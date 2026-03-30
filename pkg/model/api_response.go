package model

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// APIError represents a standardized API error response
type APIError struct {
	Code      int           `json:"code"`
	Message   string        `json:"message"`
	Status    string        `json:"status"`
	Details   []ErrorDetail `json:"details,omitempty"`
	Timestamp time.Time     `json:"timestamp"`
	TraceID   string        `json:"trace_id,omitempty"`
}

// Error implements the error interface
func (e *APIError) Error() string {
	return e.Message
}

// ErrorDetail provides granular information about a specific error
type ErrorDetail struct {
	Type         string   `json:"@type"`
	Field        string   `json:"field,omitempty"`
	StackEntries []string `json:"stack_entries,omitempty"`
	Detail       string   `json:"detail,omitempty"`
	Locale       string   `json:"locale,omitempty"`
	Message      string   `json:"message,omitempty"`
}

// ErrorStatus represents standardized error status codes
type ErrorStatus string

const (
	ErrorStatusOK                 ErrorStatus = "OK"
	ErrorStatusCancelled          ErrorStatus = "CANCELLED"
	ErrorStatusUnknown            ErrorStatus = "UNKNOWN"
	ErrorStatusInvalidArgument    ErrorStatus = "INVALID_ARGUMENT"
	ErrorStatusDeadlineExceeded   ErrorStatus = "DEADLINE_EXCEEDED"
	ErrorStatusNotFound           ErrorStatus = "NOT_FOUND"
	ErrorStatusAlreadyExists      ErrorStatus = "ALREADY_EXISTS"
	ErrorStatusPermissionDenied   ErrorStatus = "PERMISSION_DENIED"
	ErrorStatusResourceExhausted  ErrorStatus = "RESOURCE_EXHAUSTED"
	ErrorStatusFailedPrecondition ErrorStatus = "FAILED_PRECONDITION"
	ErrorStatusAborted            ErrorStatus = "ABORTED"
	ErrorStatusOutOfRange         ErrorStatus = "OUT_OF_RANGE"
	ErrorStatusUnimplemented      ErrorStatus = "UNIMPLEMENTED"
	ErrorStatusInternal           ErrorStatus = "INTERNAL"
	ErrorStatusUnavailable        ErrorStatus = "UNAVAILABLE"
	ErrorStatusDataLoss           ErrorStatus = "DATA_LOSS"
	ErrorStatusUnauthenticated    ErrorStatus = "UNAUTHENTICATED"
	ErrorStatusBadRequest         ErrorStatus = "BAD_REQUEST"
)

// **********************************************************
// Logger
// **********************************************************

// Logger interface allows dependency injection for logging
type Logger interface {
	Errorf(format string, args ...any)
	Infof(format string, args ...any)
}

// DefaultLogger implements Logger using standard log package
type DefaultLogger struct {
	logger *log.Logger
}

// NewDefaultLogger creates a new DefaultLogger
func NewDefaultLogger(output io.Writer) *DefaultLogger {
	return &DefaultLogger{
		logger: log.New(output, "", log.LstdFlags),
	}
}

func (d *DefaultLogger) Errorf(format string, args ...any) {
	d.logger.Printf("[ERROR] "+format, args...)
}

func (d *DefaultLogger) Infof(format string, args ...any) {
	d.logger.Printf("[INFO] "+format, args...)
}

// **********************************************************
// ResponseWriter
// **********************************************************

// Response wraps API responses in a consistent format
type Response struct {
	Data      any       `json:"data,omitempty"`
	Error     *APIError `json:"error,omitempty"`
	Success   bool      `json:"success"`
	Timestamp time.Time `json:"timestamp"`
}


// ResponseWriter provides convenient methods for sending responses
type ResponseWriter struct {
	w       http.ResponseWriter
	logger  Logger
	traceID string
}

// NewResponseWriter creates a new ResponseWriter
func NewResponseWriter(w http.ResponseWriter, logger Logger) *ResponseWriter {
	return &ResponseWriter{
		w:      w,
		logger: logger,
	}
}


// SendError sends a formatted error response from a generic error
func (rw *ResponseWriter) SendError(err error) error {
	if apiErr, ok := err.(*APIError); ok {
		// If it's already an APIError, use its properties
		return rw.sendResponse(apiErr.Code, apiErr, false)
	}

	// For other errors, wrap them in a 500 Internal Server Error
	return rw.sendResponse(http.StatusInternalServerError, &APIError{
		Code:      http.StatusInternalServerError,
		Message:   err.Error(),
		Status:    string(ErrorStatusInternal),
		Timestamp: time.Now().UTC(),
		TraceID:   rw.traceID,
	}, false)
}

// SendErrorWithStatus sends a formatted error response with custom parameters
func (rw *ResponseWriter) SendErrorWithStatus(code int, status ErrorStatus, message string, details []ErrorDetail) error {
	return rw.sendResponse(code, &APIError{
		Code:      code,
		Message:   message,
		Status:    string(status),
		Details:   details,
		Timestamp: time.Now().UTC(),
		TraceID:   rw.traceID,
	}, false)
}

// SendSuccessWithCode sends a successful response with custom HTTP code and data
func (rw *ResponseWriter) SendSuccessWithCode(code int, data any) error {
	rw.w.Header().Set("Content-Type", "application/json; charset=utf-8")
	rw.w.WriteHeader(code)

	response := Response{
		Data:      data,
		Success:   true,
		Timestamp: time.Now().UTC(),
	}

	if err := json.NewEncoder(rw.w).Encode(response); err != nil {
		rw.logger.Errorf("failed to encode response: %v", err)
		return err
	}

	return nil
}

// sendResponse is a helper method for sending responses
func (rw *ResponseWriter) sendResponse(code int, apiErr *APIError, success bool) error {
	rw.w.Header().Set("Content-Type", "application/json; charset=utf-8")
	rw.w.WriteHeader(code)

	response := Response{
		Error:     apiErr,
		Success:   success,
		Timestamp: time.Now().UTC(),
	}

	if err := json.NewEncoder(rw.w).Encode(response); err != nil {
		rw.logger.Errorf("failed to encode response: %v", err)
		return err
	}

	return nil
}

// NewErrorDetail creates a properly initialized error detail
func NewErrorDetail(fieldName, message string) ErrorDetail {
	return ErrorDetail{
		Field:   fieldName,
		Message: message,
		Detail:  fmt.Sprintf("%s: %s", fieldName, message),
	}
}
