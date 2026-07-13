// Load .env before anything else — required when running outside Replit
// (e.g. on your own computer), where env vars aren't injected automatically.
import "dotenv/config";

import app from "./app";
import { logger } from "./lib/logger";

// On Replit, PORT is injected by the platform's workflow runner (see
// .replit-artifact/artifact.toml) and must be present. Running locally on
// your own computer (no REPL_ID), fall back to a sane default so `pnpm run
// dev` just works without extra setup.
const isReplit = process.env["REPL_ID"] !== undefined;
const rawPort = process.env["PORT"] ?? (isReplit ? undefined : "3000");

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
