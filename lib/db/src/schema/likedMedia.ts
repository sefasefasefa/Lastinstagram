import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { trackedUsersTable } from "./trackedUsers";

export const likedMediaTypeValues = ["post", "reel"] as const;

export const likedMediaTable = pgTable("liked_media", {
  id: serial("id").primaryKey(),
  trackedUserId: integer("tracked_user_id")
    .notNull()
    .references(() => trackedUsersTable.id, { onDelete: "cascade" }),
  mediaType: text("media_type", { enum: likedMediaTypeValues }).notNull(),
  externalId: text("external_id").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  caption: text("caption"),
  likedAt: timestamp("liked_at", { withTimezone: true }).notNull().defaultNow(),
  hasLiked: boolean("has_liked").notNull().default(true),
});

export const insertLikedMediaSchema = createInsertSchema(likedMediaTable).omit({ id: true });
export type InsertLikedMedia = z.infer<typeof insertLikedMediaSchema>;
export type LikedMedia = typeof likedMediaTable.$inferSelect;
