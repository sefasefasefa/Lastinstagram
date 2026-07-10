import { pgTable, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";

// Single-row table holding the mock connection + monitoring toggle state.
export const appStateTable = pgTable("app_state", {
  id: integer("id").primaryKey().default(1),
  connected: boolean("connected").notNull().default(false),
  username: text("username"),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  monitoringEnabled: boolean("monitoring_enabled").notNull().default(false),
});

export type AppState = typeof appStateTable.$inferSelect;
