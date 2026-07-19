import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  getFollowing,
  getUserPosts,
  getUserStories,
  getUserReels,
  likeMedia,
  unlikeMedia,
  type IgUser,
  type IgListUser,
  type IgPost,
  type IgStory,
  type IgReel,
} from '@/lib/ig-api';

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function Avatar({ src, username, size = 10 }: { src: string; username: string; size?: number }) {
  const [err, setErr] = useState(false);
  const cls = `w-${size} h-${size} rounded-full object-cover flex-shrink-0`;
  const fallbackCls = `w-${size} h-${size} rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold flex-shrink-0`;
  if (err || !src) {
    return (
      <div className={fallbackCls} style={{ fontSize: size * 1.6 }}>
        {username[0]?.toUpperCase()}
      </div>
    );
  }
  return <img src={src} alt={username} className={cls} onError={() => setErr(true)} />;
}

function HeartIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// ─── Beğeni butonu ────────────────────────────────────────────────────────────

function LikeButton({
  mediaId,
  initialLiked,
  initialCount,
  onToggle,
}: {
  mediaId: string;
  initialLiked: boolean;
  initialCount: number;
  onToggle?: (liked: boolean) => void;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (loading) return;
    setLoading(true);
    const next = !liked;
    try {
      if (next) await likeMedia(mediaId);
      else await unlikeMedia(mediaId);
      setLiked(next);
      setCount((c) => c + (next ? 1 : -1));
      onToggle?.(next);
    } catch {
      toast.error(next ? 'Beğenme başarısız' : 'Beğeni kaldırılamadı');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-1 text-xs transition-colors disabled:opacity-50 ${liked ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-400'}`}
    >
      <HeartIcon filled={liked} className="w-4 h-4" />
      <span>{fmt(count)}</span>
    </button>
  );
}

// ─── Hikaye şeridi ────────────────────────────────────────────────────────────

function StoriesStrip({ stories, loading }: { stories: IgStory[]; loading: boolean }) {
  const [liked, setLiked] = useState<Record<string, boolean>>({});

  if (loading) {
    return (
      <div className="flex gap-3 px-4 py-3 overflow-x-auto scrollbar-hide">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex-shrink-0 flex flex-col items-center gap-1.5">
            <div className="w-16 h-16 rounded-2xl bg-muted animate-pulse" />
            <div className="w-10 h-2 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (stories.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground">Aktif hikaye yok</div>
    );
  }

  return (
    <div className="flex gap-3 px-4 py-3 overflow-x-auto">
      {stories.map((s) => (
        <div key={s.id} className="flex-shrink-0 flex flex-col items-center gap-1.5">
          <div className="relative">
            {s.displayUrl ? (
              <img
                src={s.displayUrl}
                className={`w-16 h-16 rounded-2xl object-cover ring-2 ring-offset-1 ring-offset-background ${liked[s.id] ? 'ring-rose-500' : 'ring-primary/60'}`}
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                <svg className="w-6 h-6 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="12" cy="10" r="3" />
                  <path d="M3 20c0-3 3-5 9-5s9 2 9 5" />
                </svg>
              </div>
            )}
            {s.mediaType === 2 && (
              <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center">
                <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              </div>
            )}
          </div>
          <button
            onClick={async () => {
              const next = !liked[s.id];
              try {
                if (next) await likeMedia(s.id);
                else await unlikeMedia(s.id);
                setLiked((prev) => ({ ...prev, [s.id]: next }));
              } catch {
                toast.error('Beğenme başarısız');
              }
            }}
            className={`p-0.5 rounded-full transition-colors ${liked[s.id] ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-400'}`}
          >
            <HeartIcon filled={!!liked[s.id]} className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Gönderi / Reel kartı ─────────────────────────────────────────────────────

function MediaCard({ item, type }: { item: IgPost | IgReel; type: 'post' | 'reel' }) {
  const isVideo = 'playCount' in item || (item as IgPost).mediaType === 2;

  return (
    <div className="relative rounded-xl overflow-hidden bg-muted aspect-square">
      {item.displayUrl ? (
        <img src={item.displayUrl} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <svg className="w-8 h-8 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
      )}

      {/* Video / Reel badge */}
      {(isVideo || type === 'reel') && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </div>
      )}

      {/* Beğeni overlay */}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/70 to-transparent flex items-center">
        <LikeButton
          mediaId={item.id}
          initialLiked={item.hasLiked}
          initialCount={item.likeCount}
        />
        {type === 'reel' && (item as IgReel).playCount !== undefined && (
          <span className="ml-auto text-xs text-white/70">{fmt((item as IgReel).playCount!)}</span>
        )}
      </div>
    </div>
  );
}

// ─── Kullanıcı içerik görünümü ────────────────────────────────────────────────

type ContentTab = 'hikayeler' | 'gonderiler' | 'reels';

function UserContentView({ user, onBack }: { user: IgListUser; onBack: () => void }) {
  const [tab, setTab] = useState<ContentTab>('hikayeler');

  const [stories, setStories] = useState<IgStory[]>([]);
  const [posts, setPosts] = useState<IgPost[]>([]);
  const [reels, setReels] = useState<IgReel[]>([]);

  const [loadingStories, setLoadingStories] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingReels, setLoadingReels] = useState(false);

  const [postsNextId, setPostsNextId] = useState<string | undefined>();
  const [reelsNextId, setReelsNextId] = useState<string | undefined>();

  const [storiesFetched, setStoriesFetched] = useState(false);
  const [postsFetched, setPostsFetched] = useState(false);
  const [reelsFetched, setReelsFetched] = useState(false);

  const loadStories = useCallback(async () => {
    if (storiesFetched) return;
    setLoadingStories(true);
    try {
      const s = await getUserStories(user.pk);
      setStories(s);
      setStoriesFetched(true);
    } catch {
      toast.error('Hikayeler yüklenemedi');
    } finally {
      setLoadingStories(false);
    }
  }, [user.pk, storiesFetched]);

  const loadPosts = useCallback(async (nextId?: string) => {
    setLoadingPosts(true);
    try {
      const { posts: newPosts, nextMaxId } = await getUserPosts(user.pk, nextId);
      setPosts((prev) => (nextId ? [...prev, ...newPosts] : newPosts));
      setPostsNextId(nextMaxId);
      setPostsFetched(true);
    } catch {
      toast.error('Gönderiler yüklenemedi');
    } finally {
      setLoadingPosts(false);
    }
  }, [user.pk]);

  const loadReels = useCallback(async (nextId?: string) => {
    setLoadingReels(true);
    try {
      const { reels: newReels, nextMaxId } = await getUserReels(user.pk, nextId);
      setReels((prev) => (nextId ? [...prev, ...newReels] : newReels));
      setReelsNextId(nextMaxId);
      setReelsFetched(true);
    } catch {
      toast.error('Reels yüklenemedi');
    } finally {
      setLoadingReels(false);
    }
  }, [user.pk]);

  // İlk yükleme
  useEffect(() => { void loadStories(); }, [loadStories]);
  useEffect(() => {
    if (tab === 'gonderiler' && !postsFetched) void loadPosts();
  }, [tab, postsFetched, loadPosts]);
  useEffect(() => {
    if (tab === 'reels' && !reelsFetched) void loadReels();
  }, [tab, reelsFetched, loadReels]);

  const tabs: { key: ContentTab; label: string }[] = [
    { key: 'hikayeler', label: 'Hikayeler' },
    { key: 'gonderiler', label: 'Gönderiler' },
    { key: 'reels', label: 'Reels' },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Başlık */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
        </button>
        <Avatar src={user.profile_pic_url} username={user.username} size={8} />
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{user.username}</p>
          {user.full_name && <p className="text-xs text-muted-foreground truncate">{user.full_name}</p>}
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === t.key
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* İçerik */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'hikayeler' && (
          <div>
            <StoriesStrip stories={stories} loading={loadingStories} />
            {storiesFetched && stories.length > 0 && (
              <p className="text-center text-xs text-muted-foreground py-2">
                {stories.length} hikaye — beğenmek için ❤️ ikonuna dokun
              </p>
            )}
          </div>
        )}

        {tab === 'gonderiler' && (
          <div className="p-3">
            {loadingPosts && posts.length === 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                <svg className="w-10 h-10 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                <p className="text-sm">Henüz gönderi yok</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {posts.map((p) => (
                    <MediaCard key={p.id} item={p} type="post" />
                  ))}
                </div>
                {postsNextId && (
                  <button
                    onClick={() => void loadPosts(postsNextId)}
                    disabled={loadingPosts}
                    className="w-full mt-3 py-2 text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    {loadingPosts ? 'Yükleniyor…' : 'Daha fazla yükle'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'reels' && (
          <div className="p-3">
            {loadingReels && reels.length === 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : reels.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                <svg className="w-10 h-10 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                <p className="text-sm">Henüz reel yok</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {reels.map((r) => (
                    <MediaCard key={r.id} item={r} type="reel" />
                  ))}
                </div>
                {reelsNextId && (
                  <button
                    onClick={() => void loadReels(reelsNextId)}
                    disabled={loadingReels}
                    className="w-full mt-3 py-2 text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    {loadingReels ? 'Yükleniyor…' : 'Daha fazla yükle'}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Ana Feed sayfası ─────────────────────────────────────────────────────────

export default function FeedPage({ user }: { user: IgUser }) {
  const [following, setFollowing] = useState<IgListUser[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<IgListUser | null>(null);

  const loadPage = useCallback(async (maxId?: string) => {
    if (loading) return;
    setLoading(true);
    try {
      const page = await getFollowing(user.pk, maxId);
      setFollowing((prev) => (maxId ? [...prev, ...page.users] : page.users));
      setCursor(page.next_max_id);
      setHasMore(!!page.next_max_id);
    } catch {
      toast.error('Takip listesi yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [user.pk, loading]);

  useEffect(() => { void loadPage(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = search.trim()
    ? following.filter(
        (u) =>
          u.username.toLowerCase().includes(search.toLowerCase()) ||
          u.full_name?.toLowerCase().includes(search.toLowerCase()),
      )
    : following;

  // Kullanıcı içerik görünümü
  if (selected) {
    return <UserContentView user={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Başlık */}
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold mb-2">Takip Edilenler</h2>
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
        {loading && following.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm">Yükleniyor…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
            <svg className="w-10 h-10 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <p className="text-sm">{search ? 'Sonuç bulunamadı' : 'Henüz takip edilen yok'}</p>
          </div>
        ) : (
          <>
            {filtered.map((u) => (
              <button
                key={u.pk}
                onClick={() => setSelected(u)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
              >
                <Avatar src={u.profile_pic_url} username={u.username} size={9} />
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
                <svg className="w-4 h-4 text-muted-foreground flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            ))}

            {hasMore && !search && (
              <div className="py-4 flex justify-center">
                <button
                  onClick={() => void loadPage(cursor)}
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
          </>
        )}
      </div>
    </div>
  );
}
