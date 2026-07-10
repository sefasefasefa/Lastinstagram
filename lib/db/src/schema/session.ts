import { sql } from "drizzle-orm";
import { pgTable, varchar, json, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Session storage table for connect-pg-simple (used by express-session in
 * the API server). Declared here so `db push` keeps it in sync, since
 * connect-pg-simple's own `createTableIfMissing` option can't be used from
 * an esbuild bundle (it reads a table.sql asset that isn't bundled).
 */
export const sessionTable = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey().notNull(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);
