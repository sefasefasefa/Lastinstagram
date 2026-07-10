import { db, appStateTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * The app has exactly one row of global state (connection + monitoring
 * toggle) keyed by the fixed id 1. Ensures the row exists and returns it.
 */
export async function getOrCreateAppState() {
  const [existing] = await db
    .select()
    .from(appStateTable)
    .where(eq(appStateTable.id, 1));

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(appStateTable)
    .values({ id: 1 })
    .onConflictDoNothing({ target: appStateTable.id })
    .returning();

  if (created) {
    return created;
  }

  // Another concurrent request won the race and inserted the row first.
  const [row] = await db
    .select()
    .from(appStateTable)
    .where(eq(appStateTable.id, 1));

  return row!;
}
