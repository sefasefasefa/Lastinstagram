import { useState, useEffect } from 'react';
import { ArrowRight, CheckCircle2, AlertCircle, Loader2, RefreshCw, Instagram } from 'lucide-react';

type IgStatus = 'checking' | 'found' | 'missing';
interface StoredUser {
  username: string;
  full_name?: string;
  profile_pic_url?: string;
  follower_count?: number;
  following_count?: number;
  is_verified?: boolean;
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export function App() {
  const [igStatus, setIgStatus] = useState<IgStatus>('checking');
  const [igUser, setIgUser] = useState<StoredUser | null>(null);
  const [imgErr, setImgErr] = useState(false);

  function checkSession() {
    setIgStatus('checking');
    chrome.cookies.get({ url: 'https://www.instagram.com', name: 'sessionid' }, (c) => {
      setIgStatus(c?.value ? 'found' : 'missing');
    });
    chrome.storage.local.get(['igUser'], (r) => {
      setIgUser((r['igUser'] as StoredUser) ?? null);
    });
  }

  useEffect(() => { checkSession(); }, []);

  const openPanel = () => { chrome.tabs.create({ url: chrome.runtime.getURL('panel.html') }); window.close(); };
  const openIG = () => { chrome.tabs.create({ url: 'https://www.instagram.com/' }); window.close(); };

  return (
    <div className="w-[280px] bg-background text-foreground font-sans flex flex-col overflow-hidden">

      {/* ── Gradient Header ─────────────────────────────────────────── */}
      <div className="relative px-4 py-4 overflow-hidden">
        {/* BG gradient blob */}
        <div className="absolute inset-0 ig-gradient opacity-15 blur-2xl scale-110" />
        <div className="absolute inset-0 bg-background/60" />

        <div className="relative flex items-center gap-3">
          {/* Logo ring with gradient */}
          <div className="relative flex-shrink-0">
            <div className="absolute inset-0 ig-gradient rounded-xl blur-sm opacity-60" />
            <div className="relative w-9 h-9 rounded-xl bg-card border border-white/10 flex items-center justify-center">
              <Instagram className="w-5 h-5 text-white" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-white leading-tight">
              Takipçi Paneli
            </h1>
            <p className="text-[9px] font-mono uppercase tracking-widest ig-gradient-text font-semibold">
              Instagram Yönetim
            </p>
          </div>

          {/* Status pill */}
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-mono font-bold border flex-shrink-0 ${
            igStatus === 'found'
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
              : igStatus === 'missing'
                ? 'bg-rose-500/15 text-rose-400 border-rose-500/25'
                : 'bg-amber-500/15 text-amber-400 border-amber-500/25'
          }`}>
            {igStatus === 'checking' && <Loader2 className="w-2 h-2 animate-spin" />}
            {igStatus === 'found'    && <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />}
            {igStatus === 'missing'  && <span className="w-1.5 h-1.5 bg-rose-400 rounded-full" />}
            {igStatus === 'checking' ? '...' : igStatus === 'found' ? 'Aktif' : 'Yok'}
          </div>
        </div>
      </div>

      {/* ── User / Status body ──────────────────────────────────────── */}
      <div className="px-4 py-3 border-y border-white/5">
        {igStatus === 'checking' ? (
          <div className="flex items-center gap-2 py-0.5">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
            <span className="text-xs text-muted-foreground">Kontrol ediliyor…</span>
          </div>

        ) : igStatus === 'found' && igUser ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {/* Avatar */}
              {imgErr || !igUser.profile_pic_url ? (
                <div className="relative flex-shrink-0">
                  <div className="absolute inset-0 ig-gradient rounded-xl blur-sm opacity-50" />
                  <div className="relative w-10 h-10 rounded-xl bg-card border border-white/10 flex items-center justify-center text-white font-bold text-sm">
                    {igUser.username[0]?.toUpperCase()}
                  </div>
                </div>
              ) : (
                <div className="relative flex-shrink-0">
                  <div className="absolute inset-0 ig-gradient rounded-xl blur-[3px] opacity-60" />
                  <img
                    src={igUser.profile_pic_url}
                    alt={igUser.username}
                    className="relative w-10 h-10 rounded-xl object-cover ring-1 ring-white/10"
                    onError={() => setImgErr(true)}
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold text-white truncate">@{igUser.username}</p>
                {igUser.full_name && <p className="text-[10px] text-muted-foreground truncate">{igUser.full_name}</p>}
              </div>
            </div>

            {/* Stats */}
            {(igUser.follower_count !== undefined || igUser.following_count !== undefined) && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Takipçi', val: igUser.follower_count ?? 0, from: 'from-violet-500/20', to: 'to-pink-500/10', border: 'border-violet-500/20', text: 'text-violet-300' },
                  { label: 'Takip', val: igUser.following_count ?? 0, from: 'from-pink-500/20', to: 'to-orange-500/10', border: 'border-pink-500/20', text: 'text-pink-300' },
                ].map(({ label, val, from, to, border, text }) => (
                  <div key={label} className={`bg-gradient-to-br ${from} ${to} border ${border} rounded-xl p-2.5 text-center`}>
                    <p className={`text-sm font-bold font-mono ${text} leading-tight`}>{fmt(val)}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-widest mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

        ) : igStatus === 'found' ? (
          <div className="flex items-center gap-2 py-0.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-muted-foreground">Instagram oturumu aktif</span>
          </div>

        ) : (
          <div className="space-y-2.5">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-snug">
                Instagram oturumu bulunamadı. Önce Instagram'a giriş yapın.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={openIG}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary/15 hover:bg-primary/25 border border-primary/25 text-[10px] font-semibold text-primary transition-all active:scale-[0.98]">
                <Instagram className="w-3 h-3" /> Giriş Yap
              </button>
              <button onClick={checkSession}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-semibold text-muted-foreground transition-all active:scale-[0.98]">
                <RefreshCw className="w-3 h-3" /> Kontrol
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Open Panel ──────────────────────────────────────────────── */}
      <div className="px-4 py-3">
        <button onClick={openPanel}
          className="relative w-full flex items-center justify-center gap-2 py-2.5 rounded-xl overflow-hidden text-xs font-bold text-white tracking-wide transition-all active:scale-[0.98] group">
          {/* Gradient background */}
          <span className="absolute inset-0 ig-gradient opacity-90 group-hover:opacity-100 transition-opacity" />
          <span className="absolute inset-0 bg-black/10" />
          <span className="relative flex items-center gap-2">
            Paneli Aç <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </button>
      </div>
    </div>
  );
}
