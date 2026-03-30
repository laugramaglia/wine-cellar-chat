// Package main Telegram Service API
// @title Telegram Service
// @version 1.0
// @description API for Telegram bot management
// @host localhost:8081
// @BasePath /
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"telegram-service/handler"
	"telegram-service/repository"
	"telegram-service/service"
)

func main() {
	// 1. Get Environment Variables
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL must be set")
	}

	rabbitmqURL := os.Getenv("RABBITMQ_URL")
	if rabbitmqURL == "" {
		log.Fatal("RABBITMQ_URL must be set")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	webhookDomain := os.Getenv("WEBHOOK_DOMAIN")
	if webhookDomain == "" {
		log.Println("WARNING: WEBHOOK_DOMAIN not set, Telegram Webhooks may not function correctly if not configured manually.")
	}

	// 2. Initialize Dependencies
	ctx := context.Background()
	repo, err := repository.NewPostgresRepository(ctx, dbURL)
	if err != nil {
		log.Fatalf("Failed to initialize repository: %v", err)
	}
	defer repo.Close()

	// 3. Initialize RabbitMQ Publisher
	rmqPublisher, err := handler.NewRabbitMQPublisher(rabbitmqURL)
	if err != nil {
		log.Fatalf("Failed to initialize RabbitMQ publisher: %v", err)
	}
	defer rmqPublisher.Close()

	// 4. Initialize Telegram Service
	telegramService := service.NewTelegramService(repo, rmqPublisher, webhookDomain)
	if err := telegramService.Initialize(ctx); err != nil {
		log.Printf("Warning: Failed to initialize telegram service initially: %v. The service will continue running, but will not process Telegram messages until configured.", err)
	}

	// 5. Initialize Telegram Handler
	telegramHandler := handler.NewTelegramHandler(telegramService)

	// 6. Initialize HTTP Router for Webhooks
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// Telegram Configuration API
	r.Route("/api/v1/telegram", func(r chi.Router) {
		r.Post("/config", telegramHandler.ConfigureBot)
		r.Get("/webhook", telegramHandler.GetWebhookInfo)
		r.Delete("/webhook", telegramHandler.DeleteWebhook)
	})

	// Webhook endpoint (if token exists)
	if telegramService.GetBotToken() != "" {
		webhookPath := fmt.Sprintf("/telegram/%s", telegramService.GetBotToken())
		r.Post(webhookPath, telegramService.HandleWebhook)
		log.Printf("Listening for Telegram webhooks on %s", webhookPath)
	} else {
		log.Println("Skipping webhook endpoint registration because no bot token was found.")
	}

	// 6. Start HTTP Server
	srv := &http.Server{
		Addr:    ":" + port,
		Handler: r,
	}

	go func() {
		log.Printf("Starting HTTP server on port %s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// 7. Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	ctxShutDown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctxShutDown); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exiting")
}
