import {
  IgApiClient,
  IgCheckpointError,
  IgLoginTwoFactorRequiredError,
  IgActionSpamError,
  IgSentryBlockError,
  IgRequestsLimitError,
  IgInactiveUserError,
} from "instagram-private-api";
import { INSTAGRAM_USER_AGENTS } from "./user-agents";
import {
  loginToInstagram,
  refreshCsrfToken,
  pingKeepAlive,
  verifySession,
  updateCsrfInHeader,
  fetchUserInfo,
  fetchSelfProfile,
  fetchWebProfileInfo,
  fetchFriendships,
  fetchUserFeed,
  fetchUserClips,
  fetchUserStories,
  markStorySeenRaw,
  likeMediaRaw,
  unlikeMediaRaw,
  addCommentRaw,
  commentLikeRaw,
  fetchMediaInfo,
  completeTwoFactorLogin,
  extractSessionCookies,
  fetchChallengeContext,
  selectChallengeMethod,
  submitChallengeCode,
  type SessionCookies,
  type RawFeedItem,
  type RawFriendshipUser,
  type TwoFactorInfo,
  type TwoFactorMethod,
  type ChallengeChoice,
  type DirectLoginResult,
} from "./direct-login";
import { solveFuncaptcha } from "./funcaptcha-client";

/**
 * /api/v1/accounts/login/ HTTP 400 (TwoFactorRequired) döndürdüğünde
 * fırlatılır. Yanıt gövdesindeki ham two_factor_info, two_factor_identifier
 * ve two_step_verification_context alanlarını taşır — çağıran taraf (örn.
 * API route) bunları okuyup bir doğrulama kodu isteme akışı tetikleyebilir.
 * two_step_verification_context, CAA/Bloks yönlendirme zincirinin
 * (entrypoint → method_picker → select_method → verify_code.async)
 * anahtarıdır; bu bağlam olmadan sonraki adımlar "Invalid Parameters"
 * hatasıyla engellenir — bu yüzden InstagramClient.completeTwoFactorLogin()
 * çağrısı için de burada saklanır (bkz. pendingTwoFactor).
 */
export class InstagramTwoFactorRequiredError extends Error {
  readonly twoFactorInfo?: TwoFactorInfo;
  readonly twoFactorIdentifier?: string;
  readonly twoStepVerificationContext?: string;

  constructor(details: {
    twoFactorInfo?: TwoFactorInfo;
    twoFactorIdentifier?: string;
    twoStepVerificationContext?: string;
  }) {
    super("Instagram two-factor authentication is required.");
    this.name = "InstagramTwoFactorRequiredError";
    this.twoFactorInfo = details.twoFactorInfo;
    this.twoFactorIdentifier = details.twoFactorIdentifier;
    this.twoStepVerificationContext = details.twoStepVerificationContext;
  }
}

export type { TwoFactorInfo, TwoFactorMethod, ChallengeChoice };
export type { LoginErrorType } from "./direct-login";

/**
 * Instagram bir "checkpoint" (güvenlik doğrulaması / challenge) döndürdüğünde
 * ve otomatik FunCaptcha bypass'ı başarısız olduğunda fırlatılır. Diğer
 * InstagramCaptchaChallengeError durumlarından farkı: burada bir
 * checkpoint_url mevcut, yani InstagramClient interaktif çözümleme akışını
 * (getCheckpointOptions/selectCheckpointMethod/completeCheckpoint) başlatabilir.
 * Çağıran taraf (auth.ts) bunu InstagramCaptchaChallengeError'dan ÖNCE
 * yakalamalı.
 */
export class InstagramCheckpointRequiredError extends Error {
  constructor() {
    super("Instagram güvenlik doğrulaması (checkpoint) gerektiriyor.");
    this.name = "InstagramCheckpointRequiredError";
  }
}

/**
 * Instagram bir captcha/anti-bot doğrulaması, hız sınırı veya spam/kötüye
 * kullanım engeli döndürdüğünde fırlatılır (checkpoint dışındaki türler için
 * — checkpoint hâlâ ayrı bir düz Error mesajı olarak fırlatılır, geriye
 * dönük uyumluluk için). Çağıran taraf (örn. /auth/login) bunu yakalayıp
 * isCaptcha: true + captchaType alanlarıyla yapılandırılmış bir yanıt
 * döndürebilir; böylece kullanıcıya "şifreniz yanlış" değil "güvenlik
 * doğrulaması gerekiyor" mesajı gösterilir.
 */
export class InstagramCaptchaChallengeError extends Error {
  readonly captchaType: "checkpoint" | "captcha" | "rate_limit" | "spam_or_abuse" | "blocked";

  constructor(captchaType: "checkpoint" | "captcha" | "rate_limit" | "spam_or_abuse" | "blocked", message?: string) {
    super(
      message ??
        "Instagram requires additional verification (captcha/checkpoint/rate limit) before login can proceed.",
    );
    this.name = "InstagramCaptchaChallengeError";
    this.captchaType = captchaType;
  }
}

/** Ham feed/clips öğesini InstagramPost şekline dönüştürür. */
function mapRawMediaToPost(item: RawFeedItem): InstagramPost {
  return {
    id: String(item.pk ?? item.id ?? ""),
    code: item.code,
    mediaType: item.media_type ?? 1,
    caption: item.caption?.text ?? undefined,
    likeCount: item.like_count ?? 0,
    commentCount: item.comment_count ?? 0,
    displayUrl: item.image_versions2?.candidates?.[0]?.url,
    videoUrl: item.video_versions?.[0]?.url,
    hasLiked: item.has_liked ?? false,
  };
}

export interface InstagramClientConfig {
  instagramUsername: string;
  instagramPassword?: string;
  instagramSessionCookie?: string;
  userAgent?: string;
  proxyUrl?: string;
  useProxy?: boolean;
}

export interface InstagramFollowUser {
  pk: string;
  username: string;
  fullName: string;
  profilePicUrl?: string;
  isPrivate?: boolean;
  isVerified?: boolean;
}

export interface InstagramProfile {
  username: string;
  pk: string;
  fullName: string;
  profilePicUrl?: string;
  /** Takipçi sayısı */
  followerCount?: number;
  /** Takip edilen sayısı */
  followingCount?: number;
  /** Toplam gönderi sayısı */
  mediaCount?: number;
  /** Profil biyografisi */
  biography?: string;
  /** Profildeki dış bağlantı */
  externalUrl?: string;
  /** Hesap gizli mi (private)? */
  isPrivate?: boolean;
}

export interface InstagramPost {
  id: string;
  code?: string;
  mediaType: number;
  caption?: string;
  likeCount: number;
  commentCount?: number;
  displayUrl?: string;
  videoUrl?: string;
  hasLiked: boolean;
}

export interface InstagramStory {
  id: string;
  mediaType: number;
  thumbnailUrl?: string;
  videoUrl?: string;
  displayUrl?: string;
  timestamp: number;
  /** Hikaye sahibinin user_id değeri (markStorySeen için gerekli) */
  ownerId?: string;
  takenAt?: number;
}

export interface InstagramReel extends InstagramPost {
  playCount: number;
  viewCount?: number;
  timestamp: number;
}

export interface InstagramMediaInfo {
  id: string;
  likeCount: number;
  hasLiked: boolean;
  commentCount: number;
  playCount?: number;
  viewCount?: number;
}

export class InstagramClient {
  private readonly client = new IgApiClient();
  private loggedIn = false;
  private loginPromise: Promise<void> | null = null;
  /** Oturum cookie'lerinin tamamı — keep-alive ve CSRF yenileme için kullanılır */
  private session: SessionCookies | null = null;
  /**
   * 2FA gerektiğinde login() bir InstagramTwoFactorRequiredError fırlatır;
   * completeTwoFactorLogin() çağrısı için gereken two_step_verification_context
   * ve ön oturum cookie'leri (csrftoken/mid) burada saklanır.
   */
  private pendingTwoFactor: { context: string; cookieHeader: string } | null = null;
  /**
   * Checkpoint gerektiğinde (login() sonrası, funcaptcha bypass başarısız
   * olduğunda) burada saklanır: getCheckpointOptions/selectCheckpointMethod/
   * completeCheckpoint çağrıları için checkpoint_url ve ön oturum cookie'leri.
   */
  private pendingCheckpoint: { checkpointUrl: string; cookieHeader: string } | null = null;
  /** Keep-alive zamanlayıcısı (clearInterval ile durdurulur) */
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  /** Keep-alive aralığı: belgede önerilen 15-30 dakika → 20 dakika */
  private static readonly KEEP_ALIVE_MS = 20 * 60 * 1000;

  /** Shared counter so every new InstagramClient picks the next UA in line. */
  private static uaIndex = 0;

  constructor(private readonly config: InstagramClientConfig) {
    if (!config.instagramUsername.trim()) {
      throw new Error("INSTAGRAM_USERNAME must be set");
    }
    this.client.state.generateDevice(config.instagramUsername);

    if (config.useProxy && config.proxyUrl) {
      this.client.state.proxyUrl = config.proxyUrl;
    }

    // Explicit UA from config takes priority; otherwise cycle through the list.
    const ua =
      config.userAgent ??
      INSTAGRAM_USER_AGENTS[InstagramClient.uaIndex++ % INSTAGRAM_USER_AGENTS.length];
    this.client.state.deviceString = ua;
  }

  async login(): Promise<void> {
    if (this.loggedIn) return;
    if (this.loginPromise) return this.loginPromise;

    this.loginPromise = this.performLogin();
    try {
      await this.loginPromise;
      this.loggedIn = true;
      this.startKeepAlive();
    } finally {
      this.loginPromise = null;
    }
  }

  /**
   * CAA/Bloks İki Adımlı Doğrulama Yönlendirme Protokolü — login() bir
   * InstagramTwoFactorRequiredError fırlattıktan sonra, kullanıcının girdiği
   * doğrulama koduyla oturumu tamamlar:
   *   entrypoint → method_picker → select_method → [enter_backup_code]
   *   → verify_code.async → bloks_extract_login_response()
   * Başarılı olursa ayıklanan sessionid/csrftoken bloks_apply_login_response()
   * eşdeğeri olarak istemcinin aktif oturum belleğine (cookie jar) yüklenir.
   *
   * @param verificationCode TOTP/SMS için 6 hane, backup_codes için 8 hane.
   * @param method "totp" | "sms" | "backup_codes" (varsayılan: "totp").
   */
  async completeTwoFactorLogin(
    verificationCode: string,
    method: TwoFactorMethod = "totp",
  ): Promise<void> {
    if (!this.pendingTwoFactor) {
      throw new Error(
        "Tamamlanacak bekleyen bir iki adımlı doğrulama akışı yok. Önce login() çağrılmalı.",
      );
    }

    const { context, cookieHeader } = this.pendingTwoFactor;
    const result = await completeTwoFactorLogin(
      context,
      method,
      verificationCode,
      cookieHeader,
      this.client.state.deviceString,
    );

    if (!result.success || !result.extraction?.sessionCookies) {
      throw new Error(
        `İki adımlı doğrulama başarısız (${result.step ?? "unknown"}): ${result.error ?? "bilinmeyen hata"}`,
      );
    }

    this.pendingTwoFactor = null;
    this.session = result.extraction.sessionCookies;
    await this.restoreFullSession(result.extraction.sessionCookies);
    await this.client.account.currentUser();
    this.loggedIn = true;
    this.startKeepAlive();
  }

  /** login() bir InstagramCheckpointRequiredError fırlattıysa true döner. */
  hasPendingCheckpoint(): boolean {
    return this.pendingCheckpoint !== null;
  }

  /**
   * Bekleyen checkpoint'in mevcut adımını (doğrulama yöntemi seçenekleri
   * veya doğrudan kod girişi) sorgular.
   */
  async getCheckpointOptions(): Promise<{
    stepName: string;
    choices?: ChallengeChoice[];
    message?: string;
  }> {
    if (!this.pendingCheckpoint) {
      throw new Error(
        "Tamamlanacak bekleyen bir checkpoint akışı yok. Önce login() çağrılmalı.",
      );
    }
    const { checkpointUrl, cookieHeader } = this.pendingCheckpoint;
    const ctx = await fetchChallengeContext(checkpointUrl, cookieHeader, this.client.state.deviceString);
    if (ctx.error) throw new Error(`Checkpoint adımı sorgulanamadı: ${ctx.error}`);
    return { stepName: ctx.stepName, choices: ctx.choices, message: ctx.message };
  }

  /**
   * step_name === "select_verify_method" adımında, kullanıcının seçtiği
   * doğrulama yöntemine (choice) Instagram'ın kod göndermesini tetikler.
   */
  async selectCheckpointMethod(choice: string): Promise<{ stepName?: string }> {
    if (!this.pendingCheckpoint) {
      throw new Error(
        "Tamamlanacak bekleyen bir checkpoint akışı yok. Önce login() çağrılmalı.",
      );
    }
    const { checkpointUrl, cookieHeader } = this.pendingCheckpoint;
    const result = await selectChallengeMethod(checkpointUrl, cookieHeader, choice, this.client.state.deviceString);
    if (!result.success) {
      throw new Error(`Doğrulama yöntemi seçilemedi: ${result.error ?? "bilinmeyen hata"}`);
    }
    return { stepName: result.stepName };
  }

  /**
   * step_name === "verify_code" adımında, kullanıcının girdiği güvenlik
   * kodunu doğrular ve oturumu kurar.
   */
  async completeCheckpoint(code: string): Promise<void> {
    if (!this.pendingCheckpoint) {
      throw new Error(
        "Tamamlanacak bekleyen bir checkpoint akışı yok. Önce login() çağrılmalı.",
      );
    }
    const { checkpointUrl, cookieHeader } = this.pendingCheckpoint;
    const result = await submitChallengeCode(checkpointUrl, cookieHeader, code, this.client.state.deviceString);
    if (!result.success || !result.sessionCookies) {
      throw new Error(`Checkpoint doğrulaması başarısız: ${result.error ?? "bilinmeyen hata"}`);
    }

    this.pendingCheckpoint = null;
    this.session = result.sessionCookies;
    await this.restoreFullSession(result.sessionCookies);
    this.loggedIn = true;
    this.startKeepAlive();
  }

  private async performLogin(): Promise<void> {
    try {
      if (this.config.instagramSessionCookie) {
        await this.restoreSession(this.config.instagramSessionCookie);
        await this.client.account.currentUser();
        return;
      }

      if (!this.config.instagramPassword) {
        throw new Error(
          "INSTAGRAM_PASSWORD or INSTAGRAM_SESSION_COOKIE must be set",
        );
      }

      // ── Yardımcı: başarılı login sonucundan oturumu kur ─────────────────
      const applySession = async (r: DirectLoginResult): Promise<void> => {
        if (r.sessionCookies) {
          this.session = r.sessionCookies;
          await this.restoreFullSession(r.sessionCookies);
        } else if (r.sessionId) {
          await this.restoreSession(r.sessionId);
        }
      };

      // ── Yardımcı: funcaptcha çöz → login'i token ile tekrar dene ────────
      // Arkose FunCaptcha token'ını alır ve login'i token ile tekrarlar.
      // Oturumu kurar + verifySession ile doğrular.
      // true  = tüm adımlar başarılı (caller return edebilir)
      // false = çözüm veya retry başarısız
      const trySolveAndRetry = async (): Promise<boolean> => {
        console.log("[instagram-client] Funcaptcha ile checkpoint/captcha bypass deneniyor...");

        const arkoseToken = await solveFuncaptcha("instagram_login", {
          proxy: this.config.useProxy && this.config.proxyUrl ? this.config.proxyUrl : undefined,
        }).catch(() => null);
        if (!arkoseToken) {
          console.log("[instagram-client] Funcaptcha çözümü başarısız veya kullanılamıyor");
          return false;
        }
        console.log("[instagram-client] Funcaptcha çözüldü — token ile login yeniden deneniyor");
        const retryResult = await loginToInstagram(
          this.config.instagramUsername,
          this.config.instagramPassword!,
          this.client,
          { arkoseToken },
        );
        if (!retryResult.success) {
          console.log("[instagram-client] Funcaptcha sonrası retry başarısız:", retryResult.error);
          return false;
        }
        await applySession(retryResult);
        if (this.session) {
          const v = await verifySession(this.session.cookieHeader);
          if (!v.valid) {
            console.log("[instagram-client] Funcaptcha retry session doğrulama başarısız:", v.error);
            return false;
          }
        }
        return true;
      };

      // ── İlk login denemesi ─────────────────────────────────────────────
      // PWD_INSTAGRAM:4 şifreleme + signed_body HMAC; önce Mobil API,
      // başarısız olursa Web API fallback.
      const result = await loginToInstagram(
        this.config.instagramUsername,
        this.config.instagramPassword,
        this.client,
      );

      if (!result.success) {
        if (result.errorType === "2fa") {
          if (result.twoStepVerificationContext) {
            this.pendingTwoFactor = {
              context: result.twoStepVerificationContext,
              cookieHeader: result.cookies
                ? extractSessionCookies(result.cookies).cookieHeader
                : "",
            };
          }
          throw new InstagramTwoFactorRequiredError({
            twoFactorInfo: result.twoFactorInfo,
            twoFactorIdentifier: result.twoFactorIdentifier,
            twoStepVerificationContext: result.twoStepVerificationContext,
          });
        }

        // Checkpoint veya captcha → Arkose FunCaptcha ile bypass dene
        if (result.errorType === "checkpoint" || result.errorType === "captcha") {
          if (await trySolveAndRetry()) return;

          // Funcaptcha bypass başarısız ama checkpoint_url mevcutsa,
          // interaktif challenge/resolve akışını (kod girişi) başlatılabilir
          // hale getir — auth.ts bunu InstagramCheckpointRequiredError ile yakalar.
          console.log("[instagram-client] Checkpoint sonrası durum:", JSON.stringify({
            errorType: result.errorType,
            checkpointUrl: result.checkpointUrl ?? "(YOK)",
            hasCookies: !!(result.cookies?.length),
          }));
          if (result.errorType === "checkpoint" && result.checkpointUrl) {
            this.pendingCheckpoint = {
              checkpointUrl: result.checkpointUrl,
              cookieHeader: result.cookies
                ? extractSessionCookies(result.cookies).cookieHeader
                : "",
            };
            throw new InstagramCheckpointRequiredError();
          }

          throw new InstagramCaptchaChallengeError(
            result.errorType,
            result.errorType === "checkpoint"
              ? "Instagram güvenlik doğrulaması (checkpoint) gerektiriyor. Funcaptcha bypass başarısız."
              : (result.error ?? "Instagram captcha doğrulaması gerektiriyor."),
          );
        }

        if (
          result.errorType === "rate_limit" ||
          result.errorType === "spam_or_abuse"
        ) {
          throw new InstagramCaptchaChallengeError(result.errorType, result.error);
        }
        if (result.errorType === "bad_password") {
          throw new Error("Instagram kullanıcı adı veya şifresi hatalı.");
        }
        throw new Error(result.error ?? "Instagram girişi başarısız");
      }

      // ── Oturumu kur ────────────────────────────────────────────────────
      // Kritik cookie'ler: sessionid, csrftoken, ds_user_id, mid, ig_did, rur
      await applySession(result);

      // ── Oturumu doğrula ────────────────────────────────────────────────
      // IgApiClient.account.currentUser() yerine verifySession() kullanıyoruz:
      // IgApiClient farklı TLS stack + ek headerlar gönderdiğinden Instagram
      // bot tespiti tetiklenip login_required (403/400) dönebilir.
      // verifySession() basit fetch ile doğrudan endpoint'i çağırır.
      if (this.session) {
        const verify = await verifySession(this.session.cookieHeader);
        if (!verify.valid) {
          const et = verify.errorType ?? "login_required";
          console.log(`[instagram-client] Session doğrulama başarısız (${et}: ${verify.error}) — funcaptcha bypass deneniyor`);
          if (await trySolveAndRetry()) return;

          // Funcaptcha da başarısız — uygun hata fırlat
          if (et === "spam_or_abuse") {
            throw new InstagramCaptchaChallengeError(
              "spam_or_abuse",
              "Instagram bu giriş girişimini şüpheli/otomatik aktivite olarak işaretledi.",
            );
          }
          if (et === "rate_limit") {
            throw new InstagramCaptchaChallengeError(
              "rate_limit",
              "Instagram hız sınırı uyguladı. Birkaç dakika bekleyip tekrar deneyin.",
            );
          }
          // checkpoint veya login_required veya bilinmeyen — checkpoint_url
          // mevcutsa interaktif çözümleme akışını başlatılabilir hale getir.
          if (verify.checkpointUrl) {
            this.pendingCheckpoint = {
              checkpointUrl: verify.checkpointUrl,
              cookieHeader: this.session.cookieHeader,
            };
            throw new InstagramCheckpointRequiredError();
          }
          // checkpoint_url YOK: Instagram bize çözülebilir bir challenge vermedi,
          // sadece login sonrası oturumu genel biçimde reddetti (çoğunlukla otomasyon/
          // bot tespiti — gerçek bir "kod gir" checkpoint'i olmayabilir). Bu durumu
          // "checkpoint" olarak etiketlemek yanıltıcı olur; ayrı bir tür kullan.
          throw new InstagramCaptchaChallengeError(
            "blocked",
            verify.error ?? "Instagram oturumu login sonrasında kabul etmedi.",
          );
        }
      }
    } catch (error) {
      if (error instanceof InstagramCheckpointRequiredError) throw error;
      if (error instanceof InstagramCaptchaChallengeError) throw error;
      if (error instanceof IgLoginTwoFactorRequiredError) {
        throw new Error(
          "Instagram iki adımlı doğrulama gerektiriyor. Session cookie kullanın.",
        );
      }
      if (error instanceof IgCheckpointError) {
        throw new InstagramCaptchaChallengeError(
          "checkpoint",
          "Instagram güvenlik doğrulaması (checkpoint) gerektiriyor.",
        );
      }
      if (error instanceof IgSentryBlockError || error instanceof IgActionSpamError) {
        throw new InstagramCaptchaChallengeError(
          "spam_or_abuse",
          "Instagram bu girişi şüpheli/otomatik aktivite olarak işaretleyip engelledi.",
        );
      }
      if (error instanceof IgRequestsLimitError) {
        throw new InstagramCaptchaChallengeError(
          "rate_limit",
          "Instagram hız sınırı uyguladı. Birkaç dakika bekleyip tekrar deneyin.",
        );
      }
      if (error instanceof IgInactiveUserError) {
        throw new InstagramCaptchaChallengeError(
          "spam_or_abuse",
          "Instagram hesabı devre dışı/pasif — manuel inceleme gerekiyor.",
        );
      }
      throw error;
    }
  }

  /**
   * Belgede listelenen tüm kritik cookie'leri (sessionid, csrftoken,
   * ds_user_id, mid, ig_did, rur) IgApiClient'in tough-cookie deposuna yükler.
   * Sonraki tüm API isteklerine Cookie header olarak eklenir.
   */
  private async restoreFullSession(sc: SessionCookies): Promise<void> {
    const now = new Date().toISOString();

    // Cookie'lerin domain/attribute tanımları
    const defs: Array<{ key: string; value: string | undefined; httpOnly?: boolean }> = [
      { key: "sessionid",  value: sc.sessionid,  httpOnly: true  },
      { key: "csrftoken",  value: sc.csrftoken,  httpOnly: false },
      { key: "ds_user_id", value: sc.ds_user_id, httpOnly: false },
      { key: "mid",        value: sc.mid,         httpOnly: false },
      { key: "ig_did",     value: sc.ig_did,      httpOnly: false },
      { key: "rur",        value: sc.rur,         httpOnly: false },
    ];

    const cookies = defs
      .filter((d) => d.value)
      .map((d) => ({
        key: d.key,
        value: d.value as string,
        domain: "instagram.com",
        path: "/",
        secure: true,
        httpOnly: d.httpOnly ?? false,
        hostOnly: false,
        creation: now,
        lastAccessed: now,
      }));

    await this.client.state.deserializeCookieJar({
      version: "tough-cookie@2.5.0",
      storeType: "MemoryCookieStore",
      rejectPublicSuffixes: true,
      cookies,
    });
  }

  private async restoreSession(sessionCookie: string): Promise<void> {
    const trimmed = sessionCookie.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      await this.client.state.deserializeCookieJar(trimmed);
      return;
    }

    const now = new Date().toISOString();
    await this.client.state.deserializeCookieJar({
      version: "tough-cookie@2.5.0",
      storeType: "MemoryCookieStore",
      rejectPublicSuffixes: true,
      cookies: [
        {
          key: "sessionid",
          value: trimmed,
          domain: "instagram.com",
          path: "/",
          secure: true,
          httpOnly: true,
          hostOnly: false,
          creation: now,
          lastAccessed: now,
        },
      ],
    });
  }

  // ── Keep-alive ──────────────────────────────────────────────────────────────

  /**
   * Oturum canlı tutma: her 20 dakikada bir /api/v1/accounts/current_user/
   * endpoint'ine GET isteği gönderir. Sunucu tarafındaki oturum sayacını
   * sıfırlar ve idle timeout'u engeller.
   *
   * 401 döndüğünde oturum sona ermiş demektir — loggedIn sıfırlanır.
   */
  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(async () => {
      if (!this.loggedIn || !this.session) return;
      const alive = await pingKeepAlive(
        this.session.cookieHeader,
        this.client.state.deviceString,
      );
      if (!alive) {
        // Oturum sona ermiş — bir sonraki API çağrısı yeniden giriş yapar
        this.loggedIn = false;
      }
    }, InstagramClient.KEEP_ALIVE_MS);

    // Node.js process'in kapanmasını engellememesi için unref
    if (typeof this.keepAliveTimer === "object" && this.keepAliveTimer !== null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.keepAliveTimer as any).unref?.();
    }
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer !== null) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  // ── CSRF yenileme ───────────────────────────────────────────────────────────

  /**
   * CSRF token yenileme — belgedeki prosedür:
   *   1. /api/v1/web/initial_share_info/ GET
   *   2. Dönen Set-Cookie'den yeni csrftoken al
   *   3. Cookie deposunu güncelle
   *
   * 403 hatalarında ensureAuthenticated tarafından otomatik çağrılır.
   */
  private async refreshCsrf(): Promise<void> {
    if (!this.session) return;
    const newCsrf = await refreshCsrfToken(this.session.cookieHeader);
    if (newCsrf) {
      this.session = {
        ...this.session,
        csrftoken: newCsrf,
        cookieHeader: updateCsrfInHeader(this.session.cookieHeader, newCsrf),
      };
      // IgApiClient cookie deposunu da güncelle
      await this.restoreFullSession(this.session);
    }
  }

  // ── Kimlik doğrulama + hata yönetimi ───────────────────────────────────────

  /**
   * Tüm API çağrılarının önünde çalışan guard.
   *
   * Hata senaryoları (belgeden):
   *   HTTP 401 → oturum sona ermiş, yeniden giriş yap
   *   HTTP 403 → CSRF sona ermiş, token yenile ve yeniden dene
   *   HTTP 429 → hız sınırı, exponential backoff ile bekle
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.loggedIn) await this.login();
  }

  /**
   * Belirtilen işlemi çalıştırır; 401/403/429 hataları için otomatik
   * kurtarma prosedürlerini uygular.
   */
  private async withErrorRecovery<T>(
    fn: () => Promise<T>,
    attempt = 0,
  ): Promise<T> {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { response?: { statusCode?: number } })
        ?.response?.statusCode;

      // HTTP 401 — oturum geçersiz: cookie deposunu sıfırla ve yeniden giriş yap
      if (status === 401 && attempt === 0) {
        this.loggedIn = false;
        this.session = null;
        await this.login();
        return this.withErrorRecovery(fn, attempt + 1);
      }

      // HTTP 403 — CSRF token sona ermiş: yenile ve yeniden dene
      if (status === 403 && attempt === 0) {
        await this.refreshCsrf();
        return this.withErrorRecovery(fn, attempt + 1);
      }

      // HTTP 429 — hız sınırı: exponential backoff (10 sn → 20 sn)
      if (status === 429 && attempt < 2) {
        const delayMs = 10_000 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, delayMs));
        return this.withErrorRecovery(fn, attempt + 1);
      }

      throw err;
    }
  }

  /**
   * Kullanıcı Profili Görüntüleme (User Info API).
   *
   * 1. Kullanıcı adını user_id'ye çevir (arama).
   * 2. Ham mobil API isteğiyle profil detaylarını çek:
   *      GET https://i.instagram.com/api/v1/users/{user_id}/info/
   *    Gerekli başlıklar: User-Agent, X-IG-App-ID, Cookie
   *      (sessionid, mid, ig_did, csrftoken).
   *    Yanıt: { "user": { pk, username, full_name, is_private, media_count,
   *              follower_count, following_count, biography, external_url },
   *             "status": "ok" }
   * 3. Ham istek başarısız olursa (örn. session-cookie girişinde tam
   *    Cookie header'ı yoksa) instagram-private-api istemcisine geri dön.
   */
  async getProfile(username: string): Promise<InstagramProfile> {
    await this.ensureAuthenticated();
    if (!this.session?.cookieHeader) throw new Error("Aktif Instagram oturumu bulunamadı");
    // web_profile_info endpoint'i — www.instagram.com, Replit'ten erişilebilir
    const result = await fetchWebProfileInfo(username, this.session.cookieHeader);
    if (!result.success || !result.user) throw new Error(result.error ?? "Profil bilgisi alınamadı");
    const u = result.user;
    return {
      username: u.username,
      pk: u.id,
      fullName: u.full_name ?? "",
      profilePicUrl: u.profile_pic_url_hd ?? u.profile_pic_url,
      followerCount: u.edge_followed_by?.count,
      followingCount: u.edge_follow?.count,
      mediaCount: u.edge_owner_to_timeline_media?.count,
      biography: u.biography ?? undefined,
      isPrivate: u.is_private,
    };
  }

  /**
   * A. Standart Gönderiler (Feed) Listeleme.
   *
   *   GET https://i.instagram.com/api/v1/feed/user/{user_id}/
   *   Sayfalama: yanıttaki next_max_id, sonraki istekte max_id olarak gönderilir.
   *
   * Tam Cookie header'ı mevcutsa ham istek kullanılır; aksi halde
   * (örn. session-cookie girişi) instagram-private-api'ye geri dönülür.
   */
  async getUserPosts(username: string, limit = 20): Promise<InstagramPost[]> {
    await this.ensureAuthenticated();
    if (!this.session?.cookieHeader) throw new Error("Aktif Instagram oturumu bulunamadı");
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    // web_profile_info → user_id → feed/user/{id}/ (her ikisi de www.instagram.com)
    const profileResult = await fetchWebProfileInfo(username, this.session.cookieHeader);
    if (!profileResult.success || !profileResult.user) throw new Error(profileResult.error ?? "Profil bulunamadı");
    const userId = profileResult.user.id;
    const posts: InstagramPost[] = [];
    let maxId: string | undefined;
    do {
      const result = await fetchUserFeed(userId, this.session.cookieHeader, { maxId });
      if (!result.success || !result.items) break;
      posts.push(...result.items.map(mapRawMediaToPost));
      maxId = result.moreAvailable ? result.nextMaxId : undefined;
    } while (maxId && posts.length < safeLimit);
    return posts.slice(0, safeLimit);
  }

  /**
   * Adım 1: Aktif Hikaye Listesini Çekme.
   *   GET https://i.instagram.com/api/v1/feed/reels_media/?user_ids={user_id}
   * Tam Cookie header'ı mevcutsa ham istek kullanılır; aksi halde
   * instagram-private-api'ye geri dönülür.
   */
  async getUserStories(username: string): Promise<InstagramStory[]> {
    await this.ensureAuthenticated();
    if (!this.session?.cookieHeader) throw new Error("Aktif Instagram oturumu bulunamadı");
    const profileResult = await fetchWebProfileInfo(username, this.session.cookieHeader);
    if (!profileResult.success || !profileResult.user) throw new Error(profileResult.error ?? "Profil bulunamadı");
    const userId = profileResult.user.id;
    const result = await fetchUserStories(userId, this.session.cookieHeader);
    if (!result.success || !result.items) throw new Error(result.error ?? "Hikayeler alınamadı");
    return result.items.map((media) => ({
      id: String(media.pk ?? media.id ?? ""),
      mediaType: media.media_type ?? 1,
      thumbnailUrl: media.image_versions2?.candidates?.[0]?.url,
      videoUrl: media.video_versions?.[0]?.url,
      displayUrl: media.image_versions2?.candidates?.[0]?.url,
      timestamp: (media.taken_at ?? 0) * 1000,
      ownerId: userId,
      takenAt: media.taken_at,
    }));
  }

  /**
   * B. Reels (Clips) Listeleme.
   *
   *   POST https://i.instagram.com/api/v1/clips/user_clips/
   *   Body: { target_user_id, max_id, page_size }
   *
   * Tam Cookie header'ı mevcutsa ham istek kullanılır; aksi halde reels,
   * normal gönderi akışından (media_type=2) türetilerek geri dönülür.
   */
  async getUserReels(username: string, limit = 10): Promise<InstagramReel[]> {
    await this.ensureAuthenticated();
    if (!this.session?.cookieHeader) throw new Error("Aktif Instagram oturumu bulunamadı");
    const safeLimit = Math.min(Math.max(limit, 1), 30);
    const profileResult = await fetchWebProfileInfo(username, this.session.cookieHeader);
    if (!profileResult.success || !profileResult.user) throw new Error(profileResult.error ?? "Profil bulunamadı");
    const userId = profileResult.user.id;
    const reels: InstagramReel[] = [];
    let maxId = "";
    do {
      const result = await fetchUserClips(userId, this.session.cookieHeader, {
        maxId,
        pageSize: Math.min(safeLimit, 20),
      });
      if (!result.success || !result.items) break;
      reels.push(
        ...result.items.map((item) => ({
          ...mapRawMediaToPost(item),
          playCount: Number(item.play_count ?? 0),
          viewCount: Number(item.view_count ?? 0) || undefined,
          timestamp: (item.taken_at ?? 0) * 1000,
        })),
      );
      maxId = result.moreAvailable ? result.nextMaxId ?? "" : "";
    } while (maxId && reels.length < safeLimit);
    return reels.slice(0, safeLimit);
  }

  /**
   * 5. Beğenilme ve Görüntülenme Verilerini Çekme (Metrics) — belgede
   * tanımlanan Media Info endpoint:
   *   GET /api/v1/media/{media_id}/info/
   *   Döner: like_count, has_liked, play_count, view_count, comment_count
   */
  async getMediaInfo(mediaId: string): Promise<InstagramMediaInfo> {
    await this.ensureAuthenticated();
    return this.withErrorRecovery(async () => {
      if (this.session?.cookieHeader) {
        const result = await fetchMediaInfo(
          mediaId,
          this.session.cookieHeader,
          this.client.state.deviceString,
        );
        if (result.success && result.item) {
          const item = result.item;
          return {
            id: String(item.id ?? mediaId),
            likeCount: Number(item.like_count ?? 0),
            hasLiked: Boolean(item.has_liked),
            commentCount: Number(item.comment_count ?? 0),
            playCount: Number(item.play_count ?? 0) || undefined,
            viewCount: Number(item.view_count ?? 0) || undefined,
          };
        }
        // Ham istek başarısız — kütüphane tabanlı yönteme geri dön.
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (this.client.media as any).info(mediaId) as { items: Record<string, unknown>[] };
      const item = result.items?.[0] ?? {};
      return {
        id: String(item.id ?? mediaId),
        likeCount: Number(item.like_count ?? 0),
        hasLiked: Boolean(item.has_liked),
        commentCount: Number(item.comment_count ?? 0),
        playCount: Number(item.play_count ?? 0) || undefined,
        viewCount: Number(item.view_count ?? 0) || undefined,
      };
    });
  }

  /**
   * Adım 2: Hikayeyi "görüldü" olarak işaretle — belgede tanımlanan Seen API:
   *   POST /api/v1/media/seen/  (signed_body: container_module, reels, live_vods, _uuid, _uid)
   *   reels key: "{story_owner_id}_{kendi_user_id}"
   *   list item: "{media_id}_{story_owner_id}_{taken_at}"
   */
  async markStorySeen(
    storyId: string,
    ownerId: string,
    takenAt?: number,
  ): Promise<boolean> {
    await this.ensureAuthenticated();
    return this.withErrorRecovery(async () => {
      const selfUser = await this.client.account.currentUser();
      const selfId = String(selfUser.pk);

      if (this.session?.cookieHeader) {
        const result = await markStorySeenRaw(
          storyId,
          ownerId,
          selfId,
          this.client.state.uuid,
          this.session.cookieHeader,
          { takenAt, userAgent: this.client.state.deviceString },
        );
        if (result.success) return true;
        // Ham istek başarısız — kütüphane tabanlı yönteme geri dön.
      }

      const ts = takenAt ?? Math.floor(Date.now() / 1000);
      const reelsKey = `${ownerId}_${selfId}`;
      const reelsValue = [`${storyId}_${ownerId}_${ts}`];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.client.media as any).seen({ [reelsKey]: reelsValue });
      return true;
    }).catch(() => false);
  }

  /**
   * 4. Gönderi ve Reels Beğenme (Like API) — belgede tanımlanan imzalı
   * POST isteği: /api/v1/media/{media_id}/like/ ve /unlike/.
   */
  async likePost(postId: string): Promise<boolean> {
    await this.ensureAuthenticated();
    return this.withErrorRecovery(async () => {
      if (this.session?.cookieHeader) {
        const result = await likeMediaRaw(postId, this.session.cookieHeader, {
          src: "timeline",
          d: 0,
          moduleInfo: { module_name: "feed_timeline" },
          userAgent: this.client.state.deviceString,
        });
        if (result.success) return true;
        // Ham istek başarısız — kütüphane tabanlı yönteme geri dön.
      }

      await this.client.media.like({
        mediaId: postId,
        moduleInfo: { module_name: "feed_timeline" },
        d: 0,
      });
      return true;
    }).catch(() => false);
  }

  async unlikePost(postId: string): Promise<boolean> {
    await this.ensureAuthenticated();
    return this.withErrorRecovery(async () => {
      if (this.session?.cookieHeader) {
        const result = await unlikeMediaRaw(postId, this.session.cookieHeader, {
          src: "timeline",
          d: 0,
          moduleInfo: { module_name: "feed_timeline" },
          userAgent: this.client.state.deviceString,
        });
        if (result.success) return true;
        // Ham istek başarısız — kütüphane tabanlı yönteme geri dön.
      }

      await this.client.media.unlike({
        mediaId: postId,
        moduleInfo: { module_name: "feed_timeline" },
        d: 0,
      });
      return true;
    }).catch(() => false);
  }

  async likeStory(storyId: string): Promise<boolean> {
    return this.likePost(storyId);
  }

  async likeReel(reelId: string): Promise<boolean> {
    return this.likePost(reelId);
  }

  async unlikeReel(reelId: string): Promise<boolean> {
    return this.unlikePost(reelId);
  }

  /**
   * Giriş yapmış kullanıcının kendi profilini çeker.
   * i.instagram.com mobil endpoint'i Replit'ten bloklu olduğundan
   * www.instagram.com web endpoint'ini kullanır.
   */
  async getMyProfile(): Promise<InstagramProfile> {
    await this.ensureAuthenticated();
    if (!this.session?.cookieHeader) {
      throw new Error("Aktif Instagram oturumu bulunamadı");
    }
    const result = await fetchSelfProfile(this.session.cookieHeader);
    if (!result.success || !result.user) {
      throw new Error(result.error ?? "Profil bilgisi alınamadı");
    }
    const u = result.user;
    return {
      username: u.username,
      pk: String(u.pk),
      fullName: u.full_name ?? "",
      profilePicUrl: u.profile_pic_url,
      followerCount: u.follower_count,
      followingCount: u.following_count,
      mediaCount: u.media_count,
      biography: u.biography ?? undefined,
      externalUrl: u.external_url ?? undefined,
      isPrivate: u.is_private,
    };
  }

  async logout(): Promise<void> {
    if (!this.loggedIn) return;
    this.stopKeepAlive();
    try {
      await this.client.account.logout();
    } catch { /* oturum zaten sona ermiş olabilir */ }
    this.loggedIn = false;
    this.session = null;
  }

  isAuthenticated(): boolean {
    return this.loggedIn;
  }

  /**
   * Takip edilen hesapların listesini çeker (www.instagram.com — Replit'ten erişilebilir).
   * @param limit Maksimum kullanıcı sayısı (varsayılan 100, max 1000)
   */
  async getFollowing(limit = 100): Promise<InstagramFollowUser[]> {
    await this.ensureAuthenticated();
    if (!this.session?.cookieHeader) throw new Error("Aktif Instagram oturumu bulunamadı");
    // Önce kendi user_id'mizi alalım
    const me = await fetchSelfProfile(this.session.cookieHeader);
    if (!me.success || !me.user) throw new Error(me.error ?? "Profil bilgisi alınamadı");
    const userId = String(me.user.pk);
    const safeLimit = Math.min(Math.max(limit, 1), 1000);
    const users: InstagramFollowUser[] = [];
    let maxId: string | undefined;
    do {
      const result = await fetchFriendships(userId, "following", this.session.cookieHeader, {
        maxId,
        count: Math.min(safeLimit - users.length, 100),
      });
      if (!result.success || !result.users) break;
      users.push(...result.users.map((u: RawFriendshipUser) => ({
        pk: String(u.pk),
        username: u.username,
        fullName: u.full_name ?? "",
        profilePicUrl: u.profile_pic_url,
        isPrivate: u.is_private,
        isVerified: u.is_verified,
      })));
      maxId = result.moreAvailable ? result.nextMaxId : undefined;
    } while (maxId && users.length < safeLimit);
    return users.slice(0, safeLimit);
  }

  /**
   * Takipçi listesini çeker (www.instagram.com — Replit'ten erişilebilir).
   * @param limit Maksimum kullanıcı sayısı (varsayılan 100, max 1000)
   */
  async getFollowers(limit = 100): Promise<InstagramFollowUser[]> {
    await this.ensureAuthenticated();
    if (!this.session?.cookieHeader) throw new Error("Aktif Instagram oturumu bulunamadı");
    const me = await fetchSelfProfile(this.session.cookieHeader);
    if (!me.success || !me.user) throw new Error(me.error ?? "Profil bilgisi alınamadı");
    const userId = String(me.user.pk);
    const safeLimit = Math.min(Math.max(limit, 1), 1000);
    const users: InstagramFollowUser[] = [];
    let maxId: string | undefined;
    do {
      const result = await fetchFriendships(userId, "followers", this.session.cookieHeader, {
        maxId,
        count: Math.min(safeLimit - users.length, 100),
      });
      if (!result.success || !result.users) break;
      users.push(...result.users.map((u: RawFriendshipUser) => ({
        pk: String(u.pk),
        username: u.username,
        fullName: u.full_name ?? "",
        profilePicUrl: u.profile_pic_url,
        isPrivate: u.is_private,
        isVerified: u.is_verified,
      })));
      maxId = result.moreAvailable ? result.nextMaxId : undefined;
    } while (maxId && users.length < safeLimit);
    return users.slice(0, safeLimit);
  }

  /** Bir medyaya yorum ekler. */
  async addComment(mediaId: string, text: string): Promise<boolean> {
    await this.ensureAuthenticated();
    if (!this.session?.cookieHeader) return false;
    const result = await addCommentRaw(mediaId, text, this.session.cookieHeader);
    return result.success;
  }

  /** Bir yorumu beğenir. */
  async likeComment(commentId: string): Promise<boolean> {
    await this.ensureAuthenticated();
    if (!this.session?.cookieHeader) return false;
    const result = await commentLikeRaw(commentId, "comment_like", this.session.cookieHeader);
    return result.success;
  }

  /** Bir yorum beğenisini kaldırır. */
  async unlikeComment(commentId: string): Promise<boolean> {
    await this.ensureAuthenticated();
    if (!this.session?.cookieHeader) return false;
    const result = await commentLikeRaw(commentId, "comment_unlike", this.session.cookieHeader);
    return result.success;
  }

  /** Yapılandırılan Instagram kullanıcı adı — 2FA doğrulaması sonrası yerel kullanıcı eşleme için. */
  getUsername(): string {
    return this.config.instagramUsername;
  }

  /** login() bir InstagramTwoFactorRequiredError fırlattıysa true döner. */
  hasPendingTwoFactor(): boolean {
    return this.pendingTwoFactor !== null;
  }
}

export default InstagramClient;
