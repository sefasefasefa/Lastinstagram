import { useState, useEffect, useCallback, Component, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  getFollowing,
  getUserPosts,
  getUserStories,
  getUserReels,
  likeMedia,
  unlikeMedia,
  likeStory,
  unlikeStory,
  type IgUser,
  type IgListUser,
  type IgPost,
  type IgStory,
  type IgReel,
} from '@/lib/ig-api';
import { motion } from 'framer-motion';
import { Search, ChevronLeft, Heart, Play, AlertCircle, Loader2, Image as ImageIcon, Film, Lock, BadgeCheck, ArrowRight } from 'lucide-react';
import { useRef } from 'react';

// ─── Hata sınırı ──────────────────────────────────────────────────────────────
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center bg-background text-foreground relative">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-2 border border-destructive/20 shadow-[0_0_20px_rgba(255,0,0,0.1)]">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <p className="text-base font-bold tracking-tight">Sistem Hatası</p>
          <p className="text-[11px] font-mono text-muted-foreground break-all bg-card border border-white/5 p-3 rounded-lg w-full">
            {(this.state.error as Error).message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 mt-2 text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all"
          >
            Terminali Sıfırla
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
function Avatar({ src, username, className = "w-11 h-11" }: { src: string; username: string; className?: string }) {
  const [err, setErr] = useState(false);
  if (err || !src) {
    return (
      <div className={`${className} rounded-xl bg-card border border-white/10 flex items-center justify-center text-foreground font-bold flex-shrink-0 shadow-inner`}>
        {username[0]?.toUpperCase()}
      </div>
    );
  }
  return <img src={src} alt={username} className={`${className} rounded-xl object-cover ring-1 ring-white/10 flex-shrink-0 shadow-sm`} onError={() => setErr(true)} />;
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
      toast.error(next ? 'Etkileşim başarısız' : 'Geri alma başarısız');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg backdrop-blur-md transition-all active:scale-95 disabled:opacity-50 ${liked ? 'bg-primary/20 text-primary border border-primary/20' : 'bg-black/40 text-white border border-white/10 hover:bg-black/60'}`}
    >
      <Heart className={`w-3.5 h-3.5 transition-transform ${liked ? 'fill-current scale-110' : ''}`} />
      <span className="text-[10px] font-mono font-bold tracking-tight">{fmt(count)}</span>
    </button>
  );
}

// ─── Hikaye şeridi ────────────────────────────────────────────────────────────
function StoriesStrip({ stories, loading }: { stories: IgStory[]; loading: boolean }) {
  const [liked, setLiked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(stories.map((s) => [s.id, s.hasLiked])),
  );
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const likeQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    setLiked((prev) => {
      const next = { ...prev };
      for (const s of stories) {
        if (!(s.id in next)) next[s.id] = s.hasLiked;
      }
      return next;
    });
  }, [stories]);

  if (loading) {
    return (
      <div className="flex gap-4 px-5 py-5 overflow-x-auto scrollbar-hide border-b border-white/5 bg-card/20">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex-shrink-0 w-[72px] h-[72px] rounded-2xl border border-white/10 bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (stories.length === 0) {
    return (
      <div className="px-5 py-6 text-xs text-muted-foreground border-b border-white/5 bg-card/20 flex items-center gap-2">
        <AlertCircle className="w-4 h-4 opacity-50" />
        <span>Aktif hikaye bağlantısı yok</span>
      </div>
    );
  }

  return (
    <div className="flex gap-4 px-5 py-5 overflow-x-auto border-b border-white/5 bg-card/20 scrollbar-hide">
      {stories.map((s) => (
        <div key={s.id} className="flex-shrink-0 relative group">
          <div className="relative">
            {s.displayUrl ? (
              <img
                src={s.displayUrl}
                className={`w-[72px] h-[72px] rounded-2xl object-cover ring-2 ring-offset-2 ring-offset-background transition-all ${liked[s.id] ? 'ring-primary shadow-[0_0_15px_rgba(225,48,108,0.4)]' : 'ring-white/10 hover:ring-white/30'}`}
              />
            ) : (
              <div className="w-[72px] h-[72px] rounded-2xl bg-card border border-white/10 flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-muted-foreground/30" />
              </div>
            )}
            {s.mediaType === 2 && (
              <div className="absolute top-1 right-1 w-5 h-5 rounded-md bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/10">
                <Film className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
          <button
            disabled={loadingIds.has(s.id)}
            onClick={() => {
              if (loadingIds.has(s.id)) return;
              const storyId = s.id;
              const next = !liked[storyId];
              setLoadingIds((p) => new Set(p).add(storyId));
              likeQueue.current = likeQueue.current.then(async () => {
                try {
                  if (next) await likeStory(storyId);
                  else await unlikeStory(storyId);
                  setLiked((prev) => ({ ...prev, [storyId]: next }));
                } catch (e) {
                  toast.error(`Ağ hatası: ${e instanceof Error ? e.message : String(e)}`);
                } finally {
                  setLoadingIds((p) => { const n = new Set(p); n.delete(storyId); return n; });
                  await new Promise<void>((r) => setTimeout(r, 800));
                }
              });
            }}
            className={`absolute -bottom-2 -right-2 p-2 rounded-xl border border-white/10 shadow-xl transition-all hover:scale-110 active:scale-95 disabled:opacity-50 z-10 ${liked[s.id] ? 'bg-primary text-white border-primary shadow-[0_0_10px_rgba(225,48,108,0.5)]' : 'bg-card text-muted-foreground hover:text-foreground hover:bg-white/10'}`}
          >
            <Heart className={`w-3.5 h-3.5 ${liked[s.id] ? 'fill-current' : ''}`} />
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
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative rounded-xl overflow-hidden bg-card border border-white/5 aspect-square group"
    >
      {item.displayUrl ? (
        <img src={item.displayUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-white/5">
          <ImageIcon className="w-8 h-8 text-white/10" />
        </div>
      )}

      {(isVideo || type === 'reel') && (
        <div className="absolute top-2 right-2 w-6 h-6 rounded-md bg-black/60 backdrop-blur-md flex items-center justify-center pointer-events-none border border-white/10 shadow-lg">
          <Film className="w-3 h-3 text-white" />
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-100 flex items-end p-2 pointer-events-none" />
      
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
        <div className="pointer-events-auto">
          <LikeButton
            mediaId={item.id}
            initialLiked={item.hasLiked}
            initialCount={item.likeCount}
          />
        </div>
        {type === 'reel' && (item as IgReel).playCount !== undefined && (
          <span className="text-[10px] font-mono font-bold tracking-tight text-white/90 flex items-center gap-1 drop-shadow-md">
            <Play className="w-3 h-3 fill-current opacity-80" />
            {fmt((item as IgReel).playCount!)}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ─── Kullanıcı içerik görünümü ────────────────────────────────────────────────
type ContentTab = 'hikayeler' | 'gonderiler' | 'reels';

function UserContentView({ user, onBack }: { user: IgListUser; onBack: () => void }) {
  const [tab, setTab] = useState<ContentTab>('hikayeler');
  const [stories, setStories] = useState<IgStory[]>([]);
  const [posts, setPosts] = useState<IgPost[]>([]);
  const [reels, setReels] = useState<IgReel[]>([]);

  const [loadingStories, setLoadingStories] = useState(true);
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
      toast.error('Bağlantı koptu (Hikayeler)');
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
      toast.error('Bağlantı koptu (Gönderiler)');
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
      toast.error('Bağlantı koptu (Reels)');
    } finally {
      setLoadingReels(false);
    }
  }, [user.pk]);

  useEffect(() => { void loadStories(); }, [loadStories]);
  useEffect(() => { if (tab === 'gonderiler' && !postsFetched) void loadPosts(); }, [tab, postsFetched, loadPosts]);
  useEffect(() => { if (tab === 'reels' && !reelsFetched) void loadReels(); }, [tab, reelsFetched, loadReels]);

  const tabs: { key: ContentTab; label: string }[] = [
    { key: 'hikayeler', label: 'Hikayeler' },
    { key: 'gonderiler', label: 'Gönderiler' },
    { key: 'reels', label: 'Reels' },
  ];

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-4 bg-card/80 backdrop-blur-xl border-b border-white/5 flex-shrink-0 sticky top-0 z-20 shadow-md">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-muted-foreground hover:text-white hover:bg-white/5 rounded-xl transition-all"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <Avatar src={user.profile_pic_url} username={user.username} className="w-10 h-10" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="text-sm font-extrabold truncate text-foreground tracking-tight">{user.username}</p>
            {user.is_verified && <BadgeCheck className="w-4 h-4 text-blue-400 flex-shrink-0" />}
          </div>
          {user.full_name && <p className="text-[11px] font-medium text-muted-foreground truncate">{user.full_name}</p>}
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex px-5 pt-2 border-b border-white/5 bg-background sticky top-[73px] z-10">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative flex-1 py-3 text-[11px] font-bold tracking-widest uppercase transition-colors ${
              tab === t.key
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {tab === t.key && (
              <motion.div 
                layoutId="content-tab"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary shadow-[0_-2px_10px_rgba(225,48,108,0.6)]"
              />
            )}
          </button>
        ))}
      </div>

      {/* İçerik */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'hikayeler' && (
          <div className="pb-6">
            <StoriesStrip stories={stories} loading={loadingStories} />
            {storiesFetched && stories.length > 0 && (
              <p className="text-center text-[10px] font-mono tracking-widest uppercase text-muted-foreground py-6">
                Operator Engagement: {stories.length} Node(s)
              </p>
            )}
          </div>
        )}

        {tab === 'gonderiler' && (
          <div className="p-4">
            {loadingPosts && posts.length === 0 ? (
              <div className="grid grid-cols-3 gap-2.5">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="aspect-square rounded-xl bg-card border border-white/5 animate-pulse" />
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-2">
                  <ImageIcon className="w-5 h-5 opacity-40" />
                </div>
                <p className="text-sm font-medium">İçerik bulunamadı</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2.5">
                  {posts.map((p) => (
                    <MediaCard key={p.id} item={p} type="post" />
                  ))}
                </div>
                {postsNextId && (
                  <button
                    onClick={() => void loadPosts(postsNextId)}
                    disabled={loadingPosts}
                    className="w-full mt-4 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-card border border-white/10 text-xs font-bold text-primary hover:bg-white/5 transition-all disabled:opacity-50"
                  >
                    {loadingPosts ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Veri Çek'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'reels' && (
          <div className="p-4">
            {loadingReels && reels.length === 0 ? (
              <div className="grid grid-cols-3 gap-2.5">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="aspect-square rounded-xl bg-card border border-white/5 animate-pulse" />
                ))}
              </div>
            ) : reels.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-2">
                  <Film className="w-5 h-5 opacity-40" />
                </div>
                <p className="text-sm font-medium">Reel bulunamadı</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2.5">
                  {reels.map((r) => (
                    <MediaCard key={r.id} item={r} type="reel" />
                  ))}
                </div>
                {reelsNextId && (
                  <button
                    onClick={() => void loadReels(reelsNextId)}
                    disabled={loadingReels}
                    className="w-full mt-4 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-card border border-white/10 text-xs font-bold text-primary hover:bg-white/5 transition-all disabled:opacity-50"
                  >
                    {loadingReels ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Veri Çek'}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </motion.div>
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
      toast.error('Bağlantı koptu (Takip Listesi)');
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

  if (selected) {
    return (
      <ErrorBoundary key={selected.pk}>
        <UserContentView user={selected} onBack={() => setSelected(null)} />
      </ErrorBoundary>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full bg-background text-foreground relative">
      {/* Başlık / Arama */}
      <div className="p-4 border-b border-white/5 flex-shrink-0 bg-card/40">
        <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-muted-foreground mb-3 px-1">Hedef Seçimi</h2>
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ağda ara…"
            className="w-full pl-10 pr-4 py-2.5 text-sm font-medium bg-background border border-white/10 rounded-xl focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground shadow-inner"
          />
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto pb-6">
        {loading && following.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-xs font-mono uppercase tracking-widest">Ağ taranıyor...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-2">
              <Search className="w-5 h-5 opacity-40" />
            </div>
            <p className="text-sm font-medium">{search ? 'Sonuç bulunamadı' : 'Hedef yok'}</p>
          </div>
        ) : (
          <>
            {filtered.map((u) => (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={u.pk}
                onClick={() => setSelected(u)}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 text-left group"
              >
                <div className="relative">
                  <Avatar src={u.profile_pic_url} username={u.username} className="w-12 h-12 group-hover:ring-primary/30 transition-all" />
                  {u.is_private && (
                    <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5 border border-background">
                      <Lock className="w-3 h-3 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">{u.username}</span>
                    {u.is_verified && <BadgeCheck className="w-4 h-4 text-blue-400 flex-shrink-0" />}
                  </div>
                  {u.full_name && (
                    <p className="text-[11px] font-medium text-muted-foreground truncate">{u.full_name}</p>
                  )}
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </motion.button>
            ))}

            {hasMore && !search && (
              <div className="py-6 flex justify-center">
                <button
                  onClick={() => void loadPage(cursor)}
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-card border border-white/10 text-xs font-bold text-primary hover:bg-white/5 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Taranıyor...
                    </>
                  ) : (
                    'Daha Fazla Yükle'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
