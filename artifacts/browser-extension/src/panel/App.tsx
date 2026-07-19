import { useEffect, useState, useCallback } from 'react';
import { Route, Switch, Redirect, Link, useRoute } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { Router as WouterRouter } from 'wouter';
import { Toaster } from 'sonner';
import { igApi, getCachedUser, clearCachedUser, hasSession, normalizeIgUser, type IgUser } from '@/lib/ig-api';
import DashboardPage from '@/pages/dashboard';
import FeedPage from '@/pages/feed';
import NotFound from '@/pages/not-found';
import { motion } from 'framer-motion';
import { Users, Layers, Instagram, LogOut, Loader2, ArrowRight, BadgeCheck, RefreshCw } from 'lucide-react';

// ─── Alt navigasyon ───────────────────────────────────────────────────────────
function BottomNav() {
  const [isDashboard] = useRoute('/dashboard');
  const [isFeed] = useRoute('/feed');

  return (
    <nav className="flex bg-card/90 backdrop-blur-xl border-t border-white/5 h-[72px] flex-shrink-0 relative z-50 px-2 pb-[env(safe-area-inset-bottom)]">
      <Link
        href="/dashboard"
        className={`flex-1 flex flex-col items-center justify-center gap-1.5 text-[11px] font-bold tracking-widest uppercase transition-all duration-300 ${isDashboard ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <Users className={`w-5 h-5 transition-all duration-300 ${isDashboard ? 'drop-shadow-[0_0_8px_rgba(225,48,108,0.5)] scale-110' : ''}`} />
        <span>Takip</span>
      </Link>
      <Link
        href="/feed"
        className={`flex-1 flex flex-col items-center justify-center gap-1.5 text-[11px] font-bold tracking-widest uppercase transition-all duration-300 ${isFeed ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <Layers className={`w-5 h-5 transition-all duration-300 ${isFeed ? 'drop-shadow-[0_0_8px_rgba(225,48,108,0.5)] scale-110' : ''}`} />
        <span>Akış</span>
      </Link>
    </nav>
  );
}

// ─── Üst Başlık ───────────────────────────────────────────────────────────────
function TopHeader({ user, onLogout }: { user: IgUser; onLogout: () => void }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <header className="flex items-center justify-between px-5 py-4 bg-card/90 backdrop-blur-xl border-b border-white/5 flex-shrink-0 z-50 relative">
      <div className="flex items-center gap-3.5">
        {imgErr || !user.profile_pic_url ? (
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-bold shadow-lg shadow-primary/20">
            {user.username[0]?.toUpperCase()}
          </div>
        ) : (
          <img
            src={user.profile_pic_url}
            alt={user.username}
            className="w-10 h-10 rounded-xl object-cover shadow-lg shadow-primary/20 ring-1 ring-white/10"
            onError={() => setImgErr(true)}
          />
        )}
        <div className="flex flex-col">
          <span className="text-sm font-extrabold tracking-tight text-foreground flex items-center gap-1.5">
            {user.username}
            {user.is_verified && <BadgeCheck className="w-4 h-4 text-blue-400" />}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mt-0.5">Active Operator</span>
        </div>
      </div>
      <button
        onClick={onLogout}
        className="p-2.5 text-muted-foreground hover:text-white hover:bg-white/5 rounded-xl transition-all border border-transparent hover:border-white/10"
        title="Oturumu Kapat"
      >
        <LogOut className="w-4 h-4" />
      </button>
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
      throw new Error('Data payload empty: ' + JSON.stringify(raw).slice(0, 120));
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
      if (msg.type === 'IG_USER_UPDATED' && msg.user) {
        onConnected(msg.user);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [onConnected]);

  const openInstagram = () => chrome.tabs.create({ url: 'https://www.instagram.com/' });

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-[420px] max-w-full relative z-10"
      >
        <div className="p-8 rounded-3xl bg-card/60 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col items-center text-center space-y-8 relative overflow-hidden">
          {/* Glass glare */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-[0_0_30px_rgba(225,48,108,0.3)]">
            <Instagram className="w-8 h-8 text-white" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold tracking-tight">Nexus Control</h1>
            <p className="text-xs text-muted-foreground font-mono tracking-wide uppercase">
              {phase === 'checking' && 'Initializing secure uplink...'}
              {phase === 'fetching' && 'Retrieving operator payload...'}
              {phase === 'no-session' && 'Awaiting operator authentication'}
              {phase === 'error' && 'Connection sequence failed'}
            </p>
          </div>

          {(phase === 'checking' || phase === 'fetching') && (
            <div className="py-6">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}

          {phase === 'error' && (
            <div className="w-full space-y-5">
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-left shadow-inner">
                <p className="text-[10px] font-mono text-destructive mb-1.5 uppercase tracking-widest">Error Trace</p>
                <p className="text-[11px] text-muted-foreground font-mono break-all leading-relaxed">{errorMsg}</p>
              </div>
              <button
                onClick={doFetch}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all active:scale-[0.98]"
              >
                <RefreshCw className="w-4 h-4" /> Retry Connection
              </button>
            </div>
          )}

          {phase === 'no-session' && (
            <div className="w-full space-y-6">
              <div className="rounded-xl bg-white/5 border border-white/10 p-5 text-left space-y-4 shadow-inner">
                {[
                  'Initialize Instagram session',
                  'Authenticate operator account',
                  'Return to command center',
                ].map((text, i) => (
                  <div key={i} className="flex items-center gap-3.5">
                    <div className="w-7 h-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0 border border-primary/20">
                      0{i + 1}
                    </div>
                    <p className="text-[13px] font-medium text-muted-foreground">{text}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={openInstagram}
                className="w-full group flex items-center justify-center gap-2 rounded-xl py-4 text-sm font-extrabold bg-primary hover:bg-primary/90 text-primary-foreground transition-all shadow-[0_0_20px_rgba(225,48,108,0.3)] hover:shadow-[0_0_30px_rgba(225,48,108,0.5)] active:scale-[0.98]"
              >
                Launch Instagram <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Ana uygulama ─────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<IgUser | null | undefined>(undefined);

  useEffect(() => {
    getCachedUser().then((u) => {
      setUser(u ?? null);
    });
  }, []);

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
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <ConnectPage onConnected={setUser} />
        <Toaster theme="dark" />
      </>
    );
  }

  const logout = async () => { await clearCachedUser(); setUser(null); };

  return (
    <WouterRouter hook={useHashLocation}>
      <div className="flex flex-col h-[100dvh] bg-background">
        <TopHeader user={user} onLogout={logout} />
        
        {/* Sayfa içeriği */}
        <div className="flex-1 overflow-hidden min-h-0 relative">
          <Switch>
            <Route path="/" component={() => <Redirect to="/dashboard" />} />
            <Route path="/dashboard" component={() => (
              <DashboardPage user={user} onLogout={logout} />
            )} />
            <Route path="/feed" component={() => <FeedPage user={user} />} />
            <Route component={NotFound} />
          </Switch>
        </div>

        <BottomNav />
      </div>
      <Toaster theme="dark" position="top-center" />
    </WouterRouter>
  );
}
