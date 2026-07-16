// Seeds the database with the default admin account and initial app state.
// Works with SQLite (embedded, no Postgres install needed).
//
// Usage:
//   pnpm --filter @workspace/scripts run db:restore
import "dotenv/config";
import { db } from "@workspace/db";
import { usersTable, appStateTable } from "@workspace/db/schema";
import bcrypt from "bcryptjs";

async function main() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("admin123", 10);

  // Insert default admin user — skip if already exists.
  await db
    .insert(usersTable)
    .values({ username: "admin", passwordHash })
    .onConflictDoNothing();

  // Insert initial app state row — skip if already exists.
  await db
    .insert(appStateTable)
    .values({ id: 1, monitoringEnabled: false })
    .onConflictDoNothing();

  console.log("Done. Default login: admin / admin123");
  console.log("Change the password before real use.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
