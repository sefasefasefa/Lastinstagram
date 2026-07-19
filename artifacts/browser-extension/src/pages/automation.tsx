import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  fetchAutoState,
  updateAutoState,
  clearAutoCache,
  statusLabel,
  AUTO_DEFAULTS,
  type AutoState,
} from '@/lib/automation';
import { motion } from 'framer-motion';
import { Settings2, Clock, Zap, Target, Trash2, Loader2, Activity } from 'lucide-react';

// Debounce helper custom hook (via ref so it doesn't cause stale closures)
function useDebouncedCallback<T extends (...args: any[]) => any>(callback: T, delay: number) {
  const timeoutRef = useRef<number | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }, [delay]);
}

export default function AutomationPage() {
  const [state, setState] = useState<AutoState>(AUTO_DEFAULTS);
  const [loading, setLoading] = useState(true);
  
  // Real-time counter ref to force re-renders for countdowns
  const [, setTick] = useState(0);

  useEffect(() => {
    fetchAutoState().then((res) => {
      setState(res);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const handler = (msg: { type: string }) => {
      if (msg.type === 'IG_AUTO_STATUS') {
        fetchAutoState().then(setState);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const debouncedUpdate = useDebouncedCallback((patch: Partial<AutoState>) => {
    updateAutoState(patch).catch(() => toast.error('Ayarlar kaydedilemedi'));
  }, 300);

  const handleChange = (patch: Partial<AutoState>) => {
    setState((prev) => ({ ...prev, ...patch }));
    debouncedUpdate(patch);
  };

  const handleClearCache = () => {
    clearAutoCache();
    toast.success('Önbellek temizlendi');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  const status = statusLabel(state);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full bg-background text-foreground overflow-y-auto">
      <div className="p-4 space-y-4 pb-24">
        
        {/* STATUS CARD */}
        <div className="bg-card border border-white/5 rounded-xl p-5 relative overflow-hidden shadow-sm">
          {state.enabled && <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-[40px] pointer-events-none" />}
          
          <div className="flex items-start justify-between relative z-10 mb-6">
            <div className="flex flex-col">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <Activity className="w-3 h-3" /> System Status
              </span>
              <div className="flex items-center gap-3">
                {/* Toggle switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={state.enabled}
                  onClick={() => handleChange({ enabled: !state.enabled })}
                  className={`relative w-12 h-6 rounded-full border transition-all duration-300 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                    state.enabled
                      ? 'bg-primary border-primary shadow-[0_0_16px_rgba(225,48,108,0.4)]'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                    state.enabled ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>

                {/* Status badge */}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold tracking-wider uppercase border transition-all ${
                  status.kind === 'active'  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  status.kind === 'backoff' ? 'bg-yellow-500/10  text-yellow-400  border-yellow-500/20'  :
                  status.kind === 'window'  ? 'bg-blue-500/10    text-blue-400    border-blue-500/20'    :
                  'bg-white/5 text-muted-foreground border-white/10'
                }`}>
                  {status.kind === 'active' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-live-ring flex-shrink-0" />
                  )}
                  {status.text}
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-end">
              <span className="text-2xl font-bold font-mono tracking-tight text-foreground">
                {state.todayCount} <span className="text-sm text-muted-foreground font-sans font-normal">/ {state.maxPerDay}</span>
              </span>
              <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mt-0.5">Etkileşim (Bugün)</span>
            </div>
          </div>

          <div className="space-y-2 relative z-10">
            {state.nextRunAt > Date.now() && status.kind === 'active' && (
              <div className="flex items-center justify-between text-xs bg-black/20 rounded-md px-3 py-2 border border-white/5">
                <span className="text-muted-foreground">Sonraki eylem:</span>
                <span className="font-mono text-primary font-medium">{Math.ceil((state.nextRunAt - Date.now()) / 1000)}s</span>
              </div>
            )}
            
            {state.lastActionLabel && (
              <p className="text-[10px] font-mono text-muted-foreground truncate border-l-2 border-white/10 pl-2">
                {">"} {state.lastActionLabel}
              </p>
            )}
          </div>
        </div>

        {/* SETTINGS GROUPS */}
        <div className="space-y-4">
          
          {/* TIME WINDOW */}
          <div className="bg-card border border-white/5 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Çalışma Saatleri
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <input
                  type="number"
                  min="0" max="23"
                  value={state.timeFrom}
                  onChange={(e) => handleChange({ timeFrom: parseInt(e.target.value) || 0 })}
                  className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-center focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">:00</span>
              </div>
              <span className="text-muted-foreground font-mono">→</span>
              <div className="flex-1 relative">
                <input
                  type="number"
                  min="0" max="23"
                  value={state.timeTo}
                  onChange={(e) => handleChange({ timeTo: parseInt(e.target.value) || 0 })}
                  className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-center focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">:00</span>
              </div>
            </div>
          </div>

          {/* DELAY & LIMITS */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card border border-white/5 rounded-xl p-4 shadow-sm flex flex-col">
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
                <Zap className="w-4 h-4 text-muted-foreground" />
                İşlem Aralığı <span className="text-[10px] font-normal text-muted-foreground">(sn)</span>
              </div>
              <div className="flex items-center gap-2 mt-auto">
                <input
                  type="number"
                  min="1"
                  value={state.minDelaySec}
                  onChange={(e) => handleChange({ minDelaySec: parseInt(e.target.value) || 1 })}
                  className="w-full bg-background border border-white/10 rounded-lg px-2 py-2 text-xs font-mono text-center focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all"
                />
                <span className="text-muted-foreground text-xs">-</span>
                <input
                  type="number"
                  min="1"
                  value={state.maxDelaySec}
                  onChange={(e) => handleChange({ maxDelaySec: parseInt(e.target.value) || 1 })}
                  className="w-full bg-background border border-white/10 rounded-lg px-2 py-2 text-xs font-mono text-center focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all"
                />
              </div>
            </div>

            <div className="bg-card border border-white/5 rounded-xl p-4 shadow-sm flex flex-col">
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
                <Target className="w-4 h-4 text-muted-foreground" />
                Günlük Maks
              </div>
              <input
                type="number"
                min="1"
                value={state.maxPerDay}
                onChange={(e) => handleChange({ maxPerDay: parseInt(e.target.value) || 1 })}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-center focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all mt-auto"
              />
            </div>
          </div>

          {/* TARGET TYPE */}
          <div className="bg-card border border-white/5 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
              <Settings2 className="w-4 h-4 text-muted-foreground" />
              Hedef İçerik
            </div>
            <div className="flex bg-background border border-white/10 rounded-lg p-1">
              {(['stories', 'reels', 'both'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => handleChange({ targetType: t })}
                  className={`flex-1 py-2 text-[11px] font-semibold tracking-wide rounded-md transition-all ${
                    state.targetType === t
                      ? 'bg-card text-primary shadow-sm border border-white/5'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t === 'stories' ? 'Hikayeler*' : t === 'reels' ? 'Reels' : 'Her İkisi'}
                </button>
              ))}
            </div>
          </div>

          {/* Stories note */}
          {(state.targetType === 'stories' || state.targetType === 'both') && (
            <p className="text-[10px] font-mono text-yellow-400/70 border border-yellow-500/20 bg-yellow-500/5 rounded-lg px-3 py-2 leading-relaxed">
              * Hikaye beğenileri hikaye sahibine görünen kalp reaksiyonu gönderir.
              Otomatik hikaye reaksiyonu devre dışı — yalnızca Reels beğenilir.
            </p>
          )}

          {/* RESET CACHE */}
          <button
            onClick={handleClearCache}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-card border border-white/5 text-xs font-semibold text-muted-foreground hover:text-white hover:bg-white/5 transition-all active:scale-[0.98]"
          >
            <Trash2 className="w-4 h-4" />
            Önbelleği Temizle
          </button>
          
        </div>
      </div>
    </motion.div>
  );
}
