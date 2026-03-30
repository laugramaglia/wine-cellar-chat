package service

import (
	"github.com/laugramaglia/wine-cellar-chat/pkg/model"

	"chat-service/repository"
)

type ChatService struct {
	repo *repository.PostgresRepository
}

func NewChatService(repo *repository.PostgresRepository) *ChatService {
	return &ChatService{repo: repo}
}

func (s *ChatService) ProcessIncomingMessage(msg *model.Message) error {
	return s.repo.SaveMessage(msg)
}
