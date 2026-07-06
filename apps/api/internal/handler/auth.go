package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/btsv/btsv/api/internal/middleware"
	"github.com/btsv/btsv/api/internal/model"
	"github.com/btsv/btsv/api/internal/store"
)

type rateLimitEntry struct {
	count   int
	resetAt time.Time
}

var (
	rlMu      sync.Mutex
	rlEntries = map[string]*rateLimitEntry{}
)

const maxLoginAttempts = 5
const rateLimitWindow = time.Minute

func checkRateLimit(ip string) bool {
	rlMu.Lock()
	defer rlMu.Unlock()

	now := time.Now()
	e, ok := rlEntries[ip]
	if !ok || now.After(e.resetAt) {
		rlEntries[ip] = &rateLimitEntry{count: 1, resetAt: now.Add(rateLimitWindow)}
		return true
	}

	if e.count >= maxLoginAttempts {
		return false
	}

	e.count++
	return true
}

type AuthHandler struct {
	db           *store.DB
	cookieDomain string
	cookieSecure bool
}

func NewAuthHandler(db *store.DB, cookieDomain string) *AuthHandler {
	return &AuthHandler{
		db:           db,
		cookieDomain: cookieDomain,
		cookieSecure: cookieDomain != "",
	}
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req model.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	req.Username = strings.ToLower(strings.TrimSpace(req.Username))
	if req.Username == "" || len(req.Password) < 8 {
		writeError(w, "username required, password must be at least 8 characters", http.StatusBadRequest)
		return
	}

	if len(req.EncryptedDEK) == 0 || len(req.KEKSalt) == 0 {
		writeError(w, "encryptedDek and kekSalt are required", http.StatusBadRequest)
		return
	}

	existing, err := h.db.GetUserByUsername(req.Username)
	if err != nil {
		writeError(w, "internal error", http.StatusInternalServerError)
		return
	}
	if existing != nil {
		writeError(w, "username already taken", http.StatusConflict)
		return
	}

	user, err := h.db.CreateUser(req.Username, req.Password, req.EncryptedDEK, req.KEKSalt)
	if err != nil {
		writeError(w, "internal error", http.StatusInternalServerError)
		return
	}

	session, err := h.db.CreateSession(user.ID)
	if err != nil {
		writeError(w, "internal error", http.StatusInternalServerError)
		return
	}

	setSessionCookie(w, session.Token, session.Expires, h.cookieDomain, h.cookieSecure)
	writeJSON(w, http.StatusCreated, user)
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	ip := r.RemoteAddr
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		ip = strings.Split(forwarded, ",")[0]
	}
	if !checkRateLimit(ip) {
		writeError(w, "too many login attempts, try again later", http.StatusTooManyRequests)
		return
	}

	var req model.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	req.Username = strings.ToLower(strings.TrimSpace(req.Username))
	user, err := h.db.GetUserByUsername(req.Username)
	if err != nil {
		writeError(w, "internal error", http.StatusInternalServerError)
		return
	}
	if user == nil || !h.db.VerifyPassword(user, req.Password) {
		writeError(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	session, err := h.db.CreateSession(user.ID)
	if err != nil {
		writeError(w, "internal error", http.StatusInternalServerError)
		return
	}

	setSessionCookie(w, session.Token, session.Expires, h.cookieDomain, h.cookieSecure)

	resp := model.LoginResponse{
		User:         *user,
		EncryptedDEK: user.EncryptedDEK,
		KEKSalt:      user.KEKSalt,
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session")
	if err == nil {
		_ = h.db.DeleteSession(cookie.Value)
	}

	c := &http.Cookie{
		Name:     "session",
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   h.cookieSecure,
	}
	if h.cookieDomain != "" {
		c.Domain = h.cookieDomain
	}
	http.SetCookie(w, c)
	w.WriteHeader(http.StatusNoContent)
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		writeJSON(w, http.StatusOK, nil)
		return
	}

	user, err := h.db.GetUserByID(userID)
	if err != nil || user == nil {
		writeJSON(w, http.StatusOK, nil)
		return
	}

	writeJSON(w, http.StatusOK, user)
}

func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		writeError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req model.ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.OldPassword == "" || len(req.NewPassword) < 8 {
		writeError(w, "old password required, new password must be at least 8 characters", http.StatusBadRequest)
		return
	}

	if len(req.EncryptedDEK) == 0 || len(req.KEKSalt) == 0 {
		writeError(w, "encryptedDek and kekSalt are required", http.StatusBadRequest)
		return
	}

	user, err := h.db.GetUserByID(userID)
	if err != nil || user == nil {
		writeError(w, "user not found", http.StatusNotFound)
		return
	}

	if !h.db.VerifyPassword(user, req.OldPassword) {
		writeError(w, "incorrect password", http.StatusUnauthorized)
		return
	}

	if err := h.db.UpdatePassword(userID, req.NewPassword, req.EncryptedDEK, req.KEKSalt); err != nil {
		writeError(w, "internal error", http.StatusInternalServerError)
		return
	}

	cookie, _ := r.Cookie("session")
	if cookie != nil {
		_ = h.db.DeleteUserSessions(userID, cookie.Value)
	}

	w.WriteHeader(http.StatusNoContent)
}

func setSessionCookie(w http.ResponseWriter, token string, expires time.Time, domain string, secure bool) {
	c := &http.Cookie{
		Name:     "session",
		Value:    token,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   secure,
	}
	if domain != "" {
		c.Domain = domain
	}
	http.SetCookie(w, c)
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, msg string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(model.ErrorResponse{Error: msg})
}
