import { useState, useEffect } from "react";
import { Instagram, ArrowRight, CheckCircle2, AlertCircle, Loader2, RefreshCw } from "lucide-react";

type IgStatus = "checking" | "found" | "missing";

interface StoredUser {
  username: string;
  full_name?: string;
  profile_pic_url?: string;
  follower_count?: number;
  following_count?: number;
  is_verified?: boolean;
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export function App() {
  const [igStatus, setIgStatus] = useState<IgStatus>("checking");
  const [igUser, setIgUser] = useState<StoredUser | null>(null);
  const [imgErr, setImgErr] = useState(false);

  function checkSession() {
    setIgStatus("checking");
    chrome.cookies.get({ url: "https://www.instagram.com", name: "sessionid" }, (cookie) => {
      setIgStatus(cookie?.value ? "found" : "missing");
    });
    chrome.storage.local.get(["igUser"], (result) => {
      setIgUser((result["igUser"] as StoredUser) ?? null);
    });
  }

  useEffect(() => { checkSession(); }, []);

  function openPanel() {
    chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
    window.close();
  }

  function openInstagram() {
    chrome.tabs.create({ url: "https://www.instagram.com/" });
    window.close();
  }

  const statusColor =
    igStatus === "found" ? "text-green-400 border-green-500/30 bg-green-500/10"
    : igStatus === "missing" ? "text-destructive border-destructive/30 bg-destructive/10"
    : "text-yellow-400 border-yellow-500/30 bg-yellow-500/10";

  const statusLabel =
    igStatus === "found" ? "Aktif" : igStatus === "missing" ? "Oturum Yok" : "Kontrol...";

  return (
    <div className="w-[280px] bg-background text-foreground font-sans flex flex-col">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 border border-primary/20 flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/10">
          <Instagram className="w-[18px] h-[18px] text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[13px] font-bold tracking-tight text-foreground leading-tight">Takipçi Paneli</h1>
          <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">Instagram Yönetim Aracı</p>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-mono font-bold border ${statusColor}`}>
          {igStatus === "checking" && <Loader2 className="w-2 h-2 animate-spin" />}
          {igStatus === "found" && <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />}
          {igStatus === "missing" && <span className="w-1.5 h-1.5 bg-destructive rounded-full" />}
          {statusLabel}
        </div>
      </div>

      {/* ─── Kullanıcı Kartı ─────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-white/5">
        {igStatus === "checking" ? (
          <div className="flex items-center gap-2 py-1">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
            <span className="text-xs text-muted-foreground">Oturum kontrol ediliyor…</span>
          </div>
        ) : igStatus === "found" && igUser ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {imgErr || !igUser.profile_pic_url ? (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                  {igUser.username[0]?.toUpperCase()}
                </div>
              ) : (
                <img
                  src={igUser.profile_pic_url}
                  alt={igUser.username}
                  className="w-10 h-10 rounded-xl object-cover ring-1 ring-white/10 flex-shrink-0 shadow-sm"
                  onError={() => setImgErr(true)}
                />
              )}
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-foreground truncate">@{igUser.username}</p>
                {igUser.full_name && (
                  <p className="text-[10px] text-muted-foreground truncate">{igUser.full_name}</p>
                )}
              </div>
            </div>

            {(igUser.follower_count !== undefined || igUser.following_count !== undefined) && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-card/60 border border-white/5 rounded-xl p-2.5 text-center">
                  <p className="text-sm font-bold font-mono text-foreground leading-tight">
                    {fmt(igUser.follower_count ?? 0)}
                  </p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-widest mt-0.5">Takipçi</p>
                </div>
                <div className="bg-card/60 border border-white/5 rounded-xl p-2.5 text-center">
                  <p className="text-sm font-bold font-mono text-foreground leading-tight">
                    {fmt(igUser.following_count ?? 0)}
                  </p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-widest mt-0.5">Takip</p>
                </div>
              </div>
            )}
          </div>
        ) : igStatus === "found" ? (
          <div className="flex items-center gap-2 py-1">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-xs text-muted-foreground">Instagram oturumu aktif</span>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              <span className="text-xs text-muted-foreground leading-snug">
                Instagram oturumu bulunamadı. Lütfen önce Instagram'a giriş yapın.
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={openInstagram}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 text-[10px] font-semibold text-primary transition-all active:scale-[0.98]"
              >
                <Instagram className="w-3 h-3" /> Instagram
              </button>
              <button
                onClick={checkSession}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-semibold text-muted-foreground transition-all active:scale-[0.98]"
              >
                <RefreshCw className="w-3 h-3" /> Kontrol Et
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Paneli Aç ───────────────────────────────────────────────── */}
      <div className="px-4 py-3">
        <button
          onClick={openPanel}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold tracking-wide transition-all shadow-[0_4px_20px_rgba(225,48,108,0.25)] hover:shadow-[0_4px_25px_rgba(225,48,108,0.4)] active:scale-[0.98]"
        >
          Paneli Aç <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
