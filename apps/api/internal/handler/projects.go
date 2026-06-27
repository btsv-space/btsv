package handler

import (
	"encoding/base64"
	"encoding/json"
	"net/http"

	"github.com/btsv/btsv/api/internal/middleware"
	"github.com/btsv/btsv/api/internal/model"
	"github.com/go-chi/chi/v5"
)

type ProjectHandler struct{}

func NewProjectHandler() *ProjectHandler {
	return &ProjectHandler{}
}

func (h *ProjectHandler) List(w http.ResponseWriter, r *http.Request) {
	db := middleware.GetStore(r.Context())
	userID := middleware.GetUserID(r.Context())

	projects, err := db.GetProjectsByUser(userID)
	if err != nil {
		writeError(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, projects)
}

func (h *ProjectHandler) Create(w http.ResponseWriter, r *http.Request) {
	db := middleware.GetStore(r.Context())
	userID := middleware.GetUserID(r.Context())

	var req model.CreateProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Name == "" || req.RepoURL == "" {
		writeError(w, "name and repoUrl are required", http.StatusBadRequest)
		return
	}

	project, err := db.CreateProject(userID, req.Name, req.RepoURL)
	if err != nil {
		writeError(w, "internal error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, project)
}

func (h *ProjectHandler) GetSecret(w http.ResponseWriter, r *http.Request) {
	db := middleware.GetStore(r.Context())
	userID := middleware.GetUserID(r.Context())
	projectID := chi.URLParam(r, "id")

	project, err := db.GetProject(projectID, userID)
	if err != nil || project == nil {
		writeError(w, "project not found", http.StatusNotFound)
		return
	}

	blob, err := db.GetGitToken(projectID, userID)
	if err != nil {
		writeError(w, "internal error", http.StatusInternalServerError)
		return
	}

	if len(blob) < 12 {
		writeError(w, "no token stored", http.StatusNotFound)
		return
	}

	iv := blob[:12]
	ciphertext := blob[12:]

	writeJSON(w, http.StatusOK, model.GetSecretResponse{
		Ciphertext: ciphertext,
		IV:         iv,
	})
}

func (h *ProjectHandler) SetSecret(w http.ResponseWriter, r *http.Request) {
	db := middleware.GetStore(r.Context())
	userID := middleware.GetUserID(r.Context())
	projectID := chi.URLParam(r, "id")

	var req model.SetSecretRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.Ciphertext) == 0 || len(req.IV) == 0 {
		writeError(w, "ciphertext and iv are required", http.StatusBadRequest)
		return
	}

	blob := make([]byte, 0, len(req.IV)+len(req.Ciphertext))
	blob = append(blob, req.IV...)
	blob = append(blob, req.Ciphertext...)

	if err := db.SetGitToken(projectID, userID, blob); err != nil {
		writeError(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func bytesFromBase64(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(s)
}

func bytesToBase64(b []byte) string {
	return base64.RawURLEncoding.EncodeToString(b)
}
