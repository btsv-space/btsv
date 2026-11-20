# btsv

A local-first markdown+ editor for git-backed blogs. Write posts in a SvelteKit
PWA, keep them in the browser, and sync them straight to a GitHub repo. Builder
templates (Astro, Hugo) turn that repo into a site on Netlify or Cloudflare.

**There is no server.** The app is a static bundle; everything it knows lives in
your browser, and the only network calls it makes are to `api.github.com`.

## Features

- **Local-first** — posts and projects live in IndexedDB; editing works offline
- **Device lock** — a passcode encrypts your GitHub tokens at rest and is
  required on each page load
- **Direct sync** — the browser pushes/pulls through the GitHub API; no backend,
  no proxy
- **Editor** — markdown+ with autosave, offline editing and tag autocomplete
- **Post list** — sort by edited / created / published date; filter by tag,
  draft, or page
- **Publishing model** — drafts are excluded from production builds; `page` posts
  are excluded from listings/RSS
- **PWA** — installable, works offline

## Architecture

```
┌─────────────────────────────────────┐    ┌────────────────┐    ┌────────────┐
│ apps/web · SvelteKit 5 · static SPA │──▶ │ GitHub API     │──▶ │ git repo   │
│                                     │    │ REST / GraphQL │    │ content +  │
│ IndexedDB     posts · projects ·    │    └────────────────┘    │ SSG source │
│               secrets (encrypted)   │                          └────────────┘
│ localStorage  device lock · prefs   │
│ memory        DEK · plaintext token │
└─────────────────────────────────────┘
```

| Layer       | Where                | Notes                                                       |
| ----------- | -------------------- | ----------------------------------------------------------- |
| **App**     | `apps/web`           | SvelteKit 5, SPA (`ssr = false`), PWA                       |
| **Local**   | IndexedDB            | posts, projects, encrypted tokens (`secrets`)               |
| **Local**   | `localStorage`       | device lock record, prefs, sync status, view prefs          |
| **Sync**    | browser → GitHub API | one PAT per project, encrypted at rest, decrypted in memory |
| **Publish** | `builder-templates/` | SSG templates (submodules) — fork and connect a provider    |

`apps/api` and `apps/proxy` are the Go backend from the previous design. They are
kept in the repo for reference but are **not built or called** by the app.

## Getting started

### Prerequisites

- Node ≥ 24, pnpm ≥ 10
- [Playwright](https://playwright.dev/) browsers for the E2E suite

### Clone

This repo uses git submodules for the builder templates. Use a recursive clone:

```sh
git clone --recurse-submodules https://github.com/btsv-space/btsv.git
```

If you've already cloned without `--recurse-submodules`:

```sh
git submodule update --init --recursive
```

### Local development

```sh
make dev-web   # http://localhost:5173
# or
cd apps/web && pnpm dev
```

> `make dev` still starts the legacy Go API and proxy alongside the web app;
> neither is needed by the current app.

#### Mobile / network testing (HTTPS)

The Web Crypto API (`crypto.subtle`), IndexedDB and the passcode flow require a
secure context. `localhost` is fine, but testing from another device on your LAN
needs HTTPS.

Install [mkcert](https://github.com/FiloSottile/mkcert) and generate certs:

```sh
brew install mkcert   # macOS
mkcert -install
mkdir -p .certs
mkcert -cert-file .certs/dev.pem -key-file .certs/dev-key.pem \
  192.168.0.63 localhost 127.0.0.1
```

> Replace `192.168.0.63` with your machine's actual LAN IP, or add extra IPs.

Then:

```sh
make dev-host   # https://<lan-ip>:5173
```

Your browser will trust the certs automatically (mkcert root CA). On a phone:

- **iOS**: AirDrop `~/Library/Application Support/mkcert/rootCA.pem` to the
  phone → Settings → General → Profiles → install → Settings → General → About →
  Certificate Trust Settings → enable.
- **Android**: copy `rootCA.pem` to the phone → Settings → Security → Install
  from storage.

Without the CA, browsers show a warning — tap "Proceed anyway" (works fine).

### Build

```sh
make build-web          # apps/web/build/ (static site)
# or
cd apps/web && pnpm build
```

### Lint & test

```sh
cd apps/web && pnpm lint   # Prettier + ESLint
cd apps/web && pnpm test   # unit tests (vitest)
make test-e2e              # Playwright — needs .env.e2e with a GitHub test repo
```

Unit tests run in Node; the E2E suite drives a real browser against a real GitHub
repo (`TEST_REPO_URL`, `TEST_GIT_TOKEN`, `TEST_BASELINE_SHA` in `.env.e2e`) and
resets the repo's branches afterwards.

## Deployment

The build is a static site — deploy `apps/web/build/` to any static host
(Cloudflare Pages, Netlify, nginx, …). No API, database or proxy is involved.

`docker-compose.yml` predates the local-only design and still describes the old
three-service stack; it is not needed to run the app.

## Security

- A passcode derives a **KEK** (PBKDF2, 600k iterations) that wraps a random
  **DEK**; only the wrapped DEK is stored, as `btsv:deviceLock` in `localStorage`
- Each project's GitHub token is encrypted with the DEK (AES-GCM) and stored in
  the IndexedDB `secrets` store; plaintext tokens exist only in memory
- The DEK is never persisted unwrapped, so every page load starts locked and
  requires the passcode
- Losing the passcode is unrecoverable: "Reset device" wipes the lock, tokens,
  projects, posts and the local filesystem
- Nothing is sent anywhere except `api.github.com`

## Content contract

The [contract/](./contract/) directory is the single source of truth between the
editor and all builder templates. It contains a [JSON Schema](./contract/frontmatter.schema.json)
that defines the frontmatter shape.

### Core fields

| Field           | Type       | Required | Description                                            |
| --------------- | ---------- | -------- | ------------------------------------------------------ |
| `title`         | `string`   | yes      | Post title                                             |
| `dateCreated`   | `datetime` | yes      | Original creation date                                 |
| `dateUpdated`   | `datetime` | yes      | Last modified date                                     |
| `datePublished` | `datetime` | no       | Publication date (set when a draft is first published) |
| `description`   | `string`   | no       | SEO/social preview                                     |
| `tags`          | `string[]` | no       | Tag list                                               |
| `draft`         | `boolean`  | no       | Exclude from production builds                         |
| `id`            | `string`   | no       | Internal identifier (auto-generated)                   |
| `slug`          | `string`   | no       | Custom URL slug                                        |
| `page`          | `boolean`  | no       | Standalone page, excluded from listings/RSS            |

Datetimes are ISO 8601 UTC (e.g. `2026-08-19T14:30:22Z`); legacy day-precision
values (`YYYY-MM-DD`) remain valid.

### Custom fields (escape hatch)

The schema is strict (`additionalProperties: false`), but users can add **any
extra fields** to their frontmatter — the editor's parser captures them into
`extra`, passes them through untouched, and builder templates can read them.
Core fields get dedicated editor UI; custom fields don't (yet).

### Markdown+

Posts use **GitHub-flavored Markdown** via MDX, plus:

- **`<Callout>`**, **`<Figure>`** — MDX components shipped by builder templates
- **`@@ ... @@@`** — editor-only comment blocks stripped at build time

See [contract/README.md](./contract/README.md) for the full specification.

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

## Project structure

```
btsv/
├── apps/
│   ├── web/                              SvelteKit 5 SPA (adapter-static)
│   ├── api/                              legacy Go server (unused)
│   └── proxy/                            legacy Go CORS proxy (unused)
├── builder-templates/
│   ├── btsv-template-astro/              Astro blog template (git submodule)
│   └── btsv-template-hugo/               Hugo blog template (git submodule)
├── contract/
│   ├── frontmatter.schema.json           Canonical JSON Schema
│   └── README.md                         Contract specification
├── Makefile                              Dev/build/lint/test commands
├── .editorconfig
└── .gitignore
```

## License

MIT
