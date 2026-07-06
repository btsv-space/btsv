package store

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"log"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/btsv/btsv/api/internal/model"
)

func newID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand failed: " + err.Error())
	}
	return hex.EncodeToString(b)
}

func (db *DB) CreateUser(username, password string, encryptedDEK, kekSalt []byte) (*model.User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	user := &model.User{
		ID:           newID(),
		Username:     username,
		Password:     hash,
		EncryptedDEK: encryptedDEK,
		KEKSalt:      kekSalt,
		CreatedAt:    time.Now(),
	}

	_, err = db.conn.Exec(
		"INSERT INTO users (id, username, password, encrypted_dek, kek_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		user.ID, user.Username, user.Password, user.EncryptedDEK, user.KEKSalt,
		user.CreatedAt.Format(time.RFC3339),
	)
	if err != nil {
		return nil, err
	}

	if err := db.CreateUserPreferences(user.ID); err != nil {
		return nil, err
	}

	return user, nil
}

func (db *DB) GetUserByUsername(username string) (*model.User, error) {
	user := &model.User{}
	var createdAt string

	err := db.conn.QueryRow(
		"SELECT id, username, password, encrypted_dek, kek_salt, created_at FROM users WHERE username = ?",
		username,
	).Scan(&user.ID, &user.Username, &user.Password, &user.EncryptedDEK, &user.KEKSalt, &createdAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	user.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	return user, nil
}

func (db *DB) GetUserByID(id string) (*model.User, error) {
	user := &model.User{}
	var createdAt string

	err := db.conn.QueryRow(
		"SELECT id, username, password, encrypted_dek, kek_salt, created_at FROM users WHERE id = ?",
		id,
	).Scan(&user.ID, &user.Username, &user.Password, &user.EncryptedDEK, &user.KEKSalt, &createdAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	user.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	return user, nil
}

func (db *DB) VerifyPassword(user *model.User, password string) bool {
	return bcrypt.CompareHashAndPassword(user.Password, []byte(password)) == nil
}

func (db *DB) UpdatePassword(userID, newPassword string, encryptedDEK, kekSalt []byte) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	_, err = db.conn.Exec(
		"UPDATE users SET password = ?, encrypted_dek = ?, kek_salt = ? WHERE id = ?",
		hash, encryptedDEK, kekSalt, userID,
	)
	return err
}

const maxSessionsPerUser = 10

func (db *DB) CreateSession(userID string) (*model.Session, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	token := hex.EncodeToString(b)

	session := &model.Session{
		Token:   token,
		UserID:  userID,
		Expires: time.Now().Add(14 * 24 * time.Hour),
	}

	_, err := db.conn.Exec(
		"INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)",
		session.Token, session.UserID, session.Expires.Format(time.RFC3339),
	)
	if err != nil {
		return nil, err
	}

	// Keep only the most recent sessions for this user.
	_, pruneErr := db.conn.Exec(
		`DELETE FROM sessions
		 WHERE user_id = ?
		   AND token NOT IN (
		     SELECT token FROM sessions
		     WHERE user_id = ?
		     ORDER BY expires DESC, rowid DESC
		     LIMIT ?
		   )`,
		userID, userID, maxSessionsPerUser,
	)
	if pruneErr != nil {
		log.Printf("failed to prune old sessions for user %s: %v", userID, pruneErr)
	}

	return session, nil
}

func (db *DB) GetSession(token string) (*model.Session, error) {
	session := &model.Session{}
	var expires string

	err := db.conn.QueryRow(
		"SELECT token, user_id, expires FROM sessions WHERE token = ?",
		token,
	).Scan(&session.Token, &session.UserID, &expires)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	session.Expires, _ = time.Parse(time.RFC3339, expires)
	if time.Now().After(session.Expires) {
		_ = db.DeleteSession(token)
		return nil, nil
	}

	return session, nil
}

func (db *DB) DeleteSession(token string) error {
	_, err := db.conn.Exec("DELETE FROM sessions WHERE token = ?", token)
	return err
}

func (db *DB) DeleteUserSessions(userID string, excludeToken string) error {
	_, err := db.conn.Exec("DELETE FROM sessions WHERE user_id = ? AND token != ?", userID, excludeToken)
	return err
}
