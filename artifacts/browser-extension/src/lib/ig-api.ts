// ─── Instagram API tipleri ───────────────────────────────────────────────────

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

// ─── Background'a mesaj gönder ────────────────────────────────────────────────

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
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!res) {
          reject(new Error('Background yanıt vermedi'));
          return;
        }
        if (res.ok) {
          resolve(res.data as T);
        } else {
          reject(new Error(res.error ?? 'Instagram API hatası'));
        }
      },
    );
  });
}

// ─── Oturum kontrolü ─────────────────────────────────────────────────────────

export function hasSession(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.cookies.get(
      { url: 'https://www.instagram.com', name: 'sessionid' },
      (c) => resolve(!!c?.value),
    );
  });
}

/** Giriş yapmış kullanıcının profilini döner. Hata varsa fırlatır (null değil). */
export async function getCurrentUser(): Promise<IgUser | null> {
  const has = await hasSession();
  if (!has) return null;
  // Hata mesajını yukarı taşı — caller görür
  const data = await igApi<{ user: IgUser }>('/api/v1/accounts/current_user/?edit=true');
  return data.user ?? null;
}

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

export async function getUserByUsername(username: string): Promise<IgUser | null> {
  try {
    const data = await igApi<{ data: { user: IgUser } }>(
      '/api/v1/users/web_profile_info/',
      { username },
    );
    return data.data.user;
  } catch {
    return null;
  }
}
