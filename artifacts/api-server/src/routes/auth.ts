import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { LoginBody, LoginResponse, GetMeResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { initClientWithCredentials } from "./instagram";
import { InstagramTwoFactorRequiredError } from "@workspace/instagram-client";

// express-session sets cookie.expires once a session is established.
function sessionExpiryOf(req: import("express").Request): string {
  const expires = req.session.cookie.expires;
  return (expires instanceof Date ? expires : new Date(expires!)).toISOString();
}

const router: IRouter = Router();

/**
 * Upsert a user row for an Instagram-authenticated account.
 * We never use the stored hash to verify — it's a sentinel that
 * bcrypt.compare will always reject, so password login is impossible
 * for Instagram-only accounts.
 */
async function upsertInstagramUser(username: string): Promise<typeof usersTable.$inferSelect> {
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username));

  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(usersTable)
    .values({ username, passwordHash: "$instagram$" })
    .returning();

  return created;
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;

  // ── 1. Try local DB auth (admin accounts) ──────────────────────────────
  const [localUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username));

  const isLocalAuth =
    localUser &&
    localUser.passwordHash !== "$instagram$" &&
    (await bcrypt.compare(password, localUser.passwordHash));

  if (isLocalAuth) {
    req.session.regenerate((err) => {
      if (err) { res.status(500).json({ error: "Failed to establish session" }); return; }
      req.session.userId = localUser.id;
      res.json(LoginResponse.parse({
        id: localUser.id,
        username: localUser.username,
        sessionExpiry: sessionExpiryOf(req),
        deviceProfile: parsed.data.deviceProfile,
      }));
    });
    return;
  }

  // ── 2. Try Instagram auth ───────────────────────────────────────────────
  try {
    const igClient = initClientWithCredentials(username, password);
    await igClient.login();
  } catch (err) {
    // TwoFactorRequired (HTTP 400): yanıt gövdesindeki two_factor_info,
    // two_factor_identifier ve two_step_verification_context alanlarını oku
    // ve çağırana ilet — ileride bir doğrulama kodu ekranı bunları kullanabilir.
    if (err instanceof InstagramTwoFactorRequiredError) {
      res.status(401).json({
        error: "Instagram hesabında iki faktörlü doğrulama açık. Lütfen doğrulama kodunu girin.",
        twoFactorRequired: true,
        twoFactorInfo: err.twoFactorInfo,
        twoFactorIdentifier: err.twoFactorIdentifier,
        twoStepVerificationContext: err.twoStepVerificationContext,
      });
      return;
    }

    const msg = err instanceof Error ? err.message : "Instagram login failed";

    // Give a friendlier message for the most common errors
    if (msg.includes("checkpoint")) {
      res.status(401).json({ error: "Instagram hesabında güvenlik doğrulaması gerekiyor. Instagram uygulamasından giriş yapıp doğrulamayı tamamlayın." });
    } else if (msg.includes("password") || msg.includes("Invalid") || msg.includes("incorrect")) {
      res.status(401).json({ error: "Instagram kullanıcı adı veya şifresi hatalı." });
    } else {
      res.status(401).json({ error: "Giriş başarısız: " + msg });
    }
    return;
  }

  // Instagram login succeeded — create/find a local user record
  const igUser = await upsertInstagramUser(username);

  req.session.regenerate((err) => {
    if (err) { res.status(500).json({ error: "Failed to establish session" }); return; }
    req.session.userId = igUser.id;
    res.json(LoginResponse.parse({
      id: igUser.id,
      username: igUser.username,
      sessionExpiry: sessionExpiryOf(req),
      deviceProfile: parsed.data.deviceProfile,
    }));
  });
});

router.post("/auth/logout", (req, res): void => {
  if (!req.session?.userId) {
    res.sendStatus(204);
    return;
  }
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.sendStatus(204);
  });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId!));

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json(GetMeResponse.parse({
    id: user.id,
    username: user.username,
    sessionExpiry: sessionExpiryOf(req),
  }));
});

export default router;
