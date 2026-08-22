# apps/web

<sub>README current as of [`2f3dec8`](https://github.com/btsv-space/btsv/commit/2f3dec8) (2026-08-21).</sub>

SvelteKit 5 frontend — a local-first markdown+ editor built as a static SPA with PWA support.

## Tech stack

- **SvelteKit 5** with Svelte 5 runes (`$state`, `$derived`, `$effect`)
- **adapter-static** with SPA fallback (`ssr = false`)
- **isomorphic-git** — clone, pull, commit, push from the browser
- **lightning-fs** — in-memory filesystem for isomorphic-git
- **idb** — IndexedDB wrapper for the local post cache
- **@vite-pwa/sveltekit** — installable PWA, offline precache
- **TypeScript** + **ESLint** + **Prettier**

## Route structure

```
src/routes/
├── +layout.svelte          Global shell (navbar + auth state)
├── +layout.ts              export const ssr = false
├── login/
│   └── +page.svelte        Login / register form
└── (app)/                  Protected route group
    ├── +layout.svelte      Auth guard (redirects to /login if unauthenticated)
    ├── +page.svelte        / → recent project, else /projects
    ├── projects/
    │   └── +page.svelte    Project list — create / connect repos
    ├── settings/
    │   └── +page.svelte    User settings (sync mode, proxy URL)
    └── [projectId]/
        ├── +layout.svelte  Project bootstrap (clone / open repo)
        ├── +page.svelte    Post list — sort & filter
        └── [postId]/
            └── +page.svelte  Post editor
```

## Modules (`src/lib/`)

| File                   | Purpose                                                                     |
| ---------------------- | --------------------------------------------------------------------------- |
| `api.ts`               | Typed fetch wrapper for the Go backend (`http://localhost:8080/api`)        |
| `crypto.ts`            | Client-side token encryption — password-derived KEK wraps a per-user DEK    |
| `db.ts`                | IndexedDB layer — CRUD for the local post cache                             |
| `fs.ts`                | lightning-fs filesystem for isomorphic-git                                  |
| `parser.ts`            | markdown+ frontmatter parse / serialize                                     |
| `postsList.ts`         | Post list sort & filter logic                                               |
| `saver.ts`             | Debounced autosave to IndexedDB                                             |
| `tagsAutocomplete.ts`  | Tag suggestions in the editor                                               |
| `sync/`                | Git sync engine — `syncer.ts` plus `git-adapter.ts` / `api-adapter.ts`      |
| `stores/`              | Svelte 5 rune stores (auth, projects, prefs, sync status, …)                |
| `components/`          | Shared UI components                                                        |
| `contract/`            | Generated frontmatter types (`pnpm generate-frontmatter`)                   |
| `shared/`              | Shared types, constants, utils                                              |

## Scripts

```sh
pnpm dev                   # Start dev server (http://localhost:5173)
pnpm build                 # Production build → build/
pnpm preview               # Preview production build
pnpm lint                  # Prettier + ESLint
pnpm format                # Auto-fix formatting
pnpm check                 # svelte-check type checking
pnpm test                  # Unit tests (vitest)
pnpm test:e2e              # Playwright E2E (parallel + sequential projects)
pnpm generate-frontmatter  # Regenerate TS types from contract/frontmatter.schema.json
```

## Environment

| Variable         | Default                     | Description                  |
| ---------------- | --------------------------- | ---------------------------- |
| `VITE_API_URL`   | `http://localhost:8080/api` | Backend API base URL         |
| `VITE_PROXY_URL` | `http://localhost:9999`     | Git CORS proxy URL           |

`VITE_GIT_COMMIT` and `VITE_BUILD_TIME` are injected automatically at build time.

## Auth flow

1. User logs in via `/login` → POST to API → server sets `HttpOnly` session cookie
2. All subsequent API calls include the cookie (`credentials: 'include'`)
3. Auth state is tracked via `$state` runes in `stores/auth.svelte.ts`
4. Protected routes redirect to `/login` if unauthenticated
5. At login/register the frontend derives a KEK from the password (PBKDF2) and
   unwraps the per-user DEK used for token encryption (see `crypto.ts`)

## Git flow

1. User creates a project (name + repo URL) via the API
2. User enters a Git PAT, which is encrypted client-side with the DEK and stored
   via `POST /api/projects/:id/secret` (`{ ciphertext, iv }`)
3. Frontend fetches the encrypted blob via `GET /api/projects/:id/secret` and
   decrypts it in-memory
4. Token is used in-memory with isomorphic-git — plaintext is never persisted
   client-side
5. Documents are edited locally, committed, and pushed to the connected repo
