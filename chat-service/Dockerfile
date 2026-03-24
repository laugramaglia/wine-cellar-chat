FROM golang:1.24-alpine AS builder
WORKDIR /app

# Copy the workspace file
COPY go.work go.work

# Copy go.mod files for all modules
COPY chat-service/go.mod chat-service/go.mod
# COPY chat-service/go.sum chat-service/go.sum
COPY pkg/health/go.mod pkg/health/go.mod

RUN go work sync

# Copy the source code
COPY chat-service/ chat-service/
COPY pkg/health/ pkg/health/

# Build the application
RUN cd chat-service && CGO_ENABLED=0 GOOS=linux go build -o /chat-service ./cmd/main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /chat-service .
# Ensure permissions
RUN chmod +x ./chat-service
CMD ["./chat-service"]
