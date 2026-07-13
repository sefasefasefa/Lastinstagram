import { defineConfig } from "drizzle-kit";
import path from "path";

const schema = path.join(__dirname, "./src/schema/index.ts");

// With DATABASE_URL set (Replit, or any explicit external Postgres), push
// against that server. Without it, push against the same embedded PGlite
// data directory the app itself falls back to (see src/index.ts) — so
// `pnpm run push` works out of the box with no separate database install.
export default process.env.DATABASE_URL
  ? defineConfig({
      schema,
      dialect: "postgresql",
      dbCredentials: {
        url: process.env.DATABASE_URL,
      },
    })
  : defineConfig({
      schema,
      dialect: "postgresql",
      driver: "pglite",
      dbCredentials: {
        url: path.join(__dirname, "./.pglite-data"),
      },
    });
