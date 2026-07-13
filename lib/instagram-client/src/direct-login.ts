/**
 * Direct Instagram login with #PWD_INSTAGRAM:4 encryption.
 *
 * Şifreleme algoritması:
 *   1. Ephemeral EC key pair (P-256 / Secp256r1) üret
 *   2. ECDH shared secret = ECDH(ephPrivate, instagramPublic)
 *   3. AES-256 key = SHA-256(sharedSecret)
 *   4. Şifreyi AES-256-GCM ile şifrele  (AAD = timestamp string)
 *   5. Payload = [0x01, keyId, ephPubKey(65), iv(12), gcmTag(16), ciphertext]
 *   6. enc_password = "#PWD_INSTAGRAM:4:<timestamp>:<base64(payload)>"
 *
 * Anahtar kaynakları (öncelik sırasıyla):
 *   1. /api/v1/accounts/contact_point_prefill/  (mobil, cevap gövdesi / header)
 *   2. www.instagram.com/data/shared_data/      (web sharedData JSON)
 *   3. /api/v1/qe/sync/                         (qe header fallback)
 *
 * Giriş akışı:
 *   Mobil API  →  Web API (fallback)
 */

import crypto from "node:crypto";
import type { IgApiClient } from "instagram-private-api";

// ── Sabitler ──────────────────────────────────────────────────────────────────

const MOBILE_LOGIN_URL =
  "https://i.instagram.com/api/v1/accounts/login/";
const WEB_LOGIN_URL =
  "https://www.instagram.com/api/v1/web/accounts/login/ajax/";
const CONTACT_POINT_URL =
  "https://i.instagram.com/api/v1/accounts/contact_point_prefill/";
const SHARED_DATA_URL =
  "https://www.instagram.com/data/shared_data/";

/** signed_body HMAC anahtarı (instagram-private-api constants.js'den) */
const IG_SIG_KEY =
  "9193488027538fd3450b83b7d05286d4ca9599a0f7eeed90d8c85925698a05dc";
const IG_SIG_KEY_VERSION = "4";

const IG_APP_ID = "1217981644879628";

/** OnePlus 6 / Android 10 mobil UA */
const MOBILE_UA =
  "Instagram 269.0.0.18.230 Android (29/10; 480dpi; 1080x2280;" +
  " OnePlus; ONEPLUS A6003; OnePlus6; qcom; en_US; 443213192)";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// ── Şifreleme anahtar tipi ────────────────────────────────────────────────────

interface EncryptionKey {
  keyId: number;
  /** Base64 ile kodlanmış DER/SPKI formatında public key */
  pubKeyBase64: string;
  /** Anahtar tipi — EC ise ECIES, RSA ise PKCS1 yöntemi kullanılır */
  keyType: "ec" | "rsa";
}

/**
 * Base64/DER public key'in EC mi RSA mi olduğunu belirler.
 * Bilinmiyorsa "rsa" döner (geriye dönük uyumluluk).
 */
function detectKeyType(pubKeyBase64: string): "ec" | "rsa" {
  try {
    const keyObj = crypto.createPublicKey({
      key: Buffer.from(pubKeyBase64, "base64"),
      format: "der",
      type: "spki",
    });
    return keyObj.asymmetricKeyType === "ec" ? "ec" : "rsa";
  } catch {
    return "rsa";
  }
}

// ── #PWD_INSTAGRAM:4 şifreleme ────────────────────────────────────────────────

/**
 * ECIES şifrelemesi: Secp256r1 (P-256) eğrisi üzerinde ECDH.
 *
 * Wire format:
 *   [0x01][keyId(1)][ephPubKey(65)][iv(12)][gcmTag(16)][ciphertext]
 */
function encryptWithEC(
  password: string,
  keyId: number,
  pubKeyBase64: string,
  timestamp: number,
): string {
  // Instagram'ın EC public key'ini parse et (SPKI DER)
  const pubKeyObj = crypto.createPublicKey({
    key: Buffer.from(pubKeyBase64, "base64"),
    format: "der",
    type: "spki",
  });

  // SPKI DER'deki ham EC noktasını çıkar — P-256 için son 65 bayt (04 || x || y)
  const spkiDer = pubKeyObj.export({ format: "der", type: "spki" }) as Buffer;
  const ecPoint = spkiDer.slice(-65);

  // Ephemeral P-256 key pair üret
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const ephPubKey = ecdh.getPublicKey(); // 65 bayt, sıkıştırılmamış

  // ECDH shared secret → AES-256 anahtar türetme (SHA-256)
  const sharedSecret = ecdh.computeSecret(ecPoint);
  const aesKey = crypto.createHash("sha256").update(sharedSecret).digest();

  // AES-256-GCM şifreleme; AAD = timestamp string
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  cipher.setAAD(Buffer.from(String(timestamp)));
  const ciphertext = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);
  const gcmTag = cipher.getAuthTag(); // 16 bayt

  // Wire format: [0x01, keyId] | ephPubKey(65) | iv(12) | gcmTag(16) | ciphertext
  const payload = Buffer.concat([
    Buffer.from([1, keyId]),
    ephPubKey,
    iv,
    gcmTag,
    ciphertext,
  ]);

  return `#PWD_INSTAGRAM:4:${timestamp}:${payload.toString("base64")}`;
}

/**
 * RSA-PKCS1 şifrelemesi — eski anahtar formatı için fallback.
 *
 * Wire format (instagram-private-api ile aynı):
 *   [0x01][keyId(1)][iv(12)][rsaKeyLen(2 LE)][rsaEncKey][gcmTag(16)][ciphertext]
 */
function encryptWithRSA(
  password: string,
  keyId: number,
  pubKeyBase64: string,
  timestamp: number,
): string {
  const randKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  const rsaEncrypted = crypto.publicEncrypt(
    {
      key: Buffer.from(pubKeyBase64, "base64").toString(),
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    randKey,
  );

  const cipher = crypto.createCipheriv("aes-256-gcm", randKey, iv);
  cipher.setAAD(Buffer.from(String(timestamp)));
  const aesEncrypted = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const sizeBuffer = Buffer.alloc(2, 0);
  sizeBuffer.writeInt16LE(rsaEncrypted.byteLength, 0);

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

/** Anahtar tipine göre doğru şifreleme yöntemini seçer. */
function encryptPassword(
  password: string,
  key: EncryptionKey,
  timestamp: number,
): string {
  return key.keyType === "ec"
    ? encryptWithEC(password, key.keyId, key.pubKeyBase64, timestamp)
    : encryptWithRSA(password, key.keyId, key.pubKeyBase64, timestamp);
}

// ── Anahtar kaynakları ────────────────────────────────────────────────────────

/**
 * 1. Kaynak: /api/v1/accounts/contact_point_prefill/
 *    Mobil API'ye POST atar; cevap headerı veya gövdesinden şifreleme
 *    anahtarını çeker.
 */
async function fetchKeyFromContactPointPrefill(
  ig: IgApiClient,
): Promise<EncryptionKey | null> {
  try {
    const s = readDeviceState(ig);
    const json = JSON.stringify({ id: s.uuid, _csrftoken: s.csrfToken });
    const { signed_body, ig_sig_key_version } = signBody(json);

    const res = await fetch(CONTACT_POINT_URL, {
      method: "POST",
      headers: {
        "User-Agent": MOBILE_UA,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-IG-App-ID": IG_APP_ID,
        "X-IG-Capabilities": "3brTvw==",
        "X-IG-Connection-Type": "WIFI",
      },
      body: new URLSearchParams({ ig_sig_key_version, signed_body }).toString(),
    });

    // Cevap headerından anahtar
    const hdrKeyId = res.headers.get("ig-set-password-encryption-key-id");
    const hdrPubKey = res.headers.get("ig-set-password-encryption-pub-key");
    if (hdrKeyId && hdrPubKey) {
      const keyId = Number(hdrKeyId);
      return { keyId, pubKeyBase64: hdrPubKey, keyType: detectKeyType(hdrPubKey) };
    }

    // Cevap gövdesinden anahtar
    let body: Record<string, unknown> = {};
    try { body = (await res.json()) as Record<string, unknown>; } catch {}
    const enc = body.encryption as Record<string, string> | undefined;
    if (enc?.key_id && enc?.public_key) {
      const pubKeyBase64 = enc.public_key;
      return {
        keyId: Number(enc.key_id),
        pubKeyBase64,
        keyType: detectKeyType(pubKeyBase64),
      };
    }
  } catch { /* ağ/parse hatası — sonraki kaynağa geç */ }
  return null;
}

/**
 * 2. Kaynak: www.instagram.com/data/shared_data/
 *    Web tarafının sharedData JSON nesnesinden şifreleme anahtarını çeker.
 */
async function fetchKeyFromWebSharedData(): Promise<EncryptionKey | null> {
  try {
    const res = await fetch(SHARED_DATA_URL, {
      headers: {
        "User-Agent": DESKTOP_UA,
        "Accept": "application/json",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const enc = data.encryption as Record<string, string> | undefined;
    if (enc?.key_id && enc?.public_key) {
      const pubKeyBase64 = enc.public_key;
      return {
        keyId: Number(enc.key_id),
        pubKeyBase64,
        keyType: detectKeyType(pubKeyBase64),
      };
    }
  } catch {}
  return null;
}

/**
 * 3. Kaynak: qe/sync (instagram-private-api ile) — son fallback.
 *    ig.state.passwordEncryptionPubKey headerını doldurur.
 */
async function fetchKeyFromQeSync(
  ig: IgApiClient,
): Promise<EncryptionKey | null> {
  try {
    if (!ig.state.passwordEncryptionPubKey) {
      await ig.qe.syncLoginExperiments();
    }
    const pubKeyBase64 = ig.state.passwordEncryptionPubKey;
    const keyId = Number(ig.state.passwordEncryptionKeyId) || 0;
    if (pubKeyBase64 && keyId) {
      return { keyId, pubKeyBase64, keyType: detectKeyType(pubKeyBase64) };
    }
  } catch {}
  return null;
}

/**
 * Tüm anahtar kaynaklarını sırayla dener ve ilk başarılı sonucu döner.
 * Öncelik: contact_point_prefill → sharedData → qe/sync
 */
async function resolveEncryptionKey(
  ig: IgApiClient,
): Promise<EncryptionKey> {
  const key =
    (await fetchKeyFromContactPointPrefill(ig)) ??
    (await fetchKeyFromWebSharedData()) ??
    (await fetchKeyFromQeSync(ig));

  if (!key) {
    throw new Error(
      "Instagram şifreleme anahtarı hiçbir kaynaktan alınamadı.",
    );
  }
  return key;
}

// ── signed_body ───────────────────────────────────────────────────────────────

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

// ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────

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
 * Set-Cookie header listesinden belirli bir cookie değerini çıkarır.
 * Örnek: extractCookieValue(["sessionid=abc; Path=/", "csrftoken=xyz"], "csrftoken") → "xyz"
 */
function extractCookieValue(cookies: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  return cookies
    .find((c) => c.startsWith(prefix) || c.includes(`; ${prefix}`) || c.includes(`, ${prefix}`))
    ?.split(/[;,]/)[0]
    ?.split("=")
    .slice(1)
    .join("=")
    .trim() || undefined;
}

// ── Cookie yönetimi (dışa aktarılan API) ─────────────────────────────────────

/**
 * Oturumla ilişkili tüm kritik cookie'leri Set-Cookie header listesinden çıkarır.
 *
 * Belgede tanımlanan cookie'ler:
 *   sessionid   — aktif oturum jetonu (90 gün–1 yıl)
 *   csrftoken   — CSRF koruması (dinamik, her durum değişiminde güncellenir)
 *   ds_user_id  — kullanıcının sayısal profil ID'si
 *   mid         — makine kimliği (kalıcı)
 *   ig_did      — cihaz kimliği (kalıcı)
 *   rur         — bölgesel yönlendirme parametresi
 */
export interface SessionCookies {
  sessionid?: string;
  csrftoken?: string;
  ds_user_id?: string;
  mid?: string;
  ig_did?: string;
  rur?: string;
  /** Birden fazla cookie'yi tek satırda birleştiren Cookie header değeri */
  cookieHeader: string;
  /** Ham Set-Cookie dizisi */
  raw: string[];
}

export function extractSessionCookies(setCookies: string[]): SessionCookies {
  const get = (name: string) => extractCookieValue(setCookies, name);

  // Tüm Set-Cookie girişlerini "key=value" çiftlerine dönüştür
  const pairs = setCookies
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean);

  return {
    sessionid: get("sessionid"),
    csrftoken: get("csrftoken"),
    ds_user_id: get("ds_user_id"),
    mid: get("mid"),
    ig_did: get("ig_did"),
    rur: get("rur"),
    cookieHeader: pairs.join("; "),
    raw: setCookies,
  };
}

/**
 * Cookie header'ı sıfırlamak zorunda kalmadan yalnızca csrftoken'ı günceller.
 * Dönen değer güncellenmiş Cookie header string'idir.
 */
export function updateCsrfInHeader(
  cookieHeader: string,
  newCsrf: string,
): string {
  // Varsa mevcut csrftoken'ı değiştir, yoksa sona ekle
  if (cookieHeader.includes("csrftoken=")) {
    return cookieHeader.replace(/csrftoken=[^;,\s]+/, `csrftoken=${newCsrf}`);
  }
  return cookieHeader ? `${cookieHeader}; csrftoken=${newCsrf}` : `csrftoken=${newCsrf}`;
}

/**
 * CSRF token yenileme — belgede tanımlanan prosedür:
 *   1. Oturum cookie'leriyle /api/v1/web/initial_share_info/ GET isteği at
 *   2. Dönen Set-Cookie'den yeni csrftoken'ı al
 *   3. Güncellenmiş token değerini döndür (null → başarısız)
 */
export async function refreshCsrfToken(
  cookieHeader: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      "https://i.instagram.com/api/v1/web/initial_share_info/",
      {
        headers: {
          "User-Agent": DESKTOP_UA,
          "Cookie": cookieHeader,
          "Accept": "application/json",
        },
      },
    );
    const newCookies = getSetCookies(res);
    return extractCookieValue(newCookies, "csrftoken") ?? null;
  } catch {
    return null;
  }
}

// ── User Info API (doğrudan HTTP) ────────────────────────────────────────────

/**
 * Belgede tanımlanan ham kullanıcı bilgisi yanıtı:
 *   GET /api/v1/users/{user_id}/info/
 *   { "user": { pk, username, full_name, is_private, media_count,
 *                follower_count, following_count, biography, external_url, ... },
 *     "status": "ok" }
 */
export interface RawInstagramUser {
  pk: number | string;
  username: string;
  full_name?: string;
  is_private?: boolean;
  media_count?: number;
  follower_count?: number;
  following_count?: number;
  biography?: string;
  external_url?: string;
  profile_pic_url?: string;
}

export interface UserInfoResult {
  success: boolean;
  user?: RawInstagramUser;
  error?: string;
}

/**
 * Kullanıcı Profili Görüntüleme (User Info API) — belgede tanımlanan
 * doğrudan mobil API çağrısı:
 *
 *   GET https://i.instagram.com/api/v1/users/{user_id}/info/
 *
 * Gerekli HTTP başlıkları:
 *   User-Agent   — mobil uygulama parmak izi (Instagram Android istemcisi)
 *   X-IG-App-ID  — Android uygulama ID'si (1217981644879628)
 *   Cookie       — giriş sonrası elde edilen sessionid, mid, ig_did,
 *                  csrftoken bileşenleri (cookieHeader)
 *
 * @param userId       Sorgulanacak hesabın pk (user_id) değeri.
 * @param cookieHeader Aktif oturumun Cookie header string'i (sessionid; mid; ig_did; csrftoken; ...).
 * @param userAgent    Giriş sırasında kullanılan mobil User-Agent (varsayılan: MOBILE_UA).
 */
export async function fetchUserInfo(
  userId: string,
  cookieHeader: string,
  userAgent: string = MOBILE_UA,
): Promise<UserInfoResult> {
  try {
    const res = await fetch(
      `https://i.instagram.com/api/v1/users/${userId}/info/`,
      {
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          "X-IG-App-ID": IG_APP_ID,
          "Cookie": cookieHeader,
          "Accept-Language": "tr-TR",
        },
      },
    );

    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      return { success: false, error: `Beklenmeyen yanıt (HTTP ${res.status})` };
    }

    if (!res.ok || data.status !== "ok" || !data.user) {
      const msg =
        typeof data.message === "string" ? data.message : `HTTP ${res.status}`;
      return { success: false, error: `User Info API: ${msg}` };
    }

    return { success: true, user: data.user as RawInstagramUser };
  } catch (e) {
    return {
      success: false,
      error: `Ağ hatası (user info): ${e instanceof Error ? e.message : e}`,
    };
  }
}

// ── Gönderi ve Reels İçeriklerini Listeleme (doğrudan HTTP) ──────────────────

/** Feed / clips yanıtlarındaki ham medya öğesi. */
export interface RawFeedItem {
  pk?: number | string;
  id?: string;
  code?: string;
  media_type?: number;
  caption?: { text?: string } | null;
  like_count?: number;
  comment_count?: number;
  image_versions2?: { candidates?: { url?: string }[] };
  video_versions?: { url?: string }[];
  has_liked?: boolean;
  taken_at?: number;
  play_count?: number;
  view_count?: number;
}

export interface UserFeedResult {
  success: boolean;
  items?: RawFeedItem[];
  nextMaxId?: string;
  moreAvailable?: boolean;
  error?: string;
}

/**
 * A. Standart Gönderiler (Feed) Listeleme — belgede tanımlanan doğrudan
 * mobil API çağrısı:
 *
 *   GET https://i.instagram.com/api/v1/feed/user/{user_id}/
 *
 * Sayfalama: bir sonraki sayfa için yanıttaki `next_max_id` değeri,
 * sonraki istekte `max_id` query string parametresi olarak gönderilir.
 *
 * @param userId       Sorgulanacak hesabın pk (user_id) değeri.
 * @param cookieHeader Aktif oturumun Cookie header string'i.
 * @param options.maxId Sayfalama için önceki yanıttan alınan next_max_id.
 */
export async function fetchUserFeed(
  userId: string,
  cookieHeader: string,
  options: { maxId?: string; userAgent?: string } = {},
): Promise<UserFeedResult> {
  try {
    const url = new URL(`https://i.instagram.com/api/v1/feed/user/${userId}/`);
    if (options.maxId) url.searchParams.set("max_id", options.maxId);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": options.userAgent ?? MOBILE_UA,
        "X-IG-App-ID": IG_APP_ID,
        "Cookie": cookieHeader,
        "Accept-Language": "tr-TR",
      },
    });

    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      return { success: false, error: `Beklenmeyen yanıt (HTTP ${res.status})` };
    }

    if (!res.ok || !Array.isArray(data.items)) {
      const msg =
        typeof data.message === "string" ? data.message : `HTTP ${res.status}`;
      return { success: false, error: `User Feed API: ${msg}` };
    }

    return {
      success: true,
      items: data.items as RawFeedItem[],
      nextMaxId: typeof data.next_max_id === "string" ? data.next_max_id : undefined,
      moreAvailable: Boolean(data.more_available),
    };
  } catch (e) {
    return {
      success: false,
      error: `Ağ hatası (user feed): ${e instanceof Error ? e.message : e}`,
    };
  }
}

export interface UserClipsResult {
  success: boolean;
  items?: RawFeedItem[];
  nextMaxId?: string;
  moreAvailable?: boolean;
  error?: string;
}

/**
 * B. Reels (Clips) Listeleme — belgede tanımlanan doğrudan mobil API
 * çağrısı:
 *
 *   POST https://i.instagram.com/api/v1/clips/user_clips/
 *   Body: { "target_user_id": "123456789", "max_id": "", "page_size": 20 }
 *
 * @param userId       Sorgulanacak hesabın pk (user_id) değeri.
 * @param cookieHeader Aktif oturumun Cookie header string'i.
 * @param options.maxId Sayfalama için önceki yanıttan alınan next_max_id.
 * @param options.pageSize Sayfa başına döndürülecek öğe sayısı (varsayılan 20).
 */
export async function fetchUserClips(
  userId: string,
  cookieHeader: string,
  options: { maxId?: string; pageSize?: number; userAgent?: string } = {},
): Promise<UserClipsResult> {
  try {
    const res = await fetch(
      "https://i.instagram.com/api/v1/clips/user_clips/",
      {
        method: "POST",
        headers: {
          "User-Agent": options.userAgent ?? MOBILE_UA,
          "X-IG-App-ID": IG_APP_ID,
          "Cookie": cookieHeader,
          "Content-Type": "application/json",
          "Accept-Language": "tr-TR",
        },
        body: JSON.stringify({
          target_user_id: userId,
          max_id: options.maxId ?? "",
          page_size: options.pageSize ?? 20,
        }),
      },
    );

    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      return { success: false, error: `Beklenmeyen yanıt (HTTP ${res.status})` };
    }

    if (!res.ok || !Array.isArray(data.items)) {
      const msg =
        typeof data.message === "string" ? data.message : `HTTP ${res.status}`;
      return { success: false, error: `User Clips API: ${msg}` };
    }

    // Clips yanıtındaki her öğe genelde { media: {...} } şeklinde sarmalanır.
    const items = (data.items as Record<string, unknown>[]).map(
      (it) => (it.media ?? it) as RawFeedItem,
    );

    const pagingInfo = data.paging_info as { max_id?: string; more_available?: boolean } | undefined;

    return {
      success: true,
      items,
      nextMaxId:
        (typeof data.next_max_id === "string" ? data.next_max_id : undefined) ??
        pagingInfo?.max_id,
      moreAvailable: Boolean(data.more_available ?? pagingInfo?.more_available),
    };
  } catch (e) {
    return {
      success: false,
      error: `Ağ hatası (user clips): ${e instanceof Error ? e.message : e}`,
    };
  }
}

// ── İmzalı istekler (signed_body) ────────────────────────────────────────────

/**
 * İmzalama Standardı: payload nesnesi JSON dizesine çevrildikten sonra,
 * oturumun imzalama anahtarı ile HMAC-SHA256 algoritmasından geçirilir:
 *   signed_body = HMAC-SHA256(signing_key, JSON_payload) + "." + JSON_payload
 */
function signPayload(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const hmac = crypto.createHmac("sha256", IG_SIG_KEY).update(json).digest("hex");
  return `${hmac}.${json}`;
}

function buildSignedBodyForm(payload: Record<string, unknown>): string {
  const params = new URLSearchParams();
  params.set("signed_body", signPayload(payload));
  params.set("ig_sig_key_version", IG_SIG_KEY_VERSION);
  return params.toString();
}

export interface RawActionResult {
  success: boolean;
  error?: string;
}

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as Record<string, unknown>;
    if (typeof data.message === "string") return data.message;
  } catch {
    /* yanıt JSON değil */
  }
  return `HTTP ${res.status}`;
}

// ── 3. Hikaye Görüntüleme ve "Görüldü" (Seen) İşaretleme ────────────────────

/** feed/reels_media yanıtındaki ham hikaye öğesi. */
export interface RawStoryItem {
  pk?: number | string;
  id?: string;
  media_type?: number;
  taken_at?: number;
  image_versions2?: { candidates?: { url?: string }[] };
  video_versions?: { url?: string }[];
}

export interface UserStoriesResult {
  success: boolean;
  items?: RawStoryItem[];
  error?: string;
}

/**
 * Adım 1: Aktif Hikaye Listesini Çekme — belgede tanımlanan doğrudan
 * mobil API çağrısı:
 *
 *   GET https://i.instagram.com/api/v1/feed/reels_media/?user_ids={user_id}
 *
 * Yanıt, kullanıcının media_id ve taken_at değerlerini içeren yayındaki
 * hikayelerin listesini (reels[user_id].items) döner.
 */
export async function fetchUserStories(
  userId: string,
  cookieHeader: string,
  userAgent: string = MOBILE_UA,
): Promise<UserStoriesResult> {
  try {
    const res = await fetch(
      `https://i.instagram.com/api/v1/feed/reels_media/?user_ids=${userId}`,
      {
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          "X-IG-App-ID": IG_APP_ID,
          "Cookie": cookieHeader,
          "Accept-Language": "tr-TR",
        },
      },
    );

    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      return { success: false, error: `Beklenmeyen yanıt (HTTP ${res.status})` };
    }

    if (!res.ok || data.status !== "ok") {
      const msg =
        typeof data.message === "string" ? data.message : `HTTP ${res.status}`;
      return { success: false, error: `User Stories API: ${msg}` };
    }

    const reelsMap = data.reels as
      | Record<string, { items?: RawStoryItem[] }>
      | undefined;
    const items = reelsMap?.[userId]?.items ?? [];
    return { success: true, items };
  } catch (e) {
    return {
      success: false,
      error: `Ağ hatası (user stories): ${e instanceof Error ? e.message : e}`,
    };
  }
}

/**
 * Adım 2: Hikayeyi "Görüldü" Olarak İşaretleme — belgede tanımlanan Seen API:
 *
 *   POST https://i.instagram.com/api/v1/media/seen/
 *   Body (signed_body içinde paketlenir):
 *     {
 *       "container_module": "feed_contextual_post",
 *       "reels": { "{hikaye_sahibi_id}_{kendi_id}": ["{media_id}_{sahibi_id}_{taken_at}"] },
 *       "live_vods": [],
 *       "_uuid": "...",
 *       "_uid": "..."
 *     }
 */
export async function markStorySeenRaw(
  storyId: string,
  ownerId: string,
  selfUserId: string,
  clientUuid: string,
  cookieHeader: string,
  options: { takenAt?: number; userAgent?: string } = {},
): Promise<RawActionResult> {
  try {
    const ts = options.takenAt ?? Math.floor(Date.now() / 1000);
    const reelsKey = `${ownerId}_${selfUserId}`;
    const payload = {
      container_module: "feed_contextual_post",
      reels: { [reelsKey]: [`${storyId}_${ownerId}_${ts}`] },
      live_vods: [],
      _uuid: clientUuid,
      _uid: selfUserId,
    };

    const res = await fetch("https://i.instagram.com/api/v1/media/seen/", {
      method: "POST",
      headers: {
        "User-Agent": options.userAgent ?? MOBILE_UA,
        "X-IG-App-ID": IG_APP_ID,
        "Cookie": cookieHeader,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: buildSignedBodyForm(payload),
    });

    if (!res.ok) {
      return { success: false, error: `Seen API: ${await extractErrorMessage(res)}` };
    }
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: `Ağ hatası (seen): ${e instanceof Error ? e.message : e}`,
    };
  }
}

// ── 4. Gönderi ve Reels Beğenme (Like API) ───────────────────────────────────

export interface MediaActionModuleInfo {
  module_name: string;
  user_id?: string | number;
  username?: string;
}

/**
 * Beğenme / beğeniyi kaldırma — belgede tanımlanan imzalı POST isteği:
 *
 *   POST https://i.instagram.com/api/v1/media/{media_id}/like/
 *   POST https://i.instagram.com/api/v1/media/{media_id}/unlike/
 *   Payload (signed_body): { media_id, src, d, module_info }
 *
 * d: çift tıklama simülasyonu (0 = butonla, 1 = çift dokunuşla beğenildi).
 * src: içeriğin görüldüğü yüzey (timeline, profile veya clips).
 */
async function postMediaLikeAction(
  action: "like" | "unlike",
  mediaId: string,
  cookieHeader: string,
  options: {
    src?: string;
    d?: 0 | 1;
    moduleInfo?: MediaActionModuleInfo;
    userAgent?: string;
  } = {},
): Promise<RawActionResult> {
  try {
    const payload = {
      media_id: mediaId,
      src: options.src ?? "timeline",
      d: options.d ?? 0,
      module_info: options.moduleInfo ?? { module_name: "profile" },
    };

    const res = await fetch(
      `https://i.instagram.com/api/v1/media/${mediaId}/${action}/`,
      {
        method: "POST",
        headers: {
          "User-Agent": options.userAgent ?? MOBILE_UA,
          "X-IG-App-ID": IG_APP_ID,
          "Cookie": cookieHeader,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: buildSignedBodyForm(payload),
      },
    );

    if (!res.ok) {
      return {
        success: false,
        error: `${action === "like" ? "Like" : "Unlike"} API: ${await extractErrorMessage(res)}`,
      };
    }
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: `Ağ hatası (${action}): ${e instanceof Error ? e.message : e}`,
    };
  }
}

export function likeMediaRaw(
  mediaId: string,
  cookieHeader: string,
  options?: { src?: string; d?: 0 | 1; moduleInfo?: MediaActionModuleInfo; userAgent?: string },
): Promise<RawActionResult> {
  return postMediaLikeAction("like", mediaId, cookieHeader, options);
}

export function unlikeMediaRaw(
  mediaId: string,
  cookieHeader: string,
  options?: { src?: string; d?: 0 | 1; moduleInfo?: MediaActionModuleInfo; userAgent?: string },
): Promise<RawActionResult> {
  return postMediaLikeAction("unlike", mediaId, cookieHeader, options);
}

// ── 5. Beğenilme ve Görüntülenme Verilerini Çekme (Metrics) ─────────────────

/** media/{id}/info/ yanıtındaki items[0] alanları. */
export interface RawMediaInfoItem {
  id?: string;
  media_type?: number;
  product_type?: string;
  like_count?: number;
  has_liked?: boolean;
  play_count?: number;
  view_count?: number;
  comment_count?: number;
}

export interface MediaInfoResult {
  success: boolean;
  item?: RawMediaInfoItem;
  error?: string;
}

/**
 * Media Info — belgede tanımlanan doğrudan mobil API çağrısı:
 *
 *   GET https://i.instagram.com/api/v1/media/{media_id}/info/
 *
 * Kritik alanlar: like_count, has_liked, play_count (Reels/video),
 * view_count (standart video), comment_count.
 */
export async function fetchMediaInfo(
  mediaId: string,
  cookieHeader: string,
  userAgent: string = MOBILE_UA,
): Promise<MediaInfoResult> {
  try {
    const res = await fetch(
      `https://i.instagram.com/api/v1/media/${mediaId}/info/`,
      {
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          "X-IG-App-ID": IG_APP_ID,
          "Cookie": cookieHeader,
          "Accept-Language": "tr-TR",
        },
      },
    );

    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      return { success: false, error: `Beklenmeyen yanıt (HTTP ${res.status})` };
    }

    if (!res.ok || data.status !== "ok" || !Array.isArray(data.items)) {
      const msg =
        typeof data.message === "string" ? data.message : `HTTP ${res.status}`;
      return { success: false, error: `Media Info API: ${msg}` };
    }

    return { success: true, item: (data.items as RawMediaInfoItem[])[0] };
  } catch (e) {
    return {
      success: false,
      error: `Ağ hatası (media info): ${e instanceof Error ? e.message : e}`,
    };
  }
}

/**
 * Oturum canlı tutma — belgede tanımlanan keep-alive endpoint:
 *   GET /api/v1/accounts/current_user/
 *   Başarılıysa HTTP 200 + kullanıcı verisi döner ve sunucu sayacını sıfırlar.
 *   Dönen değer: true → oturum geçerli, false → oturum sona ermiş
 */
export async function pingKeepAlive(
  cookieHeader: string,
  userAgent = MOBILE_UA,
): Promise<boolean> {
  try {
    const res = await fetch(
      "https://i.instagram.com/api/v1/accounts/current_user/?edit=true",
      {
        headers: {
          "User-Agent": userAgent,
          "Cookie": cookieHeader,
          "X-IG-App-ID": IG_APP_ID,
          "Accept-Language": "tr-TR",
        },
      },
    );
    return res.status === 200;
  } catch {
    return false;
  }
}

function readDeviceState(ig: IgApiClient) {
  const uuid = ig.state.uuid ?? crypto.randomUUID();
  const phoneId = ig.state.phoneId ?? crypto.randomUUID();
  const deviceId =
    ig.state.deviceId ?? `android-${crypto.randomBytes(8).toString("hex")}`;
  const adid = ig.state.adid ?? crypto.randomUUID();

  let csrfToken = "missing";
  try { csrfToken = ig.state.cookieCsrfToken; } catch {}

  const jazoest =
    "2" +
    Array.from(phoneId).reduce((sum, c) => sum + c.charCodeAt(0), 0);

  return { uuid, phoneId, deviceId, adid, csrfToken, jazoest };
}

// ── Sonuç tipi ────────────────────────────────────────────────────────────────

export type LoginErrorType = "checkpoint" | "2fa" | "bad_password" | "unknown";

export interface DirectLoginResult {
  success: boolean;
  /** Ham Set-Cookie header değerleri */
  cookies?: string[];
  /** Ayrıştırılmış kritik cookie'ler + hazır Cookie header string'i */
  sessionCookies?: SessionCookies;
  /** Kısa yol: sessionid değeri */
  sessionId?: string;
  userId?: string;
  username?: string;
  method?: "mobile" | "web";
  error?: string;
  errorType?: LoginErrorType;
}

// ── Mobil API girişi ──────────────────────────────────────────────────────────

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
  try { data = (await res.json()) as Record<string, unknown>; } catch {}

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
  const sessionCookies = extractSessionCookies(setCookies);
  return {
    success: true,
    cookies: setCookies,
    sessionCookies,
    sessionId: sessionCookies.sessionid,
    userId: user.pk ?? user.id,
    username: user.username ?? username,
    method: "mobile",
  };
}

// ── Web API girişi ────────────────────────────────────────────────────────────

async function loginViaWeb(
  username: string,
  encPassword: string,
): Promise<DirectLoginResult> {
  // Adım 1: Login sayfasından CSRF token ve rollout_hash al
  let initRes: Response;
  try {
    initRes = await fetch("https://www.instagram.com/accounts/login/", {
      headers: {
        "User-Agent": DESKTOP_UA,
        "Accept-Language": "tr-TR,tr;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
  const csrfToken =
    initCookies.find((c) => c.startsWith("csrftoken="))
      ?.match(/^csrftoken=([^;]+)/)?.[1] ?? "missing";
  const cookieHeader = initCookies.map((c) => c.split(";")[0]).join("; ");

  // X-Instagram-AJAX: sayfa HTML'inden dinamik rollout_hash değeri
  let ajaxBuildId = "1";
  try {
    const html = await initRes.text();
    const match =
      html.match(/"rollout_hash"\s*:\s*"([^"]+)"/) ??
      html.match(/["']rollout_hash["']\s*:\s*["']([^"']+)["']/);
    if (match?.[1]) ajaxBuildId = match[1];
  } catch {}

  // Adım 2: AJAX login endpoint'ine POST
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
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-CSRFToken": csrfToken,
        "X-Instagram-AJAX": ajaxBuildId,
        "X-Requested-With": "XMLHttpRequest",
        "Accept-Language": "tr-TR,tr;q=0.9",
        "Referer": "https://www.instagram.com/accounts/login/",
        "Origin": "https://www.instagram.com",
        "Cookie": cookieHeader,
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
  try { data = (await res.json()) as Record<string, unknown>; } catch {}

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
  const sessionCookies = extractSessionCookies(allCookies);
  return {
    success: true,
    cookies: allCookies,
    sessionCookies,
    sessionId: sessionCookies.sessionid,
    userId: String(data.userId ?? ""),
    username,
    method: "web",
  };
}

// ── Genel giriş fonksiyonu ────────────────────────────────────────────────────

/**
 * Instagram'a doğrudan HTTP ile giriş yapar.
 *
 * Şifreleme:
 *   EC key  → ECIES: ECDH (P-256) + SHA-256 key derivation + AES-256-GCM
 *   RSA key → RSA-PKCS1 wrapped AES-256-GCM (geriye dönük uyumluluk)
 *
 * Anahtar kaynağı:
 *   contact_point_prefill → sharedData → qe/sync (öncelik sırasıyla)
 *
 * Giriş akışı:
 *   Mobil API → Web API (fallback; 2FA/checkpoint hatalarında kısa devre)
 */
export async function loginToInstagram(
  username: string,
  password: string,
  ig: IgApiClient,
): Promise<DirectLoginResult> {
  // Şifreleme anahtarını al (EC veya RSA, kaynaktan bağımsız otomatik algılama)
  const key = await resolveEncryptionKey(ig);

  const timestamp = Math.floor(Date.now() / 1000);
  const encPassword = encryptPassword(password, key, timestamp);

  // ── Mobil API ─────────────────────────────────────────────────────────────
  const mobileResult = await loginViaMobile(username, encPassword, ig);
  if (mobileResult.success) return mobileResult;

  // 2FA / checkpoint → web API'yi denemeye gerek yok
  if (
    mobileResult.errorType === "2fa" ||
    mobileResult.errorType === "checkpoint"
  ) {
    return mobileResult;
  }

  // ── Web API (fallback) ────────────────────────────────────────────────────
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
