import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
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
});

export const insertTrackedUserSchema = createInsertSchema(
  trackedUsersTable,
).omit({ id: true, addedAt: true });
export type InsertTrackedUser = z.infer<typeof insertTrackedUserSchema>;
export type TrackedUser = typeof trackedUsersTable.$inferSelect;
