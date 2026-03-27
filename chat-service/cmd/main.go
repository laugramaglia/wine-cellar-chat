package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"chat-service/handler"
	"chat-service/repository"
	"chat-service/service"

	"wine-cellar-chat/pkg/health"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func main() {
	healthCheck := flag.Bool("healthcheck", false, "run health check")
	port := flag.String("port", "8080", "port for the service")
	flag.Parse()

	if *healthCheck {
		health.Check(*port)
	}

	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable&search_path=%s",
		getEnv("DB_USER", "chatuser"), getEnv("DB_PASSWORD", "chatpassword"),
		getEnv("DB_HOST", "localhost"), getEnv("DB_PORT", "5432"),
		getEnv("DB_NAME", "chatdb"), getEnv("DB_SCHEMA", "public"))
	rmqURL := getEnv("RMQ_URL", "amqp://guest:guest@localhost:5672/")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var repo *repository.PostgresRepository
	var err error
	for i := 0; i < 5; i++ {
		repo, err = repository.NewPostgresRepository(ctx, dsn)
		if err == nil {
			break
		}
		log.Printf("Waiting for database... (%v)", err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatalf("Could not connect to database: %v", err)
	}
	defer repo.Close()

	chatSvc := service.NewChatService(repo)

	var rmqHandler *handler.RabbitMQHandler
	for i := 0; i < 5; i++ {
		rmqHandler, err = handler.NewRabbitMQHandler(rmqURL, chatSvc)
		if err == nil {
			break
		}
		log.Printf("Waiting for RabbitMQ... (%v)", err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatalf("Could not connect to RabbitMQ: %v", err)
	}
	defer rmqHandler.Close()

	if err := rmqHandler.Start(ctx); err != nil {
		log.Fatalf("Could not start RabbitMQ handler: %v", err)
	}

	httpHandler := handler.NewHTTPHandler(chatSvc)

	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Logger, middleware.Recoverer, middleware.Timeout(60*time.Second))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK); w.Write([]byte("healthy")) })
	r.Mount("/api/v1/messages", httpHandler.Routes())

	server := &http.Server{Addr: ":" + *port, Handler: r}
	go func() {
		log.Printf("HTTP Server starting on port %s", *port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server failed: %v", err)
		}
	}()

	log.Println("Chat microservice started and running...")
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan
	log.Println("Shutting down gracefully...")
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
