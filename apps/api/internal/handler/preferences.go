package handler

import (
	"encoding/json"
	"net/http"

	"github.com/btsv/btsv/api/internal/middleware"
	"github.com/btsv/btsv/api/internal/model"
	"github.com/btsv/btsv/api/internal/store"
)

type PreferencesHandler struct {
	db *store.DB
}

func NewPreferencesHandler(db *store.DB) *PreferencesHandler {
	return &PreferencesHandler{db: db}
}

func (h *PreferencesHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	prefs, err := h.db.GetUserPreferences(userID)
	if err != nil {
		writeError(w, "internal error", http.StatusInternalServerError)
		return
	}
	if prefs == nil {
		writeError(w, "preferences not found", http.StatusNotFound)
		return
	}

	writeJSON(w, http.StatusOK, prefs)
}

func (h *PreferencesHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	var req model.UpdatePreferencesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.SyncType != "" && req.SyncType != "git" && req.SyncType != "api" {
		writeError(w, "syncType must be 'git' or 'api'", http.StatusBadRequest)
		return
	}

	// Fetch current prefs to merge partial updates
	current, err := h.db.GetUserPreferences(userID)
	if err != nil || current == nil {
		writeError(w, "internal error", http.StatusInternalServerError)
		return
	}

	syncType := current.SyncType
	if req.SyncType != "" {
		syncType = req.SyncType
	}
	proxyURL := current.ProxyURL
	if req.ProxyURL != "" {
		proxyURL = req.ProxyURL
	}

	if err := h.db.UpdateUserPreferences(userID, syncType, proxyURL); err != nil {
		writeError(w, "internal error", http.StatusInternalServerError)
		return
	}

	prefs, err := h.db.GetUserPreferences(userID)
	if err != nil {
		writeError(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, prefs)
}
