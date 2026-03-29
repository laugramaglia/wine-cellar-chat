package handler

import (
	"context"
	"encoding/json"
	"log"

	"github.com/testament117/KrakenD-chat/pkg/model"
	"chat-service/service"

	amqp "github.com/rabbitmq/amqp091-go"
)

type RabbitMQHandler struct {
	conn    *amqp.Connection
	channel *amqp.Channel
	service *service.ChatService
}

func NewRabbitMQHandler(rmqURL string, service *service.ChatService) (*RabbitMQHandler, error) {
	conn, err := amqp.Dial(rmqURL)
	if err != nil {
		return nil, err
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, err
	}

	err = ch.ExchangeDeclare(
		"chat_exchange",
		"topic",
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return nil, err
	}

	q, err := ch.QueueDeclare(
		"chat_service_queue",
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return nil, err
	}

	err = ch.QueueBind(
		q.Name,
		"chat.message.new",
		"chat_exchange",
		false,
		nil,
	)
	if err != nil {
		return nil, err
	}

	return &RabbitMQHandler{
		conn:    conn,
		channel: ch,
		service: service,
	}, nil
}

func (h *RabbitMQHandler) Close() {
	if h.channel != nil {
		h.channel.Close()
	}
	if h.conn != nil {
		h.conn.Close()
	}
}

func (h *RabbitMQHandler) Start(ctx context.Context) error {
	msgs, err := h.channel.Consume(
		"chat_service_queue",
		"",
		false,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return err
	}

	log.Println("RabbitMQ Handler started. Waiting for messages...")

	go func() {
		for {
			select {
			case <-ctx.Done():
				log.Println("Context done, stopping consumer...")
				return
			case d, ok := <-msgs:
				if !ok {
					log.Println("RabbitMQ channel closed.")
					return
				}
				h.handleMessage(d)
			}
		}
	}()

	return nil
}

func (h *RabbitMQHandler) handleMessage(d amqp.Delivery) {
	var msg model.Message
	if err := json.Unmarshal(d.Body, &msg); err != nil {
		log.Printf("Failed to unmarshal message: %v", err)
		d.Reject(false)
		return
	}

	log.Printf("Received message: Sender=%v, Conversation=%v", msg.SenderID, msg.ConversationID)

	err := h.service.ProcessIncomingMessage(&msg)
	if err != nil {
		log.Printf("Failed to process message domain logic: %v", err)
		d.Nack(false, true)
		return
	}

	d.Ack(false)
}
