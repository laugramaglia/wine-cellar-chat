package handler

import (
	"encoding/json"
	"net/http"

	"chat-service/model"
	"chat-service/service"

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
