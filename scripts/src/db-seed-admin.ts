// One-shot seed: inserts the default admin user and app_state row if missing.
// Usage: pnpm --filter @workspace/scripts run db:seed-admin
import "dotenv/config";
import { db } from "@workspace/db";
import { usersTable, appStateTable } from "@workspace/db/schema";
import bcrypt from "bcryptjs";

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  db.insert(usersTable)
    .values({ username: "admin", passwordHash })
    .onConflictDoNothing()
    .run();

  db.insert(appStateTable)
    .values({ id: 1, monitoringEnabled: false })
    .onConflictDoNothing()
    .run();

  console.log("Seed complete — admin user and app_state ready.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
