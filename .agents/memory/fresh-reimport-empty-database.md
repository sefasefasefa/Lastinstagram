---
name: Fresh re-import gives an empty database
description: A re-imported project gets a brand-new, empty Replit Postgres DB — backup SQL isn't auto-restored, so documented seed accounts/rows are missing until pushed and inserted manually.
---

Re-importing a project (e.g. from GitHub) provisions a new `DATABASE_URL` with no data, even if the repo ships a `pg_dump` backup file (e.g. `lib/db/backup/database.sql`) documented for local setup. That backup is not restored automatically on Replit.

**Why:** the backup script/instructions in the README are written for local Docker Postgres setup, not for Replit's managed DB provisioning flow.

**How to apply:** after `db push` on a freshly (re-)provisioned DB, check whether the app depends on seed rows (e.g. a documented default login). If the docs mention a default account credential, verify it actually exists in `users` (or equivalent) before assuming login/auth will work — insert it directly (bcrypt-hash the password) if missing, since 500s on login here usually mean the row simply isn't there yet, not a code bug.
