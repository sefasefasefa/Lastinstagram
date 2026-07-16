import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { trackedUsersTable } from "./trackedUsers";

export const likedMediaTypeValues = ["post", "reel"] as const;

export const likedMediaTable = sqliteTable("liked_media", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  trackedUserId: integer("tracked_user_id")
    .notNull()
    .references(() => trackedUsersTable.id, { onDelete: "cascade" }),
  mediaType: text("media_type", { enum: likedMediaTypeValues }).notNull(),
  externalId: text("external_id").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  caption: text("caption"),
  likedAt: integer("liked_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  hasLiked: integer("has_liked", { mode: "boolean" }).notNull().default(true),
});

export const insertLikedMediaSchema = createInsertSchema(likedMediaTable).omit({ id: true });
export type InsertLikedMedia = z.infer<typeof insertLikedMediaSchema>;
export type LikedMedia = typeof likedMediaTable.$inferSelect;
