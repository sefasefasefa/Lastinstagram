import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import createPgSessionStore from "connect-pg-simple";
import pinoHttp from "pino-http";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const PgSessionStore = createPgSessionStore(session);

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.set("trust proxy", 1);

if (process.env.NODE_ENV !== "production") {
  // The dev preview is served through a proxying iframe that can cache
  // responses (observed as a stale body reused across requests with
  // different cookies/bodies). Disable caching in development only.
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
}

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set.");
}

app.use(
  session({
    // Session data lives in Postgres (auto-creates its "session" table on
    // first use) so sessions survive restarts and work across multiple
    // server instances, unlike express-session's default in-memory store.
    // The "session" table is created out-of-band (see lib/db migrations),
    // not via createTableIfMissing: that option reads a table.sql asset
    // from connect-pg-simple's package directory, which isn't copied into
    // the esbuild bundle and throws ENOENT at runtime.
    store: new PgSessionStore({ pool, createTableIfMissing: false }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  }),
);

app.use("/api", router);

export default app;
