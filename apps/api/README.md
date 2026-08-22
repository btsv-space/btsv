# apps/api

<sub>README current as of [`2f3dec8`](https://github.com/btsv-space/btsv/commit/2f3dec8) (2026-08-21).</sub>

Go backend — authentication, session management, and encrypted token storage for the
btsv editor frontend.

## Tech stack

- **Go 1.25** — standard library HTTP server
- **chi** — lightweight router + middleware
- **SQLite** via `modernc.org/sqlite` — pure Go, no CGO, single-file database
- **bcrypt** — password hashing

## Endpoints

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create account — `{ username, password, encryptedDek, kekSalt }` |
| `POST` | `/api/auth/login` | Sign in — sets `session` cookie |
| `POST` | `/api/auth/logout` | Clears `session` cookie |
| `GET` | `/api/auth/me` | Returns current user or `null` |
| `POST` | `/api/auth/change-password` | Change password — `{ oldPassword, newPassword, encryptedDek, kekSalt }` |

### Projects

All project routes require a valid session cookie.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/projects` | List user's projects |
| `POST` | `/api/projects` | Create project — `{ name, repoUrl }` |
| `GET` | `/api/projects/:id/secret` | Get Git token blob — `{ ciphertext, iv }` (decrypted client-side) |
| `POST` | `/api/projects/:id/secret` | Store Git token blob — `{ ciphertext, iv }` (encrypted client-side) |

### User preferences

All preference routes require a valid session cookie.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/user/preferences` | Get the user's preferences JSON |
| `PATCH` | `/api/user/preferences` | Merge a partial preferences update |

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | `{ "status": "ok" }` |

## Project structure

```
apps/api/
├── cmd/server/
│   └── main.go              Entry point — router, middleware, server lifecycle
├── internal/
│   ├── handler/
│   │   ├── auth.go           Auth HTTP handlers
│   │   ├── projects.go       Project HTTP handlers
│   │   └── preferences.go    User preferences HTTP handlers
│   ├── middleware/
│   │   └── auth.go           Session cookie validation
│   ├── model/
│   │   └── model.go          Shared types (User, Session, Project, request/response)
│   └── store/
│       ├── db.go             SQLite init + migrations
│       ├── user.go           User CRUD, sessions, bcrypt
│       ├── project.go        Project CRUD, git token blob storage
│       └── preferences.go    Preferences persistence
├── data/                     SQLite database (gitignored)
├── go.mod
├── go.sum
└── .golangci.yml
```

Handlers and stores have co-located `*_test.go` unit tests.

## Running

```sh
# Install dependencies
cd apps/api && go mod tidy

# Development
go run ./cmd/server

# Build
CGO_ENABLED=0 go build -o bin/server ./cmd/server

# Lint
golangci-lint run ./...
```

## Environment

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Server listen port |
| `DATA_DIR` | `./data` | SQLite database directory |
| `COOKIE_DOMAIN` | — | Session cookie domain; when set, also enables the `Secure` flag. Use `.example.com` in production; leave empty in dev |

## Security

- **Passwords** — hashed with bcrypt (default cost), never stored in plaintext
- **Sessions** — 256-bit random tokens, 14-day expiry, stored server-side in SQLite
- **Session cookies** — `HttpOnly`, `SameSite=Strict`, `Secure` enabled when `COOKIE_DOMAIN` is set
- **Git tokens** — encrypted **client-side** (AES-GCM) with a per-user data key (DEK)
  before being sent to the API; the server only stores the ciphertext blob. The DEK is
  wrapped by a password-derived key (PBKDF2) and stored as `encryptedDek` + `kekSalt`
  on the user record, so plaintext tokens never leave the browser
- **SQLite** — single-connection (`max_open_conns=1`), WAL journal mode, foreign keys
  enabled

## Architecture notes

The backend is deliberately thin. It exists only for what the frontend cannot do:

1. **Auth** — validates passwords, manages sessions (browsers can't do bcrypt securely)
2. **Secrets** — stores client-encrypted Git token blobs so the same encrypted token
   is available on every device. The frontend fetches the blob via an authenticated
   API call, decrypts it in-memory with the user's DEK, and discards it.

Git operations (clone, pull, commit, push) happen entirely in the browser via
isomorphic-git. The backend never touches a Git repo.
