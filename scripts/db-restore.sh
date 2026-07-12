#!/usr/bin/env bash
# Restores the committed database snapshot (schema + data) into the local
# Postgres container started by `docker compose up -d`. Intended for running
# this project on your own computer after `git clone` — not needed on
# Replit, where the database is already provisioned and populated.
#
# Usage:
#   1. docker compose up -d
#   2. cp .env.example .env   (fill in DATABASE_URL, see .env.example)
#   3. ./scripts/db-restore.sh
#
# Uses `docker compose exec` to run psql inside the db container, so you
# don't need Postgres client tools installed on your own machine.

set -euo pipefail

cd "$(dirname "$0")/.."

DUMP_FILE="lib/db/backup/database.sql"
DB_USER="takipci"
DB_NAME="takipci_paneli"

if [ ! -f "$DUMP_FILE" ]; then
  echo "Dump file not found at $DUMP_FILE" >&2
  exit 1
fi

echo "Waiting for Postgres to accept connections..."
for i in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "Restoring $DUMP_FILE into the db container ..."
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$DUMP_FILE"

echo "Done. Default login: admin / admin123 (change this before real use)."
