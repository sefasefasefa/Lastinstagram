import { useState, useEffect } from "react";

type IgStatus = "checking" | "found" | "missing";

export function App() {
  const [apiUrl, setApiUrl] = useState("");
  const [igStatus, setIgStatus] = useState<IgStatus>("checking");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    // Load stored API URL
    chrome.storage.local.get(["apiUrl"], (result) => {
      setApiUrl((result["apiUrl"] as string | undefined) ?? "");
    });

    // Check Instagram session
    chrome.cookies.get(
      { url: "https://www.instagram.com", name: "sessionid" },
      (cookie) => {
        setIgStatus(cookie?.value ? "found" : "missing");
      }
    );
  }, []);

  function handleUrlChange(val: string) {
    setApiUrl(val);
    setDirty(true);
    setSaved(false);
  }

  function saveUrl() {
    const clean = apiUrl.replace(/\/+$/, "");
    chrome.storage.local.set({ apiUrl: clean }, () => {
      setApiUrl(clean);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  function openPanel() {
    chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
    window.close();
  }

  function openInstagram() {
    chrome.tabs.create({ url: "https://www.instagram.com/accounts/login/" });
    window.close();
  }

  const igColor =
    igStatus === "found" ? "#22c55e" : igStatus === "checking" ? "#eab308" : "#ef4444";
  const igLabel =
    igStatus === "found"
      ? "Instagram oturumu aktif ✓"
      : igStatus === "checking"
      ? "Kontrol ediliyor…"
      : "Giriş yapılmamış";

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
          <defs>
            <radialGradient id="ig" cx="30%" cy="107%" r="150%">
              <stop offset="0%" stopColor="#fdf497" />
              <stop offset="45%" stopColor="#fd5949" />
              <stop offset="60%" stopColor="#d6249f" />
              <stop offset="90%" stopColor="#285AEB" />
            </radialGradient>
          </defs>
          <rect width="32" height="32" rx="8" fill="url(#ig)" />
          <rect x="9" y="9" width="14" height="14" rx="4.5" stroke="white" strokeWidth="2" fill="none" />
          <circle cx="16" cy="16" r="3.5" stroke="white" strokeWidth="2" />
          <circle cx="23" cy="9" r="1.2" fill="white" />
        </svg>
        <span style={s.headerTitle}>Takipçi Paneli</span>
      </div>

      {/* Instagram status */}
      <div style={s.row}>
        <span style={{ ...s.dot, background: igColor }} />
        <span style={s.statusText}>{igLabel}</span>
      </div>

      {igStatus === "missing" && (
        <button onClick={openInstagram} style={s.linkBtn}>
          Instagram'da Giriş Yap →
        </button>
      )}

      <div style={s.divider} />

      {/* API URL */}
      <div style={s.label}>API Sunucu URL</div>
      <input
        style={s.input}
        type="url"
        placeholder="https://xxxx.replit.dev"
        value={apiUrl}
        onChange={(e) => handleUrlChange(e.target.value)}
        spellCheck={false}
      />
      <div style={s.hint}>Panelin çalıştığı Replit URL'si</div>

      <button
        onClick={saveUrl}
        disabled={!dirty}
        style={{
          ...s.saveBtn,
          ...(saved ? s.saveBtnOk : {}),
          opacity: dirty || saved ? 1 : 0.45,
        }}
      >
        {saved ? "✓ Kaydedildi" : "Kaydet"}
      </button>

      <div style={s.divider} />

      {/* Open panel */}
      <button onClick={openPanel} style={s.openBtn}>
        Paneli Aç →
      </button>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    width: 300,
    background: "#0f0f0f",
    color: "#f0f0f0",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    fontSize: 13,
    padding: "14px 16px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: "-0.2px",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  statusText: {
    color: "#ccc",
    fontSize: 12,
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: "#c13584",
    fontSize: 12,
    cursor: "pointer",
    padding: 0,
    textAlign: "left",
    textDecoration: "underline",
  },
  divider: {
    height: 1,
    background: "#1e1e1e",
    margin: "2px 0",
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: "0.6px",
    marginBottom: -4,
  },
  input: {
    display: "block",
    width: "100%",
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    color: "#f0f0f0",
    fontSize: 12,
    padding: "7px 10px",
    boxSizing: "border-box",
    outline: "none",
  },
  hint: {
    fontSize: 10,
    color: "#444",
    marginTop: -4,
  },
  saveBtn: {
    background: "#1e1e1e",
    border: "1px solid #333",
    borderRadius: 6,
    color: "#999",
    fontSize: 12,
    padding: "6px 14px",
    cursor: "pointer",
    alignSelf: "flex-start",
    transition: "all 0.15s",
  },
  saveBtnOk: {
    borderColor: "#22c55e",
    color: "#22c55e",
  },
  openBtn: {
    background: "linear-gradient(135deg, #c13584, #e1306c, #fd5949)",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    padding: "11px 0",
    cursor: "pointer",
    width: "100%",
    transition: "opacity 0.15s",
  },
};
