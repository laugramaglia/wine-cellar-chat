package model

import (
	"encoding/json"
	"net/http"
)

type ApiError struct {
	Code    int           `json:"code"`
	Message string        `json:"message"`
	Status  string        `json:"status"`
	Details []ErrorDetail `json:"details,omitempty"`
}

type ErrorDetail struct {
	Type         string   `json:"@type"`
	StackEntries []string `json:"stack_entries,omitempty"`
	Detail       string   `json:"detail,omitempty"`
	Locale       string   `json:"locale,omitempty"`
	Message      string   `json:"message,omitempty"`
}

type ErrorStatus string

const (
	ErrorStatusOK                 ErrorStatus = "OK"
	ErrorStatusCancelled          ErrorStatus = "CANCELLED"
	ErrorStatusUnknown            ErrorStatus = "UNKNOWN"
	ErrorStatusInvalidArgument    ErrorStatus = "INVALID_ARGUMENT"
	ErrorStatusDeadlineExceeded   ErrorStatus = "DEADLINE_EXCEEDED"
	ErrorStatusNotFound           ErrorStatus = "NOT_FOUND"
	ErrorStatusAlreadyExists      ErrorStatus = "ALREADY_EXISTS"
	ErrorStatusPermissionDenied   ErrorStatus = "PERMISSION_DENIED"
	ErrorStatusResourceExhausted  ErrorStatus = "RESOURCE_EXHAUSTED"
	ErrorStatusFailedPrecondition ErrorStatus = "FAILED_PRECONDITION"
	ErrorStatusAborted            ErrorStatus = "ABORTED"
	ErrorStatusOutOfRange         ErrorStatus = "OUT_OF_RANGE"
	ErrorStatusUnimplemented      ErrorStatus = "UNIMPLEMENTED"
	ErrorStatusInternal           ErrorStatus = "INTERNAL"
	ErrorStatusUnavailable        ErrorStatus = "UNAVAILABLE"
	ErrorStatusDataLoss           ErrorStatus = "DATA_LOSS"
	ErrorStatusUnauthenticated    ErrorStatus = "UNAUTHENTICATED"
	ErrorStatusBadRequest         ErrorStatus = "BAD_REQUEST"
)

func SendError(w http.ResponseWriter, code int, status ErrorStatus, message string, details []ErrorDetail) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)

	err := ApiError{
		Code:    code,
		Message: message,
		Status:  string(status),
		Details: details,
	}

	json.NewEncoder(w).Encode(map[string]ApiError{
		"error": err,
	})
}

func SendSuccess(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(data)
}

func BadRequestErrorDetail(field, message string) []ErrorDetail {
	return []ErrorDetail{
		{
			Message: message,
			Detail:  field + ": " + message,
		},
	}
}
