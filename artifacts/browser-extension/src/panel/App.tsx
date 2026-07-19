import { useEffect, useState, useCallback } from 'react';
import { Route, Switch, Redirect, Link, useRoute } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { Router as WouterRouter } from 'wouter';
import { Toaster } from 'sonner';
import { igApi, getCachedUser, clearCachedUser, hasSession, normalizeIgUser, type IgUser } from '@/lib/ig-api';
import DashboardPage from '@/pages/dashboard';
import FeedPage from '@/pages/feed';
import NotFound from '@/pages/not-found';

// ─── Alt navigasyon ───────────────────────────────────────────────────────────
function BottomNav() {
  const [isDashboard] = useRoute('/dashboard');
  const [isFeed] = useRoute('/feed');

  return (
    <nav className="flex border-t border-border bg-background h-14 flex-shrink-0">
      <Link
        href="/dashboard"
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-xs transition-colors ${isDashboard ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span>Takip</span>
      </Link>
      <Link
        href="/feed"
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-xs transition-colors ${isFeed ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        <span>Akış</span>
      </Link>
    </nav>
  );
}

function IgLogo() {
  return (
    <svg className="w-16 h-16" viewBox="0 0 32 32" fill="none">
      <defs>
        <radialGradient id="ig-g" cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#fdf497" />
          <stop offset="5%" stopColor="#fdf497" />
          <stop offset="45%" stopColor="#fd5949" />
          <stop offset="60%" stopColor="#d6249f" />
          <stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#ig-g)" />
      <rect x="9" y="9" width="14" height="14" rx="4.5" stroke="white" strokeWidth="2" fill="none" />
      <circle cx="16" cy="16" r="3.5" stroke="white" strokeWidth="2" />
      <circle cx="23" cy="9" r="1.2" fill="white" />
    </svg>
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
      // Instagram bazı durumlarda user nesnesini doğrudan, bazı durumlarda {user:{...}} içinde döndürür.
      // Ayrıca pk yerine fbid_v2 kullanabilir — normalizeIgUser her iki durumu da karşılar.
      const rawObj = raw as Record<string, unknown>;
      const rawUser = (rawObj?.['user'] ?? rawObj) as Record<string, unknown>;
      const user = normalizeIgUser(rawUser);
      if (user) {
        chrome.storage.local.set({ igUser: user, igUserTs: Date.now() });
        onConnected(user);
        return;
      }
      throw new Error('Kullanıcı verisi boş döndü — yanıt: ' + JSON.stringify(raw).slice(0, 120));
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

  // Cookie izle — login olunca otomatik dene
  useEffect(() => {
    const handler = (msg: { type: string; user?: IgUser }) => {
      if (msg.type === 'IG_USER_UPDATED' && msg.user) {
        onConnected(msg.user);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [onConnected]);

  const openInstagram = () => chrome.tabs.create({ url: 'https://www.instagram.com/' });

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="w-[380px] max-w-full space-y-6 text-center">

        <div className="flex flex-col items-center gap-3">
          <IgLogo />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Takipçi Paneli</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {phase === 'checking' && 'Oturum kontrol ediliyor…'}
              {phase === 'fetching' && 'Instagram verisi alınıyor…'}
              {phase === 'no-session' && 'Instagram\'a giriş yapmanızı bekliyorum'}
              {phase === 'error' && 'Bağlantı hatası'}
            </p>
          </div>
        </div>

        {(phase === 'checking' || phase === 'fetching') && (
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
        )}

        {phase === 'error' && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-left space-y-3">
            <p className="text-xs text-destructive font-medium">Hata detayı:</p>
            <p className="text-xs text-muted-foreground break-all">{errorMsg}</p>
            <button
              onClick={doFetch}
              className="w-full rounded-lg py-2 text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Tekrar Dene
            </button>
          </div>
        )}

        {phase === 'no-session' && (
          <div className="rounded-xl border border-border bg-card p-5 text-left space-y-4">
            {[
              'Aşağıdaki butona tıklayın',
              'Instagram hesabınıza giriş yapın',
              'Bu sekmeye dönün — otomatik devreye girer',
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</div>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={openInstagram}
          className="w-full rounded-xl py-3 text-sm font-semibold bg-gradient-to-r from-[#d6249f] via-[#fd5949] to-[#fdf497] text-white hover:opacity-90 transition-opacity"
        >
          Instagram'ı Aç →
        </button>
      </div>
    </div>
  );
}

// ─── Ana uygulama ─────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<IgUser | null | undefined>(undefined);

  useEffect(() => {
    // Storage'da daha önce kaydedilmiş kullanıcı var mı?
    getCachedUser().then((u) => {
      setUser(u ?? null);
    });
  }, []);

  // Cookie silinirse oturumu kapat
  useEffect(() => {
    const id = setInterval(async () => {
      const has = await hasSession();
      if (!has) {
        await clearCachedUser();
        setUser(null);
      }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Background'dan kullanıcı güncellemesi gelirse uygula
  useEffect(() => {
    const handler = (msg: { type: string; user?: IgUser }) => {
      if (msg.type === 'IG_USER_UPDATED' && msg.user) {
        setUser(msg.user);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  if (user === undefined) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <ConnectPage onConnected={setUser} />
        <Toaster />
      </>
    );
  }

  const logout = async () => { await clearCachedUser(); setUser(null); };

  return (
    <WouterRouter hook={useHashLocation}>
      <div className="flex flex-col h-[100dvh]">
        {/* Sayfa içeriği */}
        <div className="flex-1 overflow-hidden min-h-0">
          <Switch>
            <Route path="/" component={() => <Redirect to="/dashboard" />} />
            <Route path="/dashboard" component={() => (
              <DashboardPage user={user} onLogout={logout} />
            )} />
            <Route path="/feed" component={() => <FeedPage user={user} />} />
            <Route component={NotFound} />
          </Switch>
        </div>

        {/* Alt navigasyon */}
        <BottomNav />
      </div>
      <Toaster />
    </WouterRouter>
  );
}
