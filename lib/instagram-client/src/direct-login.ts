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
import { stealthFetch } from "./stealth-bridge";

// ── Sabitler ──────────────────────────────────────────────────────────────────

const MOBILE_LOGIN_URL =
  "https://i.instagram.com/api/v1/accounts/login/";
const WEB_LOGIN_URL =
  "https://www.instagram.com/api/v1/web/accounts/login/ajax/";
const CONTACT_POINT_URL =
  "https://i.instagram.com/api/v1/accounts/contact_point_prefill/";
const QE_SYNC_URL = "https://i.instagram.com/api/v1/qe/sync/";
const SHARED_DATA_URL =
  "https://www.instagram.com/data/shared_data/";

/** signed_body HMAC anahtarı (instagram-private-api constants.js'den) */
const IG_SIG_KEY =
  "9193488027538fd3450b83b7d05286d4ca9599a0f7eeed90d8c85925698a05dc";
const IG_SIG_KEY_VERSION = "4";

const IG_APP_ID = "1217981644879628";

/**
 * Instagram login akışındaki doğrudan HTTP istekleri için Stealth-Requests
 * (Python/curl_cffi) köprüsünü kullanır. Köprü çalışmazsa otomatik olarak
 * native fetch'e geri döner. `USE_STEALTH_REQUESTS=false` ile tamamen devre
 * dışı bırakılabilir.
 */
const loginFetch = process.env.USE_STEALTH_REQUESTS === "false" ? fetch : stealthFetch;

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

/**
 * Instagram'in web shared_data uç noktası bazen hex (32 bayt) anahtar döndürüyor.
 * Bu format RSA/EC SPKI DER değil, şifreleme koduyla uyumsuz. Sadece base64
 * görünen ve PEM/DER olarak çözülebilen anahtarları kabul et.
 */
function isValidBase64PubKey(value: string): boolean {
  if (!value || value.length < 64) return false;
  // Hex string (sadece [0-9a-fA-F] ve uzunluğu çift) ise base64 PEM değildir.
  if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) return false;
  try {
    const buf = Buffer.from(value, "base64");
    return buf.length >= 64;
  } catch {
    return false;
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

    const res = await loginFetch(CONTACT_POINT_URL, {
      method: "POST",
      headers: {
        "User-Agent": MOBILE_UA,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-IG-App-ID": IG_APP_ID,
        "X-IG-Capabilities": "3brTvw0=",
        "X-IG-Connection-Type": "WIFI",
      },
      body: new URLSearchParams({ ig_sig_key_version, signed_body }).toString(),
    });

    // Cevap headerından anahtar
    const hdrKeyId = res.headers.get("ig-set-password-encryption-key-id");
    const hdrPubKey = res.headers.get("ig-set-password-encryption-pub-key");
    if (hdrKeyId && hdrPubKey && isValidBase64PubKey(hdrPubKey)) {
      const keyId = Number(hdrKeyId);
      return { keyId, pubKeyBase64: hdrPubKey, keyType: detectKeyType(hdrPubKey) };
    }

    // Cevap gövdesinden anahtar
    let body: Record<string, unknown> = {};
    try { body = (await res.json()) as Record<string, unknown>; } catch {}
    const enc = body.encryption as Record<string, string> | undefined;
    if (enc?.key_id && enc?.public_key && isValidBase64PubKey(enc.public_key)) {
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
    const res = await loginFetch(SHARED_DATA_URL, {
      headers: {
        "User-Agent": DESKTOP_UA,
        "Accept": "application/json",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const enc = data.encryption as Record<string, string> | undefined;
    if (enc?.key_id && enc?.public_key && isValidBase64PubKey(enc.public_key)) {
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
 * 3. Kaynak: qe/sync, doğrudan HTTP üzerinden.
 *    Instagram bu uç noktaya 200/400 dönse de her zaman geçerli bir
 *    base64 PEM public key içeren ig-set-password-encryption-* headerları
 *    döndürür. Bu en güvenilir kaynak olduğu için doğrudan çağrılır.
 */
async function fetchKeyFromQeSyncDirect(
  ig: IgApiClient,
): Promise<EncryptionKey | null> {
  try {
    const s = readDeviceState(ig);
    const json = JSON.stringify({
      id: s.uuid,
      _csrftoken: s.csrfToken,
      _uuid: s.uuid,
      experiments: "",
    });
    const { signed_body, ig_sig_key_version } = signBody(json);

    const res = await loginFetch(QE_SYNC_URL, {
      method: "POST",
      headers: {
        "User-Agent": MOBILE_UA,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-IG-App-ID": IG_APP_ID,
        "X-IG-Capabilities": "3brTvw0=",
        "X-IG-Connection-Type": "WIFI",
        "X-DEVICE-ID": s.uuid,
      },
      body: new URLSearchParams({ ig_sig_key_version, signed_body }).toString(),
    });

    const hdrKeyId = res.headers.get("ig-set-password-encryption-key-id");
    const hdrPubKey = res.headers.get("ig-set-password-encryption-pub-key");
    if (hdrKeyId && hdrPubKey && isValidBase64PubKey(hdrPubKey)) {
      const keyId = Number(hdrKeyId);
      return { keyId, pubKeyBase64: hdrPubKey, keyType: detectKeyType(hdrPubKey) };
    }
  } catch (err) {
    console.warn("[direct-login] qe/sync direct key fetch failed:", err);
  }
  return null;
}

/**
 * 4. Kaynak: qe/sync (instagram-private-api ile) — son fallback.
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
    if (pubKeyBase64 && keyId && isValidBase64PubKey(pubKeyBase64)) {
      return { keyId, pubKeyBase64, keyType: detectKeyType(pubKeyBase64) };
    }
  } catch (err) {
    console.warn("[direct-login] qe/sync library key fetch failed:", err);
  }
  return null;
}

/**
 * Tüm anahtar kaynaklarını sırayla dener ve ilk başarılı sonucu döner.
 * Öncelik: qe/sync (direct) → contact_point_prefill → qe/sync (library) → sharedData
 * (sharedData bazen PEM/DER olmayan hex anahtar döndürüyor).
 */
async function resolveEncryptionKey(
  ig: IgApiClient,
): Promise<EncryptionKey> {
  let key: EncryptionKey | null = null;
  let source = "";

  try {
    key = await fetchKeyFromQeSyncDirect(ig);
    if (key) source = "qe/sync_direct";
  } catch (err) {
    console.warn("[direct-login] qe/sync direct key fetch failed:", err);
  }

  if (!key) {
    try {
      key = await fetchKeyFromContactPointPrefill(ig);
      if (key) source = "contact_point_prefill";
    } catch (err) {
      console.warn("[direct-login] contact_point_prefill key fetch failed:", err);
    }
  }

  if (!key) {
    try {
      key = await fetchKeyFromQeSync(ig);
      if (key) source = "qe/sync_library";
    } catch (err) {
      console.warn("[direct-login] qe/sync library key fetch failed:", err);
    }
  }

  if (!key) {
    try {
      key = await fetchKeyFromWebSharedData();
      if (key) source = "shared_data";
    } catch (err) {
      console.warn("[direct-login] shared_data key fetch failed:", err);
    }
  }

  if (!key) {
    throw new Error(
      "Instagram şifreleme anahtarı hiçbir kaynaktan alınamadı.",
    );
  }

  console.log(
    `[direct-login] Encryption key resolved from ${source}, keyId=${key.keyId}, keyType=${key.keyType}`,
  );
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
  // Stealth bridge (BridgeResponseWrapper) cookie'leri response objesinin kendi
  // getSetCookie() metodunda tutar — headers nesnesi değil, çünkü Set-Cookie
  // başlıkları bridge tarafından ayrı bir dizi olarak iletilir.
  // Native fetch ise cookie'leri headers.getSetCookie() üzerinden verir.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromResponse = ((res as any).getSetCookie?.() as string[] | undefined);
  if (fromResponse && fromResponse.length > 0) return fromResponse;
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

// ── CAA/Bloks İki Adımlı Doğrulama (2FA) Yönlendirme Protokolü ──────────────

/**
 * two_step_verification_context, doğrulama kodunun gönderilebileceği statik
 * bir endpoint olmadığı için sonraki tüm adımların (entrypoint → method_picker
 * → select_method → [enter_backup_code] → verify_code.async) anahtarıdır.
 * Bu bağlam yakalanamazsa istemci "Invalid Parameters" hatasıyla engellenir.
 */
const BLOKS_APPS_URL = "https://i.instagram.com/api/v1/bloks/apps/";

export type TwoFactorMethod = "totp" | "sms" | "backup_codes";

export interface BloksStepResult {
  success: boolean;
  /** Adımın Set-Cookie ile döndürdüğü ham çerezler (varsa) */
  cookies?: string[];
  /** Ham yanıt gövdesi — Bloks UI ağacı/JSON (ayıklama ve hata ayıklama için) */
  raw?: unknown;
  error?: string;
}

async function postBloksAction(
  appId: string,
  params: Record<string, unknown>,
  cookieHeader: string,
  userAgent: string = MOBILE_UA,
): Promise<BloksStepResult> {
  try {
    const res = await loginFetch(`${BLOKS_APPS_URL}${appId}/`, {
      method: "POST",
      headers: {
        "User-Agent": userAgent,
        "X-IG-App-ID": IG_APP_ID,
        "Cookie": cookieHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ params: JSON.stringify(params) }).toString(),
    });

    const cookies = getSetCookies(res);
    const text = await res.text();
    let raw: unknown = text;
    try { raw = JSON.parse(text); } catch { /* Bloks UI ağacı düz metin/binary olabilir */ }

    if (!res.ok) {
      const msg =
        typeof (raw as Record<string, unknown>)?.message === "string"
          ? (raw as Record<string, unknown>).message
          : `HTTP ${res.status}`;
      return { success: false, cookies, raw, error: `Bloks (${appId}): ${msg}` };
    }
    return { success: true, cookies, raw };
  } catch (e) {
    return {
      success: false,
      error: `Ağ hatası (bloks ${appId}): ${e instanceof Error ? e.message : e}`,
    };
  }
}

/** 1. Giriş Noktası Aktivasyonu (Entrypoint) */
export function bloksTwoFactorEntrypoint(
  twoStepVerificationContext: string,
  cookieHeader: string,
  userAgent?: string,
): Promise<BloksStepResult> {
  return postBloksAction(
    "com.bloks.www.two_step_verification.entrypoint",
    { server_params: { two_step_verification_context: twoStepVerificationContext } },
    cookieHeader,
    userAgent,
  );
}

/** 2. Yöntem Seçici (Method Picker) — aktif 2FA yöntemlerini (telefon/authenticator/yedek kod) tespit eder. */
export function bloksTwoFactorMethodPicker(
  twoStepVerificationContext: string,
  cookieHeader: string,
  userAgent?: string,
): Promise<BloksStepResult> {
  return postBloksAction(
    "com.bloks.www.two_step_verification.method_picker",
    { server_params: { two_step_verification_context: twoStepVerificationContext } },
    cookieHeader,
    userAgent,
  );
}

/** 3. Yöntem Seçimi ve Tetikleme — selected_method: totp | sms | backup_codes */
export function bloksTwoFactorSelectMethod(
  twoStepVerificationContext: string,
  selectedMethod: TwoFactorMethod,
  cookieHeader: string,
  userAgent?: string,
): Promise<BloksStepResult> {
  return postBloksAction(
    "com.bloks.www.two_step_verification.select_method",
    {
      client_input_params: { selected_method: selectedMethod },
      server_params: { two_step_verification_context: twoStepVerificationContext },
    },
    cookieHeader,
    userAgent,
  );
}

/** 4a. Kod Giriş Ekranı Yüklemesi — yalnızca backup_codes yöntemi seçildiyse gerekli ön adım. */
export function bloksTwoFactorEnterBackupCode(
  twoStepVerificationContext: string,
  cookieHeader: string,
  userAgent?: string,
): Promise<BloksStepResult> {
  return postBloksAction(
    "com.bloks.www.two_step_verification.enter_backup_code",
    { server_params: { two_step_verification_context: twoStepVerificationContext } },
    cookieHeader,
    userAgent,
  );
}

/**
 * 4b. Doğrulama kodunun gönderildiği ana gizli endpoint:
 *   POST /api/v1/bloks/apps/com.bloks.www.two_step_verification.verify_code.async/
 *   Body: params={"client_input_params":{"verification_code":"...","challenge_type":"..."},
 *                 "server_params":{"two_step_verification_context":"..."}}
 *
 * verification_code: TOTP/SMS için 6 hane, backup_codes için 8 hane.
 */
export function bloksTwoFactorVerifyCode(
  twoStepVerificationContext: string,
  verificationCode: string,
  challengeType: TwoFactorMethod,
  cookieHeader: string,
  userAgent?: string,
): Promise<BloksStepResult> {
  return postBloksAction(
    "com.bloks.www.two_step_verification.verify_code.async",
    {
      client_input_params: { verification_code: verificationCode, challenge_type: challengeType },
      server_params: { two_step_verification_context: twoStepVerificationContext },
    },
    cookieHeader,
    userAgent,
  );
}

export interface BloksLoginExtraction {
  sessionCookies?: SessionCookies;
  userId?: string;
  username?: string;
}

/**
 * 5. Oturum Ayıklama — bloks_extract_login_response().
 *
 * Kod doğrulama başarılı olduğunda sunucu ham oturum çerezleri yerine
 * karmaşık bir Bloks nesnesi döndürür. Öncelik HTTP Set-Cookie
 * başlıklarındadır (asıl oturum verisi genelde buradan gelir); bulunamazsa
 * ham yanıt gövdesindeki iç içe geçmiş sessionid/user_id/username alanları
 * taranarak çıkarılır.
 */
export function bloksExtractLoginResponse(
  result: BloksStepResult,
): BloksLoginExtraction {
  const extraction: BloksLoginExtraction = {};

  if (result.cookies?.length) {
    const sessionCookies = extractSessionCookies(result.cookies);
    if (sessionCookies.sessionid) extraction.sessionCookies = sessionCookies;
    if (sessionCookies.ds_user_id) extraction.userId = sessionCookies.ds_user_id;
  }

  const text = typeof result.raw === "string" ? result.raw : JSON.stringify(result.raw ?? "");
  if (!extraction.sessionCookies) {
    const sessionIdMatch = text.match(/"sessionid["\\]*\s*:\s*\\?"([^"\\]+)/);
    if (sessionIdMatch?.[1]) {
      const csrfMatch = text.match(/"csrftoken["\\]*\s*:\s*\\?"([^"\\]+)/);
      extraction.sessionCookies = {
        sessionid: sessionIdMatch[1],
        csrftoken: csrfMatch?.[1],
        cookieHeader: `sessionid=${sessionIdMatch[1]}${csrfMatch ? `; csrftoken=${csrfMatch[1]}` : ""}`,
        raw: result.cookies ?? [],
      };
    }
  }

  if (!extraction.userId) {
    const userIdMatch =
      text.match(/"pk["\\]*\s*:\s*\\?"?(\d+)/) ?? text.match(/"user_id["\\]*\s*:\s*\\?"?(\d+)/);
    if (userIdMatch?.[1]) extraction.userId = userIdMatch[1];
  }

  const usernameMatch = text.match(/"username["\\]*\s*:\s*\\?"([^"\\]+)/);
  if (usernameMatch?.[1]) extraction.username = usernameMatch[1];

  return extraction;
}

/**
 * Belgede tanımlanan uçtan uca 2FA yönlendirme zinciri: entrypoint →
 * method_picker → select_method → [enter_backup_code] → verify_code.async
 * → bloks_extract_login_response(). Başarılı olursa çağıran taraf
 * (InstagramClient) bloks_apply_login_response() eşdeğeri olarak
 * extraction.sessionCookies'i kendi oturum belleğine yükler.
 */
export async function completeTwoFactorLogin(
  twoStepVerificationContext: string,
  method: TwoFactorMethod,
  verificationCode: string,
  cookieHeader: string,
  userAgent: string = MOBILE_UA,
): Promise<{ success: boolean; extraction?: BloksLoginExtraction; error?: string; step?: string }> {
  let cookies = cookieHeader;

  const entry = await bloksTwoFactorEntrypoint(twoStepVerificationContext, cookies, userAgent);
  if (!entry.success) return { success: false, error: entry.error, step: "entrypoint" };
  if (entry.cookies?.length) cookies = extractSessionCookies([...splitCookieHeader(cookies), ...entry.cookies]).cookieHeader;

  const picker = await bloksTwoFactorMethodPicker(twoStepVerificationContext, cookies, userAgent);
  if (!picker.success) return { success: false, error: picker.error, step: "method_picker" };
  if (picker.cookies?.length) cookies = extractSessionCookies([...splitCookieHeader(cookies), ...picker.cookies]).cookieHeader;

  const select = await bloksTwoFactorSelectMethod(twoStepVerificationContext, method, cookies, userAgent);
  if (!select.success) return { success: false, error: select.error, step: "select_method" };
  if (select.cookies?.length) cookies = extractSessionCookies([...splitCookieHeader(cookies), ...select.cookies]).cookieHeader;

  if (method === "backup_codes") {
    const backup = await bloksTwoFactorEnterBackupCode(twoStepVerificationContext, cookies, userAgent);
    if (!backup.success) return { success: false, error: backup.error, step: "enter_backup_code" };
    if (backup.cookies?.length) cookies = extractSessionCookies([...splitCookieHeader(cookies), ...backup.cookies]).cookieHeader;
  }

  const verify = await bloksTwoFactorVerifyCode(
    twoStepVerificationContext,
    verificationCode,
    method,
    cookies,
    userAgent,
  );
  if (!verify.success) return { success: false, error: verify.error, step: "verify_code" };

  const extraction = bloksExtractLoginResponse(verify);
  if (!extraction.sessionCookies?.sessionid) {
    return { success: false, error: "Bloks yanıtından oturum çerezleri ayıklanamadı", step: "extract" };
  }
  return { success: true, extraction };
}

/** "a=b; c=d" formatındaki Cookie header'ını Set-Cookie benzeri bir diziye çevirir (birleştirme amaçlı). */
function splitCookieHeader(cookieHeader: string): string[] {
  return cookieHeader
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean);
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

/**
 * Verifies that a session (identified by its cookieHeader) is still valid by
 * calling the current_user endpoint directly — without going through IgApiClient.
 *
 * Using IgApiClient.account.currentUser() after a stealth-bridge login causes
 * 403 login_required because IgApiClient's request pipeline adds headers /
 * uses a TLS stack that Instagram's bot-detection rejects. This function uses
 * the same lightweight fetch approach as pingKeepAlive but returns a typed
 * result so callers can distinguish error scenarios.
 *
 * @returns { valid: true } on HTTP 200
 *          { valid: false, errorType, error } on failure
 *          { valid: true } on network/timeout errors (fail-open: don't block login)
 */
/** Instagram web uygulaması kimliği (HAR'dan alınan gerçek web app ID). */
const WEB_APP_ID = "936619743392459";

/**
 * HAR analizinden alınan gerçek tarayıcı User-Agent.
 * i.instagram.com mobil endpoint'i Replit datacenter IP'sinden bloklanıyor;
 * www.instagram.com web endpoint'i ise tarayıcı UA + web app ID ile çalışıyor.
 */
const WEB_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0";

export async function verifySession(
  cookieHeader: string,
  _userAgent = MOBILE_UA,
): Promise<{
  valid: boolean;
  errorType?: "checkpoint" | "login_required" | "rate_limit" | "spam_or_abuse";
  error?: string;
  /** errorType === "checkpoint" olduğunda: challenge/resolve akışı için checkpoint_url. */
  checkpointUrl?: string;
}> {
  // Cookie header'dan csrftoken'ı çıkar (web endpoint için zorunlu).
  const csrftoken = cookieHeader.match(/csrftoken=([^;]+)/)?.[1] ?? "";

  try {
    // www.instagram.com web endpoint'ini kullan — i.instagram.com mobil endpoint'i
    // Replit datacenter IP'sinden login_required döndürüyor (HAR analizi: Replit IP
    // mobile API'de bloklu, web API'de değil). Web endpoint için tarayıcı UA ve
    // web app ID (936619743392459) şart; aksi hâlde 401 alınıyor.
    const res = await fetch(
      "https://www.instagram.com/api/v1/accounts/current_user/?edit=true",
      {
        headers: {
          "User-Agent": WEB_UA,
          "Cookie": cookieHeader,
          "X-IG-App-ID": WEB_APP_ID,
          "X-CSRFToken": csrftoken,
          "X-ASBD-ID": "359341",
          "X-IG-WWW-Claim": "0",
          "Accept": "*/*",
          "Accept-Language": "tr,en;q=0.9",
          "Origin": "https://www.instagram.com",
          "Referer": "https://www.instagram.com/",
          "Sec-Fetch-Site": "same-origin",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Dest": "empty",
          "Sec-CH-UA": '"Not;A=Brand";v="8", "Chromium";v="150", "Microsoft Edge";v="150"',
          "Sec-CH-UA-Mobile": "?0",
          "Sec-CH-UA-Platform": '"Windows"',
        },
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (res.status === 200) return { valid: true };

    // 429 = Instagram doğrulama endpoint'ini geçici olarak throttle etti.
    // Bu, session'ın geçersiz olduğu anlamına gelmez — login başarılıysa cookie
    // zaten doğrudur. Fail-open uygula ki başarılı loginler throttle yüzünden
    // engellenmesin.
    if (res.status === 429) {
      console.log("[verifySession] 429 rate-limit — session geçerli kabul ediliyor (throttle ≠ geçersiz session)");
      return { valid: true };
    }

    // Önce ham metni oku (JSON parse başarısız olursa teşhis için loglamak amacıyla),
    // sonra JSON'a çevirmeyi dene. Boş/HTML gövdeler burada yakalanır.
    const rawText = await res.text().catch(() => "");
    let body: Record<string, unknown> = {};
    try { body = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {}; } catch { /* ignore */ }

    console.log(
      "[verifySession] status:", res.status,
      "body:", JSON.stringify({ error_type: body["error_type"], message: body["message"], has_checkpoint_url: !!body["checkpoint_url"], keys: Object.keys(body) }),
      "rawBodyLen:", rawText.length,
      Object.keys(body).length === 0 ? `rawBodyPreview: ${JSON.stringify(rawText.slice(0, 300))}` : "",
    );

    const errorType = (body["error_type"] as string | undefined) ?? "";
    const message   = (body["message"]    as string | undefined) ?? `HTTP ${res.status}`;

    if (body["checkpoint_url"] || errorType === "checkpoint_challenge_required") {
      return {
        valid: false,
        errorType: "checkpoint",
        error: "Instagram requires checkpoint verification",
        checkpointUrl: typeof body["checkpoint_url"] === "string" ? body["checkpoint_url"] : undefined,
      };
    }
    if (errorType === "login_required" || res.status === 403) {
      return { valid: false, errorType: "login_required", error: message };
    }
    if (res.status === 429) {
      return { valid: false, errorType: "rate_limit", error: "Rate limited by Instagram" };
    }
    if (errorType === "sentry_block" || errorType === "spam") {
      return { valid: false, errorType: "spam_or_abuse", error: message };
    }

    return { valid: false, errorType: "login_required", error: message };
  } catch {
    // Network / timeout — fail-open so transient errors don't block logins
    return { valid: true };
  }
}

// ── Checkpoint (challenge) çözümleme akışı ───────────────────────────────────
//
// Instagram'ın login yanıtında/oturum doğrulamasında checkpoint_url
// döndüğünde başlatılan "challenge/resolve" akışı:
//   1. GET  {checkpoint_url}         → step_name ("select_verify_method" |
//                                       "verify_code" | ...) + step_data
//                                       (varsa email/telefon ipuçları)
//   2. POST {checkpoint_url}         → { choice: "<value>" } — seçilen
//                                       yönteme (SMS/e-posta) kod gönderir
//   3. POST {checkpoint_url}         → { security_code: "<code>" } — kodu
//                                       doğrular; başarılı olursa sessionid
//                                       içeren Set-Cookie döner.
//
// NOT: Bu, Instagram'ın belgelenmemiş özel API'sidir — bu üç adımın tam
// alan adları/choice numaralandırması resmi olarak belgelenmemiştir ve
// yaygın açık kaynak istemcilerinde (instagrapi, instagram-private-api
// forkları) gözlemlenen davranışa dayanır. Instagram tarafında değişebilir;
// gerçek bir hesapla doğrulanmalıdır.

function buildChallengeUrl(checkpointUrl: string): string {
  if (checkpointUrl.startsWith("http")) return checkpointUrl;
  return `https://i.instagram.com${checkpointUrl.startsWith("/") ? "" : "/"}${checkpointUrl}`;
}

export interface ChallengeChoice {
  /** Instagram'a "choice" alanı olarak gönderilecek ham değer (örn. "0", "1"). */
  value: string;
  /** Kullanıcıya gösterilecek etiket (örn. "SMS ile gönder — •••1234"). */
  label: string;
}

export interface ChallengeContext {
  /** Instagram'ın döndürdüğü adım adı (örn. "select_verify_method", "verify_code"). */
  stepName: string;
  /** step_name === "select_verify_method" olduğunda seçilebilecek yöntemler. */
  choices?: ChallengeChoice[];
  /** Kullanıcıya gösterilecek insan-okunabilir mesaj (varsa). */
  message?: string;
  error?: string;
}

/**
 * Checkpoint URL'sinin mevcut adımını (step_name/step_data) sorgular.
 * cookieHeader, login denemesinden dönen ön oturum cookie'leri olmalıdır
 * (csrftoken/mid — henüz sessionid içermez).
 */
export async function fetchChallengeContext(
  checkpointUrl: string,
  cookieHeader: string,
  userAgent = MOBILE_UA,
): Promise<ChallengeContext> {
  try {
    const res = await loginFetch(buildChallengeUrl(checkpointUrl), {
      method: "GET",
      headers: {
        "User-Agent": userAgent,
        "Cookie": cookieHeader,
        "X-IG-App-ID": IG_APP_ID,
        "Accept": "application/json",
        "Accept-Language": "tr-TR",
      },
    });

    let data: Record<string, unknown> = {};
    try { data = (await res.json()) as Record<string, unknown>; } catch {
      return { stepName: "unknown", error: `Beklenmeyen yanıt (HTTP ${res.status})` };
    }

    const stepName = typeof data.step_name === "string" ? data.step_name : "unknown";
    const stepData = (data.step_data ?? {}) as Record<string, unknown>;

    const choices: ChallengeChoice[] = [];
    if (typeof stepData.phone_number === "string" && stepData.phone_number) {
      choices.push({ value: "0", label: `SMS ile gönder — ${stepData.phone_number}` });
    }
    if (typeof stepData.email === "string" && stepData.email) {
      choices.push({ value: "1", label: `E-posta ile gönder — ${stepData.email}` });
    }
    // Bazı yanıtlar step_data.choice içinde hazır seçenek listesi döndürür.
    if (Array.isArray(stepData.choice)) {
      for (const c of stepData.choice as unknown[]) {
        if (c && typeof c === "object" && "value" in c) {
          const cc = c as { value: string; label?: string };
          choices.push({ value: String(cc.value), label: cc.label ?? String(cc.value) });
        }
      }
    }

    return {
      stepName,
      choices: choices.length > 0 ? choices : undefined,
      message: typeof data.message === "string" ? data.message : undefined,
    };
  } catch (e) {
    return { stepName: "unknown", error: `Ağ hatası (challenge context): ${e instanceof Error ? e.message : e}` };
  }
}

/**
 * step_name === "select_verify_method" adımında, kullanıcının seçtiği
 * yönteme (choice) Instagram'ın kod göndermesini tetikler.
 */
export async function selectChallengeMethod(
  checkpointUrl: string,
  cookieHeader: string,
  choice: string,
  userAgent = MOBILE_UA,
): Promise<{ success: boolean; stepName?: string; error?: string }> {
  try {
    const res = await loginFetch(buildChallengeUrl(checkpointUrl), {
      method: "POST",
      headers: {
        "User-Agent": userAgent,
        "Cookie": cookieHeader,
        "X-IG-App-ID": IG_APP_ID,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept-Language": "tr-TR",
      },
      body: new URLSearchParams({ choice }).toString(),
    });

    let data: Record<string, unknown> = {};
    try { data = (await res.json()) as Record<string, unknown>; } catch {
      return { success: false, error: `Beklenmeyen yanıt (HTTP ${res.status})` };
    }

    if (!res.ok || data.status === "fail") {
      const msg = typeof data.message === "string" ? data.message : `HTTP ${res.status}`;
      return { success: false, error: msg };
    }

    return { success: true, stepName: typeof data.step_name === "string" ? data.step_name : undefined };
  } catch (e) {
    return { success: false, error: `Ağ hatası (challenge select): ${e instanceof Error ? e.message : e}` };
  }
}

/**
 * step_name === "verify_code" adımında, kullanıcının girdiği güvenlik
 * kodunu doğrular. Başarılı olursa Set-Cookie'den sessionid dahil tam
 * oturum cookie'lerini çıkarır.
 */
export async function submitChallengeCode(
  checkpointUrl: string,
  cookieHeader: string,
  code: string,
  userAgent = MOBILE_UA,
): Promise<{ success: boolean; sessionCookies?: SessionCookies; error?: string }> {
  try {
    const res = await loginFetch(buildChallengeUrl(checkpointUrl), {
      method: "POST",
      headers: {
        "User-Agent": userAgent,
        "Cookie": cookieHeader,
        "X-IG-App-ID": IG_APP_ID,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept-Language": "tr-TR",
      },
      body: new URLSearchParams({ security_code: code }).toString(),
    });

    const setCookies = getSetCookies(res);
    let data: Record<string, unknown> = {};
    try { data = (await res.json()) as Record<string, unknown>; } catch {
      return { success: false, error: `Beklenmeyen yanıt (HTTP ${res.status})` };
    }

    const sessionCookies = extractSessionCookies(setCookies);
    const hasSession = Boolean(sessionCookies.sessionid);

    if (!res.ok && !hasSession) {
      const msg = typeof data.message === "string" ? data.message : `HTTP ${res.status}`;
      return { success: false, error: msg };
    }
    if (data.status === "fail" && !hasSession) {
      const msg = typeof data.message === "string" ? data.message : "Doğrulama kodu reddedildi";
      return { success: false, error: msg };
    }
    if (!hasSession) {
      return {
        success: false,
        error: typeof data.message === "string" ? data.message : "Kod kabul edildi ama oturum kurulamadı",
      };
    }

    return { success: true, sessionCookies };
  } catch (e) {
    return { success: false, error: `Ağ hatası (challenge verify): ${e instanceof Error ? e.message : e}` };
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

export type LoginErrorType =
  | "checkpoint"
  | "captcha"
  | "rate_limit"
  | "spam_or_abuse"
  | "2fa"
  | "bad_password"
  | "unknown";

/**
 * Instagram'ın giriş yanıtında (mobil/web) döndürebileceği çeşitli
 * captcha/anti-bot/hız-sınırı işaretlerini sınıflandırır. Instagram bunu
 * tek bir tutarlı alanla bildirmez — bazen error_type, bazen sadece message
 * metni, bazen challenge/checkpoint URL'i olarak gelir; bu yüzden hepsine
 * bakılır.
 */
const CHECKPOINT_ERROR_TYPES = new Set([
  "checkpoint_required",
  "checkpoint_challenge_required",
  "challenge_required",
]);

const RATE_LIMIT_ERROR_TYPES = new Set(["rate_limit_error", "too_many_requests"]);

const SPAM_ERROR_TYPES = new Set([
  "feedback_required",
  "spam",
  "sentry_block",
  "suspicious_login_reported",
]);

const CAPTCHA_MESSAGE_KEYWORDS = [
  "captcha",
  "recaptcha",
  "hcaptcha",
  "prove you're not a robot",
  "prove you are not a robot",
  "are you human",
  "we detected unusual activity",
  "we suspect automated behavior",
  "suspicious activity",
  "unusual activity",
];

const RATE_LIMIT_MESSAGE_KEYWORDS = [
  "please wait a few minutes",
  "try again later",
  "too many requests",
  "wait a few minutes before",
];

const SPAM_MESSAGE_KEYWORDS = [
  "action blocked",
  "we restrict certain activity",
  "temporarily blocked",
  "your account has been disabled",
];

function messageIncludesAny(message: string, keywords: string[]): boolean {
  const lower = message.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

/**
 * Ham Instagram login yanıt gövdesini (data) inceleyip bir LoginErrorType
 * belirler. error_type alanı öncelikli; yoksa message metnindeki anahtar
 * kelimelere bakılır. Hiçbir eşleşme yoksa null döner (çağıran taraf
 * bad_password/unknown gibi diğer ayrımları kendi yapar).
 */
export function classifyInstagramLoginError(
  data: Record<string, unknown>,
  httpStatus: number,
): LoginErrorType | null {
  const errorType = typeof data.error_type === "string" ? data.error_type : "";
  const message = typeof data.message === "string" ? data.message : "";

  if (
    CHECKPOINT_ERROR_TYPES.has(errorType) ||
    data.checkpoint_url ||
    data.challenge
  ) {
    return "checkpoint";
  }
  if (RATE_LIMIT_ERROR_TYPES.has(errorType) || httpStatus === 429) {
    return "rate_limit";
  }
  if (SPAM_ERROR_TYPES.has(errorType)) {
    return "spam_or_abuse";
  }
  if (messageIncludesAny(message, CAPTCHA_MESSAGE_KEYWORDS)) {
    return "captcha";
  }
  if (messageIncludesAny(message, RATE_LIMIT_MESSAGE_KEYWORDS)) {
    return "rate_limit";
  }
  if (messageIncludesAny(message, SPAM_MESSAGE_KEYWORDS)) {
    return "spam_or_abuse";
  }
  return null;
}

/**
 * /api/v1/accounts/login/ isteği HTTP 400 (TwoFactorRequired) döndüğünde
 * yanıt gövdesinde gelen ham "two_factor_info" nesnesi. Belgelenen kritik
 * alanlar: two_factor_identifier, two_step_verification_context (ayrıca
 * username, obfuscated_phone_number, totp_two_factor_on, sms_two_factor_on vb.
 * sağlayıcıya göre değişen ek alanlar içerebilir).
 */
export interface TwoFactorInfo {
  two_factor_identifier?: string;
  two_step_verification_context?: string;
  username?: string;
  obfuscated_phone_number?: string;
  totp_two_factor_on?: boolean;
  sms_two_factor_on?: boolean;
  [key: string]: unknown;
}

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
  /** errorType === "2fa" olduğunda: yanıt gövdesindeki ham two_factor_info nesnesi. */
  twoFactorInfo?: TwoFactorInfo;
  /** İki adımlı doğrulama isteğinde kullanılacak kimlik — two_factor_info.two_factor_identifier. */
  twoFactorIdentifier?: string;
  /** two_factor_info.two_step_verification_context (örn. "default", "sms"). */
  twoStepVerificationContext?: string;
  /**
   * errorType === "checkpoint" olduğunda: yanıt gövdesindeki checkpoint_url
   * (örn. "/challenge/12345678/abcAbc123/"). challenge/resolve akışını
   * başlatmak için fetchChallengeContext/selectChallengeMethod/submitChallengeCode
   * çağrılarına geçirilir.
   */
  checkpointUrl?: string;
}

// ── Mobil API girişi ──────────────────────────────────────────────────────────

async function loginViaMobile(
  username: string,
  encPassword: string,
  ig: IgApiClient,
  options?: { arkoseToken?: string },
): Promise<DirectLoginResult> {
  const s = readDeviceState(ig);

  const payload: Record<string, unknown> = {
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

  // If a funcaptcha token was solved, include it in the login body
  if (options?.arkoseToken) {
    payload["arkose_challenge_token"] = options.arkoseToken;
  }

  const json = JSON.stringify(payload);
  const { signed_body, ig_sig_key_version } = signBody(json);

  let res: Response;
  try {
    res = await loginFetch(MOBILE_LOGIN_URL, {
      method: "POST",
      headers: {
        "User-Agent": MOBILE_UA,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept-Language": "tr-TR",
        "X-IG-App-ID": IG_APP_ID,
        "X-IG-Capabilities": "3brTvw0=",
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
    const info = data.two_factor_info as TwoFactorInfo | undefined;
    return {
      success: false,
      error: "two-factor",
      errorType: "2fa",
      twoFactorInfo: info,
      twoFactorIdentifier: info?.two_factor_identifier,
      twoStepVerificationContext: info?.two_step_verification_context,
      // Bloks doğrulama zincirinin ilk adımı için gerekli csrftoken/mid gibi
      // ön oturum cookie'leri — henüz sessionid içermez.
      cookies: setCookies,
    };
  }
  const classified = classifyInstagramLoginError(data, res.status);
  if (classified) {
    const msg =
      typeof data.message === "string" ? data.message : classified;
    return {
      success: false,
      error: msg,
      errorType: classified,
      checkpointUrl:
        classified === "checkpoint" && typeof data.checkpoint_url === "string"
          ? data.checkpoint_url
          : undefined,
      // Checkpoint çözümleme akışı, checkpoint tetiklenmeden önceki ön oturum
      // cookie'lerini (csrftoken/mid) gerektirir — 2FA akışıyla aynı mantık.
      cookies: classified === "checkpoint" ? setCookies : undefined,
    };
  }
  if (!res.ok || data.status === "fail") {
    const errorType: LoginErrorType =
      data.error_type === "bad_password" ? "bad_password" : "unknown";
    const msg =
      typeof data.message === "string" ? data.message : `HTTP ${res.status}`;
    // Diagnostic: an "unknown" failure (not classified as bad_password) is
    // exactly the case where a real captcha/checkpoint might be slipping
    // through unrecognized. Log the safe (password-free) shape of the raw
    // response so the classifier's keyword/field lists can be extended.
    if (errorType === "unknown") {
      console.error(
        "[instagram-client] Unclassified mobile login failure — raw response:",
        JSON.stringify({ status: res.status, error_type: data.error_type, message: data.message, keys: Object.keys(data) }),
      );
    }
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
    initRes = await loginFetch("https://www.instagram.com/accounts/login/", {
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
    res = await loginFetch(WEB_LOGIN_URL, {
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
    const info = data.two_factor_info as TwoFactorInfo | undefined;
    return {
      success: false,
      error: "two-factor",
      errorType: "2fa",
      twoFactorInfo: info,
      twoFactorIdentifier: info?.two_factor_identifier,
      twoStepVerificationContext: info?.two_step_verification_context,
      cookies: [...initCookies, ...setCookies],
    };
  }
  const classifiedWeb = classifyInstagramLoginError(data, res.status);
  if (classifiedWeb) {
    const msg =
      typeof data.message === "string" ? data.message : classifiedWeb;
    return {
      success: false,
      error: msg,
      errorType: classifiedWeb,
      checkpointUrl:
        classifiedWeb === "checkpoint" && typeof data.checkpoint_url === "string"
          ? data.checkpoint_url
          : undefined,
      cookies: classifiedWeb === "checkpoint" ? [...initCookies, ...setCookies] : undefined,
    };
  }
  if (!res.ok || !data.authenticated) {
    const msg =
      typeof data.message === "string" ? data.message : `HTTP ${res.status}`;
    console.error(
      "[instagram-client] Unclassified web login failure — raw response:",
      JSON.stringify({ status: res.status, message: data.message, keys: Object.keys(data) }),
    );
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
  options?: { arkoseToken?: string },
): Promise<DirectLoginResult> {
  // Şifreleme anahtarını al (EC veya RSA, kaynaktan bağımsız otomatik algılama)
  const key = await resolveEncryptionKey(ig);

  const timestamp = Math.floor(Date.now() / 1000);
  const encPassword = encryptPassword(password, key, timestamp);

  // ── Mobil API ─────────────────────────────────────────────────────────────
  const mobileResult = await loginViaMobile(username, encPassword, ig, options);
  if (mobileResult.success) return mobileResult;

  // 2FA / checkpoint / captcha / hız sınırı / spam → web API'yi denemeye gerek yok
  const SHORT_CIRCUIT_TYPES: LoginErrorType[] = [
    "2fa",
    "checkpoint",
    "captcha",
    "rate_limit",
    "spam_or_abuse",
  ];
  if (
    mobileResult.errorType &&
    SHORT_CIRCUIT_TYPES.includes(mobileResult.errorType)
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
      webResult.errorType && SHORT_CIRCUIT_TYPES.includes(webResult.errorType)
        ? webResult.errorType
        : "unknown",
  };
}
