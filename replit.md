# Takipçi Paneli

A Turkish Instagram follower/tracker management dashboard. Users log in with their Instagram credentials and the app tracks follower data via the Instagram private API.

## Architecture

- **Monorepo** managed with pnpm workspaces
- **Frontend** (`artifacts/takipci-paneli`): React 19 + Vite + Tailwind CSS 4 + TanStack Query
- **Backend** (`artifacts/api-server`): Node.js + Express + Drizzle ORM
- **Database**: PGLite (embedded, zero-config) or external PostgreSQL via `DATABASE_URL`
- **Instagram client** (`lib/instagram-client`): Private API integration

## Running on Replit

Both services are managed via Replit workflows and start automatically:

- **Frontend** workflow: `artifacts/takipci-paneli: web` → serves at `/`
- **API** workflow: `artifacts/api-server: API Server` → serves at `/api`

## Secrets

| Secret | Required | Purpose |
|--------|----------|---------|
| `SESSION_SECRET` | Yes | Express session signing |
| `DATABASE_URL` | No | External PostgreSQL (defaults to embedded PGLite) |

## Running locally

```bash
pnpm install
pnpm --filter @workspace/api-server run dev   # API on :3000
pnpm --filter @workspace/takipci-paneli run dev  # Frontend on :5173
```

## Notes

- The funcaptcha solver sidecar (`lib/funcaptcha-solver`) requires a Python `.venv` with `curl_cffi`. It is **non-blocking** — Instagram login works without it.
- Default login for the dashboard: `admin` / `admin123`
