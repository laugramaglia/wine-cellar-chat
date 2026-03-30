package repository

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresRepository struct {
	pool *pgxpool.Pool
	ctx  context.Context
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

	log.Println("Successfully connected to PostgreSQL database (telegram schema)")

	return &PostgresRepository{
		pool: pool,
		ctx:  ctx,
	}, nil
}

func (r *PostgresRepository) Close() {
	if r.pool != nil {
		r.pool.Close()
	}
}

// GetBotToken reads the active bot token from the telegram.bot_config table.
func (r *PostgresRepository) GetBotToken() (string, error) {
	query := "SELECT bot_token FROM telegram.bot_config WHERE is_active = true ORDER BY id DESC LIMIT 1"
	var token string
	err := r.pool.QueryRow(context.Background(), query).Scan(&token)
	if err != nil {
		return "", err
	}
	return token, nil
}

type BotConfig struct {
	ID         int64
	BotToken   string
	WebhookURL string
	IsActive   bool
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

func (r *PostgresRepository) SaveBotConfig(ctx context.Context, botToken, webhookURL string) error {
	query := `
		INSERT INTO telegram.bot_config (bot_token, webhook_url, is_active, created_at, updated_at)
		VALUES ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		RETURNING id
	`
	_, err := r.pool.Exec(ctx, query, botToken, webhookURL)
	if err != nil {
		return fmt.Errorf("failed to save bot config: %w", err)
	}
	return nil
}

func (r *PostgresRepository) GetActiveBotConfig(ctx context.Context) (BotConfig, error) {
	query := `
		SELECT id, bot_token, webhook_url, is_active, created_at, updated_at
		FROM telegram.bot_config
		WHERE is_active = true
		ORDER BY id DESC
		LIMIT 1
	`
	var config BotConfig
	err := r.pool.QueryRow(ctx, query).Scan(
		&config.ID,
		&config.BotToken,
		&config.WebhookURL,
		&config.IsActive,
		&config.CreatedAt,
		&config.UpdatedAt,
	)
	if err != nil {
		return BotConfig{}, err
	}
	return config, nil
}

func (r *PostgresRepository) UpdateWebhookURL(ctx context.Context, webhookURL string) error {
	query := `
		UPDATE telegram.bot_config
		SET webhook_url = $1, updated_at = CURRENT_TIMESTAMP
		WHERE is_active = true
	`
	_, err := r.pool.Exec(ctx, query, webhookURL)
	if err != nil {
		return fmt.Errorf("failed to update webhook url: %w", err)
	}
	return nil
}
