package repository

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"chat-service/model"

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

func (r *PostgresRepository) GetMessages(userID int, limit int, offset int) ([]*model.Message, error) {
	query := "SELECT id, sender_id, recipient_id, message_content, created_at FROM get_user_messages($1, $2, $3)"
	rows, err := r.pool.Query(context.Background(), query, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to execute get_user_messages: %w", err)
	}
	defer rows.Close()

	var messages []*model.Message
	for rows.Next() {
		var msg model.Message
		if err := rows.Scan(&msg.ID, &msg.SenderID, &msg.Recipient, &msg.Content, &msg.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan row: %w", err)
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

	var senders []int
	var recipients []int
	var contents []string

	for _, msg := range batch {
		senders = append(senders, msg.SenderID)
		recipients = append(recipients, msg.Recipient)
		contents = append(contents, msg.Content)
	}

	query := "CALL bulk_insert_messages($1::INT[], $2::INT[], $3::TEXT[])"

	_, err := r.pool.Exec(context.Background(), query, senders, recipients, contents)
	if err != nil {
		log.Printf("Failed to bulk insert batch of %d messages: %v", len(batch), err)
		return
	}
	log.Printf("Successfully flushed batch of %d messages to DB using Stored Procedure", len(batch))
}
