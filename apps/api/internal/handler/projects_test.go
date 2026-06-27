package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/btsv/btsv/api/internal/middleware"
)

func TestListProjectsReturnsEmptyArray(t *testing.T) {
	db, authHandler := setupTest(t)
	sessionCookie, _ := registerUser(t, authHandler)

	projectHandler := NewProjectHandler()
	getHandler := middleware.Auth(db)(http.HandlerFunc(projectHandler.List))

	req := httptest.NewRequest(http.MethodGet, "/projects", nil)
	req.Header.Set("Cookie", "session="+sessionCookie)
	w := httptest.NewRecorder()
	getHandler.ServeHTTP(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var projects []struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&projects); err != nil {
		t.Fatal(err)
	}
	if len(projects) != 0 {
		t.Fatalf("expected empty array, got %d items", len(projects))
	}
}

func TestCreateProject(t *testing.T) {
	db, authHandler := setupTest(t)
	sessionCookie, _ := registerUser(t, authHandler)

	projectHandler := NewProjectHandler()
	createHandler := middleware.Auth(db)(http.HandlerFunc(projectHandler.Create))

	body := `{"name":"test","repoUrl":"https://github.com/user/repo"}`
	req := httptest.NewRequest(http.MethodPost, "/projects", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", "session="+sessionCookie)
	w := httptest.NewRecorder()
	createHandler.ServeHTTP(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", resp.StatusCode)
	}

	var project struct {
		ID      string `json:"id"`
		Name    string `json:"name"`
		RepoURL string `json:"repoUrl"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&project); err != nil {
		t.Fatal(err)
	}
	if project.Name != "test" {
		t.Fatalf("expected name 'test', got '%s'", project.Name)
	}
	if project.RepoURL != "https://github.com/user/repo" {
		t.Fatalf("expected repoUrl 'https://github.com/user/repo', got '%s'", project.RepoURL)
	}
	if project.ID == "" {
		t.Fatal("expected non-empty id")
	}
}

func TestCreateProjectRejectsMissingFields(t *testing.T) {
	db, authHandler := setupTest(t)
	sessionCookie, _ := registerUser(t, authHandler)

	projectHandler := NewProjectHandler()
	createHandler := middleware.Auth(db)(http.HandlerFunc(projectHandler.Create))

	body := `{"name":"test"}`
	req := httptest.NewRequest(http.MethodPost, "/projects", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", "session="+sessionCookie)
	w := httptest.NewRecorder()
	createHandler.ServeHTTP(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}

func TestListProjectsAfterCreate(t *testing.T) {
	db, authHandler := setupTest(t)
	sessionCookie, _ := registerUser(t, authHandler)

	projectHandler := NewProjectHandler()
	createHandler := middleware.Auth(db)(http.HandlerFunc(projectHandler.Create))
	listHandler := middleware.Auth(db)(http.HandlerFunc(projectHandler.List))

	createBody := `{"name":"test","repoUrl":"https://github.com/user/repo"}`
	createReq := httptest.NewRequest(http.MethodPost, "/projects", strings.NewReader(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Cookie", "session="+sessionCookie)
	createW := httptest.NewRecorder()
	createHandler.ServeHTTP(createW, createReq)
	if createW.Result().StatusCode != http.StatusCreated {
		t.Fatal("create failed")
	}

	listReq := httptest.NewRequest(http.MethodGet, "/projects", nil)
	listReq.Header.Set("Cookie", "session="+sessionCookie)
	listW := httptest.NewRecorder()
	listHandler.ServeHTTP(listW, listReq)
	listResp := listW.Result()
	defer listResp.Body.Close()

	if listResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", listResp.StatusCode)
	}

	var projects []struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(listResp.Body).Decode(&projects); err != nil {
		t.Fatal(err)
	}
	if len(projects) != 1 {
		t.Fatalf("expected 1 project, got %d", len(projects))
	}
}

func TestListProjectsFailsWithoutAuth(t *testing.T) {
	db, _ := setupTest(t)

	projectHandler := NewProjectHandler()
	getHandler := middleware.Auth(db)(http.HandlerFunc(projectHandler.List))

	req := httptest.NewRequest(http.MethodGet, "/projects", nil)
	w := httptest.NewRecorder()
	getHandler.ServeHTTP(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}

func TestCreateProjectFailsWithoutAuth(t *testing.T) {
	db, _ := setupTest(t)

	projectHandler := NewProjectHandler()
	createHandler := middleware.Auth(db)(http.HandlerFunc(projectHandler.Create))

	body := `{"name":"test","repoUrl":"https://github.com/user/repo"}`
	req := httptest.NewRequest(http.MethodPost, "/projects", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	createHandler.ServeHTTP(w, req)
	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}
