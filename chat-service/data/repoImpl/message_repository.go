package repoImpl

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"chat-service/data/datasource"
	"chat-service/data/models"
	"chat-service/domain"
)

type PostgresMessageRepository struct {
	db          *datasource.PostgresDB
	messageChan chan *domain.Message
	wg          sync.WaitGroup
	ctx         context.Context
	cancel      context.CancelFunc
}

// NewPostgresMessageRepository creates a new instance of the repository and starts the background worker for bulk inserts.
func NewPostgresMessageRepository(db *datasource.PostgresDB) *PostgresMessageRepository {
	ctx, cancel := context.WithCancel(context.Background())
	repo := &PostgresMessageRepository{
		db:          db,
		messageChan: make(chan *domain.Message, 1000), // Buffer for high throughput
		ctx:         ctx,
		cancel:      cancel,
	}

	repo.wg.Add(1)
	go repo.bulkIngestionWorker()

	return repo
}

// Close gracefully shuts down the bulk ingestion worker
func (r *PostgresMessageRepository) Close() {
	r.cancel()
	r.wg.Wait()
	// Safely avoid explicitly closing r.messageChan to prevent concurrent panic risks.
	// The garbage collector will automatically clean it up when the repository is destroyed.
}

// SaveMessage adds the message to the bulk ingestion queue
func (r *PostgresMessageRepository) SaveMessage(msg *domain.Message) error {
	// First check if the repository context is shutting down
	select {
	case <-r.ctx.Done():
		return fmt.Errorf("repository is shutting down, dropping message")
	default:
	}

	// Then try to send the message to the channel
	select {
	case r.messageChan <- msg:
		return nil
	default:
		return fmt.Errorf("message buffer is full, dropping message")
	}
}

// GetMessages retrieves messages for a specific user using the Stored Procedure (Function)
func (r *PostgresMessageRepository) GetMessages(userID int, limit int, offset int) ([]*domain.Message, error) {
	query := "SELECT id, sender_id, recipient_id, message_content, created_at FROM get_user_messages($1, $2, $3)"
	rows, err := r.db.Pool.Query(context.Background(), query, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to execute get_user_messages: %w", err)
	}
	defer rows.Close()

	var domainMessages []*domain.Message
	for rows.Next() {
		var dto models.MessageDTO
		if err := rows.Scan(&dto.ID, &dto.SenderID, &dto.Recipient, &dto.Content, &dto.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan row: %w", err)
		}
		domainMessages = append(domainMessages, dto.ToDomain())
	}

	return domainMessages, nil
}

func (r *PostgresMessageRepository) bulkIngestionWorker() {
	defer r.wg.Done()
	ticker := time.NewTicker(2 * time.Second) // Flush every 2 seconds to keep latency low but batching efficient
	defer ticker.Stop()

	var batch []*domain.Message

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

func (r *PostgresMessageRepository) flushBatch(batch []*domain.Message) {
	if len(batch) == 0 {
		return
	}

	// Creating parallel arrays natively supported by pgx to avoid string-casting errors when
	// inserting user content like commas and parentheses
	var senders []int
	var recipients []int
	var contents []string

	for _, msg := range batch {
		senders = append(senders, msg.SenderID)
		recipients = append(recipients, msg.Recipient)
		contents = append(contents, msg.Content)
	}

	query := "CALL bulk_insert_messages($1::INT[], $2::INT[], $3::TEXT[])"

	// pgx natively understands Go string slices -> PostgreSQL Text/Varchar Arrays
	_, err := r.db.Pool.Exec(context.Background(), query, senders, recipients, contents)
	if err != nil {
		log.Printf("Failed to bulk insert batch of %d messages: %v", len(batch), err)
		return
	}
	log.Printf("Successfully flushed batch of %d messages to DB using Stored Procedure", len(batch))
}
