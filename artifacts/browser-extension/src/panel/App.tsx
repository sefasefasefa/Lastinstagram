import { useEffect, useState, useCallback } from 'react';
import { Route, Switch, Redirect, Link, useRoute } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { Router as WouterRouter } from 'wouter';
import { Toaster } from 'sonner';
import { igApi, getCachedUser, clearCachedUser, hasSession, normalizeIgUser, type IgUser } from '@/lib/ig-api';
import DashboardPage from '@/pages/dashboard';
import FeedPage from '@/pages/feed';
import AutomationPage from '@/pages/automation';
import NotFound from '@/pages/not-found';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Layers, Settings2, Instagram, LogOut, Loader2,
  ArrowRight, BadgeCheck, RefreshCw, AlertCircle,
} from 'lucide-react';

// ─── Alt navigasyon ───────────────────────────────────────────────────────────
function BottomNav() {
  const [isDashboard] = useRoute('/dashboard');
  const [isFeed] = useRoute('/feed');
  const [isAutomation] = useRoute('/automation');

  const tabs = [
    { href: '/dashboard', label: 'Takip', icon: Users, active: isDashboard },
    { href: '/feed', label: 'Akış', icon: Layers, active: isFeed },
    { href: '/automation', label: 'Otomasyon', icon: Settings2, active: isAutomation },
  ];

  return (
    <nav className="flex bg-card/95 backdrop-blur-xl border-t border-white/5 h-[60px] flex-shrink-0 relative z-50 px-2">
      {tabs.map(({ href, label, icon: Icon, active }) => (
        <Link key={href} href={href}
          className={`flex-1 flex flex-col items-center justify-center gap-1 text-[9px] font-bold tracking-widest uppercase transition-all duration-200 rounded-xl mx-0.5 relative ${
            active ? 'text-white' : 'text-muted-foreground hover:text-white/70'
          }`}>
          {active && (
            <motion.div
              layoutId="nav-bg"
              className="absolute inset-1 rounded-xl opacity-90"
              style={{ background: 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)' }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            />
          )}
          <div className="relative flex flex-col items-center gap-1 z-10">
            <Icon className="w-[15px] h-[15px]" />
            <span>{label}</span>
          </div>
        </Link>
      ))}
    </nav>
  );
}

// ─── Üst Başlık ───────────────────────────────────────────────────────────────
function TopHeader({ user, onLogout }: { user: IgUser; onLogout: () => void }) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <header className="flex items-center justify-between px-4 py-3 flex-shrink-0 z-50 relative overflow-hidden bg-card/90 backdrop-blur-xl">
      {/* Top gradient stripe */}
      <div className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: 'linear-gradient(90deg,#833ab4,#fd1d1d,#fcb045)' }} />
      <div className="absolute inset-0 border-b border-white/5" />

      <div className="relative flex items-center gap-3">
        {/* Avatar with gradient ring */}
        <div className="relative flex-shrink-0">
          {!imgErr && user.profile_pic_url ? (
            <>
              <div className="absolute inset-0 rounded-xl blur-[3px] opacity-70"
                style={{ background: 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)' }} />
              <img src={user.profile_pic_url} alt={user.username}
                className="relative w-8 h-8 rounded-xl object-cover ring-1 ring-white/15"
                onError={() => setImgErr(true)} />
            </>
          ) : (
            <>
              <div className="absolute inset-0 rounded-xl blur-sm opacity-60"
                style={{ background: 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)' }} />
              <div className="relative w-8 h-8 rounded-xl bg-card border border-white/10 flex items-center justify-center text-white font-bold text-sm">
                {user.username[0]?.toUpperCase()}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col min-w-0">
          <span className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
            {user.username}
            {user.is_verified && <BadgeCheck className="w-3 h-3 text-blue-400 flex-shrink-0" />}
          </span>
          <span className="text-[9px] font-mono uppercase tracking-widest font-semibold"
            style={{ background: 'linear-gradient(90deg,#833ab4,#fd1d1d)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Oturum Aktif
          </span>
        </div>
      </div>

      <div className="relative flex items-center gap-2">
        <div className="relative">
          <div className="absolute inset-0 rounded-lg opacity-40"
            style={{ background: 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)' }} />
          <div className="relative w-7 h-7 bg-card border border-white/10 rounded-lg flex items-center justify-center">
            <Instagram className="w-4 h-4 text-white opacity-80" />
          </div>
        </div>
        <button onClick={onLogout}
          className="relative p-1.5 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all border border-transparent hover:border-rose-500/20 active:scale-95">
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}

// ─── Bağlantı Sayfası ─────────────────────────────────────────────────────────
function ConnectPage({ onConnected }: { onConnected: (user: IgUser) => void }) {
  const [phase, setPhase] = useState<'checking' | 'no-session' | 'fetching' | 'error'>('checking');
  const [errorMsg, setErrorMsg] = useState('');

  const doFetch = useCallback(async () => {
    setPhase('fetching');
    setErrorMsg('');
    try {
      const raw = await igApi<unknown>('/api/v1/accounts/current_user/?edit=true');
      const rawObj = raw as Record<string, unknown>;
      const rawUser = (rawObj?.['user'] ?? rawObj) as Record<string, unknown>;
      const user = normalizeIgUser(rawUser);
      if (user) {
        chrome.storage.local.set({ igUser: user, igUserTs: Date.now() });
        onConnected(user);
        return;
      }
      throw new Error('Kullanıcı verisi alınamadı');
    } catch (err) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [onConnected]);

  useEffect(() => {
    hasSession().then((has) => { if (!has) { setPhase('no-session'); return; } void doFetch(); });
  }, [doFetch]);

  useEffect(() => {
    const h = (msg: { type: string; user?: IgUser }) => {
      if (msg.type === 'IG_USER_UPDATED' && msg.user) onConnected(msg.user);
    };
    chrome.runtime.onMessage.addListener(h);
    return () => chrome.runtime.onMessage.removeListener(h);
  }, [onConnected]);

  const openIG = () => chrome.tabs.create({ url: 'https://www.instagram.com/' });

  const steps = [
    { n: '01', text: 'Aşağıdaki butona tıkla' },
    { n: '02', text: 'Instagram\'a giriş yap' },
    { n: '03', text: 'Bu sayfaya geri dön' },
  ];

  return (
    <div className="flex flex-col h-[100dvh] bg-background overflow-hidden">
      {/* Gradient top bar */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5 flex-shrink-0 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: 'linear-gradient(90deg,#833ab4,#fd1d1d,#fcb045)' }} />
        <div className="absolute inset-0 opacity-5"
          style={{ background: 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)' }} />
        <div className="relative flex-shrink-0">
          <div className="absolute inset-0 rounded-xl blur-sm opacity-60"
            style={{ background: 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)' }} />
          <div className="relative w-9 h-9 rounded-xl bg-card border border-white/10 flex items-center justify-center">
            <Instagram className="w-5 h-5 text-white" />
          </div>
        </div>
        <div className="relative">
          <h1 className="text-[13px] font-bold text-white leading-tight">Takipçi Paneli</h1>
          <p className="text-[9px] font-mono uppercase tracking-widest font-semibold"
            style={{ background: 'linear-gradient(90deg,#833ab4,#fd1d1d)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Instagram Yönetim
          </p>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-hidden relative">
        {/* Ambient blobs */}
        <div className="absolute top-1/4 left-1/4 w-48 h-48 rounded-full blur-3xl opacity-8"
          style={{ background: '#833ab4' }} />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 rounded-full blur-3xl opacity-8"
          style={{ background: '#fcb045' }} />

        <AnimatePresence mode="wait">
          {/* Loading */}
          {(phase === 'checking' || phase === 'fetching') && (
            <motion.div key="loading"
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-5">
              <div className="relative">
                <div className="absolute inset-0 rounded-2xl blur-lg opacity-50"
                  style={{ background: 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)' }} />
                <div className="relative w-16 h-16 rounded-2xl bg-card border border-white/10 flex items-center justify-center">
                  <Instagram className="w-8 h-8 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-background border border-white/10 flex items-center justify-center">
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-bold text-white">{phase === 'checking' ? 'Oturum kontrol ediliyor…' : 'Bağlanılıyor…'}</p>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Lütfen bekleyin</p>
              </div>
            </motion.div>
          )}

          {/* No session */}
          {phase === 'no-session' && (
            <motion.div key="no-session"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="w-full max-w-[360px] space-y-5">
              <div className="text-center">
                <div className="relative inline-block mb-4">
                  <div className="absolute inset-0 rounded-2xl blur-xl opacity-50"
                    style={{ background: 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)' }} />
                  <div className="relative w-16 h-16 rounded-2xl bg-card border border-white/10 flex items-center justify-center mx-auto">
                    <Instagram className="w-8 h-8 text-white" />
                  </div>
                </div>
                <h2 className="text-lg font-bold text-white">Giriş Gerekli</h2>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Paneli kullanmak için Chrome'da Instagram oturumunun açık olması gerekiyor.
                </p>
              </div>

              {/* Steps */}
              <div className="bg-card/60 border border-white/8 rounded-2xl p-4 space-y-3">
                {steps.map(({ n, text }) => (
                  <div key={n} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-mono font-bold text-white flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg,#833ab4,#fd1d1d)' }}>
                      {n}
                    </div>
                    <p className="text-xs text-muted-foreground">{text}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button onClick={openIG}
                  className="relative flex-1 flex items-center justify-center gap-2 py-3 rounded-xl overflow-hidden text-xs font-bold text-white transition-all active:scale-[0.98] group">
                  <span className="absolute inset-0 opacity-90 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)' }} />
                  <span className="relative flex items-center gap-2">
                    <Instagram className="w-3.5 h-3.5" /> Instagram'ı Aç <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>
                <button onClick={() => void doFetch()}
                  className="px-4 flex items-center justify-center py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all active:scale-[0.98]">
                  <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            </motion.div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <motion.div key="error"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="w-full max-w-[360px] space-y-4">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-7 h-7 text-rose-400" />
                </div>
                <h2 className="text-sm font-bold text-white">Bağlantı Hatası</h2>
              </div>
              <div className="bg-rose-500/5 border border-rose-500/15 rounded-xl p-3">
                <p className="text-[9px] font-mono text-rose-400/70 uppercase tracking-widest mb-1.5">Hata</p>
                <p className="text-[10px] font-mono text-muted-foreground break-all leading-relaxed">{errorMsg}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={doFetch}
                  className="relative flex-1 flex items-center justify-center gap-2 py-3 rounded-xl overflow-hidden text-xs font-bold text-white active:scale-[0.98]">
                  <span className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#833ab4,#fd1d1d)' }} />
                  <span className="relative flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5" /> Tekrar Dene</span>
                </button>
                <button onClick={() => setPhase('no-session')}
                  className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-muted-foreground active:scale-[0.98]">
                  Geri
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Ana Uygulama ─────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<IgUser | null | undefined>(undefined);

  useEffect(() => { getCachedUser().then((u) => setUser(u ?? null)); }, []);

  useEffect(() => {
    const id = setInterval(async () => {
      const has = await hasSession();
      if (!has) { await clearCachedUser(); setUser(null); }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const h = (msg: { type: string; user?: IgUser }) => {
      if (msg.type === 'IG_USER_UPDATED' && msg.user) setUser(msg.user);
    };
    chrome.runtime.onMessage.addListener(h);
    return () => chrome.runtime.onMessage.removeListener(h);
  }, []);

  if (user === undefined) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl blur-lg opacity-40"
              style={{ background: 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)' }} />
            <div className="relative w-12 h-12 rounded-2xl bg-card border border-white/10 flex items-center justify-center">
              <Instagram className="w-6 h-6 text-white" />
            </div>
          </div>
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <ConnectPage onConnected={setUser} />
        <Toaster theme="dark" position="top-center" />
      </>
    );
  }

  const logout = async () => { await clearCachedUser(); setUser(null); };

  return (
    <WouterRouter hook={useHashLocation}>
      <div className="flex flex-col h-[100dvh] bg-background">
        <TopHeader user={user} onLogout={logout} />
        <div className="flex-1 overflow-hidden min-h-0 relative">
          <Switch>
            <Route path="/"           component={() => <Redirect to="/dashboard" />} />
            <Route path="/dashboard"  component={() => <DashboardPage user={user} onLogout={logout} />} />
            <Route path="/feed"       component={() => <FeedPage user={user} />} />
            <Route path="/automation" component={() => <AutomationPage />} />
            <Route component={NotFound} />
          </Switch>
        </div>
        <BottomNav />
      </div>
      <Toaster theme="dark" position="top-center" richColors />
    </WouterRouter>
  );
}
