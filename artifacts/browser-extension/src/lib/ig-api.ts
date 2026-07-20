export interface IgUser {
  pk: string;
  fbid_v2?: string;   // Instagram bazı endpoint'lerde pk yerine fbid_v2 döndürür
  username: string;
  full_name: string;
  profile_pic_url: string;
  follower_count: number;
  following_count: number;
  media_count: number;
  biography?: string;
  is_verified?: boolean;
  is_private?: boolean;
}

/** Instagram'ın pk veya fbid_v2 alanından kullanıcı ID'sini güvenle döndürür. */
export function resolveUserId(user: IgUser): string {
  return user.pk || user.fbid_v2 || '';
}

/** Ham API yanıtını IgUser'a normalize eder — pk eksikse fbid_v2'den doldurur. */
export function normalizeIgUser(raw: Record<string, unknown>): IgUser | null {
  const pk = String(raw['pk'] ?? raw['fbid_v2'] ?? '');
  if (!pk) return null;
  return { ...(raw as unknown as IgUser), pk };
}

export interface IgListUser {
  pk: string;
  username: string;
  full_name: string;
  profile_pic_url: string;
  is_verified: boolean;
  is_private: boolean;
}

export interface IgPage {
  users: IgListUser[];
  next_max_id?: string;
}

// ─── Background'a mesaj (takipçi listesi vb. anlık REST istekler) ────────────
export function igApi<T>(
  endpoint: string,
  params?: Record<string, string>,
  method = 'GET',
  body?: Record<string, string>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'IG_API', endpoint, params, method, body },
      (res: { ok: boolean; data?: T; error?: string } | undefined) => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        if (!res) { reject(new Error('Background yanıt vermedi')); return; }
        if (res.ok) resolve(res.data as T);
        else reject(new Error(res.error ?? 'Instagram API hatası'));
      },
    );
  });
}

// ─── Background'a GraphQL mutation mesajı ────────────────────────────────────
// HAR'dan alınan doc_id + friendlyName ile Instagram'ın web GraphQL
// endpoint'ini (/graphql/query) kullanır; fb_dtsg/lsd tokenları sayfadan okunur.
export function igGql<T>(
  docId: string,
  variables: Record<string, unknown>,
  friendlyName: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'IG_GQL_MUTATION', docId, variables, friendlyName },
      (res: { ok: boolean; data?: T; error?: string } | undefined) => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        if (!res) { reject(new Error('Background yanıt vermedi')); return; }
        if (res.ok) resolve(res.data as T);
        else reject(new Error(res.error ?? 'GraphQL mutation hatası'));
      },
    );
  });
}

// ─── Oturum cookie kontrolü ───────────────────────────────────────────────────
export function hasSession(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.cookies.get({ url: 'https://www.instagram.com', name: 'sessionid' }, (c) =>
      resolve(!!c?.value),
    );
  });
}

// ─── Kullanıcı verisi: storage'dan oku (content script push eder) ─────────────
// Content script instagram.com'a yüklenince /api/v1/accounts/current_user/ çeker
// ve background'a gönderir; background storage'a yazar.
// Bu fonksiyon o storage'ı okur — herhangi bir API çağrısı başlatmaz.
export function getCachedUser(): Promise<IgUser | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['igUser'], (result) => {
      resolve((result['igUser'] as IgUser) ?? null);
    });
  });
}

export function clearCachedUser(): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.remove(['igUser', 'igUserTs'], resolve));
}

// Geriye dönük uyumluluk için — önce cache'e bak, sonra API'ye düş
export async function getCurrentUser(): Promise<IgUser | null> {
  const has = await hasSession();
  if (!has) return null;
  return getCachedUser();
}

// ─── Takipçi / takip listesi ──────────────────────────────────────────────────
export async function getFollowers(userId: string, maxId?: string): Promise<IgPage> {
  const params: Record<string, string> = { count: '50' };
  if (maxId) params.max_id = maxId;
  return igApi<IgPage>(`/api/v1/friendships/${userId}/followers/`, params);
}

export async function getFollowing(userId: string, maxId?: string): Promise<IgPage> {
  const params: Record<string, string> = { count: '50' };
  if (maxId) params.max_id = maxId;
  return igApi<IgPage>(`/api/v1/friendships/${userId}/following/`, params);
}

export async function unfollowUser(userId: string): Promise<void> {
  await igApi(`/api/v1/friendships/${userId}/destroy/`, undefined, 'POST');
}

// ─── Feed tipleri ─────────────────────────────────────────────────────────────

export interface IgPost {
  id: string;
  code?: string;
  mediaType: number; // 1=photo 2=video 8=carousel
  caption?: string;
  likeCount: number;
  commentCount?: number;
  displayUrl?: string;
  hasLiked: boolean;
  takenAt?: number;
}

export interface IgStory {
  id: string;
  mediaType: number; // 1=photo 2=video
  displayUrl?: string;
  videoUrl?: string;
  takenAt?: number;
  ownerId?: string;
  hasLiked?: boolean;
}

export interface IgReel {
  id: string;
  code?: string;
  displayUrl?: string;
  likeCount: number;
  playCount?: number;
  hasLiked: boolean;
  caption?: string;
  takenAt?: number;
}

// ─── Feed API fonksiyonları ───────────────────────────────────────────────────

type AnyObj = Record<string, unknown>;

function extractImageUrl(item: AnyObj): string | undefined {
  const iv2 = item['image_versions2'] as AnyObj | undefined;
  const candidates = iv2?.['candidates'] as AnyObj[] | undefined;
  return candidates?.[0]?.['url'] as string | undefined;
}

export async function getUserPosts(
  userId: string,
  maxId?: string,
): Promise<{ posts: IgPost[]; nextMaxId?: string }> {
  const params: Record<string, string> = { count: '12' };
  if (maxId) params.max_id = maxId;
  const data = await igApi<AnyObj>(`/api/v1/feed/user/${userId}/`, params);
  const items = (data['items'] as AnyObj[] | undefined) ?? [];
  const posts: IgPost[] = items.map((item) => ({
    id: String(item['pk'] ?? item['id'] ?? ''),
    code: item['code'] as string | undefined,
    mediaType: (item['media_type'] as number) ?? 1,
    caption: (item['caption'] as AnyObj | undefined)?.['text'] as string | undefined,
    likeCount: (item['like_count'] as number) ?? 0,
    commentCount: item['comment_count'] as number | undefined,
    displayUrl: extractImageUrl(item),
    hasLiked: (item['has_liked'] as boolean) ?? false,
    takenAt: item['taken_at'] as number | undefined,
  }));
  return { posts, nextMaxId: data['next_max_id'] as string | undefined };
}

export async function getUserStories(userId: string): Promise<IgStory[]> {
  const data = await igApi<AnyObj>(`/api/v1/feed/reels_media/`, { reel_ids: userId });
  const reels = data['reels'] as AnyObj | undefined;
  const reel = reels?.[userId] as AnyObj | undefined;
  const items = (reel?.['items'] as AnyObj[] | undefined) ?? [];
  return items.map((item) => ({
    // pk her zaman saf sayısal media ID; id bazen "pk_userId" formatında gelir
    id: String(item['pk'] ?? String(item['id'] ?? '').split('_')[0]),
    mediaType: (item['media_type'] as number) ?? 1,
    displayUrl: extractImageUrl(item),
    videoUrl: ((item['video_versions'] as AnyObj[] | undefined)?.[0]?.['url']) as string | undefined,
    takenAt: item['taken_at'] as number | undefined,
    ownerId: String((item['user'] as AnyObj | undefined)?.['pk'] ?? userId),
    hasLiked: (item['has_liked'] as boolean) ?? false,
  }));
}

export async function getUserReels(
  userId: string,
  maxId?: string,
): Promise<{ reels: IgReel[]; nextMaxId?: string }> {
  const body: Record<string, string> = {
    target_user_id: userId,
    page_size: '12',
    include_feed_video: 'true',
  };
  if (maxId) body.max_id = maxId;
  const data = await igApi<AnyObj>(`/api/v1/clips/user/`, undefined, 'POST', body);
  const items = (data['items'] as AnyObj[] | undefined) ?? [];
  const reels: IgReel[] = items.map((wrapper) => {
    const media = ((wrapper['media'] as AnyObj | undefined) ?? wrapper) as AnyObj;
    return {
      id: String(media['pk'] ?? media['id'] ?? ''),
      code: media['code'] as string | undefined,
      displayUrl: extractImageUrl(media),
      likeCount: (media['like_count'] as number) ?? 0,
      playCount: media['play_count'] as number | undefined,
      hasLiked: (media['has_liked'] as boolean) ?? false,
      caption: ((media['caption'] as AnyObj | undefined)?.['text']) as string | undefined,
      takenAt: media['taken_at'] as number | undefined,
    };
  });
  const pagingInfo = data['paging_info'] as AnyObj | undefined;
  return { reels, nextMaxId: pagingInfo?.['max_id'] as string | undefined };
}

// ─── Beğeni fonksiyonları (HAR'dan alınan GraphQL endpoint'leri) ─────────────

/**
 * Post / Reel beğen.
 * HAR: PolarisAPILikePostMutation  →  doc_id=27358573637160660
 */
export async function likeMedia(mediaId: string): Promise<void> {
  // HAR doğrulaması: Instagram web GQL kullanıyor, doc_id=27358573637160660
  // Her çağrı için benzersiz client_mutation_id — aynı değer göndermek Instagram'ın
  // deduplikasyon mekanizmasını tetikleyip beğeniyi sessizce reddedebilir.
  const mutId = String((Date.now() % 9000) + 1000);
  await igGql(
    '27358573637160660',
    { input: { media_id: mediaId, actor_id: '__actor_id__', client_mutation_id: mutId } },
    'PolarisAPILikePostMutation',
  );
}

// ─── DOM fallback yardımcısı ──────────────────────────────────────────────────
function domLikeStoryFallback(like: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'DOM_LIKE_STORY', like },
      (res: { ok: boolean; error?: string } | undefined) => {
        if (chrome.runtime.lastError || !res) { resolve(false); return; }
        resolve(res.ok);
      },
    );
  });
}

/**
 * "Hikayeyi gördüm" sinyali gönder — doğal kullanıcı davranışı simülasyonu.
 * Sessiz: başarısız olursa beğeni akışını engellemez.
 *
 * HAR: PolarisStoriesV3SeenMutation  →  doc_id=26234228992942885
 * variables: { reelId, reelMediaId, reelMediaOwnerId, reelMediaTakenAt, viewSeenAt }
 */
async function markStorySeen(mediaId: string, ownerId?: string, takenAt?: number): Promise<void> {
  if (!ownerId) return;
  const now = Math.floor(Date.now() / 1000);
  const ts  = takenAt ?? now;
  await igGql(
    '26234228992942885',
    {
      reelId:           ownerId,
      reelMediaId:      mediaId,
      reelMediaOwnerId: ownerId,
      reelMediaTakenAt: ts,
      viewSeenAt:       now,
    },
    'PolarisStoriesV3SeenMutation',
  ).catch(() => {/* sessiz — seen başarısız olursa beğeni akışını engellemez */});
}

/**
 * Hikaye beğen — GraphQL mutation (HAR: usePolarisStoriesV4LikeMutationLikeMutation, doc_id=26938887309082050)
 *
 * Adım 0: Beğenmeden önce "seen" sinyali gönderilir (doğal davranış).
 *
 * NOT: DOM fallback kaldırıldı — ekranda görünen rastgele hikayeye tıklayarak
 * yanlış hikayenin beğenilmesine yol açıyordu.
 */
export async function likeStory(
  mediaId: string,
  opts?: { ownerId?: string; takenAt?: number },
): Promise<void> {
  const pureId = mediaId.includes('_') ? mediaId.split('_')[0] : mediaId;

  // 0) Hikayeyi "gördüm" olarak işaretle (hata olsa da devam et)
  void markStorySeen(pureId, opts?.ownerId, opts?.takenAt);

  // GQL mutation (HAR: doc_id=26938887309082050, usePolarisStoriesV4LikeMutationLikeMutation)
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const mutId = String((Date.now() % 9000) + 1000);
      await igGql(
        '26938887309082050',
        { input: { actor_id: '__actor_id__', client_mutation_id: mutId, media_id: pureId } },
        'usePolarisStoriesV4LikeMutationLikeMutation',
      );
      return; // başarılı
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Rate limit'te tekrar deneme yapma — kısa bekleme işe yaramaz
      if (msg === '__RATE_LIMIT__') {
        throw new Error('Instagram çok fazla istek algıladı. Birkaç dakika bekleyip tekrar dene.');
      }
      lastErr = err;
      if (attempt < 2) await new Promise<void>((r) => setTimeout(r, 1200));
    }
  }
  const reason = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`Hikaye beğenisi başarısız: ${reason}`);
}

/**
 * Post / Reel beğeniyi geri al.
 */
export async function unlikeMedia(mediaId: string): Promise<void> {
  await igApi(`/api/v1/media/${mediaId}/unlike/`, undefined, 'POST', {
    media_id: mediaId,
  });
}

/**
 * Hikaye beğenisini geri al — 2 katmanlı:
 *
 * 1. REST API   (/api/v1/media/{id}/unlike/) — iki deneme
 * 2. DOM tıklama — Instagram sekmesinde hikaye görünüyorsa kalp butonunu tıklar
 *
 * NOT: Story unlike için GQL doc_id henüz doğrulanmadı (HAR gerekiyor).
 * Doğru endpoint bulunduğunda GQL katmanı eklenecek.
 */
export async function unlikeStory(mediaId: string): Promise<void> {
  const pureId = mediaId.includes('_') ? mediaId.split('_')[0] : mediaId;

  let lastErr: unknown;

  // 1 & 2) REST — iki deneme, aralarında 600ms bekleme
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await igApi(`/api/v1/media/${pureId}/unlike/`, undefined, 'POST', {
        media_id: pureId,
        d: '1',
      });
      return; // başarılı
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await new Promise<void>((r) => setTimeout(r, 600));
    }
  }

  // 3) DOM fallback
  const domOk = await domLikeStoryFallback(false);
  if (domOk) return;

  const reason = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`Hikaye beğeni geri alma başarısız: ${reason}`);
}
