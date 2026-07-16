import { defineConfig } from "drizzle-kit";
import path from "path";

// Use forward slashes for the schema glob — drizzle-kit's glob engine does
// not accept Windows backslashes even on win32.
const dbPath = path.join(__dirname, "data.db");

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
