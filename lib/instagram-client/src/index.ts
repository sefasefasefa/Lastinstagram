import {
  IgApiClient,
  IgCheckpointError,
  IgLoginTwoFactorRequiredError,
} from "instagram-private-api";
import { INSTAGRAM_USER_AGENTS } from "./user-agents";
import {
  loginToInstagram,
  refreshCsrfToken,
  pingKeepAlive,
  updateCsrfInHeader,
  type SessionCookies,
} from "./direct-login";

export interface InstagramClientConfig {
  instagramUsername: string;
  instagramPassword?: string;
  instagramSessionCookie?: string;
  userAgent?: string;
  proxyUrl?: string;
  useProxy?: boolean;
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

      // Doğrudan HTTP girişi: PWD_INSTAGRAM:4 şifreleme + signed_body HMAC.
      // Önce Mobil API, başarısız olursa Web API fallback.
      const result = await loginToInstagram(
        this.config.instagramUsername,
        this.config.instagramPassword,
        this.client,
      );

      if (!result.success) {
        if (result.errorType === "2fa") {
          throw new Error(
            "Instagram two-factor authentication is required. Use a serialized cookie jar or session cookie.",
          );
        }
        if (result.errorType === "checkpoint") {
          throw new Error(
            "Instagram requires a checkpoint verification. Verify the account before trying again.",
          );
        }
        if (result.errorType === "bad_password") {
          throw new Error("Instagram username or password is incorrect.");
        }
        throw new Error(result.error ?? "Instagram login failed");
      }

      // Tüm oturum cookie'lerini kaydet ve IgApiClient'e yükle.
      // Belgede tanımlanan kritik cookie'ler: sessionid, csrftoken,
      // ds_user_id, mid, ig_did, rur
      if (result.sessionCookies) {
        this.session = result.sessionCookies;
        await this.restoreFullSession(result.sessionCookies);
      } else if (result.sessionId) {
        await this.restoreSession(result.sessionId);
      }
    } catch (error) {
      if (error instanceof IgLoginTwoFactorRequiredError) {
        throw new Error(
          "Instagram two-factor authentication is required. Use a serialized cookie jar or session cookie.",
        );
      }
      if (error instanceof IgCheckpointError) {
        throw new Error(
          "Instagram requires a checkpoint verification. Verify the account before trying again.",
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

  async getProfile(username: string): Promise<InstagramProfile> {
    await this.ensureAuthenticated();
    return this.withErrorRecovery(async () => {
      // 1. Resolve username to user_id via search.
      // 2. Fetch full profile from the mobile User Info API:
      //    GET /api/v1/users/{user_id}/info/
      //    Returns: follower_count, following_count, media_count, biography,
      //    is_private, etc.
      const basic = await this.client.user.searchExact(username);
      const info = await this.client.user.info(basic.pk);
      return {
        username: info.username,
        pk: String(info.pk),
        fullName: info.full_name,
        profilePicUrl: info.profile_pic_url,
        followerCount: info.follower_count,
        followingCount: info.following_count,
        mediaCount: info.media_count,
        biography: info.biography ?? undefined,
        externalUrl: info.external_url ?? undefined,
        isPrivate: info.is_private,
      };
    });
  }

  async getUserPosts(username: string, limit = 20): Promise<InstagramPost[]> {
    await this.ensureAuthenticated();
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    return this.withErrorRecovery(async () => {
      const user = await this.client.user.searchExact(username);
      const items = await this.client.feed.user(user.pk).items();
      return items.slice(0, safeLimit).map((media) => ({
        id: String(media.pk),
        code: media.code,
        mediaType: media.media_type,
        caption: media.caption?.text,
        likeCount: media.like_count ?? 0,
        commentCount: media.comment_count ?? 0,
        displayUrl: media.image_versions2?.candidates?.[0]?.url,
        videoUrl: media.video_versions?.[0]?.url,
        hasLiked: media.has_liked ?? false,
      }));
    });
  }

  async getUserStories(username: string): Promise<InstagramStory[]> {
    await this.ensureAuthenticated();
    return this.withErrorRecovery(async () => {
      const user = await this.client.user.searchExact(username);
      const items = await this.client.feed
        .reelsMedia({ userIds: [String(user.pk)] })
        .items();
      return items.map((media) => ({
        id: String(media.pk),
        mediaType: media.media_type,
        thumbnailUrl: media.image_versions2?.candidates?.[0]?.url,
        videoUrl: media.video_versions?.[0]?.url,
        displayUrl: media.image_versions2?.candidates?.[0]?.url,
        timestamp: media.taken_at * 1000,
        ownerId: String(user.pk),
        takenAt: media.taken_at,
      }));
    });
  }

  async getUserReels(username: string, limit = 10): Promise<InstagramReel[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 30);
    const posts = await this.getUserPosts(username, Math.max(limit * 3, 20));
    return posts
      .filter((post) => post.mediaType === 2 && post.videoUrl)
      .slice(0, safeLimit)
      .map((post) => ({ ...post, playCount: 0, viewCount: 0, timestamp: Date.now() }));
  }

  /**
   * Tekil medya metrikleri — belgede tanımlanan Media Info endpoint:
   *   GET /api/v1/media/{media_id}/info/
   *   Döner: like_count, has_liked, play_count, view_count, comment_count
   */
  async getMediaInfo(mediaId: string): Promise<InstagramMediaInfo> {
    await this.ensureAuthenticated();
    return this.withErrorRecovery(async () => {
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
   * Hikayeyi "görüldü" olarak işaretle — belgede tanımlanan Seen API:
   *   POST /api/v2/media/seen/
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
      const ts = takenAt ?? Math.floor(Date.now() / 1000);
      const reelsKey = `${ownerId}_${selfId}`;
      const reelsValue = [`${storyId}_${ownerId}_${ts}`];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.client.media as any).seen({ [reelsKey]: reelsValue });
      return true;
    }).catch(() => false);
  }

  async likePost(postId: string): Promise<boolean> {
    await this.ensureAuthenticated();
    return this.withErrorRecovery(async () => {
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
}

export default InstagramClient;
