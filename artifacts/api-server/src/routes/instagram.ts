import { Router, type IRouter } from "express";
import { InstagramClient } from "@workspace/instagram-client";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
let client: InstagramClient | null = null;

router.use("/instagram", requireAuth);

function getClient(): InstagramClient {
  if (!client) {
    client = new InstagramClient({
      instagramUsername: process.env.INSTAGRAM_USERNAME ?? "",
      instagramPassword: process.env.INSTAGRAM_PASSWORD,
      instagramSessionCookie: process.env.INSTAGRAM_SESSION_COOKIE,
      userAgent: process.env.USER_AGENT,

      proxyUrl: process.env.PROXY_URL,
      useProxy: process.env.USE_PROXY === "true",
    });
  }
  return client;
}

/** Called by auth.ts after a successful Instagram credential login. */
export function initClientWithCredentials(
  username: string,
  password: string,
): InstagramClient {
  client = new InstagramClient({
    instagramUsername: username,
    instagramPassword: password,
    proxyUrl: process.env.PROXY_URL,
    useProxy: process.env.USE_PROXY === "true",
  });
  return client;
}

/**
 * Bekleyen bir 2FA akışını (login() sonrası InstagramTwoFactorRequiredError)
 * tamamlamak için auth.ts'in kullandığı, en son oluşturulan istemci örneği.
 */
export function getActiveClient(): InstagramClient | null {
  return client;
}

/**
 * Aktif client örneğini sıfırlar. Env değişkenleri (PROXY_URL vb.) güncellendikten
 * sonra çağrılır — bir sonraki istekte yeni değerlere sahip bir client oluşturulur.
 */
export function resetClient(): void {
  client = null;
}

function parseLimit(value: unknown, fallback: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected Instagram error";
}

router.get("/instagram/status", (_req, res) => {
  res.json({ authenticated: client?.isAuthenticated() ?? false });
});

router.post("/instagram/login", async (_req, res): Promise<void> => {
  try {
    await getClient().login();
    res.json({ success: true, message: "Instagram session is ready" });
  } catch (error) {
    res.status(502).json({ success: false, error: errorMessage(error) });
  }
});

router.post("/instagram/logout", async (_req, res): Promise<void> => {
  try {
    await client?.logout();
    client = null;
    res.json({ success: true, message: "Instagram session closed" });
  } catch (error) {
    res.status(502).json({ success: false, error: errorMessage(error) });
  }
});

router.get("/instagram/profile/:username", async (req, res): Promise<void> => {
  try {
    const profile = await getClient().getProfile(req.params.username);
    res.json({ success: true, profile });
  } catch (error) {
    res.status(502).json({ success: false, error: errorMessage(error) });
  }
});

router.get("/instagram/posts/:username", async (req, res): Promise<void> => {
  try {
    const limit = parseLimit(req.query.limit, 20, 50);
    const posts = await getClient().getUserPosts(req.params.username, limit);
    res.json({ success: true, posts });
  } catch (error) {
    res.status(502).json({ success: false, error: errorMessage(error) });
  }
});

router.get("/instagram/stories/:username", async (req, res): Promise<void> => {
  try {
    const stories = await getClient().getUserStories(req.params.username);
    res.json({ success: true, stories });
  } catch (error) {
    res.status(502).json({ success: false, error: errorMessage(error) });
  }
});

router.get("/instagram/reels/:username", async (req, res): Promise<void> => {
  try {
    const limit = parseLimit(req.query.limit, 10, 30);
    const reels = await getClient().getUserReels(req.params.username, limit);
    res.json({ success: true, reels });
  } catch (error) {
    res.status(502).json({ success: false, error: errorMessage(error) });
  }
});

router.post("/instagram/like-post", async (req, res): Promise<void> => {
  const postId = typeof req.body?.postId === "string" ? req.body.postId : "";
  if (!postId) {
    res.status(400).json({ success: false, error: "postId is required" });
    return;
  }

  const success = await getClient().likePost(postId);
  res.status(success ? 200 : 502).json({
    success,
    message: success ? "Post liked" : "Instagram rejected the like request",
  });
});

router.post("/instagram/like-story", async (req, res): Promise<void> => {
  const storyId = typeof req.body?.storyId === "string" ? req.body.storyId : "";
  if (!storyId) {
    res.status(400).json({ success: false, error: "storyId is required" });
    return;
  }

  const success = await getClient().likeStory(storyId);
  res.status(success ? 200 : 502).json({
    success,
    message: success ? "Story liked" : "Instagram rejected the like request",
  });
});

router.post("/instagram/like-reel", async (req, res): Promise<void> => {
  const reelId = typeof req.body?.reelId === "string" ? req.body.reelId : "";
  if (!reelId) {
    res.status(400).json({ success: false, error: "reelId is required" });
    return;
  }

  const success = await getClient().likeReel(reelId);
  res.status(success ? 200 : 502).json({
    success,
    message: success ? "Reel liked" : "Instagram rejected the like request",
  });
});

router.post("/instagram/unlike-post", async (req, res): Promise<void> => {
  const postId = typeof req.body?.postId === "string" ? req.body.postId : "";
  if (!postId) {
    res.status(400).json({ success: false, error: "postId is required" });
    return;
  }

  const success = await getClient().unlikePost(postId);
  res.status(success ? 200 : 502).json({
    success,
    message: success ? "Post unliked" : "Instagram rejected the unlike request",
  });
});

router.post("/instagram/unlike-reel", async (req, res): Promise<void> => {
  const reelId = typeof req.body?.reelId === "string" ? req.body.reelId : "";
  if (!reelId) {
    res.status(400).json({ success: false, error: "reelId is required" });
    return;
  }

  const success = await getClient().unlikeReel(reelId);
  res.status(success ? 200 : 502).json({
    success,
    message: success ? "Reel unliked" : "Instagram rejected the unlike request",
  });
});

router.post("/instagram/story-seen", async (req, res): Promise<void> => {
  const storyId = typeof req.body?.storyId === "string" ? req.body.storyId : "";
  const ownerId = typeof req.body?.ownerId === "string" ? req.body.ownerId : "";
  const takenAt = typeof req.body?.takenAt === "number" ? req.body.takenAt : undefined;

  if (!storyId || !ownerId) {
    res.status(400).json({ success: false, error: "storyId and ownerId are required" });
    return;
  }

  const success = await getClient().markStorySeen(storyId, ownerId, takenAt);
  res.status(success ? 200 : 502).json({
    success,
    message: success ? "Story marked as seen" : "Instagram rejected the seen request",
  });
});

router.get("/instagram/media/:mediaId/info", async (req, res): Promise<void> => {
  try {
    const info = await getClient().getMediaInfo(req.params.mediaId);
    res.json({ success: true, info });
  } catch (error) {
    res.status(502).json({ success: false, error: errorMessage(error) });
  }
});

export default router;
