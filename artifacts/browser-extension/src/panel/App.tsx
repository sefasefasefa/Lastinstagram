import { useEffect, useState, useCallback, useRef } from 'react';
import { Route, Switch, Redirect } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { Router as WouterRouter } from 'wouter';
import { Toaster } from 'sonner';
import { getCurrentUser, hasSession, type IgUser } from '@/lib/ig-api';
import DashboardPage from '@/pages/dashboard';
import NotFound from '@/pages/not-found';

// ─── Instagram logosu ────────────────────────────────────────────────────────
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
// Instagram sessionid cookie'sini bekler; bulunca arka planda doğrular.
function ConnectPage({ onConnected }: { onConnected: (user: IgUser) => void }) {
  const [phase, setPhase] = useState<'checking' | 'waiting' | 'connecting' | 'error'>('checking');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tryConnect = useCallback(async (): Promise<boolean> => {
    const has = await hasSession();
    if (!has) {
      setPhase('waiting');
      return false;
    }

    setPhase('connecting');
    const user = await getCurrentUser();
    if (!user) {
      setPhase('error');
      setErrorMsg("Oturum cookie'si var ama profil bilgisi alınamadı. Bir süre bekleyip tekrar dene.");
      return false;
    }

    onConnected(user);
    return true;
  }, [onConnected]);

  // İlk yüklemede dene
  useEffect(() => {
    void tryConnect();
  }, [tryConnect]);

  // Bekleme aşamasında her 3 saniyede dene
  useEffect(() => {
    if (phase !== 'waiting') {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(() => void tryConnect(), 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [phase, tryConnect]);

  const openInstagram = () =>
    chrome.tabs.create({ url: 'https://www.instagram.com/accounts/login/' });

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="w-[380px] max-w-full space-y-6 text-center">

        <div className="flex flex-col items-center gap-3">
          <IgLogo />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Takipçi Paneli</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {phase === 'checking' && 'Instagram oturumu kontrol ediliyor…'}
              {phase === 'connecting' && 'Profil bilgileri alınıyor…'}
              {phase === 'waiting' && 'Instagram\'a giriş yapmanızı bekliyorum'}
              {phase === 'error' && 'Bağlantı hatası'}
            </p>
          </div>
        </div>

        {(phase === 'checking' || phase === 'connecting') && (
          <div className="flex justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        )}

        {phase === 'waiting' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 text-left space-y-4">
              {[
                'Aşağıdaki butona tıklayın',
                'Instagram hesabınıza normal şekilde giriş yapın',
                'Bu sekmeye dönün — sistem otomatik devreye girer',
              ].map((text, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
            <button
              onClick={openInstagram}
              className="w-full rounded-xl py-3 text-sm font-semibold bg-gradient-to-r from-[#d6249f] via-[#fd5949] to-[#fdf497] text-white hover:opacity-90 transition-opacity"
            >
              Instagram'da Giriş Yap →
            </button>
            <p className="text-xs text-muted-foreground">
              Zaten giriş yaptıysanız birkaç saniye bekleyin
            </p>
          </div>
        )}

        {phase === 'error' && (
          <div className="space-y-3">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-left">
              <p className="text-sm text-destructive">{errorMsg}</p>
            </div>
            <button
              onClick={() => { setPhase('checking'); setErrorMsg(null); void tryConnect(); }}
              className="text-sm text-primary underline underline-offset-2"
            >
              Tekrar dene
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Uygulama ────────────────────────────────────────────────────────────────
export default function App() {
  // undefined = yükleniyor, null = giriş yapılmamış, IgUser = giriş yapılmış
  const [user, setUser] = useState<IgUser | null | undefined>(undefined);

  // Başlangıçta oturum kontrolü
  useEffect(() => {
    getCurrentUser().then((u) => setUser(u ?? null));
  }, []);

  // Cookie silinirse otomatik çıkış
  useEffect(() => {
    const check = async () => {
      const has = await hasSession();
      if (!has) setUser(null);
    };
    // Her 30 saniyede cookie varlığını doğrula
    const id = setInterval(check, 30_000);
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
