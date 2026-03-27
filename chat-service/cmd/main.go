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

	"chat-service/data/datasource"
	"chat-service/data/repoImpl"
	"chat-service/domain"
	"chat-service/presentation"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"wine-cellar-chat/pkg/health"
)

func main() {
	// 0. Health check logic
	healthCheck := flag.Bool("healthcheck", false, "run health check")
	port := flag.String("port", "8080", "port for the service")
	flag.Parse()

	if *healthCheck {
		health.Check(*port)
	}



	// 1. Read Configuration
	dbUser := getEnv("DB_USER", "chatuser")
	dbPass := getEnv("DB_PASSWORD", "chatpassword")
	dbHost := getEnv("DB_HOST", "localhost")
	dbPort := getEnv("DB_PORT", "5432")
	dbName := getEnv("DB_NAME", "chatdb")
	dbSchema := getEnv("DB_SCHEMA", "public")
	rmqURL := getEnv("RMQ_URL", "amqp://guest:guest@localhost:5672/")

	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable&search_path=%s", dbUser, dbPass, dbHost, dbPort, dbName, dbSchema)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 2. Initialize Data Layer (Datasource & Repository)
	// Add retry logic for DB and RabbitMQ since docker-compose might start them slower than the microservice
	var db *datasource.PostgresDB
	var err error
	for i := 0; i < 5; i++ {
		db, err = datasource.NewPostgresDB(ctx, dsn)
		if err == nil {
			break
		}
		log.Printf("Waiting for database... (%v)", err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatalf("Could not connect to database after retries: %v", err)
	}
	defer db.Close()

	repo := repoImpl.NewPostgresMessageRepository(db)
	defer repo.Close()

	// 3. Initialize Domain Layer (Use Cases)
	chatUseCase := domain.NewChatUseCase(repo)

	// 4. Initialize Presentation Layer (RabbitMQ Consumer & HTTP Handler)
	var consumer *presentation.RabbitMQConsumer
	for i := 0; i < 5; i++ {
		consumer, err = presentation.NewRabbitMQConsumer(rmqURL, chatUseCase)
		if err == nil {
			break
		}
		log.Printf("Waiting for RabbitMQ... (%v)", err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatalf("Could not connect to RabbitMQ after retries: %v", err)
	}
	defer consumer.Close()

	if err := consumer.Start(ctx); err != nil {
		log.Fatalf("Could not start RabbitMQ consumer: %v", err)
	}

	// 5. Initialize Presentation Layer (MessageController & Chi Router)
	messageController := presentation.NewMessageController(chatUseCase)
	
	r := chi.NewRouter()
	
	// A good base middleware stack
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("healthy"))
	})

	r.Mount("/api/v1/messages", messageController.Routes())

	server := &http.Server{
		Addr:    ":" + *port,
		Handler: r,
	}

	go func() {
		log.Printf("HTTP Server starting on port %s", *port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server failed: %v", err)
		}
	}()

	// 6. Handle graceful shutdown
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
