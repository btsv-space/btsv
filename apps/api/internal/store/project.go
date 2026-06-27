package store

import (
	"database/sql"
	"time"

	"github.com/btsv/btsv/api/internal/model"
)

func (db *DB) CreateProject(userID, name, repoURL string) (*model.Project, error) {
	project := &model.Project{
		ID:        newID(),
		UserID:    userID,
		Name:      name,
		RepoURL:   repoURL,
		CreatedAt: time.Now(),
	}

	_, err := db.conn.Exec(
		"INSERT INTO projects (id, user_id, name, repo_url, created_at) VALUES (?, ?, ?, ?, ?)",
		project.ID, project.UserID, project.Name, project.RepoURL,
		project.CreatedAt.Format(time.RFC3339),
	)
	if err != nil {
		return nil, err
	}

	return project, nil
}

func (db *DB) GetProjectsByUser(userID string) ([]model.Project, error) {
	rows, err := db.conn.Query(
		"SELECT id, user_id, name, repo_url, created_at FROM projects WHERE user_id = ? ORDER BY created_at DESC",
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []model.Project
	for rows.Next() {
		var p model.Project
		var createdAt string
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.RepoURL, &createdAt); err != nil {
			return nil, err
		}
		p.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
		projects = append(projects, p)
	}

	if projects == nil {
		projects = []model.Project{}
	}

	return projects, rows.Err()
}

func (db *DB) GetProject(id, userID string) (*model.Project, error) {
	p := &model.Project{}
	var createdAt string

	err := db.conn.QueryRow(
		"SELECT id, user_id, name, repo_url, created_at FROM projects WHERE id = ? AND user_id = ?",
		id, userID,
	).Scan(&p.ID, &p.UserID, &p.Name, &p.RepoURL, &createdAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	p.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	return p, nil
}

func (db *DB) SetGitToken(projectID, userID string, blob []byte) error {
	_, err := db.conn.Exec(
		"UPDATE projects SET git_token = ? WHERE id = ? AND user_id = ?",
		blob, projectID, userID,
	)
	return err
}

func (db *DB) GetGitToken(projectID, userID string) ([]byte, error) {
	var blob []byte
	err := db.conn.QueryRow(
		"SELECT COALESCE(git_token, X'') FROM projects WHERE id = ? AND user_id = ?",
		projectID, userID,
	).Scan(&blob)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return blob, nil
}
