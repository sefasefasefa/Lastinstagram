import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";

/**
 * History of manually-triggered test requests sent from the Settings page
 * (POST /settings/request-config/test). Every row is the result of a user
 * explicitly clicking "Test Et" - nothing in this codebase inserts a row
 * here on its own; there is no scheduler or cron job.
 */
export const requestRunLogTable = pgTable("request_run_log", {
  id: serial("id").primaryKey(),
  success: boolean("success").notNull(),
  status: integer("status"),
  statusText: text("status_text"),
  errorMessage: text("error_message"),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RequestRunLog = typeof requestRunLogTable.$inferSelect;
