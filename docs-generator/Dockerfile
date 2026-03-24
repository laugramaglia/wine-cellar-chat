# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Copy go mod and source
COPY go.mod ./
COPY main.go ./

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -o docs-generator .

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /

# Copy binary from builder
COPY --from=builder /app/docs-generator /docs-generator

# Run the generator
ENTRYPOINT ["/docs-generator"]