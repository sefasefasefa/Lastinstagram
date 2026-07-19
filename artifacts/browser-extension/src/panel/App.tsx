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
  ArrowRight, BadgeCheck, RefreshCw, AlertCircle, CheckCircle2,
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
    <nav className="flex bg-card/90 backdrop-blur-xl border-t border-white/5 h-[60px] flex-shrink-0 relative z-50 px-3 pb-[env(safe-area-inset-bottom)]">
      {tabs.map(({ href, label, icon: Icon, active }) => (
        <Link
          key={href}
          href={href}
          className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-wider uppercase transition-all duration-200 rounded-xl mx-0.5 ${
            active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className={`relative flex items-center justify-center w-8 h-7 rounded-lg transition-all duration-200 ${
            active ? 'bg-primary/15' : ''
          }`}>
            <Icon className={`w-[15px] h-[15px] transition-all duration-200 ${active ? 'drop-shadow-[0_0_6px_rgba(225,48,108,0.6)]' : ''}`} />
            {active && (
              <motion.div
                layoutId="nav-pill"
                className="absolute inset-0 rounded-lg bg-primary/10 border border-primary/20"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
          </div>
          <span className={active ? 'text-primary' : ''}>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

// ─── Üst Başlık ───────────────────────────────────────────────────────────────
function TopHeader({ user, onLogout }: { user: IgUser; onLogout: () => void }) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-card/80 backdrop-blur-xl border-b border-white/5 flex-shrink-0 z-50 relative">
      <div className="flex items-center gap-3">
        {imgErr || !user.profile_pic_url ? (
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm shadow-inner">
            {user.username[0]?.toUpperCase()}
          </div>
        ) : (
          <img
            src={user.profile_pic_url}
            alt={user.username}
            className="w-8 h-8 rounded-xl object-cover ring-1 ring-primary/20 shadow-sm"
            onError={() => setImgErr(true)}
          />
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-semibold tracking-tight text-foreground flex items-center gap-1.5 truncate">
            {user.username}
            {user.is_verified && <BadgeCheck className="w-3 h-3 text-blue-400 flex-shrink-0" />}
          </span>
          <span className="text-[9px] font-mono text-primary/80 tracking-widest uppercase">
            Oturum Aktif
          </span>
        </div>
      </div>

      {/* Sağ: logo + çıkış */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center">
          <Instagram className="w-3.5 h-3.5 text-primary opacity-70" />
        </div>
        <button
          onClick={onLogout}
          className="p-1.5 text-muted-foreground hover:text-white hover:bg-white/8 rounded-lg transition-all border border-transparent hover:border-white/10 active:scale-95"
          title="Oturumu Kapat"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}

// ─── Bağlantı sayfası ─────────────────────────────────────────────────────────
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
      throw new Error('Kullanıcı verisi alınamadı: ' + JSON.stringify(raw).slice(0, 100));
    } catch (err) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [onConnected]);

  useEffect(() => {
    hasSession().then((has) => {
      if (!has) { setPhase('no-session'); return; }
      void doFetch();
    });
  }, [doFetch]);

  useEffect(() => {
    const handler = (msg: { type: string; user?: IgUser }) => {
      if (msg.type === 'IG_USER_UPDATED' && msg.user) onConnected(msg.user);
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [onConnected]);

  const openInstagram = () => chrome.tabs.create({ url: 'https://www.instagram.com/' });

  const steps = [
    { n: '01', text: 'Instagram sekmesini açın' },
    { n: '02', text: 'Hesabınıza giriş yapın' },
    { n: '03', text: 'Bu sayfaya geri dönün' },
  ];

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
          <Instagram className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-[13px] font-bold text-foreground leading-tight">Takipçi Paneli</h1>
          <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">Instagram Yönetim</p>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-[360px]"
        >
          {/* Loading / Fetching */}
          <AnimatePresence mode="wait">
            {(phase === 'checking' || phase === 'fetching') && (
              <motion.div
                key="loading"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="flex flex-col items-center gap-5 py-12"
              >
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-card border border-white/10 flex items-center justify-center shadow-lg">
                    <Instagram className="w-8 h-8 text-primary" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-background rounded-full flex items-center justify-center border border-white/10">
                    <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                  </div>
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {phase === 'checking' ? 'Oturum kontrol ediliyor…' : 'Kullanıcı bilgileri alınıyor…'}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                    {phase === 'checking' ? 'Lütfen bekleyin' : 'Instagram ile bağlanılıyor'}
                  </p>
                </div>
              </motion.div>
            )}

            {/* No session */}
            {phase === 'no-session' && (
              <motion.div
                key="no-session"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="space-y-5"
              >
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-card border border-white/10 flex items-center justify-center mx-auto shadow-lg mb-4">
                    <Instagram className="w-7 h-7 text-primary drop-shadow-[0_0_10px_rgba(225,48,108,0.4)]" />
                  </div>
                  <h2 className="text-base font-bold text-foreground">Giriş Gerekli</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Paneli kullanmak için Chrome'da Instagram oturumunun açık olması gerekir.
                  </p>
                </div>

                <div className="bg-card/60 border border-white/8 rounded-2xl p-4 space-y-3">
                  <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Nasıl yapılır</p>
                  {steps.map(({ n, text }) => (
                    <div key={n} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center text-[10px] font-mono font-bold text-primary flex-shrink-0">
                        {n}
                      </div>
                      <p className="text-xs text-muted-foreground">{text}</p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={openInstagram}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition-all shadow-[0_4px_20px_rgba(225,48,108,0.2)] hover:shadow-[0_4px_25px_rgba(225,48,108,0.35)] active:scale-[0.98]"
                  >
                    <Instagram className="w-3.5 h-3.5" /> Instagram'ı Aç <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { setPhase('checking'); void doFetch(); }}
                    className="px-4 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-muted-foreground transition-all active:scale-[0.98]"
                    title="Oturumu kontrol et"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Error */}
            {phase === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="space-y-4"
              >
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="w-7 h-7 text-destructive" />
                  </div>
                  <h2 className="text-sm font-bold text-foreground">Bağlantı Hatası</h2>
                  <p className="text-[10px] text-muted-foreground">Kullanıcı bilgileri alınamadı.</p>
                </div>

                <div className="bg-destructive/5 border border-destructive/15 rounded-xl p-3">
                  <p className="text-[9px] font-mono text-destructive/70 uppercase tracking-widest mb-1.5">Hata Detayı</p>
                  <p className="text-[10px] font-mono text-muted-foreground break-all leading-relaxed">{errorMsg}</p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={doFetch}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition-all active:scale-[0.98]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Tekrar Dene
                  </button>
                  <button
                    onClick={() => setPhase('no-session')}
                    className="px-4 flex items-center justify-center py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-muted-foreground transition-all active:scale-[0.98]"
                  >
                    Geri
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Ana uygulama ─────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<IgUser | null | undefined>(undefined);

  useEffect(() => {
    getCachedUser().then((u) => setUser(u ?? null));
  }, []);

  // Oturum kapandığında (sessionid cookie silindi) kullanıcıyı çıkar
  useEffect(() => {
    const id = setInterval(async () => {
      const has = await hasSession();
      if (!has) { await clearCachedUser(); setUser(null); }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Background'dan kullanıcı güncellemelerini dinle
  useEffect(() => {
    const handler = (msg: { type: string; user?: IgUser }) => {
      if (msg.type === 'IG_USER_UPDATED' && msg.user) setUser(msg.user);
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  // İlk yükleme
  if (user === undefined) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-card border border-white/10 flex items-center justify-center shadow-lg">
            <Instagram className="w-6 h-6 text-primary" />
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
            <Route path="/" component={() => <Redirect to="/dashboard" />} />
            <Route path="/dashboard" component={() => <DashboardPage user={user} onLogout={logout} />} />
            <Route path="/feed" component={() => <FeedPage user={user} />} />
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
