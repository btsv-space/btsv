package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/btsv/btsv/api/internal/middleware"
)

func TestGetPreferencesReturnsDefault(t *testing.T) {
	db, authHandler := setupTest(t)
	sessionCookie, _ := registerUser(t, authHandler)

	prefsHandler := NewPreferencesHandler(db)
	getHandler := middleware.Auth(db)(http.HandlerFunc(prefsHandler.Get))

	req := httptest.NewRequest(http.MethodGet, "/user/preferences", nil)
	req.Header.Set("Cookie", "session="+sessionCookie)
	w := httptest.NewRecorder()
	getHandler.ServeHTTP(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var prefs struct {
		SyncType string `json:"syncType"`
		ProxyURL string `json:"proxyUrl"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&prefs); err != nil {
		t.Fatal(err)
	}
	if prefs.SyncType != "git" {
		t.Fatalf("expected syncType 'git', got '%s'", prefs.SyncType)
	}
	if prefs.ProxyURL != "" {
		t.Fatalf("expected empty default proxyUrl, got '%s'", prefs.ProxyURL)
	}
}

func TestUpdatePreferences(t *testing.T) {
	db, authHandler := setupTest(t)
	sessionCookie, _ := registerUser(t, authHandler)

	prefsHandler := NewPreferencesHandler(db)
	patchHandler := middleware.Auth(db)(http.HandlerFunc(prefsHandler.Update))

	body := `{"syncType":"api","proxyUrl":"http://proxy:8888"}`
	req := httptest.NewRequest(http.MethodPatch, "/user/preferences", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", "session="+sessionCookie)
	w := httptest.NewRecorder()
	patchHandler.ServeHTTP(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var prefs struct {
		SyncType string `json:"syncType"`
		ProxyURL string `json:"proxyUrl"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&prefs); err != nil {
		t.Fatal(err)
	}
	if prefs.SyncType != "api" {
		t.Fatalf("expected syncType 'api', got '%s'", prefs.SyncType)
	}
	if prefs.ProxyURL != "http://proxy:8888" {
		t.Fatalf("expected proxyUrl 'http://proxy:8888', got '%s'", prefs.ProxyURL)
	}
}

func TestUpdatePreferencesProxyURLOnly(t *testing.T) {
	db, authHandler := setupTest(t)
	sessionCookie, _ := registerUser(t, authHandler)

	prefsHandler := NewPreferencesHandler(db)
	patchHandler := middleware.Auth(db)(http.HandlerFunc(prefsHandler.Update))

	body := `{"proxyUrl":"http://custom:7777"}`
	req := httptest.NewRequest(http.MethodPatch, "/user/preferences", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", "session="+sessionCookie)
	w := httptest.NewRecorder()
	patchHandler.ServeHTTP(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var prefs struct {
		SyncType string `json:"syncType"`
		ProxyURL string `json:"proxyUrl"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&prefs); err != nil {
		t.Fatal(err)
	}
	if prefs.SyncType != "git" {
		t.Fatalf("expected default syncType 'git', got '%s'", prefs.SyncType)
	}
	if prefs.ProxyURL != "http://custom:7777" {
		t.Fatalf("expected proxyUrl 'http://custom:7777', got '%s'", prefs.ProxyURL)
	}
}

func TestUpdatePreferencesRejectsInvalidSyncType(t *testing.T) {
	db, authHandler := setupTest(t)
	sessionCookie, _ := registerUser(t, authHandler)

	prefsHandler := NewPreferencesHandler(db)
	patchHandler := middleware.Auth(db)(http.HandlerFunc(prefsHandler.Update))

	body := `{"syncType":"invalid"}`
	req := httptest.NewRequest(http.MethodPatch, "/user/preferences", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", "session="+sessionCookie)
	w := httptest.NewRecorder()
	patchHandler.ServeHTTP(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}

func TestGetPreferencesFailsWithoutAuth(t *testing.T) {
	db, _ := setupTest(t)
	prefsHandler := NewPreferencesHandler(db)
	getHandler := middleware.Auth(db)(http.HandlerFunc(prefsHandler.Get))

	req := httptest.NewRequest(http.MethodGet, "/user/preferences", nil)
	w := httptest.NewRecorder()
	getHandler.ServeHTTP(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}

func TestUpdatePreferencesFailsWithoutAuth(t *testing.T) {
	db, _ := setupTest(t)
	prefsHandler := NewPreferencesHandler(db)
	patchHandler := middleware.Auth(db)(http.HandlerFunc(prefsHandler.Update))

	body := `{"syncType":"api"}`
	req := httptest.NewRequest(http.MethodPatch, "/user/preferences", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	patchHandler.ServeHTTP(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}
