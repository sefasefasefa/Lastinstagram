import "dotenv/config";

export interface AppConfig {
  instagramUsername: string;
  instagramPassword?: string;
  instagramSessionCookie?: string;
  targetUsers: string;
  likeIntervalMinutes: number;
  maxLikesPerRun: number;
  userAgent?: string;
  referer?: string;
  xIgAppId?: string;
  proxyUrl?: string;
  useProxy: boolean;
}

export function loadConfig(): AppConfig {
  return {
    instagramUsername: process.env.INSTAGRAM_USERNAME || "",
    instagramPassword: process.env.INSTAGRAM_PASSWORD,
    instagramSessionCookie: process.env.INSTAGRAM_SESSION_COOKIE,
    targetUsers: process.env.TARGET_USERS || "",
    likeIntervalMinutes: parseInt(process.env.LIKE_INTERVAL_MINUTES || "10"),
    maxLikesPerRun: parseInt(process.env.MAX_LIKES_PER_RUN || "10"),
    userAgent: process.env.USER_AGENT,
    referer: process.env.REFERER,
    xIgAppId: process.env.X_IG_APP_ID,
    proxyUrl: process.env.PROXY_URL,
    useProxy: process.env.USE_PROXY === "true",
  };
}
