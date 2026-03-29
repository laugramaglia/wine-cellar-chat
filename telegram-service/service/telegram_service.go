package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/testament117/KrakenD-chat/pkg/model"
	"telegram-service/handler"
	"telegram-service/repository"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

type TelegramService struct {
	repo         *repository.PostgresRepository
	rmqPublisher *handler.RabbitMQPublisher
	bot          *tgbotapi.BotAPI
	domain       string
	botToken     string
}

func NewTelegramService(repo *repository.PostgresRepository, rmqPublisher *handler.RabbitMQPublisher, domain string) *TelegramService {
	return &TelegramService{
		repo:         repo,
		rmqPublisher: rmqPublisher,
		domain:       domain,
	}
}

func (s *TelegramService) GetBotToken() string {
	return s.botToken
}

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

// HandleWebhook processes incoming requests from Telegram
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
