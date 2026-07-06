# apps/api

Go backend — authentication, session management, and encrypted token storage for the
btsv editor frontend.

## Tech stack

- **Go 1.25** — standard library HTTP server
- **chi** — lightweight router + middleware
- **SQLite** via `modernc.org/sqlite` — pure Go, no CGO, single-file database
- **bcrypt** — password hashing
- **AES-GCM** — encrypted at-rest storage for Git tokens

## Endpoints

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create account — `{ username, password }` |
| `POST` | `/api/auth/login` | Sign in — sets `session` cookie |
| `POST` | `/api/auth/logout` | Clears `session` cookie |
| `GET` | `/api/auth/me` | Returns current user or `null` |

### Projects

All project routes require a valid session cookie.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/projects` | List user's projects |
| `POST` | `/api/projects` | Create project — `{ name, repoUrl }` |
| `GET` | `/api/projects/:id/secret` | Get decrypted Git token |
| `POST` | `/api/projects/:id/secret` | Set Git token — `{ gitToken }` |

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
│   │   └── projects.go       Project HTTP handlers
│   ├── middleware/
│   │   └── auth.go           Session cookie validation
│   ├── model/
│   │   └── model.go          Shared types (User, Session, Project, request/response)
│   └── store/
│       ├── db.go             SQLite init + migrations
│       ├── user.go           User CRUD, sessions, bcrypt
│       └── project.go        Project CRUD, AES-GCM encryption
├── data/                     SQLite database (gitignored)
├── go.mod
├── go.sum
└── .golangci.yml
```

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
| `ENCRYPTION_KEY` | generated on startup | 32-byte key for AES-GCM token encryption. Set a fixed value for persistence across restarts. |
| `COOKIE_DOMAIN` | — | Session cookie domain; when set, also enables the `Secure` flag. Use `.btsv.space` in production; leave empty in dev |

## Security

- **Passwords** — hashed with bcrypt (default cost), never stored in plaintext
- **Sessions** — 256-bit random tokens, 14-day expiry, stored server-side in SQLite
- **Session cookies** — `HttpOnly`, `SameSite=Strict`, `Secure` enabled when `COOKIE_DOMAIN` is set
- **Git tokens** — encrypted with AES-GCM before writing to SQLite. Decrypted only when
  requested by an authenticated user. Key derived from `ENCRYPTION_KEY` env var (auto-
  generated with a warning if unset, meaning tokens won't survive restarts)
- **SQLite** — single-connection (`max_open_conns=1`), WAL journal mode, foreign keys
  enabled

## Architecture notes

The backend is deliberately thin. It exists only for what the frontend cannot do:

1. **Auth** — validates passwords, manages sessions (browsers can't do bcrypt securely)
2. **Secrets** — stores and decrypts Git PATs server-side so tokens never touch
   `localStorage`. The frontend requests a decrypted token via an authenticated API
   call, uses it in-memory, and discards it.

Git operations (clone, pull, commit, push) happen entirely in the browser via
isomorphic-git. The backend never touches a Git repo.
