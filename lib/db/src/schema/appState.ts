import { pgTable, boolean, integer } from "drizzle-orm/pg-core";

// Single-row table holding the monitoring toggle state.
export const appStateTable = pgTable("app_state", {
  id: integer("id").primaryKey().default(1),
  monitoringEnabled: boolean("monitoring_enabled").notNull().default(false),
});

export type AppState = typeof appStateTable.$inferSelect;
