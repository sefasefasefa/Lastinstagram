import { useEffect, useState, useCallback, useRef } from 'react';
import { Route, Switch, Redirect } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { Router as WouterRouter } from 'wouter';
import { Toaster } from 'sonner';
import { getCachedUser, clearCachedUser, hasSession, type IgUser } from '@/lib/ig-api';
import DashboardPage from '@/pages/dashboard';
import NotFound from '@/pages/not-found';

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
  const [phase, setPhase] = useState<'checking' | 'waiting' | 'connecting'>('checking');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const attemptRef = useRef(0);

  const tryConnect = useCallback(async () => {
    const has = await hasSession();
    if (!has) {
      setPhase('waiting');
      return;
    }

    setPhase('connecting');

    // Storage'da hazır veri var mı?
    const cached = await getCachedUser();
    if (cached) {
      if (pollRef.current) clearInterval(pollRef.current);
      onConnected(cached);
      return;
    }

    // 3 denemeden sonra (≈6 sn) content script'i beklemek yerine
    // aktif olarak background→content script üzerinden veri çek
    attemptRef.current += 1;
    if (attemptRef.current >= 3) {
      attemptRef.current = 0; // sıfırla, tekrar deneyecek
      try {
        const { igApi } = await import('@/lib/ig-api');
        const data = await igApi<{ user?: import('@/lib/ig-api').IgUser }>(
          '/api/v1/accounts/current_user/?edit=true',
        );
        const user = (data as Record<string, unknown>)?.['user'] as import('@/lib/ig-api').IgUser | undefined;
        if (user?.pk) {
          if (pollRef.current) clearInterval(pollRef.current);
          onConnected(user);
          return;
        }
      } catch (_) {
        // background/content-script hazır değil, bir sonraki döngüde tekrar denenecek
      }
    }
  }, [onConnected]);

  // İlk kontrol
  useEffect(() => { void tryConnect(); }, [tryConnect]);

  // Her 2 sn'de bir storage'ı kontrol et
  useEffect(() => {
    pollRef.current = setInterval(() => void tryConnect(), 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [tryConnect]);

  // Background'dan anlık push mesajı gelirse hemen bağlan
  useEffect(() => {
    const handler = (msg: { type: string; user?: IgUser }) => {
      if (msg.type === 'IG_USER_UPDATED' && msg.user) {
        if (pollRef.current) clearInterval(pollRef.current);
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
              {phase === 'connecting' && 'Instagram verisi bekleniyor…'}
              {phase === 'waiting' && 'Instagram\'a giriş yapmanızı bekliyorum'}
            </p>
          </div>
        </div>

        {(phase === 'checking' || phase === 'connecting') && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            {phase === 'connecting' && (
              <div className="rounded-xl border border-border bg-card p-4 text-left space-y-2 w-full">
                <p className="text-xs text-muted-foreground">
                  ✅ Instagram oturumu tespit edildi
                </p>
                <p className="text-xs text-muted-foreground">
                  ⏳ instagram.com sekmesinden veri bekleniyor…
                </p>
                <p className="text-xs text-muted-foreground font-medium text-foreground mt-1">
                  instagram.com açık değilse aşağıdan açın:
                </p>
              </div>
            )}
          </div>
        )}

        {phase === 'waiting' && (
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
      if (u) { setUser(u); return; }
      // Yoksa ve session da yoksa → login sayfası
      hasSession().then((has) => setUser(has ? null : null));
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

  return (
    <WouterRouter hook={useHashLocation}>
      <Switch>
        <Route path="/" component={() => <Redirect to="/dashboard" />} />
        <Route path="/dashboard" component={() => (
          <DashboardPage
            user={user}
            onLogout={async () => { await clearCachedUser(); setUser(null); }}
          />
        )} />
        <Route component={NotFound} />
      </Switch>
      <Toaster />
    </WouterRouter>
  );
}
