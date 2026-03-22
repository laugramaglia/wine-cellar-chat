package domain

// ChatUseCase handles the business logic for chat operations
type ChatUseCase struct {
	repo MessageRepository
}

// NewChatUseCase creates a new instance of ChatUseCase
func NewChatUseCase(repo MessageRepository) *ChatUseCase {
	return &ChatUseCase{repo: repo}
}

// ProcessIncomingMessage handles an incoming message and persists it
func (uc *ChatUseCase) ProcessIncomingMessage(msg *Message) error {
	return uc.repo.SaveMessage(msg)
}
