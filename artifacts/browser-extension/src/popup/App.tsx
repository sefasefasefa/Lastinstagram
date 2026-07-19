import { useState, useEffect } from "react";
import { Instagram, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type IgStatus = "checking" | "found" | "missing";

export function App() {
  const [igStatus, setIgStatus] = useState<IgStatus>("checking");

  useEffect(() => {
    chrome.cookies.get(
      { url: "https://www.instagram.com", name: "sessionid" },
      (cookie) => {
        setIgStatus(cookie?.value ? "found" : "missing");
      }
    );
  }, []);

  function openPanel() {
    chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
    window.close();
  }

  function openInstagram() {
    chrome.tabs.create({ url: "https://www.instagram.com/" });
    window.close();
  }

  return (
    <div className="w-[280px] bg-background text-foreground font-sans p-5 flex flex-col gap-5 border border-border selection:bg-primary/30 relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-center gap-3 relative z-10">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-[0_0_15px_rgba(225,48,108,0.3)] flex-shrink-0">
          <Instagram className="w-5 h-5 text-white" />
        </div>
        <div className="flex flex-col min-w-0">
          <h1 className="text-sm font-extrabold tracking-tight truncate">Nexus Control</h1>
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest truncate mt-0.5">Operator Node</p>
        </div>
      </div>

      <div className="rounded-xl bg-card/60 backdrop-blur-xl border border-white/5 p-4 flex flex-col gap-4 shadow-inner relative z-10">
        <div className="flex items-center gap-2.5">
          {igStatus === "checking" && <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />}
          {igStatus === "found" && <CheckCircle2 className="w-4 h-4 text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.4)]" />}
          {igStatus === "missing" && <AlertCircle className="w-4 h-4 text-destructive drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]" />}
          
          <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
            {igStatus === "checking" ? "Verifying uplink..." : igStatus === "found" ? "Session Active" : "No Session Found"}
          </span>
        </div>
        
        {igStatus === "missing" && (
          <button
            onClick={openInstagram}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-bold uppercase tracking-wider transition-all text-white group"
          >
            Authenticate <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </button>
        )}
        {igStatus === "found" && (
          <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">
            Connection stable. System ready for engagement automation.
          </p>
        )}
      </div>

      <button
        onClick={openPanel}
        className="relative w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-[13px] font-extrabold tracking-wide transition-all shadow-[0_0_15px_rgba(225,48,108,0.25)] hover:shadow-[0_0_25px_rgba(225,48,108,0.4)] active:scale-[0.98] group overflow-hidden z-10"
      >
        {/* Button inner glare */}
        <div className="absolute top-0 inset-x-0 h-[1px] bg-white/30" />
        Launch Terminal <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
      </button>
    </div>
  );
}
