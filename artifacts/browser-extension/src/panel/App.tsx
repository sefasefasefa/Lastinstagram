import { useState } from 'react';
import { Route, Switch, Redirect } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useGetMe } from '@workspace/api-client-react';
import LoginPage from '@/pages/login';
import DashboardPage from '@/pages/dashboard';
import RequestSettingsPage from '@/pages/request-settings';
import NotFound from '@/pages/not-found';

// ─── Setup screen ─────────────────────────────────────────────────────────────
function SetupPage({ onSave }: { onSave: (url: string) => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  function handleSave() {
    const trimmed = url.trim();
    if (!trimmed) { setError('URL boş olamaz'); return; }
    try { new URL(trimmed); } catch { setError('Geçersiz URL'); return; }
    onSave(trimmed);
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-5">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <svg className="w-14 h-14" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="ig-g" cx="30%" cy="107%" r="150%">
                <stop offset="0%" stopColor="#fdf497"/>
                <stop offset="5%" stopColor="#fdf497"/>
                <stop offset="45%" stopColor="#fd5949"/>
                <stop offset="60%" stopColor="#d6249f"/>
                <stop offset="90%" stopColor="#285AEB"/>
              </radialGradient>
            </defs>
            <rect width="32" height="32" rx="8" fill="url(#ig-g)"/>
            <rect x="9" y="9" width="14" height="14" rx="4.5" stroke="white" strokeWidth="2" fill="none"/>
            <circle cx="16" cy="16" r="3.5" stroke="white" strokeWidth="2"/>
            <circle cx="23" cy="9" r="1.2" fill="white"/>
          </svg>
          <div className="text-center">
            <h1 className="text-xl font-semibold">Takipçi Paneli</h1>
            <p className="text-sm text-muted-foreground mt-1">Panel sunucu adresini girin</p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-3">
          <input
            className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="https://xxxx.replit.app"
            value={url}
            onChange={e => { setUrl(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            className="w-full rounded-md px-3 py-2 text-sm font-medium bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white hover:opacity-90 transition-opacity"
            onClick={handleSave}
          >
            Kaydet ve Bağlan
          </button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Replit'te çalışan panel'in URL'si (örn. https://takipci-paneli.kullanici.replit.app)
        </p>
      </div>
    </div>
  );
}

// ─── Auth-aware route wrappers ─────────────────────────────────────────────────
function HomeRedirect() {
  const { data: me, isPending } = useGetMe();
  if (isPending) return null;
  return me ? <Redirect to="/dashboard" /> : <Redirect to="/login" />;
}

function LoginRoute() {
  const { data: me, isPending } = useGetMe();
  if (isPending) return null;
  if (me) return <Redirect to="/dashboard" />;
  return <LoginPage />;
}

function DashboardRoute() {
  const { data: me, isPending } = useGetMe();
  if (isPending) return null;
  if (!me) return <Redirect to="/login" />;
  return <DashboardPage />;
}

function RequestSettingsRoute() {
  const { data: me, isPending } = useGetMe();
  if (isPending) return null;
  if (!me) return <Redirect to="/login" />;
  return <RequestSettingsPage />;
}

// ─── Main app ──────────────────────────────────────────────────────────────────
interface AppProps {
  panelUrl: string;
  onChangePanelUrl: (url: string) => void;
}

// One QueryClient per app mount — survives route changes, resets on URL change
// (we reload the page when URL changes, so this is fine).
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

export default function App({ panelUrl, onChangePanelUrl }: AppProps) {
  if (!panelUrl) {
    return <SetupPage onSave={onChangePanelUrl} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter hook={useHashLocation}>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/login" component={LoginRoute} />
          <Route path="/dashboard" component={DashboardRoute} />
          <Route path="/request-settings" component={RequestSettingsRoute} />
          <Route component={NotFound} />
        </Switch>
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
