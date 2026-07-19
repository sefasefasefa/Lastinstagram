import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Server, Link2, LogIn, CheckCircle2, AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import { loadConfig, saveConfig, type AppConfig } from '@/lib/config';

// ─── Sunucuya oturum gönder ────────────────────────────────────────────────────
async function sendSessionToServer(serverUrl: string): Promise<{ ok: boolean; msg: string }> {
  // Chrome cookies API'sinden Instagram sessionid oku
  const cookie = await new Promise<chrome.cookies.Cookie | null>((resolve) =>
    chrome.cookies.get({ url: 'https://www.instagram.com', name: 'sessionid' }, resolve),
  );

  if (!cookie?.value) {
    return { ok: false, msg: "Instagram oturumu bulunamadı. Önce Instagram'a giriş yapın." };
  }

  try {
    const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/auth/login-with-cookie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: cookie.value }),
      credentials: 'include',
    });
    const data = (await res.json()) as { error?: string; username?: string };
    if (res.ok) {
      return { ok: true, msg: `Bağlantı kuruldu${data.username ? ': @' + data.username : ''}` };
    }
    return { ok: false, msg: data.error ?? `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, msg: (err as Error).message };
  }
}

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig>(loadConfig);
  const [connectState, setConnectState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [connectMsg, setConnectMsg] = useState('');

  // Auto-save on change
  useEffect(() => { saveConfig(config); }, [config]);

  const handleConnect = async () => {
    if (!config.serverUrl) {
      toast.error("Önce Panel Sunucusu URL'sini girin");
      return;
    }
    setConnectState('loading');
    setConnectMsg('');
    const { ok, msg } = await sendSessionToServer(config.serverUrl);
    setConnectState(ok ? 'ok' : 'error');
    setConnectMsg(msg);
    if (ok) toast.success(msg);
    else toast.error(msg);
  };

  const handleReset = () => {
    const fresh: AppConfig = {
      serverUrl: '',
      instagramUsername: '',
      instagramPassword: '',
      instagramSessionCookie: '',
      targetUsers: '',
      likeIntervalMinutes: 10,
      maxLikesPerRun: 10,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
      referer: 'https://www.instagram.com/',
      xIgAppId: '936619743392459',
      proxyUrl: '',
      useProxy: false,
    };
    saveConfig(fresh);
    setConfig(fresh);
    toast.success('Ayarlar sıfırlandı');
  };

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="px-4 py-5 space-y-4 pb-8">

        {/* ── Panel Sunucusu ─────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card/60 border border-white/8 rounded-2xl p-4 space-y-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <Server className="w-3.5 h-3.5 text-primary" />
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">Panel Sunucusu</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
              Replit URL
            </label>
            <input
              type="url"
              value={config.serverUrl}
              onChange={(e) => setConfig((c) => ({ ...c, serverUrl: e.target.value }))}
              placeholder="https://xxxx.replit.dev"
              className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 font-mono transition-colors"
            />
            <p className="text-[9px] text-muted-foreground/60 leading-relaxed">
              Replit preview pane'deki URL'yi yapıştırın. Sonda / olmadan.
            </p>
          </div>

          {/* Connect button */}
          <button
            onClick={handleConnect}
            disabled={connectState === 'loading'}
            className="relative w-full flex items-center justify-center gap-2 py-2.5 rounded-xl overflow-hidden text-xs font-bold text-white disabled:opacity-50 transition-all active:scale-[0.98]"
          >
            <span className="absolute inset-0 opacity-90" style={{ background: 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)' }} />
            <span className="relative flex items-center gap-2">
              {connectState === 'loading'
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Bağlanıyor…</>
                : <><LogIn className="w-3.5 h-3.5" /> Instagram Oturumunu Sunucuya Gönder</>}
            </span>
          </button>

          {/* Status */}
          {connectState !== 'idle' && connectState !== 'loading' && (
            <motion.div
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-[10px] font-mono ${
                connectState === 'ok'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}
            >
              {connectState === 'ok'
                ? <CheckCircle2 className="w-3 h-3 flex-shrink-0 mt-0.5" />
                : <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />}
              <span className="break-all leading-relaxed">{connectMsg}</span>
            </motion.div>
          )}

          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/50">
            <Link2 className="w-2.5 h-2.5" />
            <span>Instagram sessionid cookie'si sunucuya güvenli biçimde iletilir.</span>
          </div>
        </motion.div>

        {/* ── Genel Ayarlar ─────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-card/60 border border-white/8 rounded-2xl p-4 space-y-3"
        >
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">Otomasyon Ayarları</p>

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

        {/* ── Sıfırla ──────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
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
