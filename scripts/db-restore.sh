#!/usr/bin/env bash
# Restores the committed database snapshot (schema + data) from
# lib/db/backup/database.sql.
#
# No Docker or separate Postgres install needed: if DATABASE_URL isn't set,
# this restores into a local file-based database (lib/db/.pglite-data)
# bundled with the project. If DATABASE_URL is set, it restores into that
# Postgres server instead.
#
# Usage:
#   1. cp .env.example .env   (optional — only needed to point at a real Postgres)
#   2. ./scripts/db-restore.sh

set -euo pipefail

cd "$(dirname "$0")/.."

pnpm --filter @workspace/scripts run db:restore
