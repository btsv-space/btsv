package store

import (
	"database/sql"

	"github.com/btsv/btsv/api/internal/model"
)

func (db *DB) CreateUserPreferences(userID string) error {
	_, err := db.conn.Exec(
		"INSERT INTO user_preferences (user_id, sync_type) VALUES (?, 'git')",
		userID,
	)
	return err
}

func (db *DB) GetUserPreferences(userID string) (*model.UserPreferences, error) {
	p := &model.UserPreferences{}
	err := db.conn.QueryRow(
		"SELECT user_id, sync_type, proxy_url FROM user_preferences WHERE user_id = ?",
		userID,
	).Scan(&p.UserID, &p.SyncType, &p.ProxyURL)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (db *DB) UpdateUserPreferences(userID, syncType, proxyURL string) error {
	_, err := db.conn.Exec(
		"UPDATE user_preferences SET sync_type = ?, proxy_url = ? WHERE user_id = ?",
		syncType, proxyURL, userID,
	)
	return err
}
