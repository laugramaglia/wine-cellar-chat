package presentation

import (
	"context"
	"encoding/json"
	"log"

	"chat-service/data/models"
	"chat-service/domain"

	amqp "github.com/rabbitmq/amqp091-go"
)

// RabbitMQConsumer handles consuming messages from the gateway
type RabbitMQConsumer struct {
	conn    *amqp.Connection
	channel *amqp.Channel
	useCase *domain.ChatUseCase
}

// NewRabbitMQConsumer creates and connects a new consumer
func NewRabbitMQConsumer(rmqURL string, useCase *domain.ChatUseCase) (*RabbitMQConsumer, error) {
	conn, err := amqp.Dial(rmqURL)
	if err != nil {
		return nil, err
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, err
	}

	// Declare exchange to match KrakenD config
	err = ch.ExchangeDeclare(
		"chat_exchange", // name
		"topic",         // type
		true,            // durable
		false,           // auto-deleted
		false,           // internal
		false,           // no-wait
		nil,             // arguments
	)
	if err != nil {
		return nil, err
	}

	// Declare queue
	q, err := ch.QueueDeclare(
		"chat_service_queue", // name
		true,                 // durable
		false,                // delete when unused
		false,                // exclusive
		false,                // no-wait
		nil,                  // arguments
	)
	if err != nil {
		return nil, err
	}

	// Bind queue to exchange routing key
	err = ch.QueueBind(
		q.Name,             // queue name
		"chat.message.new", // routing key
		"chat_exchange",    // exchange
		false,
		nil,
	)
	if err != nil {
		return nil, err
	}

	return &RabbitMQConsumer{
		conn:    conn,
		channel: ch,
		useCase: useCase,
	}, nil
}

// Close gracefully closes connections
func (c *RabbitMQConsumer) Close() {
	if c.channel != nil {
		c.channel.Close()
	}
	if c.conn != nil {
		c.conn.Close()
	}
}

// Start consuming messages
func (c *RabbitMQConsumer) Start(ctx context.Context) error {
	msgs, err := c.channel.Consume(
		"chat_service_queue", // queue
		"",                   // consumer tag
		false,                // auto-ack
		false,                // exclusive
		false,                // no-local
		false,                // no-wait
		nil,                  // args
	)
	if err != nil {
		return err
	}

	log.Println("RabbitMQ Consumer started. Waiting for messages...")

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
				c.handleMessage(d)
			}
		}
	}()

	return nil
}

func (c *RabbitMQConsumer) handleMessage(d amqp.Delivery) {
	var dto models.MessageDTO
	if err := json.Unmarshal(d.Body, &dto); err != nil {
		log.Printf("Failed to unmarshal message: %v", err)
		d.Reject(false) // Reject without requeue
		return
	}

	log.Printf("Received message: Sender=%s, Recipient=%s", dto.SenderID, dto.Recipient)

	// Save using Clean Architecture domain logic
	err := c.useCase.ProcessIncomingMessage(dto.ToDomain())
	if err != nil {
		log.Printf("Failed to process message domain logic: %v", err)
		// Requeue the message if the buffer is full
		d.Nack(false, true)
		return
	}

	d.Ack(false) // Acknowledge message delivery
}
