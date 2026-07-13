---
name: PGlite as a no-install local DB fallback
description: Swapping local dev Postgres for embedded PGlite when a Drizzle pg-core app must run with zero external DB/Docker install.
---

When a user wants to run a Drizzle (`pg-core`) app locally with no separate Postgres/Docker install, `@electric-sql/pglite` (embedded WASM Postgres, `drizzle-orm/pglite`) is a good fit: it keeps the existing `pg-core` schema unchanged and drizzle-kit has a native `driver: "pglite"` push mode.

**Why:** literal SQLite would require rewriting every schema file (`sqlite-core` has different column/type APIs), which risks breaking a working app. PGlite is wire-compatible enough with Postgres that the same schema and query code run against either driver.

**How to apply:**
- Branch the driver at runtime on `DATABASE_URL` presence: `pg`/`node-postgres` when set, `@electric-sql/pglite`/`drizzle-orm/pglite` (file-backed `dataDir`) when not. Mirror the same branch in `drizzle.config.ts` for `db push`.
- Never derive the PGlite `dataDir` from `__dirname`/`import.meta.url` if the module gets bundled (e.g. esbuild) — bundling rewrites that to the *output* file's location, not the source location, silently pointing at an empty/wrong directory. Instead, walk up from `process.cwd()` to find a stable monorepo marker (e.g. `pnpm-workspace.yaml`) and join the known relative path from there.
- Externalize `@electric-sql/pglite` in the bundler config — it ships its own WASM/tar.gz assets that bundling can break.
- A `pg_dump` plain-SQL file that uses `COPY ... FROM stdin` is **not** directly executable via a raw driver's `.query()`/`.exec()` — that syntax relies on psql's own protocol handling. Regenerate the dump with `--inserts` (plain `INSERT` statements) to make it portable across any Postgres-wire client, and strip pg_dump 16+'s `\restrict`/`\unrestrict` meta-command lines (psql-only, not valid SQL).
- `connect-pg-simple` accepts any object via `options.pool` with a compatible `.query()` — a PGlite instance works as its session store, no separate local session backend needed.
- PGlite is single-process: don't run two processes (e.g. a restore script and the app server) against the same data directory concurrently — restore first, then start the server.
