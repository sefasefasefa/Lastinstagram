import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  getFollowers,
  getFollowing,
  unfollowUser,
  type IgUser,
  type IgListUser,
} from '@/lib/ig-api';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, BadgeCheck, Lock, Loader2, UserMinus, Users, UserCheck } from 'lucide-react';

type Tab = 'followers' | 'following';

interface Props {
  user: IgUser;
  onLogout: () => void;
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function Avatar({ src, username, size = 'md' }: { src: string; username: string; size?: 'sm' | 'md' }) {
  const [err, setErr] = useState(false);
  const cls = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';

  if (err || !src) {
    return (
      <div className={`${cls} rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/15 flex items-center justify-center text-primary font-bold flex-shrink-0`}>
        {username[0]?.toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={username}
      className={`${cls} rounded-xl object-cover ring-1 ring-white/10 flex-shrink-0 shadow-sm`}
      onError={() => setErr(true)}
    />
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
      toast.error('Takipten çıkarılamadı, tekrar dene');
    } finally {
      setUnfollowing(false);
    }
  }

  if (done) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0 }}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors border-b border-white/[0.04] last:border-0 group"
    >
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
        {u.full_name && (
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{u.full_name}</p>
        )}
      </div>

      {tab === 'following' && (
        <button
          onClick={handleUnfollow}
          disabled={unfollowing}
          className="flex items-center justify-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border border-white/8 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/25 transition-all flex-shrink-0 disabled:opacity-40 opacity-0 group-hover:opacity-100 focus:opacity-100 min-w-[60px]"
        >
          {unfollowing
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <UserMinus className="w-3 h-3" />
          }
          {unfollowing ? '…' : 'Bırak'}
        </button>
      )}
    </motion.div>
  );
}

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
      toast.error('Veriler yüklenemedi, tekrar dene');
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

  const filtered = search.trim()
    ? users.filter(
        (u) =>
          u.username.toLowerCase().includes(search.toLowerCase()) ||
          u.full_name.toLowerCase().includes(search.toLowerCase()),
      )
    : users;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full text-foreground">

      {/* ─── İstatistik kartları ───────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-0 border-b border-white/5 flex-shrink-0">
        {[
          { label: 'Takipçi', value: user.follower_count, border: true },
          { label: 'Takip', value: user.following_count, border: true },
          { label: 'Gönderi', value: user.media_count, border: false },
        ].map(({ label, value, border }) => (
          <div key={label} className={`flex flex-col items-center justify-center py-3.5 ${border ? 'border-r border-white/5' : ''} bg-card/40`}>
            <span className="text-lg font-bold font-mono tracking-tight text-foreground leading-tight">{fmt(value ?? 0)}</span>
            <span className="text-[9px] text-muted-foreground uppercase tracking-widest mt-0.5 font-semibold">{label}</span>
          </div>
        ))}
      </div>

      {/* ─── Sekmeler ──────────────────────────────────────────────────── */}
      <div className="flex border-b border-white/5 bg-background flex-shrink-0">
        {(['followers', 'following'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative flex-1 py-3 text-[10px] font-bold tracking-widest uppercase transition-colors flex items-center justify-center gap-2 ${
              tab === t ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/70'
            }`}
          >
            {t === 'followers' ? <Users className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
            {t === 'followers' ? 'Takipçiler' : 'Takip Edilenler'}
            {tab === t && users.length > 0 && (
              <span className="text-[8px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/15">
                {users.length}{hasMore ? '+' : ''}
              </span>
            )}
            {tab === t && (
              <motion.div
                layoutId="dash-tab-line"
                className="absolute bottom-0 left-4 right-4 h-[2px] bg-primary rounded-full"
              />
            )}
          </button>
        ))}
      </div>

      {/* ─── Arama ────────────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 bg-background border-b border-white/[0.04] flex-shrink-0">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kullanıcı ara…"
            className="w-full pl-8.5 pr-3 py-2 text-xs bg-card/40 border border-white/8 rounded-lg focus:border-primary/40 focus:ring-1 focus:ring-primary/30 focus:outline-none transition-all placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      {/* ─── Liste ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-background">
        {loading && users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <p className="text-[10px] font-mono uppercase tracking-widest">Yükleniyor…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <div className="w-10 h-10 rounded-xl bg-card/60 border border-white/8 flex items-center justify-center">
              <Search className="w-4 h-4 opacity-40" />
            </div>
            <p className="text-xs font-medium">
              {search ? 'Kullanıcı bulunamadı' : 'Veri yok'}
            </p>
          </div>
        ) : (
          <div className="pb-4">
            <AnimatePresence>
              {filtered.map((u) => (
                <UserRow
                  key={u.pk}
                  u={u}
                  tab={tab}
                  onUnfollow={tab === 'following' ? (pk) => setUsers((prev) => prev.filter((x) => x.pk !== pk)) : undefined}
                />
              ))}
            </AnimatePresence>

            {hasMore && !search && (
              <div className="px-4 pt-3">
                <button
                  onClick={() => { if (!loading && hasMore && cursor) void loadPage(user.pk, tab, cursor); }}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-card/60 border border-white/8 text-[11px] font-semibold text-foreground hover:bg-white/5 transition-all disabled:opacity-40 active:scale-[0.98]"
                >
                  {loading ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> Yükleniyor…</>
                  ) : (
                    'Daha Fazla Yükle'
                  )}
                </button>
              </div>
            )}

            {!hasMore && users.length > 0 && (
              <p className="text-center text-[9px] font-mono tracking-widest text-muted-foreground/50 py-4 uppercase">
                {users.length} kayıt listelendi
              </p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
