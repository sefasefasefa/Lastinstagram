import { existsSync } from "node:fs";
import path from "node:path";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// This module is bundled (esbuild) when the API server builds for
// production, which rewrites `import.meta.url`/`__dirname` to point at the
// *output* file's location (e.g. artifacts/api-server/dist/), not this
// source file's location. So the data directory can't be derived from
// __dirname — instead, walk up from cwd to the monorepo root (marked by
// pnpm-workspace.yaml), which is stable regardless of bundling or which
// package's `pnpm run dev` set the cwd.
function findWorkspaceRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return startDir; // reached filesystem root; give up
    dir = parent;
  }
}

// Local file-based data directory used when no external Postgres is
// configured (i.e. no DATABASE_URL). Keeps the project runnable with just
// `pnpm install` — no Docker/Postgres install required. Gitignored: it's
// runtime data, not source.
const LOCAL_DB_DIR = path.join(
  findWorkspaceRoot(process.cwd()),
  "lib/db/.pglite-data",
);

let db: NodePgDatabase<typeof schema>;
let pool: import("pg").Pool | import("@electric-sql/pglite").PGlite;

if (process.env.DATABASE_URL) {
  // Replit-provisioned (or any explicitly configured) Postgres.
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
} else {
  // No DATABASE_URL: fall back to an embedded Postgres (PGlite) that
  // stores its data as files under this package, so running the project
  // locally never requires installing or starting a separate database
  // server. Same schema/query code works unchanged against it.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  pool = new PGlite({ dataDir: LOCAL_DB_DIR });
  db = drizzle(pool, { schema }) as unknown as NodePgDatabase<typeof schema>;
}

export { db, pool };
export * from "./schema";
