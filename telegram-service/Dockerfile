FROM golang:1.25.8-alpine AS builder
WORKDIR /app

# Copy the workspace file
COPY go.work go.work

# Copy go.mod files for all modules
COPY chat-service/go.mod chat-service/go.mod
COPY chat-service/go.sum chat-service/go.sum
COPY pkg/health/go.mod pkg/health/go.mod
COPY pkg/model/go.mod pkg/model/go.mod
COPY telegram-service/go.mod telegram-service/go.mod
COPY telegram-service/go.sum telegram-service/go.sum

RUN go work sync

# Copy the source code
COPY chat-service/ chat-service/
COPY pkg/health/ pkg/health/
COPY pkg/model/ pkg/model/
COPY telegram-service/ telegram-service/



# Build the application
RUN cd telegram-service && CGO_ENABLED=0 GOOS=linux go build -o /telegram-service ./cmd/main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /telegram-service .
COPY --from=builder /app/telegram-service/docs ./docs
# Ensure permissions
RUN chmod +x ./telegram-service
CMD ["./telegram-service"]
