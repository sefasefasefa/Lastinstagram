import { sqliteTable, integer } from "drizzle-orm/sqlite-core";

// Single-row table holding the monitoring toggle state.
export const appStateTable = sqliteTable("app_state", {
  id: integer("id").primaryKey().default(1),
  monitoringEnabled: integer("monitoring_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
});

export type AppState = typeof appStateTable.$inferSelect;
