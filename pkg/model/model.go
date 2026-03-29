package model

import "time"

// User represents a user in the system
type User struct {
	UserID            int64  `json:"user_id"`
	Name              string `json:"name"`
	PhoneNumber       string `json:"phone_number"`
	ProfilePictureURL string `json:"profile_picture_url"`
}

// ConversationType represents the type of a conversation
type ConversationType string

const (
	ConversationTypeDirect ConversationType = "direct"
	ConversationTypeGroup  ConversationType = "group"
)

// Conversation represents a chat conversation
type Conversation struct {
	ConversationID int64            `json:"conversation_id"`
	Type           ConversationType `json:"type"`
	LastMessageID  *int64           `json:"last_message_id"` // Pointer as it can be null initially
}

// MessageType represents the type of a message
type MessageType string

const (
	MessageTypeText     MessageType = "text"
	MessageTypeImage    MessageType = "image"
	MessageTypeVideo    MessageType = "video"
	MessageTypeDocument MessageType = "document"
	MessageTypeAudio    MessageType = "audio"
)

// MessageStatus represents the delivery status of a message
type MessageStatus string

const (
	MessageStatusSent      MessageStatus = "sent"
	MessageStatusDelivered MessageStatus = "delivered"
	MessageStatusRead      MessageStatus = "read"
	MessageStatusFailed    MessageStatus = "failed"
)

// Message represents a chat message
type Message struct {
	MessageID      int64         `json:"message_id"`
	SenderID       int64         `json:"sender_id"`
	ConversationID int64         `json:"conversation_id"`
	MessageType    MessageType   `json:"message_type"`
	MessageContent string        `json:"message_content"`
	MediaURL       string        `json:"media_url"`
	SentAt         time.Time     `json:"sent_at"`
	Status         MessageStatus `json:"status"`
}

// Group represents a chat group
type Group struct {
	GroupID           int64     `json:"group_id"`
	GroupName         string    `json:"group_name"`
	CreatedBy         int64     `json:"created_by"` // user_id
	CreatedAt         time.Time `json:"created_at"`
	ProfilePictureURL string    `json:"profile_picture_url"`
	IsPublic          bool      `json:"is_public"`
}

// GroupRole represents the role of a user in a group
type GroupRole string

const (
	GroupRoleAdmin  GroupRole = "admin"
	GroupRoleMember GroupRole = "member"
)

// GroupMember represents a member of a group
type GroupMember struct {
	GroupID int64     `json:"group_id"`
	UserID  int64     `json:"user_id"`
	Role    GroupRole `json:"role"`
}
