package handler

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/testament117/KrakenD-chat/pkg/model"

	amqp "github.com/rabbitmq/amqp091-go"
)

type RabbitMQPublisher struct {
	conn    *amqp.Connection
	channel *amqp.Channel
}

func NewRabbitMQPublisher(rmqURL string) (*RabbitMQPublisher, error) {
	conn, err := amqp.Dial(rmqURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to open a channel: %w", err)
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
		return nil, fmt.Errorf("failed to declare an exchange: %w", err)
	}

	log.Println("RabbitMQ Publisher initialized successfully")

	return &RabbitMQPublisher{
		conn:    conn,
		channel: ch,
	}, nil
}

func (p *RabbitMQPublisher) Close() {
	if p.channel != nil {
		p.channel.Close()
	}
	if p.conn != nil {
		p.conn.Close()
	}
}

func (p *RabbitMQPublisher) PublishMessage(msg *model.Message) error {
	body, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	err = p.channel.Publish(
		"chat_exchange",
		"chat.message.new",
		false,
		false,
		amqp.Publishing{
			ContentType: "application/json",
			Body:        body,
		})
	if err != nil {
		return fmt.Errorf("failed to publish message to RabbitMQ: %w", err)
	}

	log.Printf("Successfully published message %v to chat_exchange", msg.MessageID)
	return nil
}
