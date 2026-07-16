import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const trackedUserCategoryValues = [
  "follower",
  "liked_post",
  "liked_story",
  "liked_reel",
] as const;

export const trackedUsersTable = sqliteTable("tracked_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull(),
  fullName: text("full_name").notNull(),
  avatarUrl: text("avatar_url").notNull(),
  category: text("category", { enum: trackedUserCategoryValues }).notNull(),
  addedAt: integer("added_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  // The following are stored fields only - nothing in this codebase writes
  // to lastInteractionAt/interactionCount automatically, and autoLikeEnabled
  // does not trigger any automated action. There is no scheduler/bot in
  // this codebase; see lib/db/src/schema/automationJobs.ts for why.
  lastInteractionAt: integer("last_interaction_at", { mode: "timestamp" }),
  interactionCount: integer("interaction_count").notNull().default(0),
  autoLikeEnabled: integer("auto_like_enabled", { mode: "boolean" }).notNull().default(false),
  // Follower count tracking — updated on demand via POST /tracked-users/:id/refresh-followers
  followerCount: integer("follower_count"),
  previousFollowerCount: integer("previous_follower_count"),
  followerCountUpdatedAt: integer("follower_count_updated_at", { mode: "timestamp" }),
});

export const insertTrackedUserSchema = createInsertSchema(
  trackedUsersTable,
).omit({ id: true, addedAt: true });
export type InsertTrackedUser = z.infer<typeof insertTrackedUserSchema>;
export type TrackedUser = typeof trackedUsersTable.$inferSelect;
