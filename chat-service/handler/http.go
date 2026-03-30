package handler

import (
	"encoding/json"
	"net/http"

	"chat-service/service"

	"github.com/laugramaglia/wine-cellar-chat/pkg/model"

	"github.com/go-chi/chi/v5"
)

type HTTPHandler struct {
	service *service.ChatService
}

func NewHTTPHandler(service *service.ChatService) *HTTPHandler {
	return &HTTPHandler{service: service}
}

func (h *HTTPHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Post("/", h.CreateMessage)

	return r
}

// @Summary Create message
// @Description Create a new chat message
// @Tags messages
// @Accept json
// @Produce json
// @Param message body model.Message true "Message data"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} model.ApiError
// @Failure 500 {object} model.ApiError
// @Router /api/v1/messages [post]
func (h *HTTPHandler) CreateMessage(w http.ResponseWriter, r *http.Request) {
	var msg model.Message
	if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	err := h.service.ProcessIncomingMessage(&msg)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]bool{"result": true})
}
