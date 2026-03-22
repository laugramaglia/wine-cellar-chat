package domain

import "time"

// Message represents the core domain entity for a chat message
type Message struct {
	ID        int       `json:"id"`
	SenderID  string    `json:"sender_id"`
	Recipient string    `json:"recipient_id"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

// MessageRepository defines the interface for data operations related to messages
type MessageRepository interface {
	SaveMessage(msg *Message) error
	GetMessages(userID string, limit int, offset int) ([]*Message, error)
}
