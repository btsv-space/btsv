package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

type DB struct {
	conn *sql.DB
}

func New(dataDir string) (*DB, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	dbPath := filepath.Join(dataDir, "btsv.db")
	conn, err := sql.Open("sqlite", dbPath+"?_journal_mode=WAL&_foreign_keys=on")
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	conn.SetMaxOpenConns(1)

	db := &DB{conn: conn}
	if err := db.migrate(); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return db, nil
}

func (db *DB) Close() error {
	return db.conn.Close()
}

func (db *DB) migrate() error {
	_, err := db.conn.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id            TEXT PRIMARY KEY,
			username      TEXT NOT NULL UNIQUE,
			password      BLOB NOT NULL,
			encrypted_dek BLOB NOT NULL,
			kek_salt      BLOB NOT NULL,
			created_at    TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS sessions (
			token    TEXT PRIMARY KEY,
			user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			expires  TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS projects (
			id         TEXT PRIMARY KEY,
			user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			name       TEXT NOT NULL,
			repo_url   TEXT NOT NULL,
			git_token  BLOB,
			created_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS user_preferences (
			user_id   TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
			sync_type TEXT NOT NULL DEFAULT 'git',
			proxy_url TEXT NOT NULL DEFAULT ''
		);
	`)
	return err
}
