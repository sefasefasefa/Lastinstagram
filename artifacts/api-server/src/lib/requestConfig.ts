import { db, requestConfigTable, requestRunLogTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

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

const HISTORY_LIMIT = 20;

/**
 * Returns past test-request runs, newest first. Every row was written by
 * the "Test Et" handler after a user-triggered request - nothing else in
 * this codebase writes to this table.
 */
export async function listRequestRunLog(limit = HISTORY_LIMIT) {
  return db
    .select()
    .from(requestRunLogTable)
    .orderBy(desc(requestRunLogTable.ranAt))
    .limit(limit);
}

export async function getLastRunAt(): Promise<Date | null> {
  const [latest] = await listRequestRunLog(1);
  return latest?.ranAt ?? null;
}

export async function recordRequestRun(
  entry:
    | { success: true; status: number; statusText: string }
    | { success: false; errorMessage: string },
) {
  const [row] = await db
    .insert(requestRunLogTable)
    .values(
      entry.success
        ? { success: true, status: entry.status, statusText: entry.statusText }
        : { success: false, errorMessage: entry.errorMessage },
    )
    .returning();

  return row!;
}
