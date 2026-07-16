# Takipçi Paneli

A Turkish-language Instagram follower tracking and automation panel.

## Stack
- **Frontend**: React 19 + Vite + Tailwind CSS 4 + Radix UI + TanStack Query (at `artifacts/takipci-paneli/`)
- **Backend**: Express 5 + Drizzle ORM (at `artifacts/api-server/`)
- **Database**: PGlite (embedded file-based Postgres at `lib/db/.pglite-data`) — no external Postgres needed
- **Instagram**: Python bridge via `stealth-requests` + `instagram-private-api` (optional, off by default on Replit)
- **Package manager**: pnpm workspaces

## How to Run

Both services start automatically via Replit workflows:
- **Frontend** (`artifacts/takipci-paneli: web`): Vite dev server, served at `/`
- **API Server** (`artifacts/api-server: API Server`): Express, served at `/api`

To restart manually:
```
# Frontend
pnpm --filter @workspace/takipci-paneli run dev

# Backend
pnpm --filter @workspace/api-server run dev
```

## Database Setup

Schema is managed by Drizzle ORM. To reset and re-seed:
```bash
pnpm --filter @workspace/db run push          # push schema
pnpm --filter @workspace/scripts run db:seed  # seed sample data + admin user
```

Default login: **admin / admin123** (enter your Instagram credentials on the login screen)

## Environment

- `SESSION_SECRET` — set as a Replit secret (auto-injected)
- `DATABASE_URL` — not set; app uses embedded PGlite automatically
- `STEALTH_REQUESTS_PYTHON` / `FUNCAPTCHA_PYTHON` — set to `/home/runner/workspace/.venv/bin/python3` (shared env var); points API server at the virtualenv with all Python deps installed

## Python Virtual Environment

Python deps (cryptography, pycryptodome, curl_cffi, flask, colorama, numpy, stealth-requests) are installed in `.venv/`. The env vars above ensure Node spawns the venv Python for the stealth bridge and funcaptcha solver.

To reinstall after a fresh import:
```bash
python3 -m venv .venv
.venv/bin/pip install cryptography pycryptodome curl_cffi flask colorama numpy
.venv/bin/pip install -e lib/stealth-requests/
```

## Project Structure

```
artifacts/
  api-server/       Express API server
  takipci-paneli/   React frontend
lib/
  db/               Drizzle schema, PGlite config, backup SQL
  instagram-client/ Instagram API client (native + Python bridge)
  api-spec/         Shared Zod schemas
scripts/            DB seed/restore scripts
```

## User Preferences
- Keep existing project structure — do not restructure or migrate to a different stack
