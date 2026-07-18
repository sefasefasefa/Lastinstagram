import { useEffect, useState, useCallback } from 'react';
import { Route, Switch, Redirect } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useGetMe } from '@workspace/api-client-react';
import DashboardPage from '@/pages/dashboard';
import RequestSettingsPage from '@/pages/request-settings';
import NotFound from '@/pages/not-found';

// ─── Instagram logo ─────────────────────────────────────────────────────────────
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

// ─── Auto-connect page ──────────────────────────────────────────────────────────
// Reads the instagram.com sessionid cookie and sends it to the backend.
// No credentials ever entered manually.
function ConnectPage() {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<'checking' | 'connecting' | 'waiting' | 'error'>('checking');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const tryConnect = useCallback(async (): Promise<boolean> => {
    try {
      const cookie = await chrome.cookies.get({
        url: 'https://www.instagram.com',
        name: 'sessionid',
      });

      if (!cookie?.value) {
        setPhase('waiting');
        return false;
      }

      setPhase('connecting');

      const res = await fetch('/api/auth/login-with-cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionCookie: cookie.value }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setErrorMsg(body.error ?? 'Bağlantı başarısız.');
        setPhase('error');
        return false;
      }

      // Success — invalidate so HomeRedirect re-checks /api/auth/me
      await queryClient.invalidateQueries();
      return true;
    } catch {
      setPhase('waiting');
      return false;
    }
  }, [queryClient]);

  // First check on mount
  useEffect(() => { void tryConnect(); }, [tryConnect]);

  // Poll every 3 s while waiting for the user to log in on instagram.com
  useEffect(() => {
    if (phase !== 'waiting') return;
    const id = setInterval(() => void tryConnect(), 3000);
    return () => clearInterval(id);
  }, [phase, tryConnect]);

  const openInstagram = () =>
    chrome.tabs.create({ url: 'https://www.instagram.com/accounts/login/' });

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="w-[380px] max-w-full space-y-6 text-center">

        {/* Logo + title */}
        <div className="flex flex-col items-center gap-3">
          <IgLogo />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Takipçi Paneli</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {phase === 'checking' && 'Instagram oturumu kontrol ediliyor…'}
              {phase === 'connecting' && 'Bağlanıyor…'}
              {phase === 'waiting' && 'Instagram\'a giriş yapmanızı bekliyorum'}
              {phase === 'error' && 'Bağlantı hatası'}
            </p>
          </div>
        </div>

        {/* Spinner */}
        {(phase === 'checking' || phase === 'connecting') && (
          <div className="flex justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        )}

        {/* Waiting — show steps + button */}
        {phase === 'waiting' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 text-left space-y-4">
              {[
                'Aşağıdaki butona tıklayın',
                'Instagram hesabınıza normal şekilde giriş yapın',
                'Bu sekmeye dönün — sistem otomatik başlayacak',
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

        {/* Error */}
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

// ─── Route guards ───────────────────────────────────────────────────────────────
function HomeRedirect() {
  const { data: me, isPending } = useGetMe();
  if (isPending) return null;
  return me ? <Redirect to="/dashboard" /> : <Redirect to="/connect" />;
}

function ConnectRoute() {
  const { data: me, isPending } = useGetMe();
  if (isPending) return null;
  if (me) return <Redirect to="/dashboard" />;
  return <ConnectPage />;
}

function DashboardRoute() {
  const { data: me, isPending } = useGetMe();
  if (isPending) return null;
  if (!me) return <Redirect to="/connect" />;
  return <DashboardPage />;
}

function RequestSettingsRoute() {
  const { data: me, isPending } = useGetMe();
  if (isPending) return null;
  if (!me) return <Redirect to="/connect" />;
  return <RequestSettingsPage />;
}

// ─── App ────────────────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter hook={useHashLocation}>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/connect" component={ConnectRoute} />
          <Route path="/dashboard" component={DashboardRoute} />
          <Route path="/request-settings" component={RequestSettingsRoute} />
          <Route component={NotFound} />
        </Switch>
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
