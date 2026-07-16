import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const automationActionTypeValues = ["like", "view_story", "follow"] as const;
export const automationJobStatusValues = ["active", "paused", "failed"] as const;

// Stores job *configuration* only. Nothing in this codebase reads this
// table on a schedule or performs the described action - there is no
// cron/worker process anywhere in the api-server. Rows are always created
// with status "paused". See artifacts/api-server/src/routes/automationJobs.ts.
export const automationJobsTable = sqliteTable("automation_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  targetUsername: text("target_username").notNull(),
  actionType: text("action_type", { enum: automationActionTypeValues }).notNull(),
  frequencyMinutes: integer("frequency_minutes").notNull(),
  randomizeDelay: integer("randomize_delay", { mode: "boolean" }).notNull().default(true),
  status: text("status", { enum: automationJobStatusValues }).notNull().default("paused"),
  nextRunAt: integer("next_run_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const insertAutomationJobSchema = createInsertSchema(
  automationJobsTable,
).omit({ id: true, createdAt: true });
export type InsertAutomationJob = z.infer<typeof insertAutomationJobSchema>;
export type AutomationJob = typeof automationJobsTable.$inferSelect;
