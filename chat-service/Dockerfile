FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Go 1.24 introduces built-in fips140 which does not require CGO.
# Using GOEXPERIMENT=fips140 ensures the cryptographic operations are FIPS 140-3 compliant.
RUN CGO_ENABLED=0 GOEXPERIMENT=fips140 GOOS=linux go build -o chat-service ./cmd/main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/chat-service .
CMD ["./chat-service"]
