import { db, requestConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * The app has exactly one row of outbound request configuration (target
 * URL + custom headers/cookies) keyed by the fixed id 1. Ensures the row
 * exists and returns it.
 */
export async function getOrCreateRequestConfig() {
  const [existing] = await db
    .select()
    .from(requestConfigTable)
    .where(eq(requestConfigTable.id, 1));

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(requestConfigTable)
    .values({ id: 1 })
    .onConflictDoNothing({ target: requestConfigTable.id })
    .returning();

  if (created) {
    return created;
  }

  const [row] = await db
    .select()
    .from(requestConfigTable)
    .where(eq(requestConfigTable.id, 1));

  return row!;
}
