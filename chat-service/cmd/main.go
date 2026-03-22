package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"chat-service/data/datasource"
	"chat-service/data/repoImpl"
	"chat-service/domain"
	"chat-service/presentation"
)

func main() {
	// 1. Read Configuration
	dbUser := getEnv("DB_USER", "chatuser")
	dbPass := getEnv("DB_PASSWORD", "chatpassword")
	dbHost := getEnv("DB_HOST", "localhost")
	dbPort := getEnv("DB_PORT", "5432")
	dbName := getEnv("DB_NAME", "chatdb")
	rmqURL := getEnv("RMQ_URL", "amqp://guest:guest@localhost:5672/")

	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", dbUser, dbPass, dbHost, dbPort, dbName)

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

	// 4. Initialize Presentation Layer (RabbitMQ Consumer)
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

	// 5. Handle graceful shutdown
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
