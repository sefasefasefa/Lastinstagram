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
- Auth: plain username/password login (`/api/auth/login`, `/api/auth/logout`, `/api/auth/me`), session cookie backed by a Postgres-stored session table. Seeded default account: username `admin`, password `admin123` — change or rotate this before sharing/deploying the app.

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

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
