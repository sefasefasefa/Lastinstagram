import { pgTable, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

/**
 * Single-row table (fixed id 1) holding the outbound request configuration
 * used when the app makes requests to an external URL (target URL + custom
 * headers + cookies, e.g. an Instagram session cookie). This is
 * configuration only — no automated requests are triggered by anything in
 * this codebase; a user must explicitly send a test request from the
 * settings page.
 */
export const requestConfigTable = pgTable("request_config", {
  id: integer("id").primaryKey().default(1),
  targetUrl: text("target_url"),
  headers: jsonb("headers").notNull().default({}),
  cookies: jsonb("cookies").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const keyValueMapSchema = z.record(z.string(), z.string());

export type RequestConfig = typeof requestConfigTable.$inferSelect;
