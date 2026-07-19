import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  getFollowers, getFollowing, unfollowUser,
  type IgUser, type IgListUser,
} from '@/lib/ig-api';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, BadgeCheck, Lock, Loader2, UserMinus, Users, UserCheck } from 'lucide-react';

type Tab = 'followers' | 'following';
interface Props { user: IgUser; onLogout: () => void; }

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function Avatar({ src, username, size = 'md' }: { src: string; username: string; size?: 'sm' | 'md' }) {
  const [err, setErr] = useState(false);
  const cls = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';

  if (err || !src) {
    return (
      <div className={`${cls} rounded-xl bg-gradient-to-br from-violet-500/25 to-pink-500/10 border border-violet-500/20 flex items-center justify-center text-violet-300 font-bold text-sm flex-shrink-0`}>
        {username[0]?.toUpperCase()}
      </div>
    );
  }
  return (
    <img src={src} alt={username}
      className={`${cls} rounded-xl object-cover ring-1 ring-white/10 flex-shrink-0 shadow-sm`}
      onError={() => setErr(true)} />
  );
}

function UserRow({ u, tab, onUnfollow }: { u: IgListUser; tab: Tab; onUnfollow?: (pk: string) => void }) {
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
      toast.error('Takipten çıkarılamadı');
    } finally {
      setUnfollowing(false);
    }
  }

  if (done) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors border-b border-white/[0.04] last:border-0 group">
      <div className="relative flex-shrink-0">
        <Avatar src={u.profile_pic_url} username={u.username} />
        {u.is_private && (
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-background rounded-full flex items-center justify-center border border-white/10">
            <Lock className="w-2 h-2 text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[12px] font-semibold text-foreground truncate">{u.username}</span>
          {u.is_verified && <BadgeCheck className="w-3 h-3 text-blue-400 flex-shrink-0" />}
        </div>
        {u.full_name && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{u.full_name}</p>}
      </div>

      {tab === 'following' && (
        <button onClick={handleUnfollow} disabled={unfollowing}
          className="flex items-center justify-center gap-1.5 text-[10px] font-semibold px-3 py-1.5 rounded-lg border transition-all duration-200 flex-shrink-0 disabled:opacity-40 min-w-[64px] border-white/8 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/25 opacity-0 group-hover:opacity-100 focus:opacity-100">
          {unfollowing ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserMinus className="w-3 h-3" />}
          {unfollowing ? '…' : 'Bırak'}
        </button>
      )}
    </motion.div>
  );
}

export default function DashboardPage({ user }: Props) {
  const [tab, setTab] = useState<Tab>('followers');
  const [users, setUsers] = useState<IgListUser[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
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
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    setUsers([]); setCursor(undefined); setHasMore(true); setSearch('');
    void loadPage(user.pk, tab);
  }, [tab, user.pk, loadPage]);

  const filtered = search.trim()
    ? users.filter((u) =>
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.full_name.toLowerCase().includes(search.toLowerCase()))
    : users;

  // Stat cards config
  const stats = [
    { label: 'Takipçi', value: user.follower_count, grad: 'from-violet-600 to-purple-700', glow: 'shadow-violet-500/20' },
    { label: 'Takip',   value: user.following_count, grad: 'from-pink-600 to-rose-700',   glow: 'shadow-pink-500/20'   },
    { label: 'Gönderi', value: user.media_count,    grad: 'from-orange-500 to-amber-600', glow: 'shadow-orange-500/20' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full text-foreground">

      {/* ─── Stat Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-0 flex-shrink-0">
        {stats.map(({ label, value, grad, glow }, i) => (
          <div key={label}
            className={`flex flex-col items-center justify-center py-4 relative overflow-hidden ${i < 2 ? 'border-r border-white/5' : ''} border-b border-white/5`}>
            {/* Glow blob */}
            <div className={`absolute inset-0 bg-gradient-to-br ${grad} opacity-10 blur-xl`} />
            <span className={`relative text-xl font-extrabold font-mono tracking-tight text-white leading-none drop-shadow-lg`}>
              {fmt(value ?? 0)}
            </span>
            <span className="relative text-[8px] text-muted-foreground uppercase tracking-widest mt-1 font-bold">{label}</span>
          </div>
        ))}
      </div>

      {/* ─── Tabs ────────────────────────────────────────────────── */}
      <div className="flex border-b border-white/5 bg-background flex-shrink-0">
        {(['followers', 'following'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`relative flex-1 py-3 text-[10px] font-bold tracking-widest uppercase transition-colors flex items-center justify-center gap-2 ${
              tab === t ? 'text-white' : 'text-muted-foreground hover:text-white/70'
            }`}>
            {t === 'followers' ? <Users className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
            {t === 'followers' ? 'Takipçiler' : 'Takip Edilenler'}
            {tab === t && users.length > 0 && (
              <span className="text-[8px] font-mono px-1.5 py-0.5 rounded border text-violet-300 bg-violet-500/10 border-violet-500/20">
                {users.length}{hasMore ? '+' : ''}
              </span>
            )}
            {tab === t && (
              <motion.div layoutId="dash-tab"
                className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full"
                style={{ background: 'linear-gradient(90deg,#833ab4,#fd1d1d,#fcb045)' }} />
            )}
          </button>
        ))}
      </div>

      {/* ─── Search ──────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 bg-background border-b border-white/[0.04] flex-shrink-0">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-violet-400 transition-colors" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Kullanıcı ara…"
            className="w-full pl-9 pr-3 py-2 text-xs bg-card/50 border border-white/8 rounded-lg focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 focus:outline-none transition-all placeholder:text-muted-foreground/50" />
        </div>
      </div>

      {/* ─── List ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-background">
        {loading && users.length === 0 ? (
          <div className="p-3 space-y-px">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2.5">
                <div className="skeleton w-10 h-10 rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3 w-28 rounded-full" />
                  <div className="skeleton h-2.5 w-16 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <div className="w-10 h-10 rounded-xl bg-card/60 border border-white/8 flex items-center justify-center">
              <Search className="w-4 h-4 opacity-40" />
            </div>
            <p className="text-xs font-medium">{search ? 'Kullanıcı bulunamadı' : 'Veri yok'}</p>
          </div>
        ) : (
          <div className="pb-4">
            <AnimatePresence>
              {filtered.map((u) => (
                <UserRow key={u.pk} u={u} tab={tab}
                  onUnfollow={tab === 'following' ? (pk) => setUsers((prev) => prev.filter((x) => x.pk !== pk)) : undefined} />
              ))}
            </AnimatePresence>

            {hasMore && !search && (
              <div className="px-4 pt-3">
                <button
                  onClick={() => { if (!loading && hasMore && cursor) void loadPage(user.pk, tab, cursor); }}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-card/60 border border-white/8 text-[11px] font-bold text-foreground hover:bg-white/5 transition-all disabled:opacity-40 active:scale-[0.98]">
                  {loading
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" /> Yükleniyor…</>
                    : 'Daha Fazla Yükle'}
                </button>
              </div>
            )}
            {!hasMore && users.length > 0 && (
              <p className="text-center text-[9px] font-mono tracking-widest text-muted-foreground/40 py-4 uppercase">
                {users.length} kayıt
              </p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
