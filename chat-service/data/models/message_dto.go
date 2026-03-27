package models

import (
	"time"

	"chat-service/domain"
)

// MessageDTO represents the data transfer object used by the presentation and data layers
type MessageDTO struct {
	ID        int       `json:"id"`
	SenderID  int       `json:"sender_id"`
	Recipient int       `json:"recipient_id"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

// ToDomain converts a DTO to a Domain entity
func (dto *MessageDTO) ToDomain() *domain.Message {
	return &domain.Message{
		ID:        dto.ID,
		SenderID:  dto.SenderID,
		Recipient: dto.Recipient,
		Content:   dto.Content,
		CreatedAt: dto.CreatedAt,
	}
}

// FromDomain creates a DTO from a Domain entity
func FromDomain(msg *domain.Message) *MessageDTO {
	return &MessageDTO{
		ID:        msg.ID,
		SenderID:  msg.SenderID,
		Recipient: msg.Recipient,
		Content:   msg.Content,
		CreatedAt: msg.CreatedAt,
	}
}
