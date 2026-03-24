package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
)

// KrakenDConfig represents the structure of krakend.json
type KrakenDConfig struct {
	Version int        `json:"version"`
	Name    string     `json:"name"`
	Port    int        `json:"port"`
	Timeout string     `json:"timeout"`
	Endpoints []Endpoint `json:"endpoints"`
}

type Endpoint struct {
	Endpoint      string                 `json:"endpoint"`
	Method        string                 `json:"method"`
	OutputEncoding string                `json:"output_encoding"`
	ExtraConfig   map[string]interface{} `json:"extra_config"`
	Backend       []Backend              `json:"backend"`
}

type Backend struct {
	Host                  []string               `json:"host"`
	URLPattern            string                 `json:"url_pattern"`
	DisableHostSanitize   bool                   `json:"disable_host_sanitize"`
	Encoding              string                 `json:"encoding"`
	ExtraConfig           map[string]interface{} `json:"extra_config"`
}

// OpenAPISpec represents OpenAPI 3.0.3 specification
type OpenAPISpec struct {
	OpenAPI string                 `json:"openapi"`
	Info    OpenAPIInfo            `json:"info"`
	Servers []OpenAPIServer        `json:"servers"`
	Paths   map[string]PathItem    `json:"paths"`
	Components OpenAPIComponents   `json:"components"`
}

type OpenAPIInfo struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Version     string `json:"version"`
}

type OpenAPIServer struct {
	URL string `json:"url"`
}

type PathItem struct {
	Post *Operation `json:"post,omitempty"`
	Get  *Operation `json:"get,omitempty"`
	Put  *Operation `json:"put,omitempty"`
	Delete *Operation `json:"delete,omitempty"`
	Patch *Operation `json:"patch,omitempty"`
}

type Operation struct {
	Summary     string              `json:"summary"`
	Description string              `json:"description"`
	Tags        []string            `json:"tags"`
	RequestBody *RequestBody        `json:"requestBody,omitempty"`
	Responses   map[string]Response `json:"responses"`
}

type RequestBody struct {
	Description string               `json:"description"`
	Required    bool                 `json:"required"`
	Content     map[string]MediaType `json:"content"`
}

type MediaType struct {
	Schema Schema `json:"schema"`
}

type Schema struct {
	Ref        string                 `json:"$ref,omitempty"`
	Type       string                 `json:"type,omitempty"`
	Properties map[string]Property    `json:"properties,omitempty"`
	Required   []string               `json:"required,omitempty"`
}

type Property struct {
	Type        string `json:"type"`
	Description string `json:"description,omitempty"`
	Example     string `json:"example,omitempty"`
}

type Response struct {
	Description string               `json:"description"`
	Content     map[string]MediaType `json:"content,omitempty"`
}

type OpenAPIComponents struct {
	Schemas map[string]Schema `json:"schemas"`
}

func main() {
	// Check for healthcheck flag
	if len(os.Args) > 1 && os.Args[1] == "--healthcheck" {
		if err := runHealthcheckServer(); err != nil {
			fmt.Fprintf(os.Stderr, "Healthcheck server error: %v\n", err)
			os.Exit(1)
		}
		return
	}

	if err := generateOpenAPI(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("OpenAPI spec generated successfully at /etc/krakend/openapi.json")
}

func runHealthcheckServer() error {
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"healthy"}`))
	})

	server := &http.Server{
		Addr:         ":8080",
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
	}

	fmt.Println("Healthcheck server listening on :8080")
	return server.ListenAndServe()
}

func generateOpenAPI() error {
	// Read krakend.json
	data, err := os.ReadFile("/etc/krakend/krakend.json")
	if err != nil {
		return fmt.Errorf("failed to read krakend.json: %w", err)
	}

	var config KrakenDConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return fmt.Errorf("failed to parse krakend.json: %w", err)
	}

	// Build OpenAPI spec
	spec := OpenAPISpec{
		OpenAPI: "3.0.3",
		Info: OpenAPIInfo{
			Title:       config.Name,
			Description: "Auto-generated API documentation from KrakenD configuration",
			Version:     "1.0.0",
		},
		Servers: []OpenAPIServer{
			{URL: fmt.Sprintf("http://localhost:%d", config.Port)},
		},
		Paths: make(map[string]PathItem),
		Components: OpenAPIComponents{
			Schemas: map[string]Schema{
				"Message": {
					Type: "object",
					Properties: map[string]Property{
						"id": {
							Type:        "integer",
							Description: "Message unique identifier",
						},
						"sender_id": {
							Type:        "string",
							Description: "ID of the message sender",
							Example:     "user-123",
						},
						"recipient_id": {
							Type:        "string",
							Description: "ID of the message recipient",
							Example:     "user-456",
						},
						"content": {
							Type:        "string",
							Description: "Message content",
							Example:     "Hello, world!",
						},
						"created_at": {
							Type:        "string",
							Description: "Message creation timestamp",
						},
					},
					Required: []string{"sender_id", "recipient_id", "content"},
				},
				"Error": {
					Type: "object",
					Properties: map[string]Property{
						"error": {
							Type:        "string",
							Description: "Error message",
						},
					},
				},
			},
		},
	}

	// Process endpoints
	for _, ep := range config.Endpoints {
		pathItem := PathItem{}
		op := &Operation{
			Summary:     fmt.Sprintf("%s %s", ep.Method, ep.Endpoint),
			Description: fmt.Sprintf("KrakenD gateway endpoint forwarding to backend"),
			Tags:        []string{"gateway"},
			Responses:   make(map[string]Response),
		}

		// Extract required fields from CEL validation
		requiredFields := extractRequiredFields(ep.ExtraConfig)

		// Add request body for POST/PUT/PATCH
		if ep.Method == "POST" || ep.Method == "PUT" || ep.Method == "PATCH" {
			op.RequestBody = &RequestBody{
				Description: "Request payload",
				Required:    true,
				Content: map[string]MediaType{
					"application/json": {
						Schema: Schema{
							Ref: "#/components/schemas/Message",
						},
					},
				},
			}
		}

		// Add responses
		op.Responses["202"] = Response{
			Description: "Accepted - Message queued successfully",
		}
		op.Responses["400"] = Response{
			Description: "Bad Request - Validation failed",
			Content: map[string]MediaType{
				"application/json": {
					Schema: Schema{
						Ref: "#/components/schemas/Error",
					},
				},
			},
		}
		op.Responses["429"] = Response{
			Description: "Too Many Requests - Rate limit exceeded",
		}
		op.Responses["500"] = Response{
			Description: "Internal Server Error",
		}

		// Apply required fields from validation
		if len(requiredFields) > 0 {
			if op.RequestBody != nil {
				// Create inline schema with required fields
				op.RequestBody.Content["application/json"] = MediaType{
					Schema: Schema{
						Type: "object",
						Properties: map[string]Property{
							"sender_id": {
								Type:        "string",
								Description: "ID of the message sender",
								Example:     "user-123",
							},
							"recipient_id": {
								Type:        "string",
								Description: "ID of the message recipient",
								Example:     "user-456",
							},
							"content": {
								Type:        "string",
								Description: "Message content",
								Example:     "Hello, world!",
							},
						},
						Required: requiredFields,
					},
				}
			}
		}

		// Set operation based on method
		switch strings.ToUpper(ep.Method) {
		case "POST":
			pathItem.Post = op
		case "GET":
			pathItem.Get = op
		case "PUT":
			pathItem.Put = op
		case "DELETE":
			pathItem.Delete = op
		case "PATCH":
			pathItem.Patch = op
		}

		spec.Paths[ep.Endpoint] = pathItem
	}

	// Write OpenAPI spec
	output, err := json.MarshalIndent(spec, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal OpenAPI spec: %w", err)
	}

	if err := os.WriteFile("/etc/krakend/openapi.json", output, 0644); err != nil {
		return fmt.Errorf("failed to write openapi.json: %w", err)
	}

	return nil
}

// extractRequiredFields parses CEL validation expressions to find required fields
func extractRequiredFields(extraConfig map[string]interface{}) []string {
	var required []string

	// Look for validation/cel config
	celConfig, ok := extraConfig["validation/cel"].([]interface{})
	if !ok {
		return required
	}

	// Regex to extract field names from has(req_body.field_name)
	fieldRegex := regexp.MustCompile(`req_body\.(\w+)`)

	for _, item := range celConfig {
		config, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		checkExpr, ok := config["check_expr"].(string)
		if !ok {
			continue
		}

		// Extract field names from the expression
		matches := fieldRegex.FindAllStringSubmatch(checkExpr, -1)
		for _, match := range matches {
			if len(match) > 1 {
				field := match[1]
				// Avoid duplicates
				if !contains(required, field) {
					required = append(required, field)
				}
			}
		}
	}

	return required
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}