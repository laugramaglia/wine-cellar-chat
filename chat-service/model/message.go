package model

import "time"

// Message represents a chat message
type Message struct {
	ID        int       `json:"id"`
	SenderID  int       `json:"sender_id"`
	Recipient int       `json:"recipient_id"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}
