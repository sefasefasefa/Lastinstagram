import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

/**
 * Single-row table (fixed id 1) holding the outbound request configuration
 * used when the app makes requests to an external URL (target URL + custom
 * headers + cookies, e.g. an Instagram session cookie). This is
 * configuration only — no automated requests are triggered by anything in
 * this codebase; a user must explicitly send a test request from the
 * settings page.
 */
export const requestConfigTable = sqliteTable("request_config", {
  id: integer("id").primaryKey().default(1),
  targetUrl: text("target_url"),
  headers: text("headers", { mode: "json" })
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  cookies: text("cookies", { mode: "json" })
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const keyValueMapSchema = z.record(z.string(), z.string());

export type RequestConfig = typeof requestConfigTable.$inferSelect;
