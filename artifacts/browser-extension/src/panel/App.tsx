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
import { motion } from 'framer-motion';
import { Users, Layers, Settings2, Instagram, LogOut, Loader2, ArrowRight, BadgeCheck, RefreshCw } from 'lucide-react';

// ─── Alt navigasyon ───────────────────────────────────────────────────────────
function BottomNav() {
  const [isDashboard] = useRoute('/dashboard');
  const [isFeed] = useRoute('/feed');
  const [isAutomation] = useRoute('/automation');

  return (
    <nav className="flex bg-card/80 backdrop-blur-xl border-t border-white/5 h-[64px] flex-shrink-0 relative z-50 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.5)]">
      <Link
        href="/dashboard"
        className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-mono tracking-widest uppercase transition-all duration-300 ${isDashboard ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <Users className={`w-4 h-4 transition-all duration-300 ${isDashboard ? 'drop-shadow-[0_0_8px_rgba(225,48,108,0.5)] scale-110' : ''}`} />
        <span>Takip</span>
      </Link>
      <Link
        href="/feed"
        className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-mono tracking-widest uppercase transition-all duration-300 ${isFeed ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <Layers className={`w-4 h-4 transition-all duration-300 ${isFeed ? 'drop-shadow-[0_0_8px_rgba(225,48,108,0.5)] scale-110' : ''}`} />
        <span>Akış</span>
      </Link>
      <Link
        href="/automation"
        className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-mono tracking-widest uppercase transition-all duration-300 ${isAutomation ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <Settings2 className={`w-4 h-4 transition-all duration-300 ${isAutomation ? 'drop-shadow-[0_0_8px_rgba(225,48,108,0.5)] scale-110' : ''}`} />
        <span>Otomasyon</span>
      </Link>
    </nav>
  );
}

// ─── Üst Başlık ───────────────────────────────────────────────────────────────
function TopHeader({ user, onLogout }: { user: IgUser; onLogout: () => void }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <header className="flex items-center justify-between px-5 py-3.5 bg-card/80 backdrop-blur-xl border-b border-white/5 flex-shrink-0 z-50 relative shadow-md">
      <div className="flex items-center gap-3">
        {imgErr || !user.profile_pic_url ? (
          <div className="w-9 h-9 rounded-lg bg-card border border-white/10 flex items-center justify-center text-foreground font-semibold shadow-inner">
            {user.username[0]?.toUpperCase()}
          </div>
        ) : (
          <img
            src={user.profile_pic_url}
            alt={user.username}
            className="w-9 h-9 rounded-lg object-cover shadow-sm ring-1 ring-white/10"
            onError={() => setImgErr(true)}
          />
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-semibold tracking-tight text-foreground flex items-center gap-1.5 truncate">
            {user.username}
            {user.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
          </span>
          <span className="text-[9px] font-mono text-primary tracking-widest uppercase mt-0.5">Active Operator</span>
        </div>
      </div>
      <button
        onClick={onLogout}
        className="p-2 text-muted-foreground hover:text-white hover:bg-white/5 rounded-lg transition-all border border-transparent hover:border-white/10 active:scale-95"
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
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-[380px] max-w-full relative z-10"
      >
        <div className="p-8 rounded-2xl bg-card/60 backdrop-blur-xl border border-white/5 shadow-2xl flex flex-col items-center text-center space-y-8 relative overflow-hidden">
          {/* Glass glare */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          
          <div className="w-14 h-14 rounded-xl bg-card border border-white/5 flex items-center justify-center shadow-lg shadow-black/50">
            <Instagram className="w-7 h-7 text-primary drop-shadow-[0_0_10px_rgba(225,48,108,0.5)]" />
          </div>
          
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Nexus Control</h1>
            <p className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase">
              {phase === 'checking' && 'Initializing secure uplink...'}
              {phase === 'fetching' && 'Retrieving operator payload...'}
              {phase === 'no-session' && 'Awaiting operator authentication'}
              {phase === 'error' && 'Connection sequence failed'}
            </p>
          </div>

          {(phase === 'checking' || phase === 'fetching') && (
            <div className="py-6">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          )}

          {phase === 'error' && (
            <div className="w-full space-y-4">
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-left shadow-inner">
                <p className="text-[9px] font-mono text-destructive mb-1 uppercase tracking-widest">Error Trace</p>
                <p className="text-[10px] text-muted-foreground font-mono break-all leading-relaxed">{errorMsg}</p>
              </div>
              <button
                onClick={doFetch}
                className="w-full flex items-center justify-center gap-2 rounded-lg py-3 text-xs font-semibold bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all active:scale-[0.98]"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry Connection
              </button>
            </div>
          )}

          {phase === 'no-session' && (
            <div className="w-full space-y-5">
              <div className="rounded-lg bg-white/5 border border-white/10 p-4 text-left space-y-3 shadow-inner">
                {[
                  'Initialize Instagram session',
                  'Authenticate operator account',
                  'Return to command center',
                ].map((text, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-md bg-primary/20 text-primary flex items-center justify-center text-[9px] font-mono font-bold flex-shrink-0 border border-primary/20">
                      0{i + 1}
                    </div>
                    <p className="text-xs font-medium text-muted-foreground">{text}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={openInstagram}
                className="w-full relative group flex items-center justify-center gap-2 rounded-lg py-3.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground transition-all shadow-[0_0_15px_rgba(225,48,108,0.2)] hover:shadow-[0_0_25px_rgba(225,48,108,0.4)] active:scale-[0.98] overflow-hidden"
              >
                <div className="absolute top-0 inset-x-0 h-[1px] bg-white/30" />
                Launch Instagram <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
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
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
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
            <Route path="/automation" component={() => <AutomationPage />} />
            <Route component={NotFound} />
          </Switch>
        </div>

        <BottomNav />
      </div>
      <Toaster theme="dark" position="top-center" />
    </WouterRouter>
  );
}
