# btsv

A web-based markdown+ document editor. Write posts in a SvelteKit PWA, persist them
to a git repo via isomorphic-git, and publish through Astro (or Hugo, etc.) deployed
to Netlify or Cloudflare.

## Architecture

```
┌──────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   apps/web   │────▶│   apps/api  │     │  Git repo   │────▶│  Netlify /  │
│  (SvelteKit) │     │    (Go)     │     │ (content +  │     │ Cloudflare  │
│   Editor SPA │     │  Auth +     │     │  Astro SSG) │     │             │
│              │◀────│  secrets    │     │             │     │             │
└──────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
     local-first           │                    ▲                    ▲
     IndexedDB +           │                    │                    │
     isomorphic-git ─ ─ ─ ─┘  git push with     │                    │
                               server-stored PAT │                    │
```

| Layer | Component | Description |
|---|---|---|
| **Frontend** | `apps/web` | SvelteKit 5, adapter-static SPA, Svelte 5 runes, local-first PWA |
| **Backend** | `apps/api` | Go + chi, SQLite, username/password auth, encrypted token storage |
| **Storage** | Git repos | Content repos per user/project; isomorphic-git pushes from the browser |
| **Publish** | `builder-templates/` | SSG templates (submodules) — users fork and connect to a provider |

## Getting started

### Prerequisites

- Node ≥ 24, pnpm ≥ 10
- Go ≥ 1.25
- [golangci-lint](https://golangci-lint.run/) (for linting the API)

### Clone

This repo uses git submodules for the builder templates. Use a recursive clone:

```sh
git clone --recurse-submodules https://github.com/btsv/btsv.git
```

If you've already cloned without `--recurse-submodules`:

```sh
git submodule update --init --recursive
```

### Local Development

```sh
# Start all services (proxy, API, web)
make dev

# Or individually
make dev-web   # http://localhost:5173
make dev-api   # http://localhost:8080
make dev-proxy # http://localhost:9999
```

#### Mobile / network testing (HTTPS)

`crypto.subtle` (used for isomorphic-git) requires a secure context. Localhost
works in HTTP, but testing from other devices on your LAN needs HTTPS.

First install [mkcert](https://github.com/FiloSottile/mkcert) and generate certs:

```sh
brew install mkcert   # macOS
mkcert -install
mkdir -p .certs
mkcert -cert-file .certs/dev.pem -key-file .certs/dev-key.pem \
  192.168.0.63 localhost 127.0.0.1
```

> Replace `192.168.0.63` with your machine's actual LAN IP, or add extra IPs.

Then start everything with HTTPS:

```sh
make dev-host
```

The `dev-host` target detects your LAN IP automatically, sets `ALLOW_ORIGIN=*`,
and passes TLS certs to all three services (Vite, API, proxy):

```
https://192.168.0.63:5173   Editor (Vite + SvelteKit)
https://192.168.0.63:8080   API (Go + chi)
https://192.168.0.63:9999   CORS proxy (Go)
```

Your browser will trust the certs automatically (mkcert root CA). On a phone:

- **iOS**: AirDrop `~/Library/Application\ Support/mkcert/rootCA.pem` to the
  phone → Settings → General → Profiles → install → Settings → General →
  About → Certificate Trust Settings → enable.
- **Android**: Copy `rootCA.pem` to the phone → Settings → Security →
  Install from storage.

Without the CA, browsers show a warning — tap "Proceed anyway" (works fine).

### Build

```sh
make build
# Frontend → apps/web/build/
# API      → apps/api/bin/server
```

### Lint

```sh
make lint
```

## Deployment (Docker)

The three services are dockerized for production deployment:

| Service | Image | Port | Domain |
|---|---|---|---|
| **Web** | nginx (static SPA) | `8100` | `app.btsv.space` |
| **API** | Go binary on alpine | `8101` | `api.btsv.space` |
| **Proxy** | Go binary on alpine | `8102` | `proxy.btsv.space` |

### Prerequisites

- Docker & Docker Compose

### Build & run

```sh
# Set the API encryption key (32 bytes, hex-encoded)
export ENCRYPTION_KEY=$(openssl rand -hex 32)

docker compose up --build
```

The `ENCRYPTION_KEY` is used for AES-GCM encryption of stored git tokens. If
unset it's auto-generated on first startup — but a fixed value is needed to
keep existing tokens decryptable across restarts.

### Environment

Production domain URLs (`VITE_API_URL`, `VITE_PROXY_URL`, `ALLOW_ORIGIN`) are
set as Docker build args and environment variables in `docker-compose.yml`.
Update `.env.production` if you run `make start` locally with production
builds instead of Docker.

| Variable | Set in | Purpose |
|---|---|---|
| `VITE_API_URL` | web build arg | API base URL baked into the SPA bundle |
| `VITE_PROXY_URL` | web build arg | Git CORS proxy URL baked into the SPA bundle |
| `ALLOW_ORIGIN` | api & proxy env vars | CORS origin header (the web app's domain) |
| `PORT` | api & proxy env vars | Internal listen port |
| `ENCRYPTION_KEY` | api env var | AES-GCM key for token encryption |
| `DATA_DIR` | api env var | SQLite database path (persisted via named volume) |

## Submodules

Builder templates live as git submodules under `builder-templates/`. Each is an
independent repo that users fork to create their own blog site. We develop them
alongside the editor to keep the content contract in sync.

### Pulling the latest template

```sh
# Pull the latest commit from the submodule's main branch
git submodule update --remote builder-templates/btsv-template-astro

# Commit the updated submodule pointer in the main repo
git add builder-templates/btsv-template-astro
git commit -m "Update btsv-template-astro submodule"
```

### Making changes to a template

```sh
cd builder-templates/btsv-template-astro

# Work on the template, commit, push
git checkout main
# ... make changes ...
git add -A
git commit -m "Description of changes"
git push origin main

# Back in the main repo, record the new submodule pointer
cd ../..
git add builder-templates/btsv-template-astro
git commit -m "Update btsv-template-astro: description"
```

## Content contract

The [contract/](./contract/) directory is the single source of truth between the
editor and all builder templates. It contains a [JSON Schema](./contract/frontmatter.schema.json)
that defines the frontmatter shape.

### Core fields

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | `string` | yes | Post title |
| `date` | `date` | yes | Publication date (`YYYY-MM-DD`) |
| `description` | `string` | no | SEO/social preview |
| `tags` | `string[]` | no | Tag list |
| `draft` | `boolean` | no | Exclude from production builds |
| `slug` | `string` | no | Custom URL slug |
| `updated` | `date` | no | Last modified date |

### Custom fields (escape hatch)

The schema uses `additionalProperties: true`. Users can add **any extra fields** to
their frontmatter — they pass through the editor untouched and are available in
builder templates. Core fields get dedicated editor UI; custom fields don't (yet).

### Markdown+

Posts use **GitHub-flavored Markdown** via MDX, plus:

- **`<Callout>`**, **`<Figure>`** — MDX components shipped by builder templates
- **`@@ ... @@@`** — editor-only comment blocks stripped at build time

See [contract/README.md](./contract/README.md) for the full specification.

## API contract

The backend exposes a REST API consumed by the frontend (`apps/web/src/lib/api.ts`).
The API base URL defaults to `http://localhost:8080/api` and can be overridden with
`VITE_API_URL`.

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | — | `{ username, password }` → `{ id, username, createdAt }` |
| `POST` | `/api/auth/login` | — | `{ username, password }` → user, sets `session` cookie |
| `POST` | `/api/auth/logout` | — | Clears `session` cookie |
| `GET` | `/api/auth/me` | session | → `{ id, username, createdAt }` or `null` |

### Projects

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/projects` | session | → `[{ id, name, repoUrl, createdAt }]` |
| `POST` | `/api/projects` | session | `{ name, repoUrl }` → project |
| `GET` | `/api/projects/:id/secret` | session | → `{ gitToken }` |
| `POST` | `/api/projects/:id/secret` | session | `{ gitToken }` → 204 |

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | `{ "status": "ok" }` |

## Security

- Git tokens are encrypted at rest with AES-GCM (key from `ENCRYPTION_KEY` env var
  or generated on startup)
- Tokens are transmitted only over authenticated API calls, used in-memory by the
  frontend, and never written to `localStorage` or IndexedDB
- Session cookies are `HttpOnly`, `SameSite=Lax`, random 256-bit tokens with 7-day expiry

## Project structure

```
btsv/
├── apps/
│   ├── web/                              SvelteKit 5 SPA (adapter-static)
│   └── api/                              Go + chi REST server
├── builder-templates/
│   └── btsv-template-astro/              Astro blog template (git submodule)
├── contract/
│   ├── frontmatter.schema.json           Canonical JSON Schema
│   └── README.md                         Contract specification
├── Makefile                              Top-level dev/build/lint commands
├── .editorconfig
└── .gitignore
```

## License

MIT
