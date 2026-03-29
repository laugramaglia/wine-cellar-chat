package repository

import (
	"context"
	"fmt"
	"log"

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
