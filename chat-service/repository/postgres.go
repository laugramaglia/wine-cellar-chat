package repository

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/testament117/KrakenD-chat/pkg/model"

	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresRepository struct {
	pool        *pgxpool.Pool
	messageChan chan *model.Message
	wg          sync.WaitGroup
	ctx         context.Context
	cancel      context.CancelFunc
}

func NewPostgresRepository(ctx context.Context, connectionString string) (*PostgresRepository, error) {
	config, err := pgxpool.ParseConfig(connectionString)
	if err != nil {
		return nil, fmt.Errorf("unable to parse connection string: %w", err)
	}

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("unable to connect to database: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("unable to ping database: %w", err)
	}

	log.Println("Successfully connected to PostgreSQL database")

	repoCtx, cancel := context.WithCancel(context.Background())
	repo := &PostgresRepository{
		pool:        pool,
		messageChan: make(chan *model.Message, 1000), // Buffer for high throughput
		ctx:         repoCtx,
		cancel:      cancel,
	}

	repo.wg.Add(1)
	go repo.bulkIngestionWorker()

	return repo, nil
}

func (r *PostgresRepository) Close() {
	r.cancel()
	r.wg.Wait()
	if r.pool != nil {
		r.pool.Close()
	}
}

func (r *PostgresRepository) SaveMessage(msg *model.Message) error {
	select {
	case <-r.ctx.Done():
		return fmt.Errorf("repository is shutting down, dropping message")
	default:
	}

	select {
	case r.messageChan <- msg:
		return nil
	default:
		return fmt.Errorf("message buffer is full, dropping message")
	}
}

func (r *PostgresRepository) GetMessages(conversationID int64, limit int, offset int) ([]*model.Message, error) {
	query := "SELECT message_id, sender_id, conversation_id, message_type, message_content, media_url, sent_at, status FROM get_conversation_messages($1, $2, $3)"
	rows, err := r.pool.Query(context.Background(), query, conversationID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to execute get_conversation_messages: %w", err)
	}
	defer rows.Close()

	var messages []*model.Message
	for rows.Next() {
		var msg model.Message
		var mediaURL *string
		var content *string
		if err := rows.Scan(&msg.MessageID, &msg.SenderID, &msg.ConversationID, &msg.MessageType, &content, &mediaURL, &msg.SentAt, &msg.Status); err != nil {
			return nil, fmt.Errorf("failed to scan row: %w", err)
		}
		if content != nil {
			msg.MessageContent = *content
		}
		if mediaURL != nil {
			msg.MediaURL = *mediaURL
		}
		messages = append(messages, &msg)
	}

	return messages, nil
}

func (r *PostgresRepository) bulkIngestionWorker() {
	defer r.wg.Done()
	ticker := time.NewTicker(2 * time.Second) // Flush every 2 seconds to keep latency low but batching efficient
	defer ticker.Stop()

	var batch []*model.Message

	for {
		select {
		case <-r.ctx.Done():
			r.flushBatch(batch)
			return
		case msg := <-r.messageChan:
			batch = append(batch, msg)
			if len(batch) >= 100 { // Max batch size
				r.flushBatch(batch)
				batch = nil
			}
		case <-ticker.C:
			if len(batch) > 0 {
				r.flushBatch(batch)
				batch = nil
			}
		}
	}
}

func (r *PostgresRepository) flushBatch(batch []*model.Message) {
	if len(batch) == 0 {
		return
	}

	var senders []int64
	var conversations []int64
	var messageTypes []string
	var contents []string
	var mediaUrls []string
	var statuses []string

	for _, msg := range batch {
		senders = append(senders, msg.SenderID)
		conversations = append(conversations, msg.ConversationID)
		messageTypes = append(messageTypes, string(msg.MessageType))
		contents = append(contents, msg.MessageContent)
		mediaUrls = append(mediaUrls, msg.MediaURL)
		statuses = append(statuses, string(msg.Status))
	}

	query := "CALL bulk_insert_messages($1::BIGINT[], $2::BIGINT[], $3::TEXT[], $4::TEXT[], $5::TEXT[], $6::TEXT[])"

	_, err := r.pool.Exec(context.Background(), query, senders, conversations, messageTypes, contents, mediaUrls, statuses)
	if err != nil {
		log.Printf("Failed to bulk insert batch of %d messages: %v", len(batch), err)
		return
	}
	log.Printf("Successfully flushed batch of %d messages to DB using Stored Procedure", len(batch))
}
