#!/usr/bin/env bash
# Restores the committed database snapshot (schema + data) into a local
# Postgres instance. Intended for running this project on your own computer
# after `git clone` — not needed on Replit, where the database is already
# provisioned and populated.
#
# Usage:
#   1. cp .env.example .env   (and fill in DATABASE_URL for your local db,
#      e.g. postgresql://takipci:takipci@localhost:5432/takipci_paneli
#      if you used `docker compose up -d`)
#   2. ./scripts/db-restore.sh

set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. Create a .env file (see .env.example) first." >&2
  exit 1
fi

DUMP_FILE="lib/db/backup/database.sql"

if [ ! -f "$DUMP_FILE" ]; then
  echo "Dump file not found at $DUMP_FILE" >&2
  exit 1
fi

echo "Waiting for Postgres to accept connections..."
for i in $(seq 1 30); do
  if psql "$DATABASE_URL" -c '\q' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "Restoring $DUMP_FILE into $DATABASE_URL ..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$DUMP_FILE"

echo "Done. Default login: admin / admin123 (change this before real use)."
