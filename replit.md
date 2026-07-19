# Takipçi Paneli

An Instagram automation and management panel. Features an Express API backend, React frontend (browser extension), and Python stealth bridge services for TLS fingerprint spoofing and FunCaptcha solving.

## Stack

- **Backend:** Node.js + Express, Drizzle ORM, SQLite (`lib/db/data.db`)
- **Frontend:** React + Vite + Tailwind CSS (browser extension in `artifacts/browser-extension/`)
- **Python sidecars:** `lib/stealth-requests/` (curl_cffi bridge) and `lib/funcaptcha-solver/`
- **Monorepo:** pnpm workspaces

## How to run

The API server starts automatically via the managed workflow `artifacts/api-server: API Server`.

```
pnpm --filter @workspace/api-server run dev
```

The server listens on the port injected by Replit (`PORT` env var, defaults to 8080 locally).

## First-time setup

Dependencies are installed via `pnpm install`. The Python venv is at `.venv/` and is set up by:

```bash
bash scripts/setup-python.sh
```

Seed the admin user (username: `admin`, password: `admin123`):

```bash
pnpm --filter @workspace/scripts run db:seed-admin
```

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `SESSION_SECRET` | Yes | Set in Replit Secrets |
| `DATABASE_URL` | No | Defaults to SQLite at `lib/db/data.db` |
| `USE_STEALTH_REQUESTS` | No | Defaults to `true`; set `false` to disable Python bridge |
| `STEALTH_REQUESTS_PYTHON` | No | Path to Python interpreter; defaults to `.venv/bin/python3` |
| `FUNCAPTCHA_PYTHON` | No | Same as above for the FunCaptcha solver |

## Key paths

- `artifacts/api-server/` — Express API server
- `artifacts/browser-extension/` — React Chrome/Firefox extension UI
- `lib/db/` — Drizzle schema and SQLite database
- `lib/stealth-requests/` — Python curl_cffi stealth bridge
- `lib/funcaptcha-solver/` — Python FunCaptcha solver sidecar
- `lib/instagram-client/` — Instagram API client
- `scripts/` — DB seed/restore scripts

## User preferences

- Keep the existing monorepo structure (pnpm workspaces)
- Do not migrate to a different database without explicit request
