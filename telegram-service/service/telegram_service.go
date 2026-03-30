package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"telegram-service/repository"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/laugramaglia/wine-cellar-chat/pkg/model"
)
 
var (
	ErrBotNotInitialized = &model.APIError{
		Code:    http.StatusBadRequest,
		Status:  string(model.ErrorStatusInvalidArgument),
		Message: "bot not initialized",
	}
	ErrInvalidToken = &model.APIError{
		Code:    http.StatusBadRequest,
		Status:  string(model.ErrorStatusInvalidArgument),
		Message: "invalid bot token",
	}
)

// MessagePublisher defines an interface for publishing messages to a message queue (e.g., RabbitMQ).
// This abstraction allows the Telegram service to be decoupled from specific message broker implementations.
type MessagePublisher interface {
	PublishMessage(msg *model.Message) error
}

// TelegramService handles Telegram bot operations including bot initialization, webhook management,
// and message processing. It acts as a bridge between Telegram's Bot API and the application's
// internal message handling system via RabbitMQ.
type TelegramService struct {
	repo         *repository.PostgresRepository // Repository for persisting bot configuration
	rmqPublisher MessagePublisher               // Publisher for sending messages to the message queue
	bot          *tgbotapi.BotAPI               // Telegram Bot API client instance
	domain       string                         // Domain for webhook URL generation (e.g., https://example.com)
	botToken     string                         // Current bot token used for API authentication
}

// WebhookInfo represents the current webhook configuration status for the Telegram bot.
// This struct is used to expose webhook information through the service's API endpoints.
type WebhookInfo struct {
	URL                  string   `json:"url"`                          // The current webhook URL registered with Telegram
	HasCustomCertificate bool     `json:"has_custom_certificate"`       // Whether a custom certificate is used for the webhook
	PendingUpdateCount   int      `json:"pending_update_count"`         // Number of updates waiting to be processed
	LastErrorDate        int      `json:"last_error_date,omitempty"`    // Unix timestamp of the last webhook error
	LastErrorMessage     string   `json:"last_error_message,omitempty"` // Description of the last webhook error
	MaxConnections       int      `json:"max_connections,omitempty"`    // Maximum number of simultaneous connections allowed
	AllowedUpdates       []string `json:"allowed_updates,omitempty"`    // Types of updates the bot will receive
}

// NewTelegramService creates a new TelegramService instance with the provided dependencies.
// Parameters:
//   - repo: PostgreSQL repository for storing bot configuration and user data
//   - rmqPublisher: Message publisher for sending messages to the message queue
//   - domain: The domain name used to construct webhook URLs (can be empty to skip webhook setup)
//
// Returns a pointer to the newly created TelegramService ready for initialization.
func NewTelegramService(repo *repository.PostgresRepository, rmqPublisher MessagePublisher, domain string) *TelegramService {
	return &TelegramService{
		repo:         repo,
		rmqPublisher: rmqPublisher,
		domain:       domain,
	}
}

// GetBotToken returns the current bot token stored in the service.
// This token is used for authenticating API requests to Telegram.
// Returns an empty string if the bot has not been initialized.
func (s *TelegramService) GetBotToken() string {
	return s.botToken
}

// Initialize sets up the Telegram bot by retrieving the bot token from the database,
// creating a Bot API client, and optionally configuring a webhook if a domain is provided.
// This method should be called once at application startup.
// Steps performed:
//  1. Fetch the active bot token from the database
//  2. Initialize the Telegram Bot API client with the token
//  3. If domain is configured, register a webhook URL with Telegram
//  4. Log the bot's account information for verification
func (s *TelegramService) Initialize(ctx context.Context) error {
	token, err := s.repo.GetBotToken()
	if err != nil {
		return fmt.Errorf("failed to get active bot token from db: %w", err)
	}
	if token == "" {
		return fmt.Errorf("no active bot token found in db")
	}
	s.botToken = token

	bot, err := tgbotapi.NewBotAPI(token)
	if err != nil {
		return fmt.Errorf("failed to initialize telegram bot api: %w", err)
	}

	bot.Debug = false
	log.Printf("Authorized on account %s", bot.Self.UserName)

	s.bot = bot

	if s.domain != "" {
		webhookURL := fmt.Sprintf("%s/telegram/%s", s.domain, bot.Token)
		wh, err := tgbotapi.NewWebhook(webhookURL)
		if err != nil {
			return fmt.Errorf("failed to create webhook configuration: %w", err)
		}

		_, err = bot.Request(wh)
		if err != nil {
			return fmt.Errorf("failed to set telegram webhook to %s: %w", webhookURL, err)
		}

		info, err := bot.GetWebhookInfo()
		if err != nil {
			return fmt.Errorf("failed to get webhook info: %w", err)
		}

		if info.LastErrorDate != 0 {
			log.Printf("Telegram Webhook last error: %s", info.LastErrorMessage)
		}

		log.Printf("Successfully set webhook: %s", webhookURL)
	} else {
		log.Println("Skipping automatic webhook registration because WEBHOOK_DOMAIN is empty")
	}

	return nil
}

// ConfigureBot configures a new Telegram bot with the provided token and webhook domain.
// This method is typically called during bot setup or when changing bot configurations.
// Parameters:
//   - ctx: Context for database operations
//   - botToken: The Telegram bot token obtained from @BotFather
//   - webhookDomain: The domain where Telegram will send webhook updates (e.g., "https://example.com")
//
// The method saves the bot configuration to the database and optionally sets up a webhook.
// If webhookDomain is empty, no webhook is configured.
func (s *TelegramService) ConfigureBot(ctx context.Context, botToken, webhookDomain string) error {
	if err := s.repo.SaveBotConfig(ctx, botToken, ""); err != nil {
		return fmt.Errorf("failed to save bot config: %w", err)
	}

	bot, err := tgbotapi.NewBotAPI(botToken)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidToken, err)
	}

	bot.Debug = false
	log.Printf("Authorized on account %s", bot.Self.UserName)

	s.bot = bot
	s.botToken = botToken

	if webhookDomain != "" {
		webhookURL := fmt.Sprintf("%s/telegram/%s", webhookDomain, botToken)
		wh, err := tgbotapi.NewWebhook(webhookURL)
		if err != nil {
			return fmt.Errorf("failed to create webhook config: %w", err)
		}
		if _, err := bot.Request(wh); err != nil {
			return fmt.Errorf("failed to set webhook: %w", err)
		}

		if err := s.repo.UpdateWebhookURL(ctx, webhookURL); err != nil {
			return fmt.Errorf("failed to update webhook url in db: %w", err)
		}

		log.Printf("Successfully set webhook: %s", webhookURL)
	}

	return nil
}

// GetWebhookInfo retrieves the current webhook configuration information from Telegram.
// This allows checking the webhook status including URL, pending updates, and any errors.
// Parameters:
//   - ctx: Context for the operation (not used directly with Telegram API)
//
// Returns a WebhookInfo struct containing the current webhook details or an error if
// the bot is not initialized or the Telegram API request fails.
func (s *TelegramService) GetWebhookInfo(ctx context.Context) (WebhookInfo, error) {
	if s.bot == nil {
		return WebhookInfo{}, ErrBotNotInitialized
	}

	info, err := s.bot.GetWebhookInfo()
	if err != nil {
		return WebhookInfo{}, fmt.Errorf("failed to get webhook info: %w", err)
	}

	return WebhookInfo{
		URL:                  info.URL,
		HasCustomCertificate: info.HasCustomCertificate,
		PendingUpdateCount:   info.PendingUpdateCount,
		LastErrorDate:        info.LastErrorDate,
		LastErrorMessage:     info.LastErrorMessage,
		MaxConnections:       info.MaxConnections,
		AllowedUpdates:       info.AllowedUpdates,
	}, nil
}

// DeleteWebhook removes the currently registered webhook from Telegram.
// This stops the bot from receiving updates via webhook and clears the webhook URL
// from the database. After calling this method, the bot will no longer receive
// messages unless polling is enabled through another mechanism.
// Parameters:
//   - ctx: Context for the database operation to clear the stored webhook URL
//
// Returns an error if the bot is not initialized, the webhook deletion fails,
// or if the database update fails.
func (s *TelegramService) DeleteWebhook(ctx context.Context) error {
	if s.bot == nil {
		return ErrBotNotInitialized
	}

	if err := s.repo.UpdateWebhookURL(ctx, ""); err != nil {
		return fmt.Errorf("failed to clear webhook url in db: %w", err)
	}

	log.Println("Successfully deleted webhook from database")
	return nil
}

// HandleWebhook is an HTTP handler that processes incoming webhook requests from Telegram.
// This method is called by the HTTP server (e.g., KrakenD) when Telegram sends updates.
// It parses the incoming JSON payload, extracts message updates, and processes them asynchronously.
// The handler returns HTTP 200 OK immediately after parsing to prevent Telegram from
// retrying the request, regardless of whether processing succeeds.
//
// Request format: Expected to receive a Telegram Update JSON object in the request body.
// Response: Returns 200 OK on successful parsing, or 400 Bad Request if the JSON is invalid.
func (s *TelegramService) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	var update tgbotapi.Update
	if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
		errMsg := fmt.Sprintf("failed to parse incoming update: %v", err)
		log.Println(errMsg)
		http.Error(w, errMsg, http.StatusBadRequest)
		return
	}

	if update.Message != nil {
		s.processMessage(update.Message)
	}

	w.WriteHeader(http.StatusOK)
}

// processMessage converts a Telegram message into the application's domain model
// and publishes it to the message queue for further processing. It handles various
// message types including text, images, videos, documents, audio, and voice messages.
// Parameters:
//   - tgMsg: The Telegram message object received from the webhook
//
// The method maps Telegram-specific fields to the application's Message model:
//   - SenderID: The user's Telegram ID
//   - ConversationID: The chat ID where the message was sent
//   - MessageContent: The text content (for text messages)
//   - MessageType: Determined by the presence of media (photo, video, document, audio, voice)
//   - MediaURL: File ID from Telegram (used to reference media for later retrieval)
//
// After mapping, the message is published to RabbitMQ for async processing.
// Any publishing errors are logged but do not cause the method to fail.
func (s *TelegramService) processMessage(tgMsg *tgbotapi.Message) {
	// Map Telegram message to domain model Message
	msg := &model.Message{
		SenderID:       int64(tgMsg.From.ID),
		ConversationID: int64(tgMsg.Chat.ID),
		MessageContent: tgMsg.Text,
		SentAt:         time.Unix(int64(tgMsg.Date), 0),
		Status:         model.MessageStatusSent,
		MessageType:    model.MessageTypeText, // Default to text
	}

	// Handle media
	if tgMsg.Photo != nil && len(tgMsg.Photo) > 0 {
		msg.MessageType = model.MessageTypeImage
		// Store the largest photo file ID as the media URL placeholder
		msg.MediaURL = tgMsg.Photo[len(tgMsg.Photo)-1].FileID
	} else if tgMsg.Video != nil {
		msg.MessageType = model.MessageTypeVideo
		msg.MediaURL = tgMsg.Video.FileID
	} else if tgMsg.Document != nil {
		msg.MessageType = model.MessageTypeDocument
		msg.MediaURL = tgMsg.Document.FileID
	} else if tgMsg.Audio != nil {
		msg.MessageType = model.MessageTypeAudio
		msg.MediaURL = tgMsg.Audio.FileID
	} else if tgMsg.Voice != nil {
		msg.MessageType = model.MessageTypeAudio
		msg.MediaURL = tgMsg.Voice.FileID
	}

	err := s.rmqPublisher.PublishMessage(msg)
	if err != nil {
		log.Printf("Failed to publish telegram message %v to RMQ: %v", tgMsg.MessageID, err)
	}
}
