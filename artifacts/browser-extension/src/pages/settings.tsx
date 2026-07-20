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
import { loadConfig, saveConfig, DEFAULT_CONFIG, type AppConfig } from '@/lib/config';
import { motion } from 'framer-motion';
import {
  Settings2, Clock, Zap, Target, Trash2, Loader2,
  Activity, RotateCcw, Users, Bot, SlidersHorizontal,
} from 'lucide-react';

function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(cb: T, delay: number) {
  const timerRef   = useRef<number | null>(null);
  const cbRef      = useRef(cb);
  useEffect(() => { cbRef.current = cb; }, [cb]);
  return useCallback((...args: Parameters<T>) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => { cbRef.current(...args); }, delay);
  }, [delay]);
}

export default function SettingsPage() {
  const [auto, setAuto]     = useState<AutoState>(AUTO_DEFAULTS);
  const [cfg,  setCfg]      = useState<AppConfig>(loadConfig);
  const [loading, setLoading] = useState(true);
  const [, setTick]          = useState(0);

  // ── Otomasyon state yükle ──────────────────────────────────────────────────
  useEffect(() => {
    fetchAutoState().then((s) => { setAuto(s); setLoading(false); });
  }, []);

  useEffect(() => {
    const h = (msg: { type: string }) => {
      if (msg.type === 'IG_AUTO_STATUS') fetchAutoState().then(setAuto);
    };
    chrome.runtime.onMessage.addListener(h);
    return () => chrome.runtime.onMessage.removeListener(h);
  }, []);

  // Geri sayım için saniye bazlı tick
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // AppConfig her değiştiğinde otomatik kaydet
  useEffect(() => { saveConfig(cfg); }, [cfg]);

  const debouncedAutoUpdate = useDebouncedCallback((patch: Partial<AutoState>) => {
    updateAutoState(patch).catch(() => toast.error('Ayarlar kaydedilemedi'));
  }, 300);

  const handleAuto = (patch: Partial<AutoState>) => {
    setAuto((prev) => ({ ...prev, ...patch }));
    debouncedAutoUpdate(patch);
  };

  const handleReset = () => {
    saveConfig(DEFAULT_CONFIG);
    setCfg(DEFAULT_CONFIG);
    toast.success('Ayarlar sıfırlandı');
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

  const status = statusLabel(auto);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full bg-background text-foreground overflow-y-auto"
    >
      <div className="p-4 space-y-4 pb-24">

        {/* ── Otomasyon Bölümü Başlığı ─────────────────────────────────────── */}
        <div className="flex items-center gap-2 pt-1">
          <Bot className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">Otomasyon</span>
          <div className="flex-1 h-px bg-white/5" />
        </div>

        {/* ── Durum kartı ───────────────────────────────────────────────────── */}
        <div className="bg-card border border-white/5 rounded-xl p-5 relative overflow-hidden shadow-sm">
          {auto.enabled && (
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-[40px] pointer-events-none" />
          )}

          <div className="flex items-start justify-between relative z-10 mb-5">
            <div className="flex flex-col">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <Activity className="w-3 h-3" /> Sistem Durumu
              </span>
              <div className="flex items-center gap-3">
                {/* Toggle */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={auto.enabled}
                  onClick={() => handleAuto({ enabled: !auto.enabled })}
                  className={`relative w-12 h-6 rounded-full border transition-all duration-300 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                    auto.enabled
                      ? 'bg-primary border-primary shadow-[0_0_16px_rgba(225,48,108,0.4)]'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                    auto.enabled ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>

                {/* Durum rozeti */}
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

            {/* Bugünkü sayaç */}
            <div className="flex flex-col items-end">
              <span className="text-2xl font-bold font-mono tracking-tight text-foreground">
                {auto.todayCount}{' '}
                <span className="text-sm text-muted-foreground font-sans font-normal">/ {auto.maxPerDay}</span>
              </span>
              <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mt-0.5">
                Etkileşim (Bugün)
              </span>
            </div>
          </div>

          <div className="space-y-2 relative z-10">
            {auto.nextRunAt > Date.now() && status.kind === 'active' && (
              <div className="flex items-center justify-between text-xs bg-black/20 rounded-md px-3 py-2 border border-white/5">
                <span className="text-muted-foreground">Sonraki eylem:</span>
                <span className="font-mono text-primary font-medium">
                  {Math.ceil((auto.nextRunAt - Date.now()) / 1000)}s
                </span>
              </div>
            )}
            {auto.lastActionLabel && (
              <p className="text-[10px] font-mono text-muted-foreground truncate border-l-2 border-white/10 pl-2">
                {'>'} {auto.lastActionLabel}
              </p>
            )}
          </div>
        </div>

        {/* ── Hedef Kullanıcılar ────────────────────────────────────────────── */}
        <div className="bg-card border border-white/5 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
            <Users className="w-4 h-4 text-muted-foreground" />
            Hedef Kullanıcılar
          </div>
          <input
            type="text"
            value={cfg.targetUsers}
            onChange={(e) => setCfg((c) => ({ ...c, targetUsers: e.target.value }))}
            placeholder="kullanici1, kullanici2"
            className="w-full bg-background border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 font-mono transition-colors"
          />
        </div>

        {/* ── Çalışma saatleri ──────────────────────────────────────────────── */}
        <div className="bg-card border border-white/5 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Çalışma Saatleri
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <input
                type="number" min="0" max="23"
                value={auto.timeFrom}
                onChange={(e) => handleAuto({ timeFrom: parseInt(e.target.value) || 0 })}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-center focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">:00</span>
            </div>
            <span className="text-muted-foreground font-mono">→</span>
            <div className="flex-1 relative">
              <input
                type="number" min="0" max="23"
                value={auto.timeTo}
                onChange={(e) => handleAuto({ timeTo: parseInt(e.target.value) || 0 })}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-center focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">:00</span>
            </div>
          </div>
        </div>

        {/* ── Aralık & Günlük maks ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card border border-white/5 rounded-xl p-4 shadow-sm flex flex-col">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
              <Zap className="w-4 h-4 text-muted-foreground" />
              Aralık <span className="text-[10px] font-normal text-muted-foreground">(sn)</span>
            </div>
            <div className="flex items-center gap-2 mt-auto">
              <input
                type="number" min="1"
                value={auto.minDelaySec}
                onChange={(e) => handleAuto({ minDelaySec: parseInt(e.target.value) || 1 })}
                className="w-full bg-background border border-white/10 rounded-lg px-2 py-2 text-xs font-mono text-center focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all"
              />
              <span className="text-muted-foreground text-xs">–</span>
              <input
                type="number" min="1"
                value={auto.maxDelaySec}
                onChange={(e) => handleAuto({ maxDelaySec: parseInt(e.target.value) || 1 })}
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
              type="number" min="1"
              value={auto.maxPerDay}
              onChange={(e) => handleAuto({ maxPerDay: parseInt(e.target.value) || 1 })}
              className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-center focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all mt-auto"
            />
          </div>
        </div>

        {/* ── Hedef içerik ──────────────────────────────────────────────────── */}
        <div className="bg-card border border-white/5 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
            <Settings2 className="w-4 h-4 text-muted-foreground" />
            Hedef İçerik
          </div>
          <div className="flex bg-background border border-white/10 rounded-lg p-1">
            {(['stories', 'reels', 'both'] as const).map((t) => (
              <button
                key={t}
                onClick={() => handleAuto({ targetType: t })}
                className={`flex-1 py-2 text-[11px] font-semibold tracking-wide rounded-md transition-all ${
                  auto.targetType === t
                    ? 'bg-card text-primary shadow-sm border border-white/5'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'stories' ? 'Hikayeler' : t === 'reels' ? 'Reels' : 'Her İkisi'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Genel Ayarlar Bölümü Başlığı ─────────────────────────────────── */}
        <div className="flex items-center gap-2 pt-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">Ayarlar</span>
          <div className="flex-1 h-px bg-white/5" />
        </div>

        {/* ── İşlem butonları ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleReset}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-card border border-white/5 text-xs font-semibold text-muted-foreground hover:text-white hover:bg-white/5 transition-all active:scale-[0.98]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Sıfırla
          </button>
          <button
            onClick={handleClearCache}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-card border border-white/5 text-xs font-semibold text-muted-foreground hover:text-white hover:bg-white/5 transition-all active:scale-[0.98]"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Önbellek
          </button>
        </div>

      </div>
    </motion.div>
  );
}
