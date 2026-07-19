import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

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

// Sessions are stored in memory (SQLite DB, no external Postgres needed).
// Sessions are lost only on server restart — perfectly fine for a single VDS.
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    rolling: true,   // Her istekte cookie maxAge'i sıfırla (oturum aktif kaldıkça uzar)
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // "none" + secure is required so browser-extension pages
      // (chrome-extension://) can send the session cookie cross-origin.
      // Production (HTTPS) → secure:true. Local dev (HTTP) → secure:false;
      // Chrome allows SameSite=None without Secure on localhost.
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  }),
);

app.use("/api", router);

export default app;
