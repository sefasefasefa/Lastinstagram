export interface IgUser {
  pk: string;
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

// ─── Background'a mesaj (takipçi listesi vb. anlık istekler) ─────────────────
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
