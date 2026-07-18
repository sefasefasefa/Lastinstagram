import { useState, useEffect } from "react";

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
      : "Instagram'a giriş yapılmamış";

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
      <div style={s.statusRow}>
        <span style={{ ...s.dot, background: igColor }} />
        <span style={s.statusText}>{igLabel}</span>
      </div>

      {igStatus === "missing" && (
        <button onClick={openInstagram} style={s.igBtn}>
          Instagram'da Giriş Yap →
        </button>
      )}

      {igStatus === "found" && (
        <p style={s.hint}>
          Oturum algılandı. Panel otomatik açılır veya aşağıdan açabilirsin.
        </p>
      )}

      <button onClick={openPanel} style={s.openBtn}>
        Paneli Aç →
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    width: 260,
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
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: "-0.2px",
  },
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
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
  hint: {
    fontSize: 11,
    color: "#555",
    margin: 0,
    lineHeight: 1.5,
  },
  igBtn: {
    background: "none",
    border: "1px solid #333",
    borderRadius: 6,
    color: "#c13584",
    fontSize: 12,
    cursor: "pointer",
    padding: "6px 12px",
    textAlign: "left",
    width: "100%",
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
    marginTop: 2,
  },
};
