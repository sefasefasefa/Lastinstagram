import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  getFollowers,
  getFollowing,
  unfollowUser,
  type IgUser,
  type IgListUser,
} from '@/lib/ig-api';
import { motion } from 'framer-motion';
import { Search, BadgeCheck, Lock, Loader2, UserMinus } from 'lucide-react';

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

function Avatar({ src, username, className = "w-10 h-10" }: { src: string; username: string; className?: string }) {
  const [err, setErr] = useState(false);
  if (err || !src) {
    return (
      <div className={`${className} rounded-xl bg-card border border-white/10 flex items-center justify-center text-foreground font-semibold flex-shrink-0 shadow-inner text-sm`}>
        {username[0]?.toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={username}
      className={`${className} rounded-xl object-cover ring-1 ring-white/10 flex-shrink-0 shadow-sm bg-card`}
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
    <motion.div 
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 group"
    >
      <div className="relative">
        <Avatar src={u.profile_pic_url} username={u.username} />
        {u.is_private && (
          <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-[1px] border border-background">
            <Lock className="w-3 h-3 text-muted-foreground" />
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-sm font-semibold text-foreground truncate">{u.username}</span>
          {u.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
        </div>
        {u.full_name && (
          <p className="text-[10px] text-muted-foreground truncate font-medium">{u.full_name}</p>
        )}
      </div>

      {tab === 'following' && (
        <button
          onClick={handleUnfollow}
          disabled={unfollowing}
          className="flex items-center justify-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border border-white/10 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all flex-shrink-0 disabled:opacity-50 opacity-0 group-hover:opacity-100 focus:opacity-100 min-w-[72px]"
        >
          {unfollowing ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserMinus className="w-3 h-3" />}
          {unfollowing ? 'İşlem' : 'Bırak'}
        </button>
      )}
    </motion.div>
  );
}

// ─── Ana bileşen ─────────────────────────────────────────────────────────────
export default function DashboardPage({ user }: Props) {
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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full text-foreground relative">
      
      {/* Profil İstatistikleri (Command Center Look) */}
      <div className="grid grid-cols-3 px-4 py-4 border-b border-white/5 bg-card/60 relative overflow-hidden flex-shrink-0 shadow-sm">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-[40px] pointer-events-none" />
        
        <div className="flex flex-col items-center text-center relative z-10 border-r border-white/5">
          <span className="text-xl font-bold text-foreground font-mono tracking-tight">{fmt(user.follower_count)}</span>
          <span className="text-[9px] text-muted-foreground uppercase tracking-widest mt-0.5 font-semibold">Takipçiler</span>
        </div>
        <div className="flex flex-col items-center text-center relative z-10 border-r border-white/5">
          <span className="text-xl font-bold text-foreground font-mono tracking-tight">{fmt(user.following_count)}</span>
          <span className="text-[9px] text-muted-foreground uppercase tracking-widest mt-0.5 font-semibold">Takip Edilen</span>
        </div>
        <div className="flex flex-col items-center text-center relative z-10">
          <span className="text-xl font-bold text-foreground font-mono tracking-tight">{fmt(user.media_count)}</span>
          <span className="text-[9px] text-muted-foreground uppercase tracking-widest mt-0.5 font-semibold">Gönderiler</span>
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex px-4 pt-1.5 border-b border-white/5 bg-background flex-shrink-0 sticky top-0 z-10 shadow-sm">
        {(['followers', 'following'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative flex-1 py-2.5 text-[10px] font-semibold tracking-widest uppercase transition-colors flex items-center justify-center gap-1.5 ${
              tab === t
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'followers' ? 'Takipçiler' : 'Takip Edilenler'}
            {tab === t && users.length > 0 && (
              <span className="text-[8px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">
                {users.length}{hasMore ? '+' : ''}
              </span>
            )}
            {tab === t && (
              <motion.div 
                layoutId="dashboard-tab"
                className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-primary shadow-[0_-1px_6px_rgba(225,48,108,0.5)]"
              />
            )}
          </button>
        ))}
      </div>

      {/* Arama */}
      <div className="p-3 bg-background border-b border-white/5 flex-shrink-0">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kullanıcı ara…"
            className="w-full pl-9 pr-3 py-2 text-xs font-medium bg-card/50 border border-white/10 rounded-lg focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground shadow-inner"
          />
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto bg-background">
        {loading && users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-[10px] font-mono uppercase tracking-widest">Ağ taranıyor...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
              <Search className="w-4 h-4 opacity-50" />
            </div>
            <p className="text-xs font-medium">{search ? 'Hedef bulunamadı' : 'Veri yok'}</p>
          </div>
        ) : (
          <div className="pb-6">
            {filtered.map((u) => (
              <UserRow key={u.pk} u={u} tab={tab} onUnfollow={tab === 'following' ? removeUser : undefined} />
            ))}

            {hasMore && !search && (
              <div className="py-4 flex justify-center px-4">
                <button
                  onClick={loadMore}
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

            {!hasMore && users.length > 0 && (
              <p className="text-center text-[9px] font-mono tracking-widest text-muted-foreground py-4 uppercase">
                Tüm Veri Çekildi // {users.length} Kayıt
              </p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
