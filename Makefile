# Makefile for Database migrations using migrate/migrate

# Load environment variables from .env file
include .env
export

# Migration directory
MIGRATIONS_DIR=./migrations

# Database connection string
DB_URL=postgres://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@$(POSTGRES_HOST):$(POSTGRES_PORT)/$(POSTGRES_DB)?sslmode=disable

# Docker Compose migration service
MIGRATE_SERVICE=migrate

.PHONY: help migrate-up migrate-down migrate-create migrate-force migrate-version migrate-drop migrate-goto ssh-server swagger-up swagger-regenerate swagger-open

help:
	@echo "Database Migration Commands:"
	@echo "  make migrate-create NAME=<migration_name>  - Create a new migration"
	@echo "  make migrate-up                             - Run all pending migrations"
	@echo "  make migrate-down                           - Rollback last migration"
	@echo "  make migrate-down STEPS=N                   - Rollback N migrations"
	@echo "  make migrate-version                        - Show current migration version"
	@echo "  make migrate-force VERSION=N                - Force set migration version"
	@echo "  make migrate-goto VERSION=N                 - Migrate to specific version"
	@echo "  make migrate-drop                           - Drop everything (USE WITH CAUTION)"
	@echo ""


// make migrate-create NAME=
migrate-create:
	@if [ -z "$(NAME)" ]; then \
		echo "Error: NAME is required. Usage: make migrate-create NAME=your_migration_name"; \
		exit 1; \
	fi
	@docker run --rm -v $(PWD)/migrations:/migrations migrate/migrate:latest \
		create -ext sql -dir /migrations -seq $(NAME)
	@echo "Migration files created in $(MIGRATIONS_DIR)"

migrate-up:
	@echo "Running migrations..."
	@docker compose run --rm migrations \
		-path=/migrations/ \
		-database "$(DB_URL)" \
		up
	@echo "migrations completed"

migrate-down:
	@echo "Rolling back migration..."
	@docker compose run --rm migrations \
		-path=/migrations/ \
		-database "$(DB_URL)" \
		down $(if $(STEPS),$(STEPS),1)
	@echo "Rollback completed"

migrate-force:
	@if [ -z "$(VERSION)" ]; then \
		echo "Error: VERSION is required. Usage: make migrate-force VERSION=N"; \
		exit 1; \
	fi
	@echo "Force setting migration version to $(VERSION)..."
	@docker compose run --rm migrations \
		-path=/migrations/ \
		-database "$(DB_URL)" \
		force $(VERSION)
	@echo "Version set to $(VERSION)"

migrate-version:
	@echo "Checking current migration version..."
	@docker compose run --rm migrations \
		-path=/migrations/ \
		-database "$(DB_URL)" \
		version

migrate-goto:
	@if [ -z "$(VERSION)" ]; then \
		echo "Error: VERSION is required. Usage: make migrate-goto VERSION=N"; \
		exit 1; \
	fi
	@echo "Migrating to version $(VERSION)..."
	@docker compose run --rm migrations \
		-path=/migrations/ \
		-database "$(DB_URL)" \
		goto $(VERSION)
	@echo "Migrated to version $(VERSION)"

migrate-drop:
	@echo "WARNING: This will drop all tables and remove all migration history!"
	@echo "Press Ctrl+C to cancel, or wait 5 seconds to continue..."
	@sleep 5
	@docker compose run --rm migrations \
		-path=/migrations/ \
		-database "$(DB_URL)" \
		drop -f
	@echo "Database dropped"

# Swagger / OpenAPI Commands
swagger-up:
	@echo "Generating OpenAPI spec and starting Swagger UI..."
	@docker compose up --force-recreate docs-generator && docker compose up -d swagger-ui
	@echo "Swagger UI available at: http://localhost:8081"

swagger-regenerate:
	@echo "Regenerating OpenAPI spec..."
	@docker compose rm -f docs-generator swagger-ui
	@docker compose up --force-recreate docs-generator && docker compose up -d swagger-ui
	@echo "Swagger UI available at: http://localhost:8081"

swagger-open:
	@open http://localhost:8081