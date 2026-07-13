/**
 * Direct Instagram login using:
 *   - PWD_INSTAGRAM:4 password encryption (AES-256-GCM + RSA-PKCS1)
 *   - signed_body HMAC-SHA256 (mobile API)
 *   - Mobile endpoint first, web endpoint as fallback
 *
 * Wire format (from Instagram private API):
 *   #PWD_INSTAGRAM:4:<timestamp>:<base64(
 *     [0x01, keyId, iv(12), rsaKeyLen(2 LE), rsaEncKey, gcmTag(16), ciphertext]
 *   )>
 */

import crypto from "node:crypto";
import type { IgApiClient } from "instagram-private-api";

// ── Constants ─────────────────────────────────────────────────────────────────

const MOBILE_LOGIN_URL =
  "https://i.instagram.com/api/v1/accounts/login/";
const WEB_LOGIN_URL =
  "https://www.instagram.com/api/v1/web/accounts/login/ajax/";

/** HMAC-SHA256 key for signed_body (public, from instagram-private-api constants) */
const IG_SIG_KEY =
  "9193488027538fd3450b83b7d05286d4ca9599a0f7eeed90d8c85925698a05dc";
const IG_SIG_KEY_VERSION = "4";

const IG_APP_ID = "1217981644879628";

/** Fixed mobile User-Agent matching an OnePlus 6 running Android 10. */
const MOBILE_UA =
  "Instagram 269.0.0.18.230 Android (29/10; 480dpi; 1080x2280; OnePlus; ONEPLUS A6003; OnePlus6; qcom; en_US; 443213192)";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// ── PWD_INSTAGRAM:4 encryption ────────────────────────────────────────────────

/**
 * Encrypt the plaintext password into #PWD_INSTAGRAM:4 format.
 *
 * Steps:
 *   1. Generate random 32-byte AES key + 12-byte IV
 *   2. Encrypt password with AES-256-GCM (AAD = timestamp string)
 *   3. Encrypt AES key with RSA-PKCS1 using Instagram's public key
 *   4. Concatenate and base64-encode the payload
 */
function encryptPassword(
  password: string,
  keyId: number,
  pubKeyBase64: string,
  timestamp: number,
): string {
  const randKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  // RSA-PKCS1 — matches what instagram-private-api uses internally
  const rsaEncrypted = crypto.publicEncrypt(
    {
      key: Buffer.from(pubKeyBase64, "base64").toString(),
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    randKey,
  );

  // AES-256-GCM; AAD is the timestamp string (not bytes)
  const cipher = crypto.createCipheriv("aes-256-gcm", randKey, iv);
  cipher.setAAD(Buffer.from(String(timestamp)));
  const aesEncrypted = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // always 16 bytes

  // 2-byte LE: length of the RSA-encrypted AES key
  const sizeBuffer = Buffer.alloc(2, 0);
  sizeBuffer.writeInt16LE(rsaEncrypted.byteLength, 0);

  // Wire format: [0x01, keyId] | iv(12) | sizeLE(2) | rsaKey | gcmTag(16) | ciphertext
  const payload = Buffer.concat([
    Buffer.from([1, keyId]),
    iv,
    sizeBuffer,
    rsaEncrypted,
    authTag,
    aesEncrypted,
  ]);

  return `#PWD_INSTAGRAM:4:${timestamp}:${payload.toString("base64")}`;
}

// ── signed_body (mobile API) ──────────────────────────────────────────────────

function signBody(json: string): {
  signed_body: string;
  ig_sig_key_version: string;
} {
  const sig = crypto
    .createHmac("sha256", IG_SIG_KEY)
    .update(json)
    .digest("hex");
  return {
    signed_body: `${sig}.${json}`,
    ig_sig_key_version: IG_SIG_KEY_VERSION,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Node 20+ supports Headers.getSetCookie(); fall back to empty array on older. */
function getSetCookies(res: Response): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.headers as any).getSetCookie?.() ?? [];
}

function extractSessionId(cookies: string[]): string | undefined {
  return cookies
    .find((c) => c.startsWith("sessionid="))
    ?.match(/^sessionid=([^;]+)/)?.[1];
}

/**
 * Safely read device state from the IgApiClient.
 * Some fields throw if not yet initialized (e.g. cookieCsrfToken before login).
 */
function readDeviceState(ig: IgApiClient) {
  const uuid = ig.state.uuid ?? crypto.randomUUID();
  const phoneId = ig.state.phoneId ?? crypto.randomUUID();
  const deviceId =
    ig.state.deviceId ?? `android-${crypto.randomBytes(8).toString("hex")}`;
  const adid = ig.state.adid ?? crypto.randomUUID();
  const deviceString = ig.state.deviceString ?? "";

  let csrfToken = "missing";
  try {
    csrfToken = ig.state.cookieCsrfToken;
  } catch {
    /* not yet set — will be "missing", Instagram usually accepts this pre-login */
  }

  /** jazoest = "2" + sum of char codes of phoneId (Instagram's own formula) */
  const jazoest =
    "2" +
    Array.from(phoneId).reduce((sum, c) => sum + c.charCodeAt(0), 0);

  return { uuid, phoneId, deviceId, adid, deviceString, csrfToken, jazoest };
}

// ── Result type ───────────────────────────────────────────────────────────────

export type LoginErrorType = "checkpoint" | "2fa" | "bad_password" | "unknown";

export interface DirectLoginResult {
  success: boolean;
  /** Raw Set-Cookie header values returned by Instagram */
  cookies?: string[];
  /** Extracted sessionid value (ready to pass to restoreSession) */
  sessionId?: string;
  userId?: string;
  username?: string;
  method?: "mobile" | "web";
  error?: string;
  errorType?: LoginErrorType;
}

// ── Mobile API path ───────────────────────────────────────────────────────────

async function loginViaMobile(
  username: string,
  encPassword: string,
  ig: IgApiClient,
): Promise<DirectLoginResult> {
  const s = readDeviceState(ig);

  const payload = {
    username,
    enc_password: encPassword,
    guid: s.uuid,
    phone_id: s.phoneId,
    _csrftoken: s.csrfToken,
    device_id: s.deviceId,
    adid: s.adid,
    google_tokens: "[]",
    login_attempt_count: 0,
    country_codes: JSON.stringify([{ country_code: "90", source: "default" }]),
    jazoest: s.jazoest,
  };

  const json = JSON.stringify(payload);
  const { signed_body, ig_sig_key_version } = signBody(json);

  let res: Response;
  try {
    res = await fetch(MOBILE_LOGIN_URL, {
      method: "POST",
      headers: {
        "User-Agent": MOBILE_UA,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept-Language": "tr-TR",
        "X-IG-App-ID": IG_APP_ID,
        "X-IG-Capabilities": "3brTvw==",
        "X-IG-Connection-Type": "WIFI",
        "X-IG-Connection-Speed": "-1kbps",
        "X-CSRFToken": s.csrfToken,
        "X-FB-HTTP-Engine": "Liger",
      },
      body: new URLSearchParams({ ig_sig_key_version, signed_body }).toString(),
    });
  } catch (e) {
    return {
      success: false,
      error: `Ağ hatası (mobil): ${e instanceof Error ? e.message : e}`,
      errorType: "unknown",
    };
  }

  const setCookies = getSetCookies(res);
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch { /* ignore parse errors */ }

  // Hard errors — don't bother trying web API
  if (data.two_factor_required) {
    return { success: false, error: "two-factor", errorType: "2fa" };
  }
  if (data.error_type === "checkpoint_required" || data.checkpoint_url) {
    return { success: false, error: "checkpoint", errorType: "checkpoint" };
  }

  if (!res.ok || data.status === "fail") {
    const errorType: LoginErrorType =
      data.error_type === "bad_password" ? "bad_password" : "unknown";
    const msg =
      typeof data.message === "string" ? data.message : `HTTP ${res.status}`;
    return { success: false, error: `Mobil API: ${msg}`, errorType };
  }

  const user = (data.logged_in_user ?? {}) as Record<string, string>;
  return {
    success: true,
    cookies: setCookies,
    sessionId: extractSessionId(setCookies),
    userId: user.pk ?? user.id,
    username: user.username ?? username,
    method: "mobile",
  };
}

// ── Web API path ──────────────────────────────────────────────────────────────

async function loginViaWeb(
  username: string,
  encPassword: string,
): Promise<DirectLoginResult> {
  // Step 1: GET the login page to receive a CSRF cookie
  let initRes: Response;
  try {
    initRes = await fetch("https://www.instagram.com/accounts/login/", {
      headers: {
        "User-Agent": DESKTOP_UA,
        "Accept-Language": "tr-TR,tr;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
  } catch (e) {
    return {
      success: false,
      error: `Ağ hatası (web): ${e instanceof Error ? e.message : e}`,
      errorType: "unknown",
    };
  }

  const initCookies = getSetCookies(initRes);
  const csrfCookie = initCookies.find((c) => c.startsWith("csrftoken="));
  const csrfToken =
    csrfCookie?.match(/^csrftoken=([^;]+)/)?.[1] ?? "missing";
  const cookieHeader = initCookies.map((c) => c.split(";")[0]).join("; ");

  // Step 2: POST credentials to the AJAX endpoint
  const params = new URLSearchParams({
    username,
    enc_password: encPassword,
    queryParams: "{}",
    optIntoOneTap: "false",
    stopDeletionNonce: "",
    trustedDeviceRecords: "{}",
  });

  let res: Response;
  try {
    res = await fetch(WEB_LOGIN_URL, {
      method: "POST",
      headers: {
        "User-Agent": DESKTOP_UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRFToken": csrfToken,
        "X-Instagram-AJAX": "1",
        "X-Requested-With": "XMLHttpRequest",
        "Accept-Language": "tr-TR,tr;q=0.9",
        Referer: "https://www.instagram.com/accounts/login/",
        Cookie: cookieHeader,
      },
      body: params.toString(),
    });
  } catch (e) {
    return {
      success: false,
      error: `Ağ hatası (web): ${e instanceof Error ? e.message : e}`,
      errorType: "unknown",
    };
  }

  const setCookies = getSetCookies(res);
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch { /* ignore parse errors */ }

  if (data.two_factor_required) {
    return { success: false, error: "two-factor", errorType: "2fa" };
  }
  if (data.checkpoint_url) {
    return { success: false, error: "checkpoint", errorType: "checkpoint" };
  }
  if (!res.ok || !data.authenticated) {
    const msg =
      typeof data.message === "string" ? data.message : `HTTP ${res.status}`;
    return { success: false, error: `Web API: ${msg}`, errorType: "unknown" };
  }

  const allCookies = [...initCookies, ...setCookies];
  return {
    success: true,
    cookies: allCookies,
    sessionId: extractSessionId(allCookies),
    userId: String(data.userId ?? ""),
    username,
    method: "web",
  };
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Log in to Instagram using direct HTTP requests with proper cryptographic signing.
 *
 * Algorithm:
 *   1. Fetch Instagram's RSA public key via /api/v1/qe/sync/ (once per client)
 *   2. Encrypt password: AES-256-GCM key → RSA-PKCS1 wrapped → #PWD_INSTAGRAM:4
 *   3. Sign request body with HMAC-SHA256 (mobile path only)
 *   4. Try Mobile API (https://i.instagram.com/api/v1/accounts/login/)
 *   5. Fall back to Web API (https://www.instagram.com/api/v1/web/accounts/login/ajax/)
 *
 * Hard errors (2FA, checkpoint) are returned immediately without trying the fallback.
 */
export async function loginToInstagram(
  username: string,
  password: string,
  ig: IgApiClient,
): Promise<DirectLoginResult> {
  // Ensure the encryption public key is loaded
  if (!ig.state.passwordEncryptionPubKey) {
    await ig.qe.syncLoginExperiments();
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const keyId = Number(ig.state.passwordEncryptionKeyId) || 0;
  const pubKey = ig.state.passwordEncryptionPubKey;

  if (!pubKey || !keyId) {
    throw new Error(
      "Instagram şifreleme anahtarı alınamadı — lütfen tekrar deneyin.",
    );
  }

  const encPassword = encryptPassword(password, keyId, pubKey, timestamp);

  // ── Mobile API first ──────────────────────────────────────────────────────
  const mobileResult = await loginViaMobile(username, encPassword, ig);
  if (mobileResult.success) return mobileResult;

  // Propagate hard errors immediately (2FA, checkpoint)
  if (
    mobileResult.errorType === "2fa" ||
    mobileResult.errorType === "checkpoint"
  ) {
    return mobileResult;
  }

  // ── Web API fallback ──────────────────────────────────────────────────────
  const webResult = await loginViaWeb(username, encPassword);
  if (webResult.success) return webResult;

  return {
    success: false,
    error: `${mobileResult.error} / ${webResult.error}`,
    errorType:
      webResult.errorType === "2fa" || webResult.errorType === "checkpoint"
        ? webResult.errorType
        : "unknown",
  };
}
