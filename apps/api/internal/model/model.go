package model

import "time"

type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	Password     []byte    `json:"-"`
	EncryptedDEK []byte    `json:"encryptedDek"`
	KEKSalt      []byte    `json:"kekSalt"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Session struct {
	Token   string    `json:"token"`
	UserID  string    `json:"userId"`
	Expires time.Time `json:"expires"`
}

type Project struct {
	ID        string    `json:"id"`
	UserID    string    `json:"-"`
	Name      string    `json:"name"`
	RepoURL   string    `json:"repoUrl"`
	GitToken  []byte    `json:"-"`
	CreatedAt time.Time `json:"createdAt"`
}

type RegisterRequest struct {
	Username     string `json:"username"`
	Password     string `json:"password"`
	EncryptedDEK []byte `json:"encryptedDek"`
	KEKSalt      []byte `json:"kekSalt"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	User         User   `json:"user"`
	EncryptedDEK []byte `json:"encryptedDek"`
	KEKSalt      []byte `json:"kekSalt"`
}

type CreateProjectRequest struct {
	Name    string `json:"name"`
	RepoURL string `json:"repoUrl"`
}

type SetSecretRequest struct {
	Ciphertext []byte `json:"ciphertext"`
	IV         []byte `json:"iv"`
}

type GetSecretResponse struct {
	Ciphertext []byte `json:"ciphertext"`
	IV         []byte `json:"iv"`
}

type ChangePasswordRequest struct {
	OldPassword  string `json:"oldPassword"`
	NewPassword  string `json:"newPassword"`
	EncryptedDEK []byte `json:"encryptedDek"`
	KEKSalt      []byte `json:"kekSalt"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

type UserPreferences struct {
	UserID   string `json:"-"`
	SyncType string `json:"syncType"`
	ProxyURL string `json:"proxyUrl"`
}

type UpdatePreferencesRequest struct {
	SyncType string `json:"syncType"`
	ProxyURL string `json:"proxyUrl"`
}
