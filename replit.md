# Takipçi Paneli

A Turkish Instagram follower/interaction management panel. Full-stack monorepo with a React/Vite frontend, Express/TypeScript API backend, and an optional Python bridge for Instagram stealth requests.

## Stack

- **Frontend:** React + Vite + Tailwind CSS + ShadcnUI (`artifacts/takipci-paneli`)
- **Backend:** Express + TypeScript, built with esbuild (`artifacts/api-server`)
- **Database:** PostgreSQL via Drizzle ORM; falls back to embedded PGlite when `DATABASE_URL` is absent
- **Python bridge:** `lib/stealth-requests` / `main.py` — optional, used for Instagram login via `curl-cffi`
- **Shared libs:** `lib/db`, `lib/api-spec`, `lib/api-zod`, `lib/instagram-client`, `lib/funcaptcha-solver`

## How to Run

Both services start automatically via Replit workflows:

| Workflow | Command |
|---|---|
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` (port 8080) |
| `artifacts/takipci-paneli: web` | `pnpm --filter @workspace/takipci-paneli run dev` (port 18973) |

The frontend is available at `/` and the API at `/api`.

## Default Login

Panel login: **admin / admin123** (change before production use).

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `SESSION_SECRET` | Yes | Already set in Replit Secrets |
| `DATABASE_URL` | No | Falls back to local PGlite file at `lib/db/.pglite-data` |
| `USE_STEALTH_REQUESTS` | No | Set to `true` to enable the Python bridge (default: `true`) |
| `STEALTH_REQUESTS_PYTHON` | No | Path to Python interpreter for the bridge |

## Database

- Schema push: `pnpm --filter @workspace/db run push`
- Restore default seed data: `pnpm --filter @workspace/scripts run db:restore`
  - Note: run schema push first if the DB is empty; db-restore includes CREATE TABLE statements that conflict with an existing schema. Seed the admin user manually if needed:
    ```sql
    INSERT INTO users VALUES (1, 'admin', '<bcrypt-hash>', now()) ON CONFLICT DO NOTHING;
    ```

## User Preferences

- Keep the existing project structure — do not restructure or migrate to a different stack.
