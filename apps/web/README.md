# apps/web

SvelteKit 5 frontend — a local-first markdown+ editor built as a static SPA with
PWA support. No backend: the app talks to the GitHub API directly and keeps all
of its state in the browser.

## Tech stack

- **SvelteKit 5** with Svelte 5 runes (`$state`, `$derived`, `$effect`)
- **adapter-static** with SPA fallback (`ssr = false`)
- **idb** — IndexedDB for posts, projects and encrypted tokens
- **Web Crypto** — PBKDF2 + AES-GCM for the device lock and token encryption
- **@vite-pwa/sveltekit** — installable PWA, offline precache
- **TypeScript** + **ESLint** + **Prettier**

## Route structure

```
src/routes/
├── +layout.svelte          Shell: device gate, header, settings shortcut
├── +layout.ts              export const ssr = false
├── login/
│   └── +page.ts            307 → /projects (the login route is gone)
└── (app)/                  Rendered only while the device is unlocked
    ├── +layout.svelte      Projects hydration + background clone loop
    ├── +page.svelte        / → most recently synced project, else /projects
    ├── projects/
    │   └── +page.svelte    Project list — add / connect a repo
    ├── settings/
    │   └── +page.svelte    Device name, passcode, reset
    └── [projectId]/
        ├── +page.svelte    Post list — sort & filter
        └── [postId]/
            └── +page.svelte  Post editor
```

## Modules (`src/lib/`)

| File                  | Purpose                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `crypto.ts`           | PBKDF2 KEK derivation, AES-GCM encrypt/decrypt, random bytes             |
| `db.ts`               | IndexedDB layer — posts, projects, secrets                               |
| `fs.ts`               | Browser filesystem for clones (lightning-fs)                             |
| `parser.ts`           | markdown+ frontmatter parse / serialize                                  |
| `reset.ts`            | Full local wipe — lock, device keys, IDB, filesystem                     |
| `postsList.ts`        | Post list sort & filter logic                                            |
| `saver.ts`            | Debounced autosave to IndexedDB                                          |
| `secrets.ts`          | Token encrypt/decrypt + the unlocked-state guard                         |
| `tagsAutocomplete.ts` | Tag suggestions in the editor                                            |
| `sync/`               | `syncer.ts` (queue/commit loop) + `api-adapter.ts` (GitHub REST/GraphQL) |
| `stores/`             | Rune stores — device lock, projects, prefs, sync status, store classes   |
| `components/`         | Shared UI — gate, nav, info tip, dialogs                                 |
| `contract/`           | Generated frontmatter types (`pnpm generate-frontmatter`)                |
| `shared/`             | Types, constants, copy, utils                                            |

`sync/git-adapter.ts` is a leftover from the isomorphic-git/proxy design; the app
only uses `api-adapter.ts`.

## Scripts

```sh
pnpm dev                   # http://localhost:5173
pnpm build                 # static build → build/
pnpm preview               # serve the build locally
pnpm lint                  # Prettier + ESLint
pnpm format                # auto-fix formatting
pnpm check                 # svelte-check
pnpm test                  # unit tests (vitest, node env)
pnpm test:e2e              # Playwright (parallel + sequential projects)
pnpm generate-frontmatter  # regenerate TS types from contract/frontmatter.schema.json
```

`VITE_GIT_COMMIT` and `VITE_BUILD_TIME` are injected at build time and shown in
the settings footer. There are no API or proxy URLs to configure.

## Device lock

1. First run: a passcode derives a KEK (PBKDF2, 600k iterations) which wraps a
   random 32-byte DEK; only the wrapped DEK is stored (`btsv:deviceLock`)
2. Each project's GitHub token is encrypted with the DEK and stored in the
   IndexedDB `secrets` store
3. The DEK is kept in memory only, so every page load starts locked; unlocking
   re-derives the KEK and unwraps it
4. "Change passcode" re-wraps the same DEK; "Lock now" drops it from memory
5. "Reset device" wipes the lock, tokens, projects, posts and the filesystem

## Sync flow

1. Add a project (name + repo URL) and a fine-grained PAT
2. The token is encrypted with the DEK before it touches IndexedDB
3. The syncer queues dirty posts, commits them through the GitHub API, and
   records the project's last sync time (`btsv:projectCommits`)
4. Pulls compare against the stored base sha, so a push never skips remote work
5. Edits are saved to IndexedDB first; network failures leave posts dirty and
   they retry on the next sync
