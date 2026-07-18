import { useEffect, useState, useCallback, useRef } from 'react';
import { Route, Switch, Redirect } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { Router as WouterRouter } from 'wouter';
import { Toaster } from 'sonner';
import { getCurrentUser, hasSession, type IgUser } from '@/lib/ig-api';
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

// ─── Bağlantı sayfası ────────────────────────────────────────────────────────
const MAX_API_RETRIES = 15; // ~45 saniye

function ConnectPage({ onConnected }: { onConnected: (user: IgUser) => void }) {
  const [phase, setPhase] = useState<'checking' | 'waiting' | 'connecting' | 'error'>('checking');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const apiRetries = useRef(0);

  const tryConnect = useCallback(async () => {
    const has = await hasSession();
    if (!has) {
      // Oturum yok — kullanıcıdan giriş yapmasını iste
      apiRetries.current = 0;
      setPhase('waiting');
      return;
    }

    // Cookie var — API'yi dene
    setPhase('connecting');
    apiRetries.current += 1;

    try {
      const user = await getCurrentUser();
      if (user) {
        if (pollRef.current) clearInterval(pollRef.current);
        onConnected(user);
        return;
      }
      // null döndü (beklenmedik)
      if (apiRetries.current >= MAX_API_RETRIES) {
        setPhase('error');
        setErrorMsg('Profil bilgisi alınamadı (null). Instagram sekmesinin yüklü olduğundan emin ol.');
      }
      // else: poll devam eder
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (apiRetries.current >= MAX_API_RETRIES) {
        setPhase('error');
        setErrorMsg(`Hata (${apiRetries.current} deneme): ${msg}`);
      }
      // else: sessizce tekrar dene — tab henüz yüklenmiyor olabilir
    }
  }, [onConnected]);

  // Başlangıç kontrolü
  useEffect(() => { void tryConnect(); }, [tryConnect]);

  // Her 3 sn'de bir dene (waiting veya connecting aşamalarında)
  useEffect(() => {
    if (phase === 'error') {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(() => void tryConnect(), 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [phase, tryConnect]);

  const openInstagram = () => chrome.tabs.create({ url: 'https://www.instagram.com/' });

  const retry = () => {
    apiRetries.current = 0;
    setErrorMsg(null);
    setPhase('checking');
    void tryConnect();
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="w-[380px] max-w-full space-y-6 text-center">

        <div className="flex flex-col items-center gap-3">
          <IgLogo />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Takipçi Paneli</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {phase === 'checking' && 'Oturum kontrol ediliyor…'}
              {phase === 'connecting' && `Bağlanıyor… (${apiRetries.current}/${MAX_API_RETRIES})`}
              {phase === 'waiting' && 'Instagram\'a giriş yapmanızı bekliyorum'}
              {phase === 'error' && 'Bağlantı başarısız'}
            </p>
          </div>
        </div>

        {(phase === 'checking' || phase === 'connecting') && (
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            {phase === 'connecting' && (
              <p className="text-xs text-muted-foreground">
                Instagram sekmesi açık olmalı — açık değilse aşağıdan aç
              </p>
            )}
          </div>
        )}

        {(phase === 'waiting' || phase === 'connecting') && (
          <button
            onClick={openInstagram}
            className="w-full rounded-xl py-3 text-sm font-semibold bg-gradient-to-r from-[#d6249f] via-[#fd5949] to-[#fdf497] text-white hover:opacity-90 transition-opacity"
          >
            Instagram'ı Aç →
          </button>
        )}

        {phase === 'waiting' && (
          <div className="rounded-xl border border-border bg-card p-4 text-left space-y-3">
            {['Instagram\'a giriş yap', 'Bu sekmeye dön — otomatik devreye girer'].map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</div>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        )}

        {phase === 'error' && (
          <div className="space-y-3">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-left">
              <p className="text-xs text-destructive font-mono break-all">{errorMsg}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={retry} className="flex-1 text-sm py-2 rounded-lg border border-border hover:bg-muted transition-colors">
                Tekrar dene
              </button>
              <button onClick={openInstagram} className="flex-1 text-sm py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                Instagram'ı Aç
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Ana uygulama ─────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<IgUser | null | undefined>(undefined);

  useEffect(() => {
    getCurrentUser()
      .then((u) => setUser(u ?? null))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    const id = setInterval(async () => {
      const has = await hasSession();
      if (!has) setUser(null);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  if (user === undefined) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (user === null) {
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
        <Route path="/dashboard" component={() => <DashboardPage user={user} onLogout={() => setUser(null)} />} />
        <Route component={NotFound} />
      </Switch>
      <Toaster />
    </WouterRouter>
  );
}
