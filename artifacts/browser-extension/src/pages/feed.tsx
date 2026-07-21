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
        <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center bg-background text-foreground relative">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center border border-destructive/20 shadow-inner">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <p className="text-sm font-semibold tracking-tight">Sistem Hatası</p>
          <p className="text-[10px] font-mono text-muted-foreground break-all bg-card border border-white/5 p-3 rounded-lg w-full text-left overflow-auto max-h-32">
            {(this.state.error as Error).message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="w-full py-2.5 mt-2 text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all active:scale-[0.98]"
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
function Avatar({ src, username, className = "w-10 h-10" }: { src: string; username: string; className?: string }) {
  const [err, setErr] = useState(false);
  if (err || !src) {
    return (
      <div className={`${className} rounded-xl bg-card border border-white/10 flex items-center justify-center text-foreground font-semibold flex-shrink-0 shadow-inner text-sm`}>
        {username[0]?.toUpperCase()}
      </div>
    );
  }
  return <img src={src} alt={username} className={`${className} rounded-xl object-cover ring-1 ring-white/10 flex-shrink-0 shadow-sm bg-card`} onError={() => setErr(true)} />;
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
  const [popped, setPopped] = useState(false);

  async function toggle() {
    if (loading) return;
    setLoading(true);
    const next = !liked;
    try {
      if (next) await likeMedia(mediaId);
      else await unlikeMedia(mediaId);
      setLiked(next);
      setCount((c) => c + (next ? 1 : -1));
      if (next) { setPopped(true); setTimeout(() => setPopped(false), 500); }
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
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg backdrop-blur-md transition-all duration-200 active:scale-90 disabled:opacity-50 shadow-md ${
        liked
          ? 'bg-primary/25 text-primary border border-primary/40 shadow-[0_2px_12px_rgba(225,48,108,0.25)]'
          : 'bg-black/55 text-white/90 border border-white/10 hover:bg-black/70 hover:border-white/20'
      }`}
    >
      <Heart className={`w-3.5 h-3.5 transition-colors duration-200 ${liked ? 'fill-current' : ''} ${popped ? 'animate-heart-pop' : ''}`} />
      <span className="text-[10px] font-mono font-bold tracking-tight tabular-nums">{fmt(count)}</span>
    </button>
  );
}

// ─── Hikaye şeridi ────────────────────────────────────────────────────────────
// Kullanıcının son like/unlike tercihinin ne kadar süre API verisine karşı
// korunacağı (ms). Instagram'ın beğeni durumunu yayması bu süreyi alabilir.
const LIKE_PIN_TTL_MS = 90_000; // 90 saniye

function StoriesStrip({ stories, loading }: { stories: IgStory[]; loading: boolean }) {
  const [liked, setLiked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(stories.map((s) => [s.id, s.hasLiked || false])),
  );
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [popIds, setPopIds]         = useState<Set<string>>(new Set());
  const likeQueue = useRef<Promise<void>>(Promise.resolve());
  // Unlike yapılan hikayeler — yeniden beğenirken markStorySeen tekrar gönderilmeli.
  const unlikedRef = useRef<Set<string>>(new Set());

  // Kullanıcının açıkça yaptığı like/unlike'lar burada "pin" olarak tutulur.
  // API güncellemesi geldiğinde TTL dolmamış pinler API verisini ezer;
  // bu sayede unlike sonrası hikaye yenilemesi liked=true'ya geri dönemez.
  const pinnedRef = useRef<Record<string, { val: boolean; ts: number }>>({});

  useEffect(() => {
    const now = Date.now();
    setLiked((prev) => {
      const next = { ...prev };
      for (const s of stories) {
        if (loadingIds.has(s.id)) continue; // in-flight — dokunma

        const pin = pinnedRef.current[s.id];
        if (pin && now - pin.ts < LIKE_PIN_TTL_MS) {
          // Kullanıcı bu hikayeyi yakın zamanda beğendi/geri aldı;
          // API verisi ne derse desin pin'i koru.
          next[s.id] = pin.val;
        } else {
          // Pin yok veya süresi dolmuş — API verisini kullan.
          if (pin) delete pinnedRef.current[s.id];
          next[s.id] = s.hasLiked ?? false;
        }
      }
      return next;
    });
  }, [stories, loadingIds]);

  if (loading) {
    return (
      <div className="flex gap-3 px-4 py-4 overflow-x-auto scrollbar-hide border-b border-white/5 bg-card/40">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton flex-shrink-0 w-[72px] h-[72px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (stories.length === 0) {
    return (
      <div className="px-4 py-6 text-[11px] text-muted-foreground border-b border-white/5 bg-card/30 flex items-center justify-center gap-2">
        <AlertCircle className="w-3.5 h-3.5 opacity-40" />
        <span className="font-medium">Aktif hikaye yok</span>
      </div>
    );
  }

  return (
    <div className="flex gap-3 px-4 py-4 overflow-x-auto border-b border-white/5 bg-card/30 scrollbar-hide">
      {stories.map((s) => (
        <div key={s.id} className="flex-shrink-0 relative group">
          <div className="relative">
            {s.displayUrl ? (
              <img
                src={s.displayUrl}
                className={`w-[72px] h-[72px] rounded-xl object-cover ring-2 ring-offset-2 ring-offset-[hsl(var(--background))] transition-all duration-300 ${
                  liked[s.id]
                    ? 'ring-primary shadow-[0_0_14px_rgba(225,48,108,0.35)]'
                    : 'ring-white/10 hover:ring-white/25'
                }`}
              />
            ) : (
              <div className="w-[72px] h-[72px] rounded-xl bg-card border border-white/8 flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-muted-foreground/25" />
              </div>
            )}
            {s.mediaType === 2 && (
              <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-md bg-black/65 backdrop-blur-md flex items-center justify-center border border-white/15">
                <Film className="w-2.5 h-2.5 text-white" />
              </div>
            )}
          </div>
          {/* Like butonu */}
          <button
            disabled={loadingIds.has(s.id)}
            onClick={() => {
              if (loadingIds.has(s.id)) return;
              const storyId  = s.id;
              const ownerId  = s.ownerId;
              const takenAt  = s.takenAt;
              const current  = liked[storyId] ?? false;
              const next     = !current;

              // Optimistic update KALDIRILDI — API yanıtını bekle, sadece
              // başarı gelince güncelle. Sessiz GQL hatalarında yanlış
              // "beğenildi" görünmesini önler.
              setLoadingIds((p) => new Set(p).add(storyId));

              likeQueue.current = likeQueue.current.then(async () => {
                try {
                  if (next) {
                    // Unlike sonrası yeniden beğeniliyorsa markStorySeen tekrar gönderilmeli.
                    // Instagram unlike yapınca "seen" durumunu sıfırlıyor.
                    const wasUnliked = unlikedRef.current.has(storyId);
                    await likeStory(storyId, {
                      ownerId,
                      takenAt,
                      hasSeen: s.hasSeen && !wasUnliked,
                    });
                    unlikedRef.current.delete(storyId);
                  } else {
                    await unlikeStory(storyId);
                    // Unlike başarılı — bir sonraki like'ta seen tekrar gönderilsin.
                    unlikedRef.current.add(storyId);
                  }
                  // API başarılı — pin kaydet ve UI'ı güncelle.
                  // Pin, sonraki hikaye yenilemelerinin bu seçimi ezmesini önler.
                  pinnedRef.current[storyId] = { val: next, ts: Date.now() };
                  setLiked((prev) => ({ ...prev, [storyId]: next }));
                  if (next) {
                    setPopIds((p) => new Set(p).add(storyId));
                    setTimeout(() => setPopIds((p) => { const n = new Set(p); n.delete(storyId); return n; }), 500);
                  }
                } catch (e) {
                  // Hata — hiçbir güncelleme yapılmadı, pin yazılmadı
                  const msg = e instanceof Error ? e.message : String(e);
                  toast.error(`Beğeni başarısız: ${msg}`);
                } finally {
                  setLoadingIds((p) => { const n = new Set(p); n.delete(storyId); return n; });
                  await new Promise<void>((r) => setTimeout(r, 600));
                }
              });
            }}
            className={`absolute -bottom-2 -right-2 p-2 rounded-xl border shadow-lg transition-all duration-200 hover:scale-110 active:scale-90 disabled:opacity-50 z-10 ${
              liked[s.id]
                ? 'bg-primary text-white border-primary shadow-[0_0_10px_rgba(225,48,108,0.5)]'
                : 'bg-card/95 text-muted-foreground border-white/12 hover:text-white hover:border-white/25 backdrop-blur-sm'
            }`}
          >
            <Heart
              className={`w-3.5 h-3.5 transition-colors duration-150 ${liked[s.id] ? 'fill-current' : ''} ${popIds.has(s.id) ? 'animate-heart-pop' : ''}`}
            />
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
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative rounded-lg overflow-hidden bg-card border border-white/5 aspect-square group"
    >
      {item.displayUrl ? (
        <img src={item.displayUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-white/5">
          <ImageIcon className="w-6 h-6 text-white/10" />
        </div>
      )}

      {(isVideo || type === 'reel') && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded bg-black/50 backdrop-blur-md flex items-center justify-center pointer-events-none border border-white/10">
          <Film className="w-3 h-3 text-white/90" />
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-100 flex items-end p-1.5 pointer-events-none" />
      
      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between">
        <div className="pointer-events-auto">
          <LikeButton
            mediaId={item.id}
            initialLiked={item.hasLiked}
            initialCount={item.likeCount}
          />
        </div>
        {type === 'reel' && (item as IgReel).playCount !== undefined && (
          <span className="text-[9px] font-mono font-bold tracking-tight text-white/90 flex items-center gap-1 drop-shadow-md bg-black/40 px-1.5 py-0.5 rounded backdrop-blur-sm border border-white/10">
            <Play className="w-2.5 h-2.5 fill-current opacity-80" />
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
    <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="flex flex-col h-full bg-background text-foreground relative z-20">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-3 bg-card/80 backdrop-blur-xl border-b border-white/5 flex-shrink-0 sticky top-0 z-20 shadow-sm">
        <button
          onClick={onBack}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-all"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <Avatar src={user.profile_pic_url} username={user.username} className="w-9 h-9" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="text-xs font-semibold truncate text-foreground tracking-tight">{user.username}</p>
            {user.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
          </div>
          {user.full_name && <p className="text-[10px] font-medium text-muted-foreground truncate">{user.full_name}</p>}
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex px-4 pt-1.5 border-b border-white/5 bg-background sticky top-[61px] z-10 shadow-sm">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative flex-1 py-2.5 text-[10px] font-semibold tracking-widest uppercase transition-colors ${
              tab === t.key
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {tab === t.key && (
              <motion.div 
                layoutId="content-tab"
                className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-primary shadow-[0_-1px_6px_rgba(225,48,108,0.5)]"
              />
            )}
          </button>
        ))}
      </div>

      {/* İçerik */}
      <div className="flex-1 overflow-y-auto bg-background">
        {tab === 'hikayeler' && (
          <div className="pb-6">
            <StoriesStrip stories={stories} loading={loadingStories} />
            {storiesFetched && stories.length > 0 && (
              <p className="text-center text-[9px] font-mono tracking-widest uppercase text-muted-foreground/40 py-6">
                {stories.length} hikaye
              </p>
            )}
          </div>
        )}

        {tab === 'gonderiler' && (
          <div className="p-3">
            {loadingPosts && posts.length === 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="skeleton aspect-square rounded-xl" />
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
                  <ImageIcon className="w-4 h-4 opacity-50" />
                </div>
                <p className="text-xs font-medium">İçerik bulunamadı</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {posts.map((p) => (
                    <MediaCard key={p.id} item={p} type="post" />
                  ))}
                </div>
                {postsNextId && (
                  <button
                    onClick={() => void loadPosts(postsNextId)}
                    disabled={loadingPosts}
                    className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-card border border-white/10 text-xs font-semibold text-foreground hover:bg-white/5 transition-all disabled:opacity-50 active:scale-[0.98]"
                  >
                    {loadingPosts ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : 'Daha Fazla Yükle'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'reels' && (
          <div className="p-3">
            {loadingReels && reels.length === 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="skeleton aspect-[9/16] rounded-xl" />
                ))}
              </div>
            ) : reels.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
                  <Film className="w-4 h-4 opacity-50" />
                </div>
                <p className="text-xs font-medium">Reel bulunamadı</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {reels.map((r) => (
                    <MediaCard key={r.id} item={r} type="reel" />
                  ))}
                </div>
                {reelsNextId && (
                  <button
                    onClick={() => void loadReels(reelsNextId)}
                    disabled={loadingReels}
                    className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-card border border-white/10 text-xs font-semibold text-foreground hover:bg-white/5 transition-all disabled:opacity-50 active:scale-[0.98]"
                  >
                    {loadingReels ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : 'Daha Fazla Yükle'}
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
      <div className="p-3 border-b border-white/5 flex-shrink-0 bg-card/60 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-[40px] pointer-events-none" />
        <h2 className="text-[10px] font-mono font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1 relative z-10">Hedef Seçimi</h2>
        <div className="relative group z-10">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ağda ara…"
            className="w-full pl-9 pr-3 py-2 text-xs font-medium bg-background border border-white/10 rounded-lg focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground shadow-inner"
          />
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto pb-6 bg-background">
        {loading && following.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-[10px] font-mono uppercase tracking-widest">Ağ taranıyor...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
              <Search className="w-4 h-4 opacity-50" />
            </div>
            <p className="text-xs font-medium">{search ? 'Sonuç bulunamadı' : 'Hedef yok'}</p>
          </div>
        ) : (
          <>
            {filtered.map((u) => (
              <motion.button
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                key={u.pk}
                onClick={() => setSelected(u)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 text-left group"
              >
                <div className="relative">
                  <Avatar src={u.profile_pic_url} username={u.username} className="w-10 h-10 group-hover:ring-primary/30 transition-all" />
                  {u.is_private && (
                    <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-[1px] border border-background">
                      <Lock className="w-3 h-3 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{u.username}</span>
                    {u.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
                  </div>
                  {u.full_name && (
                    <p className="text-[10px] font-medium text-muted-foreground truncate">{u.full_name}</p>
                  )}
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all flex-shrink-0" />
              </motion.button>
            ))}

            {hasMore && !search && (
              <div className="py-4 flex justify-center px-4">
                <button
                  onClick={() => void loadPage(cursor)}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-card border border-white/10 text-[11px] font-semibold text-foreground hover:bg-white/5 transition-all disabled:opacity-50 active:scale-[0.98]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
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
