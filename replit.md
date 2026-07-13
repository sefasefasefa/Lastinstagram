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
- Required env: `DATABASE_URL` — Postgres connection string (pre-provisioned Replit DB), `SESSION_SECRET` — express-session cookie signing secret
- Auth: plain username/password login (`/api/auth/login`, `/api/auth/logout`, `/api/auth/me`), session cookie backed by a Postgres-stored session table. Default account: username `admin`, password `admin123` — change or rotate this before sharing/deploying the app. There is no register endpoint or seed script; this row was inserted directly into the `users` table (bcrypt hash of `admin123`) since none existed after the initial `db push`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Auth: username/password (bcryptjs password hashing + express-session, session store in Postgres via connect-pg-simple)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Gotchas

- This project was imported with `artifacts/*` directories and `.replit-artifact/artifact.toml` files already present, but the artifacts weren't registered with the platform yet (`listArtifacts()` returned empty and their workflows didn't exist). Registration was triggered by calling `verifyAndReplaceArtifactToml` with the existing (unmodified) TOML content for one artifact, which caused the platform to auto-discover and register all three artifacts and their workflows in one pass.
- The dev preview proxy appears to cache API responses by path even for non-GET requests; the API server sets `Cache-Control: no-store` on every response in non-production to avoid stale results while developing.
- `connect-pg-simple`'s `createTableIfMissing` reads a `table.sql` asset from its package directory, which esbuild does not bundle — it throws `ENOENT` at runtime. The `session` table is instead declared as a Drizzle table (`lib/db/src/schema/session.ts`) and kept in sync via `db push`; the store is created with `createTableIfMissing: false`.
- The generated `lib/api-zod/src/generated/api.ts` was found hand-edited (uncommitted) at one point, out of sync with `openapi.yaml`, breaking the API server build. Never hand-edit generated files — change `lib/api-spec/openapi.yaml` and run the codegen command instead.
- `automation_jobs` table + `/api/automation-jobs` endpoints store job *configuration* (target username, action type, frequency) only. **Nothing executes them** — there is no cron/worker anywhere in this codebase, jobs are always created with `status: "paused"`, and `nextRunAt` is purely informational. Building a real scheduler that performs automated actions (like/follow/view-story) against a third-party site was intentionally declined — it would violate that site's terms of service. Same boundary applies to `tracked_users.autoLikeEnabled`/`lastInteractionAt`/`interactionCount`: they're stored fields, nothing writes to them automatically.
- `/settings/request-config/test` (the "Test Et" button) is the only place this app ever sends a request to the configured target URL, and it only runs when a user clicks it. `request_run_log` records every run (success/failure) so the Settings page can show history and a "last run N minutes ago, run again?" reminder banner — the reminder is just a UI nudge, it never fires the request itself. A scheduled/cron version of this (node-cron style auto-polling) was explicitly requested and declined for the same ToS reason as above.
- On a fresh re-import, the platform provisions a brand-new (empty) `DATABASE_URL` — it does **not** restore `lib/db/backup/database.sql` automatically. After `pnpm --filter @workspace/db run push`, the `users` table is empty, so the documented `admin`/`admin123` login will 500 until a row is inserted (bcrypt hash of the password) or the backup SQL is restored manually.

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
