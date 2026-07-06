package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/btsv/btsv/api/internal/middleware"
	"github.com/btsv/btsv/api/internal/store"
)

func setupTest(t *testing.T) (*store.DB, *AuthHandler) {
	t.Helper()
	return setupTestWithDomain(t, "")
}

func setupTestWithDomain(t *testing.T, domain string) (*store.DB, *AuthHandler) {
	t.Helper()
	db, err := store.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db, NewAuthHandler(db, domain)
}

func registerUser(t *testing.T, handler *AuthHandler) (sessionCookie string, userID string) {
	t.Helper()
	body := `{"username":"testuser","password":"password123","encryptedDek":"AAECAwQFBgcICQoLDA0ODw==","kekSalt":"AAECAwQFBgcICQoLDA0ODw=="}`
	req := httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.Register(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("register failed: %d", resp.StatusCode)
	}

	for _, c := range resp.Cookies() {
		if c.Name == "session" {
			sessionCookie = c.Value
		}
	}
	if sessionCookie == "" {
		t.Fatal("no session cookie in register response")
	}

	var user struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		t.Fatalf("decode user response: %v", err)
	}

	return sessionCookie, user.ID
}

func TestLoginRateLimit(t *testing.T) {
	_, handler := setupTest(t)

	_, _ = registerUser(t, handler)

	// Use a dedicated test IP so we don't interfere with other tests (RFC 5737)
	ip := "192.0.2.1:12345"

	loginBody := `{"username":"testuser","password":"wrongpass"}`

	for i := range 6 {
		req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(loginBody))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = ip
		w := httptest.NewRecorder()
		handler.Login(w, req)
		resp := w.Result()
		resp.Body.Close()

		if i < 5 {
			if resp.StatusCode != http.StatusUnauthorized {
				t.Fatalf("attempt %d: expected 401, got %d", i+1, resp.StatusCode)
			}
		} else {
			if resp.StatusCode != http.StatusTooManyRequests {
				t.Fatalf("attempt %d: expected 429, got %d", i+1, resp.StatusCode)
			}
		}
	}
}

func TestLoginRateLimitResetsAfterWindow(t *testing.T) {
	_, handler := setupTest(t)

	_, _ = registerUser(t, handler)

	ip := "192.0.2.2:12345"
	loginBody := `{"username":"testuser","password":"wrongpass"}`

	// Exhaust the limit
	for range 5 {
		req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(loginBody))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = ip
		w := httptest.NewRecorder()
		handler.Login(w, req)
		resp := w.Result()
		resp.Body.Close()
	}

	// Manually reset the window so we don't wait a real minute
	rlMu.Lock()
	delete(rlEntries, ip)
	rlMu.Unlock()

	// Now the next attempt should pass (401, not 429)
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(loginBody))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = ip
	w := httptest.NewRecorder()
	handler.Login(w, req)
	resp := w.Result()
	resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 after reset, got %d", resp.StatusCode)
	}
}

func TestPasswordChangeInvalidatesOtherSessions(t *testing.T) {
	db, handler := setupTest(t)

	sessionCookie, userID := registerUser(t, handler)

	// Create another session directly via the store (simulates another device)
	otherSession, err := db.CreateSession(userID)
	if err != nil {
		t.Fatal(err)
	}

	// Verify both sessions exist
	existing1, _ := db.GetSession(sessionCookie)
	existing2, _ := db.GetSession(otherSession.Token)
	if existing1 == nil {
		t.Fatal("current session does not exist before password change")
	}
	if existing2 == nil {
		t.Fatal("other session does not exist before password change")
	}

	// Build the change-password handler wrapped with auth middleware
	changePasswordHandler := middleware.Auth(db)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handler.ChangePassword(w, r)
	}))

	body := `{"oldPassword":"password123","newPassword":"newpassword123","encryptedDek":"AAECAwQFBgcICQoLDA0ODw==","kekSalt":"AAECAwQFBgcICQoLDA0ODw=="}`
	req := httptest.NewRequest(http.MethodPost, "/auth/change-password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", "session="+sessionCookie)
	w := httptest.NewRecorder()
	changePasswordHandler.ServeHTTP(w, req)
	resp := w.Result()
	resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("change password failed: %d", resp.StatusCode)
	}

	// Current session should still exist
	existing1, _ = db.GetSession(sessionCookie)
	if existing1 == nil {
		t.Fatal("current session was deleted after password change")
	}

	// Other session should be gone
	existing2, _ = db.GetSession(otherSession.Token)
	if existing2 != nil {
		t.Fatal("other session was not invalidated after password change")
	}
}

func TestPasswordChangeKeepsCurrentSession(t *testing.T) {
	db, handler := setupTest(t)

	sessionCookie, _ := registerUser(t, handler)

	changePasswordHandler := middleware.Auth(db)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handler.ChangePassword(w, r)
	}))

	body := `{"oldPassword":"password123","newPassword":"newpassword123","encryptedDek":"AAECAwQFBgcICQoLDA0ODw==","kekSalt":"AAECAwQFBgcICQoLDA0ODw=="}`
	req := httptest.NewRequest(http.MethodPost, "/auth/change-password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", "session="+sessionCookie)
	w := httptest.NewRecorder()
	changePasswordHandler.ServeHTTP(w, req)
	resp := w.Result()
	resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("change password failed: %d", resp.StatusCode)
	}

	// Current session cookie should still work with /me
	meHandler := middleware.Auth(db)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handler.Me(w, r)
	}))

	meReq := httptest.NewRequest(http.MethodGet, "/auth/me", nil)
	meReq.Header.Set("Cookie", "session="+sessionCookie)
	meW := httptest.NewRecorder()
	meHandler.ServeHTTP(meW, meReq)
	meResp := meW.Result()
	defer meResp.Body.Close()

	if meResp.StatusCode != http.StatusOK {
		t.Fatalf("me endpoint returns %d after password change (session invalidated)", meResp.StatusCode)
	}

	var meResult map[string]interface{}
	if err := json.NewDecoder(meResp.Body).Decode(&meResult); err != nil {
		t.Fatalf("decode me response: %v", err)
	}

	username, _ := meResult["username"].(string)
	if username != "testuser" {
		t.Fatalf("expected username 'testuser', got '%s'", username)
	}
}

func TestCookieSameSiteStrict(t *testing.T) {
	_, handler := setupTest(t)

	body := `{"username":"samesitetest","password":"password123","encryptedDek":"AAECAwQFBgcICQoLDA0ODw==","kekSalt":"AAECAwQFBgcICQoLDA0ODw=="}`
	req := httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.Register(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("register failed: %d", resp.StatusCode)
	}

	var found bool
	for _, c := range resp.Cookies() {
		if c.Name == "session" {
			found = true
			if c.SameSite != http.SameSiteStrictMode {
				t.Fatalf("expected SameSite=Strict, got SameSite=%d", c.SameSite)
			}
		}
	}
	if !found {
		t.Fatal("no session cookie in response")
	}
}

func TestCookieSecureAndDomainProduction(t *testing.T) {
	_, handler := setupTestWithDomain(t, ".btsv.space")

	body := `{"username":"prodtls","password":"password123","encryptedDek":"AAECAwQFBgcICQoLDA0ODw==","kekSalt":"AAECAwQFBgcICQoLDA0ODw=="}`
	req := httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.Register(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("register failed: %d", resp.StatusCode)
	}

	var found bool
	for _, c := range resp.Cookies() {
		if c.Name == "session" {
			found = true
			if !c.Secure {
				t.Fatal("expected Secure flag in production cookie")
			}
			if c.Domain != "btsv.space" {
				t.Fatalf("expected Domain='btsv.space', got '%s'", c.Domain)
			}
		}
	}
	if !found {
		t.Fatal("no session cookie in response")
	}
}

func TestCookieSecureAndDomainDev(t *testing.T) {
	_, handler := setupTestWithDomain(t, "")

	body := `{"username":"devtls","password":"password123","encryptedDek":"AAECAwQFBgcICQoLDA0ODw==","kekSalt":"AAECAwQFBgcICQoLDA0ODw=="}`
	req := httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.Register(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("register failed: %d", resp.StatusCode)
	}

	for _, c := range resp.Cookies() {
		if c.Name == "session" {
			if c.Secure {
				t.Fatal("expected no Secure flag in dev cookie")
			}
			if c.Domain != "" {
				t.Fatalf("expected no Domain in dev cookie, got '%s'", c.Domain)
			}
		}
	}
}

func TestChangePasswordFailsWithoutCookie(t *testing.T) {
	db, handler := setupTest(t)

	body := `{"oldPassword":"password123","newPassword":"newpassword123","encryptedDek":"AAECAwQFBgcICQoLDA0ODw==","kekSalt":"AAECAwQFBgcICQoLDA0ODw=="}`
	req := httptest.NewRequest(http.MethodPost, "/auth/change-password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	changePasswordHandler := middleware.Auth(db)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handler.ChangePassword(w, r)
	}))

	w := httptest.NewRecorder()
	changePasswordHandler.ServeHTTP(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 without cookie, got %d", resp.StatusCode)
	}
}

func TestPasswordChangeFailsWithWrongOldPassword(t *testing.T) {
	db, handler := setupTest(t)

	sessionCookie, _ := registerUser(t, handler)

	changePasswordHandler := middleware.Auth(db)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handler.ChangePassword(w, r)
	}))

	body := `{"oldPassword":"wrongpassword","newPassword":"newpassword123","encryptedDek":"AAECAwQFBgcICQoLDA0ODw==","kekSalt":"AAECAwQFBgcICQoLDA0ODw=="}`
	req := httptest.NewRequest(http.MethodPost, "/auth/change-password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", "session="+sessionCookie)
	w := httptest.NewRecorder()
	changePasswordHandler.ServeHTTP(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 with wrong old password, got %d", resp.StatusCode)
	}
}

func TestRateLimitDifferentIPsIndependent(t *testing.T) {
	_, handler := setupTest(t)

	_, _ = registerUser(t, handler)
	loginBody := `{"username":"testuser","password":"wrongpass"}`

	// Exhaust limit for one IP
	for range 5 {
		req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(loginBody))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "192.0.2.10:12345"
		w := httptest.NewRecorder()
		handler.Login(w, req)
		w.Result().Body.Close()
	}

	// Different IP should not be rate-limited
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(loginBody))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "192.0.2.11:12345"
	w := httptest.NewRecorder()
	handler.Login(w, req)
	resp := w.Result()
	resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for different IP, got %d", resp.StatusCode)
	}
}
