# Takipçi Paneli

Turkish-localized Instagram tracking and automation panel. Built as a TypeScript pnpm monorepo.

## Stack

- **Frontend** (`artifacts/takipci-paneli`): React 19 + Vite + Tailwind CSS 4 + Radix UI + TanStack Query + Wouter
- **Backend** (`artifacts/api-server`): Express 5 + TypeScript (built with esbuild, runs as ESM)
- **Database** (`lib/db`): Drizzle ORM over PostgreSQL; falls back to embedded PGlite when `DATABASE_URL` is not set
- **Instagram client** (`lib/instagram-client`): Stealth HTTP client with TLS fingerprint spoofing (Linux `.so` binary)
- **Python bridge** (`lib/stealth-requests`): curl_cffi-based request bridge for additional stealth coverage

## How to run

Both services start automatically via Replit workflows:

| Workflow | Command |
|---|---|
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` |
| `artifacts/takipci-paneli: web` | `pnpm --filter @workspace/takipci-paneli run dev` |

The API server listens on port 8080 (`/api`). The frontend dev server listens on port 18973 (`/`).

## First-time database setup

```bash
# 1. Push schema
pnpm --filter @workspace/db run push

# 2. Seed default admin user
pnpm --filter @workspace/scripts run db:seed-admin

# Optional: seed mock data (tracked users, liked media, etc.)
pnpm --filter @workspace/scripts run db:seed
```

The database is SQLite — a single file at `lib/db/data.db`. No Postgres, no Docker needed.

## Windows setup

```powershell
# 1. Install Node deps
pnpm install

# 2. Push schema & seed
pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run db:seed-admin

# 3. Python venv (for Instagram stealth bridge & funcaptcha solver)
.\scripts\setup-python.ps1

# 4. Start both services in separate terminals
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/takipci-paneli run dev
```

The Python venv path is auto-detected (`py` launcher on Windows). If you have multiple Python versions, add to `.env`:
```
STEALTH_REQUESTS_PYTHON=.venv\Scripts\python.exe
```

## Default login

- **Username:** `admin`
- **Password:** `admin123`

> Change `ADMIN_PASSWORD` in your environment for production use.

## Environment variables / secrets

| Variable | Required | Notes |
|---|---|---|
| `SESSION_SECRET` | ✅ Yes | Already set as a Replit secret |
| `DATABASE_URL` | ❌ No | Falls back to PGlite if unset |
| `ADMIN_PASSWORD` | ❌ No | Defaults to `admin123` — rotate for production |
| `VITE_ADMIN_ENABLED` | ❌ No | Set to `true` to enable admin UI in the frontend |

## Funcaptcha solver

The optional Python funcaptcha solver (`lib/funcaptcha-solver/app.py`) requires a `.venv` with `curl_cffi` installed. It starts automatically but the app works fine without it — Instagram login falls back to the stealth bridge.

## User preferences

(none yet)
