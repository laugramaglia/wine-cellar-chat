package presentation

import (
	"encoding/json"
	"net/http"

	"chat-service/data/models"
	"chat-service/domain"

	"github.com/go-chi/chi/v5"
)

type MessageController struct {
	useCase *domain.ChatUseCase
}

func NewMessageController(useCase *domain.ChatUseCase) *MessageController {
	return &MessageController{useCase: useCase}
}

// Routes returns a chi router with all the message routes
func (c *MessageController) Routes() chi.Router {
	r := chi.NewRouter()

	r.Post("/", c.CreateMessage)

	return r
}

func (c *MessageController) CreateMessage(w http.ResponseWriter, r *http.Request) {
	var dto models.MessageDTO
	if err := json.NewDecoder(r.Body).Decode(&dto); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	err := c.useCase.ProcessIncomingMessage(dto.ToDomain())
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]bool{"result": true})
}
