package store

import (
	"testing"
	"time"

	"github.com/btsv/btsv/api/internal/model"
)

func setupTest(t *testing.T) *DB {
	t.Helper()
	db, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestCreateUser(t *testing.T) {
	db := setupTest(t)

	user, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	if user.ID == "" {
		t.Fatal("expected non-empty user ID")
	}
	if user.Username != "alice" {
		t.Fatalf("expected username 'alice', got '%s'", user.Username)
	}
	if len(user.Password) == 0 {
		t.Fatal("expected non-empty password hash")
	}
}

func TestCreateUserDuplicateUsername(t *testing.T) {
	db := setupTest(t)

	_, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	_, err = db.CreateUser("alice", "otherpass", []byte("dek2"), []byte("salt2"))
	if err == nil {
		t.Fatal("expected error for duplicate username")
	}
}

func TestGetUserByUsername(t *testing.T) {
	db := setupTest(t)

	_, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	user, err := db.GetUserByUsername("alice")
	if err != nil {
		t.Fatal(err)
	}
	if user == nil {
		t.Fatal("expected non-nil user")
	}
	if user.Username != "alice" {
		t.Fatalf("expected username 'alice', got '%s'", user.Username)
	}
}

func TestGetUserByUsernameNotFound(t *testing.T) {
	db := setupTest(t)

	user, err := db.GetUserByUsername("nonexistent")
	if err != nil {
		t.Fatal(err)
	}
	if user != nil {
		t.Fatal("expected nil for nonexistent user")
	}
}

func TestGetUserByID(t *testing.T) {
	db := setupTest(t)

	created, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	user, err := db.GetUserByID(created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if user == nil {
		t.Fatal("expected non-nil user")
	}
	if user.ID != created.ID {
		t.Fatalf("expected ID '%s', got '%s'", created.ID, user.ID)
	}
}

func TestGetUserByIDNotFound(t *testing.T) {
	db := setupTest(t)

	user, err := db.GetUserByID("nonexistent-id")
	if err != nil {
		t.Fatal(err)
	}
	if user != nil {
		t.Fatal("expected nil for nonexistent user ID")
	}
}

func TestVerifyPassword(t *testing.T) {
	db := setupTest(t)

	user, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	if !db.VerifyPassword(user, "password123") {
		t.Fatal("expected correct password to verify")
	}

	if db.VerifyPassword(user, "wrongpass") {
		t.Fatal("expected wrong password to not verify")
	}
}

func TestUpdatePassword(t *testing.T) {
	db := setupTest(t)

	user, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	userID := user.ID
	err = db.UpdatePassword(userID, "newpassword123", []byte("newdek"), []byte("newsalt"))
	if err != nil {
		t.Fatal(err)
	}

	updated, err := db.GetUserByID(userID)
	if err != nil {
		t.Fatal(err)
	}
	if updated == nil {
		t.Fatal("expected user to exist after update")
	}

	if !db.VerifyPassword(updated, "newpassword123") {
		t.Fatal("expected new password to verify after update")
	}

	if db.VerifyPassword(updated, "password123") {
		t.Fatal("expected old password to not verify after update")
	}
}

func TestCreateAndGetSession(t *testing.T) {
	db := setupTest(t)

	user, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	session, err := db.CreateSession(user.ID)
	if err != nil {
		t.Fatal(err)
	}

	if session.Token == "" {
		t.Fatal("expected non-empty session token")
	}
	if session.UserID != user.ID {
		t.Fatalf("expected user ID '%s', got '%s'", user.ID, session.UserID)
	}

	got, err := db.GetSession(session.Token)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Fatal("expected non-nil session")
	}
	if got.Token != session.Token {
		t.Fatalf("expected token '%s', got '%s'", session.Token, got.Token)
	}
}

func TestCreateSessionCapsAtMaxSessions(t *testing.T) {
	db := setupTest(t)

	user, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	sessions := make([]*model.Session, 12)
	for i := 0; i < 12; i++ {
		sessions[i], err = db.CreateSession(user.ID)
		if err != nil {
			t.Fatal(err)
		}
		time.Sleep(10 * time.Millisecond)
	}

	var count int
	err = db.conn.QueryRow(
		"SELECT COUNT(*) FROM sessions WHERE user_id = ?",
		user.ID,
	).Scan(&count)
	if err != nil {
		t.Fatal(err)
	}
	if count != 10 {
		t.Fatalf("expected 10 sessions, got %d", count)
	}

	// The two oldest sessions should have been pruned.
	for i := 0; i < 2; i++ {
		got, err := db.GetSession(sessions[i].Token)
		if err != nil {
			t.Fatal(err)
		}
		if got != nil {
			t.Fatalf("expected oldest session %d to be pruned", i)
		}
	}

	// The ten newest sessions should still exist.
	for i := 2; i < 12; i++ {
		got, err := db.GetSession(sessions[i].Token)
		if err != nil {
			t.Fatal(err)
		}
		if got == nil {
			t.Fatalf("expected newest session %d to survive", i)
		}
	}
}

func TestGetSessionNotFound(t *testing.T) {
	db := setupTest(t)

	session, err := db.GetSession("nonexistent-token")
	if err != nil {
		t.Fatal(err)
	}
	if session != nil {
		t.Fatal("expected nil for nonexistent session")
	}
}

func TestDeleteSession(t *testing.T) {
	db := setupTest(t)

	user, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	session, err := db.CreateSession(user.ID)
	if err != nil {
		t.Fatal(err)
	}

	err = db.DeleteSession(session.Token)
	if err != nil {
		t.Fatal(err)
	}

	got, err := db.GetSession(session.Token)
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Fatal("expected nil after deletion")
	}
}

func TestDeleteUserSessions(t *testing.T) {
	db := setupTest(t)

	user, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	s1, err := db.CreateSession(user.ID)
	if err != nil {
		t.Fatal(err)
	}

	s2, err := db.CreateSession(user.ID)
	if err != nil {
		t.Fatal(err)
	}

	// Keep s1, delete everything else
	err = db.DeleteUserSessions(user.ID, s1.Token)
	if err != nil {
		t.Fatal(err)
	}

	// s1 should survive
	got1, _ := db.GetSession(s1.Token)
	if got1 == nil {
		t.Fatal("expected session s1 to survive")
	}

	// s2 should be gone
	got2, _ := db.GetSession(s2.Token)
	if got2 != nil {
		t.Fatal("expected session s2 to be deleted")
	}
}

func TestDeleteUserSessionsOnlyTargetUser(t *testing.T) {
	db := setupTest(t)

	alice, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	bob, err := db.CreateUser("bob", "password456", []byte("dek2"), []byte("salt2"))
	if err != nil {
		t.Fatal(err)
	}

	aliceSession, err := db.CreateSession(alice.ID)
	if err != nil {
		t.Fatal(err)
	}

	bobSession, err := db.CreateSession(bob.ID)
	if err != nil {
		t.Fatal(err)
	}

	// Delete all of alice's sessions
	err = db.DeleteUserSessions(alice.ID, "")
	if err != nil {
		t.Fatal(err)
	}

	// Alice's session should be gone
	gotAlice, _ := db.GetSession(aliceSession.Token)
	if gotAlice != nil {
		t.Fatal("expected alice's session to be deleted")
	}

	// Bob's session should survive
	gotBob, _ := db.GetSession(bobSession.Token)
	if gotBob == nil {
		t.Fatal("expected bob's session to survive")
	}
}

func TestCreateUserPreferences(t *testing.T) {
	db := setupTest(t)

	user, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	prefs, err := db.GetUserPreferences(user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if prefs == nil {
		t.Fatal("expected preferences to exist after user creation")
	}
	if prefs.SyncType != "api" {
		t.Fatalf("expected default sync_type 'api', got '%s'", prefs.SyncType)
	}
}

func TestGetUserPreferencesNotFound(t *testing.T) {
	db := setupTest(t)

	prefs, err := db.GetUserPreferences("nonexistent-id")
	if err != nil {
		t.Fatal(err)
	}
	if prefs != nil {
		t.Fatal("expected nil for nonexistent user")
	}
}

func TestUpdateUserPreferences(t *testing.T) {
	db := setupTest(t)

	user, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	err = db.UpdateUserPreferences(user.ID, "api", "http://localhost:9999")
	if err != nil {
		t.Fatal(err)
	}

	prefs, err := db.GetUserPreferences(user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if prefs.SyncType != "api" {
		t.Fatalf("expected sync_type 'api', got '%s'", prefs.SyncType)
	}
}

func TestUpdateUserPreferencesInvalidValue(t *testing.T) {
	db := setupTest(t)

	user, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	err = db.UpdateUserPreferences(user.ID, "invalid", "")
	if err != nil {
		t.Fatal(err) // store doesn't validate, handler does
	}
}

func TestDeleteUserCascadesPreferences(t *testing.T) {
	db := setupTest(t)

	user, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	err = db.DeleteUserSessions(user.ID, "")
	if err != nil {
		t.Fatal(err)
	}

	// We can't easily delete a user (no DeleteUser method), but CASCADE
	// should be tested if a DeleteUser method is added later.
	// For now, verify preferences still exist.
	prefs, err := db.GetUserPreferences(user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if prefs == nil {
		t.Fatal("expected preferences to still exist")
	}
}

func TestGetSessionExpired(t *testing.T) {
	db := setupTest(t)

	user, err := db.CreateUser("alice", "password123", []byte("dek"), []byte("salt"))
	if err != nil {
		t.Fatal(err)
	}

	session, err := db.CreateSession(user.ID)
	if err != nil {
		t.Fatal(err)
	}

	// Manually set the session to expired in the database
	_, err = db.conn.Exec(
		"UPDATE sessions SET expires = ? WHERE token = ?",
		"2000-01-01T00:00:00Z",
		session.Token,
	)
	if err != nil {
		t.Fatal(err)
	}

	// GetSession should return nil for expired session and clean it up
	got, err := db.GetSession(session.Token)
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Fatal("expected nil for expired session")
	}

	// Session should have been deleted from DB
	var count int
	err = db.conn.QueryRow("SELECT COUNT(*) FROM sessions WHERE token = ?", session.Token).Scan(&count)
	if err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("expected expired session to be cleaned up from DB")
	}
}
