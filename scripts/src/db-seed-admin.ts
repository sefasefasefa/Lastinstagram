// One-shot seed: inserts the default admin user and app_state row if missing.
// Usage: pnpm --filter @workspace/scripts run db:seed-admin
import "dotenv/config";
import { pool } from "@workspace/db";

async function main() {
  await pool.query(`
    INSERT INTO public.users (id, username, password_hash, created_at)
    VALUES (1, 'admin', '$2b$10$D9iBCSa3hRIqTcHcWlitqusZbT4QvfS0HVtjZ7S0FGZrzjKbOpDQe', '2026-07-13 13:31:35+00')
    ON CONFLICT (id) DO NOTHING
  `);
  await pool.query(`
    INSERT INTO public.app_state (id, monitoring_enabled)
    VALUES (1, false)
    ON CONFLICT (id) DO NOTHING
  `);
  console.log("Seed complete — admin user and app_state ready.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
