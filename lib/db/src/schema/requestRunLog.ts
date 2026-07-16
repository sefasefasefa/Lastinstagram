import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * History of manually-triggered test requests sent from the Settings page
 * (POST /settings/request-config/test). Every row is the result of a user
 * explicitly clicking "Test Et" - nothing in this codebase inserts a row
 * here on its own; there is no scheduler or cron job.
 */
export const requestRunLogTable = sqliteTable("request_run_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  success: integer("success", { mode: "boolean" }).notNull(),
  status: integer("status"),
  statusText: text("status_text"),
  errorMessage: text("error_message"),
  ranAt: integer("ran_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type RequestRunLog = typeof requestRunLogTable.$inferSelect;
