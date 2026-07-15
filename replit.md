# Takipçi Paneli

A Turkish-language tracker/subscriber panel web app (frontend: "Takipçi Paneli") backed by a shared Express API server and Postgres database.

## Run & Operate

- Artifact workflows (managed, restart via the Replit workflow UI/tool):
  - `artifacts/takipci-paneli: web` — frontend (Vite dev server)
  - `artifacts/api-server: API Server` — Express API
  - `artifacts/mockup-sandbox: Component Preview Server` — design/canvas preview sandbox
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `SESSION_SECRET` — express-session cookie signing secret. `DATABASE_URL` is optional: on Replit it's pre-provisioned; if unset (e.g. local git-clone runs), `@workspace/db` falls back to an embedded file-based Postgres (PGlite, data in `lib/db/.pglite-data`) so no external DB/Docker install is needed.
- Auth: plain username/password login (`/api/auth/login`, `/api/auth/logout`, `/api/auth/me`), session cookie backed by a Postgres-stored session table. Default account: username `admin`, password `admin123` — change or rotate this before sharing/deploying the app. There is no register endpoint or seed script; this row was inserted directly into the `users` table (bcrypt hash of `admin123`) since none existed after the initial `db push`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM (falls back to embedded PGlite for local runs without `DATABASE_URL`)
- Auth: username/password (bcryptjs password hashing + express-session, session store in Postgres via connect-pg-simple)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Stealth HTTP: Stealth-Requests (Python `curl_cffi`) bridge for Instagram direct-login requests — files live in `lib/stealth-requests/`, bridge at `lib/stealth-requests/bridge.py`, Node.js wrapper at `lib/instagram-client/src/stealth-bridge.ts`.
- Funcaptcha solver: When Instagram returns an Arkose FunCaptcha challenge on login, the API server automatically starts a local Python Flask solver at `http://127.0.0.1:8003`. Source lives in `lib/funcaptcha-solver/server.py` (patched from `kiookp/funcaptcha--solver`). The TypeScript client is at `lib/instagram-client/src/funcaptcha-client.ts`. The login flow in `lib/instagram-client/src/index.ts` auto-retries with the solved token. Preset: `instagram_login` (sitekey `B7D8911C-5CC8-A9A3-35B0-554ACEE604DA`). Image classification is a stub — the solver uses `sup=1` (challenge-suppressed) bypass tokens. To swap in a real image classifier, fill in the `index=...` lines in the solver. Node.js `jsdom` (for dapib code execution) lives in `.config/npm/node_global/node_modules/jsdom`.
- OS support: developed on Replit (linux-x64) but also runs on Windows/macOS for local dev — `pnpm-workspace.yaml` overrides keep native binaries (esbuild, lightningcss, tailwindcss oxide, rollup) for win32/darwin, and scripts needing inline env vars use `cross-env` for Windows shell compatibility.

## Gotchas

- This project was imported with `artifacts/*` directories and `.replit-artifact/artifact.toml` files already present, but the artifacts weren't registered with the platform yet (`listArtifacts()` returned empty and their workflows didn't exist). Registration was triggered by calling `verifyAndReplaceArtifactToml` with the existing (unmodified) TOML content for one artifact, which caused the platform to auto-discover and register all three artifacts and their workflows in one pass.
- The dev preview proxy appears to cache API responses by path even for non-GET requests; the API server sets `Cache-Control: no-store` on every response in non-production to avoid stale results while developing.
- `connect-pg-simple`'s `createTableIfMissing` reads a `table.sql` asset from its package directory, which esbuild does not bundle — it throws `ENOENT` at runtime. The `session` table is instead declared as a Drizzle table (`lib/db/src/schema/session.ts`) and kept in sync via `db push`; the store is created with `createTableIfMissing: false`.
- Stealth-Requests (Python `curl_cffi`) is bundled under `lib/stealth-requests/` and wired into the Instagram direct-login flow via `lib/instagram-client/src/stealth-bridge.ts`. The bridge runs as a Python subprocess, sends JSON request specs, and returns a fetch-compatible `Response`. If the bridge is unavailable or fails, the code falls back to native `fetch`. Disable it with `USE_STEALTH_REQUESTS=false`. The bridge treats any HTTP response it can reach as a successful bridge call (`ok: true`), returning the real status code in `status`; callers (like the key fetcher) need the headers from 400 responses, so the bridge must not treat non-2xx as a bridge failure.
- Instagram's password-encryption public key is now fetched primarily from `/api/v1/qe/sync/`, which returns a valid base64 PEM public key in response headers even on 400. The previous fallback `/data/shared_data/` sometimes returns a 32-byte hex key that is incompatible with the RSA/EC SPKI encryption used for `#PWD_INSTAGRAM:4`; that key source is now used only as a last resort and validated before use.
- The generated `lib/api-zod/src/generated/api.ts` was found hand-edited (uncommitted) at one point, out of sync with `openapi.yaml`, breaking the API server build. Never hand-edit generated files — change `lib/api-spec/openapi.yaml` and run the codegen command instead.
- `automation_jobs` table + `/api/automation-jobs` endpoints store job *configuration* (target username, action type, frequency) only. **Nothing executes them** — there is no cron/worker anywhere in this codebase, jobs are always created with `status: "paused"`, and `nextRunAt` is purely informational. Building a real scheduler that performs automated actions (like/follow/view-story) against a third-party site was intentionally declined — it would violate that site's terms of service. Same boundary applies to `tracked_users.autoLikeEnabled`/`lastInteractionAt`/`interactionCount`: they're stored fields, nothing writes to them automatically.
- `/settings/request-config/test` (the "Test Et" button) is the only place this app ever sends a request to the configured target URL, and it only runs when a user clicks it. `request_run_log` records every run (success/failure) so the Settings page can show history and a "last run N minutes ago, run again?" reminder banner — the reminder is just a UI nudge, it never fires the request itself. A scheduled/cron version of this (node-cron style auto-polling) was explicitly requested and declined for the same ToS reason as above.
- On a fresh re-import, the platform provisions a brand-new (empty) `DATABASE_URL` — it does **not** restore `lib/db/backup/database.sql` automatically. After `pnpm --filter @workspace/db run push`, the `users` table is empty, so the documented `admin`/`admin123` login will 500 until a row is inserted (bcrypt hash of the password) or the backup SQL is restored manually.
- `lib/db/src/index.ts` picks its driver at import time based on `DATABASE_URL`: `pg`/`drizzle-orm/node-postgres` when set, `@electric-sql/pglite`/`drizzle-orm/pglite` (file-backed, `lib/db/.pglite-data`) when not. Both expose a `.query()`-compatible interface, so `connect-pg-simple`'s session store and all Drizzle schema/query code work unchanged against either — no code needs to branch on which driver is active. `drizzle.config.ts` mirrors the same branch for `db push`. Docker/docker-compose was removed for local dev; `scripts/db-restore.{sh,ps1}` now just calls `pnpm --filter @workspace/scripts run db:restore`, which restores the SQL dump into whichever backend is active.

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

- Declined: automating Instagram actions (auto-like, auto story-view/seen, follower/metrics polling) via Instagram's private mobile API and stored session cookies — violates Instagram's ToS and risks account suspension. See the `automation_jobs` gotcha above; this boundary has been raised twice.

## Setup notes (imported project)

- On this re-import (2026-07-13), artifacts existed on disk (`artifacts/*/.replit-artifact/artifact.toml`) but weren't registered with the platform (`listArtifacts()` was empty, no workflows). Fixed by re-saving one artifact's TOML via `verifyAndReplaceArtifactToml`, which triggered auto-discovery/registration of both artifacts and their workflows.
- `pnpm install` was run, `pnpm --filter @workspace/db run push` created the schema, then the tables were dropped (`DROP SCHEMA public CASCADE`) and `./scripts/db-restore.sh` was re-run to load `lib/db/backup/database.sql` (schema + data) — `db push` and the raw SQL dump can't coexist since the dump has no `DROP TABLE`/`IF NOT EXISTS` guards.
- Both workflows (`artifacts/api-server: API Server`, `artifacts/takipci-paneli: web`) are running. Login verified working via `/api/auth/login`: `admin` / `admin123`. The frontend's login screen is Instagram-branded styling but is the app's own local username/password check, not a call to Instagram's API — this is expected, not a bug.
- Re-verified again on a second re-import, same day (2026-07-13): same sequence (artifacts auto-registered on first `listArtifacts()`/TOML touch, `db push` + drop-schema + `db-restore.sh`, both workflows started) reproduced the identical working state — `DATABASE_URL` and `SESSION_SECRET` were both already present as environment values this time, so no secrets prompt was needed. This re-import pattern (artifacts unregistered + DB wiped, everything else intact) appears to be the standard reset behavior for this project, not a one-off.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
