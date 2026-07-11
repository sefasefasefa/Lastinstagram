import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const automationActionTypeValues = ["like", "view_story", "follow"] as const;
export const automationJobStatusValues = ["active", "paused", "failed"] as const;

// Stores job *configuration* only. Nothing in this codebase reads this
// table on a schedule or performs the described action - there is no
// cron/worker process anywhere in the api-server. Rows are always created
// with status "paused". See artifacts/api-server/src/routes/automationJobs.ts.
export const automationJobsTable = pgTable("automation_jobs", {
  id: serial("id").primaryKey(),
  targetUsername: text("target_username").notNull(),
  actionType: text("action_type", { enum: automationActionTypeValues }).notNull(),
  frequencyMinutes: integer("frequency_minutes").notNull(),
  randomizeDelay: boolean("randomize_delay").notNull().default(true),
  status: text("status", { enum: automationJobStatusValues })
    .notNull()
    .default("paused"),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAutomationJobSchema = createInsertSchema(
  automationJobsTable,
).omit({ id: true, createdAt: true });
export type InsertAutomationJob = z.infer<typeof insertAutomationJobSchema>;
export type AutomationJob = typeof automationJobsTable.$inferSelect;
