// Restores the committed database snapshot (schema + data) from
// lib/db/backup/database.sql.
//
// - If DATABASE_URL is set, restores into that Postgres server.
// - Otherwise, restores into the local embedded file-based database
//   (lib/db/.pglite-data) that the app itself falls back to — no Postgres
//   server or Docker install required.
//
// Usage:
//   pnpm --filter @workspace/scripts run db:restore
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dumpFile = path.join(__dirname, "../../lib/db/backup/database.sql");

async function main() {
  if (!existsSync(dumpFile)) {
    console.error(`Dump file not found at ${dumpFile}`);
    process.exit(1);
  }

  const sql = readFileSync(dumpFile, "utf8");
  const target = process.env.DATABASE_URL
    ? "the configured Postgres database"
    : "the local file-based database (lib/db/.pglite-data)";
  console.log(`Restoring ${dumpFile} into ${target} ...`);

  // node-postgres' Pool exposes query(); PGlite (the local fallback)
  // requires exec() to run a multi-statement SQL script.
  const anyPool = pool as unknown as {
    exec?: (sql: string) => Promise<unknown>;
    query: (sql: string) => Promise<unknown>;
  };
  if (typeof anyPool.exec === "function") {
    await anyPool.exec(sql);
  } else {
    await anyPool.query(sql);
  }

  console.log(
    "Done. Default login: admin / admin123 (change this before real use).",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
