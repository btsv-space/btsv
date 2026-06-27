# apps/web

SvelteKit 5 frontend — a local-first markdown+ editor built as a static SPA with PWA support.

## Tech stack

- **SvelteKit 5** with Svelte 5 runes (`$state`, `$derived`, `$effect`)
- **adapter-static** with SPA fallback (`ssr = false`)
- **isomorphic-git** — clone, pull, commit, push from the browser
- **lightning-fs** — in-memory filesystem for isomorphic-git
- **idb** — IndexedDB wrapper for local document cache
- **TypeScript** + **ESLint** + **Prettier**

## Route structure

```
src/routes/
├── +layout.svelte          Global shell (navbar + auth state)
├── +layout.ts              export const ssr = false
├── +page.svelte            / → redirects to /app or /login
├── login/
│   └── +page.svelte        Login / register form
└── (app)/                  Protected route group
    ├── +layout.svelte      Auth guard (redirects to /login if unauthenticated)
    ├── app/
    │   └── +page.svelte    Dashboard — project list
    └── [projectId]/
        └── +page.svelte    Editor — per-project markdown editor
```

## Modules (`src/lib/`)

| File             | Purpose                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `api.ts`         | Typed fetch wrapper for the Go backend (`http://localhost:8080/api`)                              |
| `auth.svelte.js` | `$state`-based auth store — `isAuthenticated`, `currentUser`, `login()`, `register()`, `logout()` |
| `git.ts`         | isomorphic-git wrappers — `cloneProject()`, `pullChanges()`, `commitAndPush()`                    |
| `db.ts`          | IndexedDB layer — CRUD for local document cache, keyed by `[projectId, path]`                     |

## Scripts

```sh
pnpm dev        # Start dev server (http://localhost:5173)
pnpm build      # Production build → build/
pnpm preview    # Preview production build
pnpm lint       # Prettier + ESLint
pnpm format     # Auto-fix formatting
pnpm check      # svelte-check type checking
```

## Environment

| Variable       | Default                     | Description          |
| -------------- | --------------------------- | -------------------- |
| `VITE_API_URL` | `http://localhost:8080/api` | Backend API base URL |

## Auth flow

1. User logs in via `/login` → POST to API → server sets `HttpOnly` session cookie
2. All subsequent API calls include the cookie (`credentials: 'include'`)
3. Auth state is tracked via `$state` runes in `auth.svelte.js`
4. Protected routes redirect to `/login` if unauthenticated

## Git flow

1. User creates a project (name + repo URL) via the API
2. User stores a Git PAT via `POST /api/projects/:id/secret`
3. Frontend requests the PAT via `GET /api/projects/:id/secret` (authenticated)
4. Token is used in-memory with isomorphic-git — never persisted client-side
5. Documents are edited locally, committed, and pushed to the connected repo
