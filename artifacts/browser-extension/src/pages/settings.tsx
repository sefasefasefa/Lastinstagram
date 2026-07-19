import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Settings2, RotateCcw } from 'lucide-react';
import { loadConfig, saveConfig, DEFAULT_CONFIG, type AppConfig } from '@/lib/config';

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig>(loadConfig);

  // Auto-save on change
  useEffect(() => { saveConfig(config); }, [config]);

  const handleReset = () => {
    saveConfig(DEFAULT_CONFIG);
    setConfig(DEFAULT_CONFIG);
    toast.success('Ayarlar sıfırlandı');
  };

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="px-4 py-5 space-y-4 pb-8">

        {/* ── Hedef Hesap ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card/60 border border-white/8 rounded-2xl p-4 space-y-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <Settings2 className="w-3.5 h-3.5 text-primary" />
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">Otomasyon Ayarları</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
              Hedef Kullanıcılar (virgülle ayırın)
            </label>
            <input
              type="text"
              value={config.targetUsers}
              onChange={(e) => setConfig((c) => ({ ...c, targetUsers: e.target.value }))}
              placeholder="kullanici1, kullanici2"
              className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 font-mono transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                Aralık (dk)
              </label>
              <input
                type="number"
                min={1}
                value={config.likeIntervalMinutes}
                onChange={(e) => setConfig((c) => ({ ...c, likeIntervalMinutes: Number(e.target.value) }))}
                className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-primary/50 font-mono transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                Max Beğeni
              </label>
              <input
                type="number"
                min={1}
                value={config.maxLikesPerRun}
                onChange={(e) => setConfig((c) => ({ ...c, maxLikesPerRun: Number(e.target.value) }))}
                className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-primary/50 font-mono transition-colors"
              />
            </div>
          </div>
        </motion.div>

        {/* ── Sıfırla ──────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        >
          <button
            onClick={handleReset}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/4 hover:bg-white/8 border border-white/8 text-[10px] font-mono font-semibold text-muted-foreground transition-all active:scale-[0.98]"
          >
            <RotateCcw className="w-3 h-3" /> Varsayılanlara Sıfırla
          </button>
        </motion.div>

      </div>
    </div>
  );
}
