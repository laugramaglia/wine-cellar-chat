package handler

import (
	"encoding/json"
	"net/http"

	"telegram-service/service"

	"github.com/laugramaglia/wine-cellar-chat/pkg/model"
)

type TelegramHandler struct {
	telegramService *service.TelegramService
	logger          model.Logger
}

func NewTelegramHandler(telegramService *service.TelegramService, logger model.Logger) *TelegramHandler {
	return &TelegramHandler{
		telegramService: telegramService,
		logger:          logger,
	}
}

type ConfigureBotRequest struct {
	BotToken      string `json:"bot_token"`
	WebhookDomain string `json:"webhook_domain"`
}

// @Summary Configure bot
// @Description Configure Telegram bot and set webhook
// @Tags telegram
// @Accept json
// @Produce json
// @Param config body ConfigureBotRequest true "Bot configuration"
// @Success 200 {object} map[string]string
// @Failure 400 {object} model.ApiError
// @Failure 500 {object} model.ApiError
// @Router /api/v1/telegram/config [post]
func (h *TelegramHandler) ConfigureBot(w http.ResponseWriter, r *http.Request) {
	rw := model.NewResponseWriter(w, h.logger)
	var req ConfigureBotRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		rw.SendErrorWithStatus(http.StatusBadRequest, model.ErrorStatusInvalidArgument, "Invalid request body", nil)
		return
	}

	if req.BotToken == "" {
		rw.SendErrorWithStatus(http.StatusBadRequest, model.ErrorStatusInvalidArgument, "bot_token is required", []model.ErrorDetail{model.NewErrorDetail("bot_token", "bot_token is required")})
		return
	}

	if err := h.telegramService.ConfigureBot(r.Context(), req.BotToken, req.WebhookDomain); err != nil {
		rw.SendError(err)
		return
	}

	rw.SendSuccessWithCode(http.StatusOK, map[string]string{
		"message": "bot configured successfully",
	})
}

// @Summary Get webhook info
// @Description Get current webhook status
// @Tags telegram
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} model.ApiError
// @Router /api/v1/telegram/webhook [get]
func (h *TelegramHandler) GetWebhookInfo(w http.ResponseWriter, r *http.Request) {
	rw := model.NewResponseWriter(w, h.logger)
	info, err := h.telegramService.GetWebhookInfo(r.Context())
	if err != nil {
		rw.SendError(err)
		return
	}

	rw.SendSuccessWithCode(http.StatusOK, info)
}

// @Summary Delete webhook
// @Description Delete webhook
// @Tags telegram
// @Produce json
// @Success 200 {object} map[string]string
// @Failure 500 {object} model.ApiError
// @Router /api/v1/telegram/webhook [delete]
func (h *TelegramHandler) DeleteWebhook(w http.ResponseWriter, r *http.Request) {
	rw := model.NewResponseWriter(w, h.logger)
	if err := h.telegramService.DeleteWebhook(r.Context()); err != nil {
		rw.SendError(err)
		return
	}

	rw.SendSuccessWithCode(http.StatusOK, map[string]string{
		"message": "webhook deleted successfully",
	})
}
