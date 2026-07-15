import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { LoginBody, LoginResponse, GetMeResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { initClientWithCredentials, getActiveClient } from "./instagram";
import { logger } from "../lib/logger";
import {
  InstagramTwoFactorRequiredError,
  InstagramCaptchaChallengeError,
  InstagramCheckpointRequiredError,
  type TwoFactorMethod,
} from "@workspace/instagram-client";

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
    // Diagnostic logging: captures exactly which error class/type Instagram
    // login failed with, so real-world captcha/checkpoint responses we
    // haven't classified correctly yet can be identified and fixed. Never
    // logs the password.
    logger.warn(
      {
        username,
        errName: err instanceof Error ? err.name : typeof err,
        errMessage: err instanceof Error ? err.message : String(err),
        captchaType:
          err instanceof InstagramCaptchaChallengeError ? err.captchaType : undefined,
        isTwoFactor: err instanceof InstagramTwoFactorRequiredError,
      },
      "Instagram login failed",
    );

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

    // Checkpoint with a resolvable interactive flow: Instagram returned a
    // checkpoint_url and the automated FunCaptcha bypass failed, but the
    // client kept the pending challenge state so the user can pick a
    // verification method (SMS/email) and enter the code themselves —
    // see /auth/checkpoint/*. This must be caught BEFORE the generic
    // InstagramCaptchaChallengeError branch below.
    if (err instanceof InstagramCheckpointRequiredError) {
      res.status(401).json({
        error: "Instagram hesabında güvenlik doğrulaması (checkpoint) gerekiyor. Bir doğrulama yöntemi seçip kodu girin.",
        isCaptcha: true,
        captchaType: "checkpoint",
        checkpointRequired: true,
      });
      return;
    }

    // Captcha / checkpoint / rate-limit / spam-block: this is NOT a wrong
    // username or password, so it must never surface the generic
    // "kullanıcı adı veya şifrenizi kontrol edin" message — show a
    // challenge-specific message instead and flag isCaptcha for the client.
    if (err instanceof InstagramCaptchaChallengeError) {
      const CAPTCHA_MESSAGES: Record<typeof err.captchaType, string> = {
        checkpoint: "Instagram hesabında güvenlik doğrulaması (checkpoint) gerekiyor. Instagram uygulamasından giriş yapıp doğrulamayı tamamlayın, ardından tekrar deneyin.",
        captcha: "Instagram bir captcha/bot doğrulaması istiyor. Bu genellikle kullanıcı adı/şifre hatası değildir — Instagram uygulamasından veya tarayıcıdan giriş yapıp doğrulamayı tamamlayın.",
        rate_limit: "Instagram çok fazla giriş denemesi algıladı ve isteği geçici olarak sınırladı. Lütfen birkaç dakika bekleyip tekrar deneyin.",
        spam_or_abuse: "Instagram bu girişi şüpheli/otomatik davranış olarak işaretledi ve geçici olarak engelledi. Instagram uygulamasından giriş yapıp hesabı doğrulayın.",
        blocked: "Instagram bu girişi genel olarak reddetti ve çözülebilir bir doğrulama adımı (checkpoint kodu) sunmadı — bu genellikle otomasyon/bot tespiti kaynaklıdır, hesabınızda mutlaka bekleyen bir checkpoint olduğu anlamına gelmez. Instagram uygulamasından bu hesapla normal giriş yapıp birkaç dakika kullandıktan sonra tekrar deneyin.",
      };
      res.status(401).json({
        error: CAPTCHA_MESSAGES[err.captchaType],
        isCaptcha: true,
        captchaType: err.captchaType,
      });
      return;
    }

    const msg = err instanceof Error ? err.message : "Instagram login failed";

    // Give a friendlier message for the most common errors
    if (msg.includes("checkpoint")) {
      res.status(401).json({
        error: "Instagram hesabında güvenlik doğrulaması gerekiyor. Instagram uygulamasından giriş yapıp doğrulamayı tamamlayın.",
        isCaptcha: true,
        captchaType: "checkpoint",
      });
    } else if (msg.includes("password") || msg.includes("Invalid") || msg.includes("incorrect")) {
      res.status(401).json({ error: "Instagram kullanıcı adı veya şifresi hatalı.", isCaptcha: false });
    } else {
      res.status(401).json({ error: "Giriş başarısız: " + msg, isCaptcha: false });
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

/**
 * CAA/Bloks İki Adımlı Doğrulama — /auth/login bir twoFactorRequired yanıtı
 * döndürdükten sonra, kullanıcının girdiği doğrulama koduyla oturumu
 * tamamlar (entrypoint → method_picker → select_method → verify_code.async).
 */
router.post("/auth/verify-2fa", async (req, res): Promise<void> => {
  const verificationCode =
    typeof req.body?.verificationCode === "string" ? req.body.verificationCode.trim() : "";
  const method: TwoFactorMethod =
    req.body?.method === "sms" || req.body?.method === "backup_codes"
      ? req.body.method
      : "totp";

  if (!verificationCode) {
    res.status(400).json({ error: "verificationCode is required" });
    return;
  }

  const igClient = getActiveClient();
  if (!igClient || !igClient.hasPendingTwoFactor()) {
    res.status(400).json({ error: "Tamamlanacak bekleyen bir doğrulama isteği bulunamadı. Lütfen tekrar giriş yapın." });
    return;
  }

  try {
    await igClient.completeTwoFactorLogin(verificationCode, method);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "İki adımlı doğrulama başarısız";
    res.status(401).json({ error: msg });
    return;
  }

  const igUser = await upsertInstagramUser(igClient.getUsername());

  req.session.regenerate((err) => {
    if (err) { res.status(500).json({ error: "Failed to establish session" }); return; }
    req.session.userId = igUser.id;
    res.json(LoginResponse.parse({
      id: igUser.id,
      username: igUser.username,
      sessionExpiry: sessionExpiryOf(req),
    }));
  });
});

/**
 * Checkpoint (güvenlik doğrulaması) çözümleme akışı — /auth/login bir
 * checkpointRequired: true yanıtı döndürdükten sonra kullanılır:
 *   1. GET  /auth/checkpoint/options       → doğrulama yöntemi seçenekleri
 *   2. POST /auth/checkpoint/select-method → seçilen yönteme kod gönder
 *   3. POST /auth/checkpoint/verify        → alınan kodu doğrula, oturumu kur
 *
 * NOT: Bu, Instagram'ın belgelenmemiş özel API'sine dayanır (bkz.
 * direct-login.ts'teki challenge/resolve yorumları) — gerçek bir hesapla
 * doğrulanmalıdır.
 */
router.get("/auth/checkpoint/options", async (_req, res): Promise<void> => {
  const igClient = getActiveClient();
  if (!igClient || !igClient.hasPendingCheckpoint()) {
    res.status(400).json({ error: "Tamamlanacak bekleyen bir checkpoint akışı bulunamadı. Lütfen tekrar giriş yapın." });
    return;
  }

  try {
    const options = await igClient.getCheckpointOptions();
    res.json(options);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Checkpoint adımı sorgulanamadı";
    res.status(502).json({ error: msg });
  }
});

router.post("/auth/checkpoint/select-method", async (req, res): Promise<void> => {
  const choice = typeof req.body?.choice === "string" ? req.body.choice.trim() : "";
  if (!choice) {
    res.status(400).json({ error: "choice is required" });
    return;
  }

  const igClient = getActiveClient();
  if (!igClient || !igClient.hasPendingCheckpoint()) {
    res.status(400).json({ error: "Tamamlanacak bekleyen bir checkpoint akışı bulunamadı. Lütfen tekrar giriş yapın." });
    return;
  }

  try {
    const result = await igClient.selectCheckpointMethod(choice);

    // action:"close" → Instagram checkpoint'i bypass etti, oturum zaten kuruldu.
    // Normal login yanıtı gibi session oluştur ve kullanıcıya döndür.
    if (result.loginCompleted) {
      const igUser = await upsertInstagramUser(igClient.getUsername());
      req.session.regenerate((err) => {
        if (err) { res.status(500).json({ error: "Failed to establish session" }); return; }
        req.session.userId = igUser.id;
        res.json(LoginResponse.parse({
          id: igUser.id,
          username: igUser.username,
          sessionExpiry: sessionExpiryOf(req),
        }));
      });
      return;
    }

    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Doğrulama yöntemi seçilemedi";
    res.status(502).json({ error: msg });
  }
});

router.post("/auth/checkpoint/verify", async (req, res): Promise<void> => {
  const verificationCode =
    typeof req.body?.verificationCode === "string" ? req.body.verificationCode.trim() : "";
  if (!verificationCode) {
    res.status(400).json({ error: "verificationCode is required" });
    return;
  }

  const igClient = getActiveClient();
  if (!igClient || !igClient.hasPendingCheckpoint()) {
    res.status(400).json({ error: "Tamamlanacak bekleyen bir checkpoint akışı bulunamadı. Lütfen tekrar giriş yapın." });
    return;
  }

  try {
    await igClient.completeCheckpoint(verificationCode);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Checkpoint doğrulaması başarısız";
    res.status(401).json({ error: msg });
    return;
  }

  const igUser = await upsertInstagramUser(igClient.getUsername());

  req.session.regenerate((err) => {
    if (err) { res.status(500).json({ error: "Failed to establish session" }); return; }
    req.session.userId = igUser.id;
    res.json(LoginResponse.parse({
      id: igUser.id,
      username: igUser.username,
      sessionExpiry: sessionExpiryOf(req),
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
