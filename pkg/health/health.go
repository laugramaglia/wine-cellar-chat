package health

import (
	"fmt"
	"net/http"
	"os"
)

// StartHealthServer starts an HTTP server on the given port that responds to /health requests.
func StartHealthServer(port string) {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("healthy"))
	})

	go func() {
		if err := http.ListenAndServe(":"+port, mux); err != nil {
			fmt.Printf("Health server failed: %v\n", err)
		}
	}()
}

// Check performs a health check by calling the /health endpoint on the given port.
// It exits the process with 0 if healthy, or 1 if unhealthy.
func Check(port string) {
	url := "http://localhost:" + port + "/health"
	fmt.Printf("Performing health check on %s...\n", url)
	resp, err := http.Get(url)
	if err != nil {
		fmt.Printf("Health check failed: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		fmt.Printf("Health check returned non-OK status: %d\n", resp.StatusCode)
		os.Exit(1)
	}
	fmt.Println("Health check successful")
	os.Exit(0)
}
