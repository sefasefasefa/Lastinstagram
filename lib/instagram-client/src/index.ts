import {
  IgApiClient,
  IgCheckpointError,
  IgLoginTwoFactorRequiredError,
} from "instagram-private-api";

export interface InstagramClientConfig {
  username: string;
  password?: string;
  sessionCookie?: string;
}

export interface InstagramProfile {
  username: string;
  pk: string;
  fullName: string;
  profilePicUrl?: string;
}

export interface InstagramPost {
  id: string;
  code?: string;
  mediaType: number;
  caption?: string;
  likeCount: number;
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
}

export interface InstagramReel extends InstagramPost {
  playCount: number;
  timestamp: number;
}

export class InstagramClient {
  private readonly client = new IgApiClient();
  private loggedIn = false;
  private loginPromise: Promise<void> | null = null;

  constructor(private readonly config: InstagramClientConfig) {
    if (!config.username.trim()) {
      throw new Error("INSTAGRAM_USERNAME must be set");
    }
    this.client.state.generateDevice(config.username);
  }

  async login(): Promise<void> {
    if (this.loggedIn) return;
    if (this.loginPromise) return this.loginPromise;

    this.loginPromise = this.performLogin();
    try {
      await this.loginPromise;
      this.loggedIn = true;
    } finally {
      this.loginPromise = null;
    }
  }

  private async performLogin(): Promise<void> {
    try {
      if (this.config.sessionCookie) {
        await this.restoreSession(this.config.sessionCookie);
        await this.client.account.currentUser();
        return;
      }

      if (!this.config.password) {
        throw new Error(
          "INSTAGRAM_PASSWORD or INSTAGRAM_SESSION_COOKIE must be set",
        );
      }

      await this.client.account.login(
        this.config.username,
        this.config.password,
      );
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

  private async ensureAuthenticated(): Promise<void> {
    if (!this.loggedIn) await this.login();
  }

  async getProfile(username: string): Promise<InstagramProfile> {
    await this.ensureAuthenticated();
    const user = await this.client.user.searchExact(username);

    return {
      username: user.username,
      pk: String(user.pk),
      fullName: user.full_name,
      profilePicUrl: user.profile_pic_url,
    };
  }

  async getUserPosts(username: string, limit = 20): Promise<InstagramPost[]> {
    await this.ensureAuthenticated();
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const user = await this.client.user.searchExact(username);
    const items = await this.client.feed.user(user.pk).items();

    return items.slice(0, safeLimit).map((media) => ({
      id: String(media.pk),
      code: media.code,
      mediaType: media.media_type,
      caption: media.caption?.text,
      likeCount: media.like_count ?? 0,
      displayUrl: media.image_versions2?.candidates?.[0]?.url,
      videoUrl: media.video_versions?.[0]?.url,
      hasLiked: media.has_liked ?? false,
    }));
  }

  async getUserStories(username: string): Promise<InstagramStory[]> {
    await this.ensureAuthenticated();
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
    }));
  }

  async getUserReels(username: string, limit = 10): Promise<InstagramReel[]> {
    const posts = await this.getUserPosts(username, Math.max(limit * 3, 20));
    const safeLimit = Math.min(Math.max(limit, 1), 30);

    return posts
      .filter((post) => post.mediaType === 2 && post.videoUrl)
      .slice(0, safeLimit)
      .map((post) => ({
        ...post,
        playCount: 0,
        timestamp: Date.now(),
      }));
  }

  async likePost(postId: string): Promise<boolean> {
    await this.ensureAuthenticated();
    try {
      await this.client.media.like({
        mediaId: postId,
        moduleInfo: { module_name: "feed_timeline" },
        d: 1,
      });
      return true;
    } catch {
      return false;
    }
  }

  async likeStory(storyId: string): Promise<boolean> {
    return this.likePost(storyId);
  }

  async likeReel(reelId: string): Promise<boolean> {
    return this.likePost(reelId);
  }

  async logout(): Promise<void> {
    if (!this.loggedIn) return;
    await this.client.account.logout();
    this.loggedIn = false;
  }

  isAuthenticated(): boolean {
    return this.loggedIn;
  }
}

export default InstagramClient;
