import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const trackedUserCategoryValues = [
  "follower",
  "liked_post",
  "liked_story",
] as const;

export const trackedUsersTable = pgTable("tracked_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  fullName: text("full_name").notNull(),
  avatarUrl: text("avatar_url").notNull(),
  category: text("category", { enum: trackedUserCategoryValues }).notNull(),
  addedAt: timestamp("added_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // The following are stored fields only - nothing in this codebase writes
  // to lastInteractionAt/interactionCount automatically, and autoLikeEnabled
  // does not trigger any automated action. There is no scheduler/bot in
  // this codebase; see lib/db/src/schema/automationJobs.ts for why.
  lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
  interactionCount: integer("interaction_count").notNull().default(0),
  autoLikeEnabled: boolean("auto_like_enabled").notNull().default(false),
});

export const insertTrackedUserSchema = createInsertSchema(
  trackedUsersTable,
).omit({ id: true, addedAt: true });
export type InsertTrackedUser = z.infer<typeof insertTrackedUserSchema>;
export type TrackedUser = typeof trackedUsersTable.$inferSelect;
