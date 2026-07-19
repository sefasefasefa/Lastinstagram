import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  getFollowers,
  getFollowing,
  unfollowUser,
  type IgUser,
  type IgListUser,
} from '@/lib/ig-api';

// ─── Tipler ──────────────────────────────────────────────────────────────────
type Tab = 'followers' | 'following';

interface Props {
  user: IgUser;
  onLogout: () => void;
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────
function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function Avatar({ src, username }: { src: string; username: string }) {
  const [err, setErr] = useState(false);
  if (err || !src) {
    return (
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
        {username[0]?.toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={username}
      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
      onError={() => setErr(true)}
    />
  );
}

// ─── Kullanıcı satırı ─────────────────────────────────────────────────────────
function UserRow({
  u,
  tab,
  onUnfollow,
}: {
  u: IgListUser;
  tab: Tab;
  onUnfollow?: (pk: string) => void;
}) {
  const [unfollowing, setUnfollowing] = useState(false);
  const [done, setDone] = useState(false);

  async function handleUnfollow() {
    if (unfollowing || done) return;
    setUnfollowing(true);
    try {
      await unfollowUser(u.pk);
      setDone(true);
      toast.success(`@${u.username} takipten çıkarıldı`);
      onUnfollow?.(u.pk);
    } catch {
      toast.error('Takipten çıkarılamadı, tekrar dene');
    } finally {
      setUnfollowing(false);
    }
  }

  if (done) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
      <Avatar src={u.profile_pic_url} username={u.username} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{u.username}</span>
          {u.is_verified && (
            <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
            </svg>
          )}
          {u.is_private && (
            <svg className="w-3 h-3 text-muted-foreground flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z" />
            </svg>
          )}
        </div>
        {u.full_name && (
          <p className="text-xs text-muted-foreground truncate">{u.full_name}</p>
        )}
      </div>
      {tab === 'following' && (
        <button
          onClick={handleUnfollow}
          disabled={unfollowing}
          className="text-xs px-2.5 py-1 rounded-full border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-colors flex-shrink-0 disabled:opacity-50"
        >
          {unfollowing ? '…' : 'Bırak'}
        </button>
      )}
    </div>
  );
}

// ─── Ana bileşen ─────────────────────────────────────────────────────────────
export default function DashboardPage({ user, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('followers');
  const [users, setUsers] = useState<IgListUser[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const loadingRef = useRef(false);

  const loadPage = useCallback(async (userId: string, currentTab: Tab, maxId?: string) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const fn = currentTab === 'followers' ? getFollowers : getFollowing;
      const page = await fn(userId, maxId);
      setUsers((prev) => (maxId ? [...prev, ...page.users] : page.users));
      setCursor(page.next_max_id);
      setHasMore(!!page.next_max_id);
    } catch {
      toast.error('Veriler yüklenemedi, sayfayı yenile');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  // Sekme değişince sıfırla
  useEffect(() => {
    setUsers([]);
    setCursor(undefined);
    setHasMore(true);
    setSearch('');
    void loadPage(user.pk, tab);
  }, [tab, user.pk, loadPage]);

  function loadMore() {
    if (!loading && hasMore && cursor) {
      void loadPage(user.pk, tab, cursor);
    }
  }

  function removeUser(pk: string) {
    setUsers((prev) => prev.filter((u) => u.pk !== pk));
  }

  const filtered = search.trim()
    ? users.filter(
        (u) =>
          u.username.toLowerCase().includes(search.toLowerCase()) ||
          u.full_name.toLowerCase().includes(search.toLowerCase()),
      )
    : users;

  // ── Profil başlığı ──────────────────────────────────────────────────────────
  const ProfileHeader = () => {
    const [imgErr, setImgErr] = useState(false);
    return (
      <div className="flex items-center gap-4 px-4 py-4 border-b border-border">
        {imgErr || !user.profile_pic_url ? (
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
            {user.username[0]?.toUpperCase()}
          </div>
        ) : (
          <img
            src={user.profile_pic_url}
            alt={user.username}
            className="w-14 h-14 rounded-full object-cover flex-shrink-0"
            onError={() => setImgErr(true)}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-base truncate">{user.username}</p>
            {user.is_verified && (
              <svg className="w-4 h-4 text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
              </svg>
            )}
          </div>
          {user.full_name && (
            <p className="text-sm text-muted-foreground truncate">{user.full_name}</p>
          )}
          <div className="flex gap-4 mt-1.5">
            <span className="text-xs text-muted-foreground">
              <strong className="text-foreground">{fmt(user.follower_count)}</strong> takipçi
            </span>
            <span className="text-xs text-muted-foreground">
              <strong className="text-foreground">{fmt(user.following_count)}</strong> takip
            </span>
            <span className="text-xs text-muted-foreground">
              <strong className="text-foreground">{fmt(user.media_count)}</strong> gönderi
            </span>
          </div>
        </div>
        <button
          onClick={onLogout}
          title="Çıkış"
          className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <ProfileHeader />

      {/* Sekmeler */}
      <div className="flex border-b border-border">
        {(['followers', 'following'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === t
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'followers' ? 'Takipçiler' : 'Takip Edilenler'}
            {tab === t && users.length > 0 && (
              <span className="ml-1.5 text-xs bg-primary/10 text-primary rounded-full px-1.5 py-0.5">
                {users.length}{hasMore ? '+' : ''}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Arama */}
      <div className="px-4 py-2.5 border-b border-border">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kullanıcı ara…"
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/40 rounded-lg border border-transparent focus:border-border focus:outline-none"
          />
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto">
        {loading && users.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm">Yükleniyor…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
            <svg className="w-10 h-10 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <p className="text-sm">{search ? 'Sonuç bulunamadı' : 'Henüz veri yok'}</p>
          </div>
        ) : (
          <>
            {filtered.map((u) => (
              <UserRow key={u.pk} u={u} tab={tab} onUnfollow={tab === 'following' ? removeUser : undefined} />
            ))}

            {/* Daha fazla yükle */}
            {hasMore && !search && (
              <div className="py-4 flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="text-sm text-primary hover:underline disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      Yükleniyor…
                    </>
                  ) : (
                    'Daha fazla yükle'
                  )}
                </button>
              </div>
            )}

            {!hasMore && users.length > 0 && (
              <p className="text-center text-xs text-muted-foreground py-4">
                Tüm {users.length} kullanıcı listelendi
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
