import { useState, useEffect, useCallback } from "react";

interface Settings {
  panelUrl: string;
  username: string;
  password: string;
}

type IgStatus =
  | { kind: "checking" }
  | { kind: "found"; cookieValue: string }
  | { kind: "missing" };

type SendStatus =
  | { kind: "idle" }
  | { kind: "loading"; step: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const DEFAULT_SETTINGS: Settings = {
  panelUrl: "",
  username: "admin",
  password: "",
};

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [igStatus, setIgStatus] = useState<IgStatus>({ kind: "checking" });
  const [sendStatus, setSendStatus] = useState<SendStatus>({ kind: "idle" });

  // Load saved settings on mount
  useEffect(() => {
    chrome.storage.local.get(
      ["panelUrl", "username", "password"],
      (result) => {
        setSettings({
          panelUrl: result["panelUrl"] ?? "",
          username: result["username"] ?? "admin",
          password: result["password"] ?? "",
        });
      }
    );
  }, []);

  const checkIgSession = useCallback(async () => {
    setIgStatus({ kind: "checking" });
    try {
      const cookie = await chrome.cookies.get({
        url: "https://www.instagram.com",
        name: "sessionid",
      });
      if (cookie?.value) {
        setIgStatus({ kind: "found", cookieValue: cookie.value });
      } else {
        setIgStatus({ kind: "missing" });
      }
    } catch {
      setIgStatus({ kind: "missing" });
    }
  }, []);

  useEffect(() => {
    checkIgSession();
  }, [checkIgSession]);

  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
    setSettingsDirty(true);
  }

  function saveSettings() {
    chrome.storage.local.set(settings, () => {
      setSettingsDirty(false);
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 2000);
    });
  }

  async function sendToPanel() {
    if (igStatus.kind !== "found") return;
    const sessionCookie = igStatus.cookieValue;
    const baseUrl = settings.panelUrl.replace(/\/+$/, "");

    setSendStatus({ kind: "loading", step: "Panel'e bağlanıyor…" });

    try {
      // Step 1: Login to panel as admin
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: settings.username,
          password: settings.password,
        }),
      });

      if (!loginRes.ok) {
        let msg = "Panel girişi başarısız";
        try {
          const body = await loginRes.json();
          msg = body.error ?? body.message ?? msg;
        } catch {}
        setSendStatus({ kind: "error", message: msg });
        return;
      }

      // Step 2: Push Instagram session cookie
      setSendStatus({ kind: "loading", step: "Instagram oturumu gönderiliyor…" });

      const sessionRes = await fetch(`${baseUrl}/api/instagram/session-cookie`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionCookie }),
      });

      if (!sessionRes.ok) {
        let msg = "Instagram oturumu gönderilemedi";
        try {
          const body = await sessionRes.json();
          msg = body.error ?? body.message ?? msg;
        } catch {}
        setSendStatus({ kind: "error", message: msg });
        return;
      }

      const data = await sessionRes.json();
      setSendStatus({
        kind: "success",
        message: data.message ?? "Instagram oturumu panele başarıyla gönderildi!",
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Bağlantı hatası — Panel URL'sini kontrol edin.";
      setSendStatus({ kind: "error", message: msg });
    }
  }

  const canSend =
    igStatus.kind === "found" &&
    settings.panelUrl.trim() !== "" &&
    settings.username.trim() !== "" &&
    settings.password.trim() !== "" &&
    sendStatus.kind !== "loading";

  return (
    <div style={s.root}>
      {/* ── Header ── */}
      <div style={s.header}>
        <span style={s.logo}>🎯</span>
        <div>
          <div style={s.headerTitle}>Takipçi Paneli</div>
          <div style={s.headerSub}>Tarayıcı Eklentisi</div>
        </div>
      </div>

      {/* ── Instagram Status ── */}
      <section style={s.section}>
        <div style={s.sectionLabel}>Instagram Durumu</div>
        <div style={s.row}>
          <span
            style={{
              ...s.dot,
              background:
                igStatus.kind === "found"
                  ? "#22c55e"
                  : igStatus.kind === "checking"
                  ? "#eab308"
                  : "#ef4444",
            }}
          />
          <span style={s.statusText}>
            {igStatus.kind === "checking"
              ? "Kontrol ediliyor…"
              : igStatus.kind === "found"
              ? "Aktif oturum bulundu ✓"
              : "Oturum bulunamadı — önce Instagram'a giriş yapın"}
          </span>
          <button onClick={checkIgSession} style={s.iconBtn} title="Yenile">
            ↻
          </button>
        </div>
        {igStatus.kind === "missing" && (
          <a
            href="https://www.instagram.com"
            target="_blank"
            rel="noreferrer"
            style={s.link}
          >
            Instagram'a git →
          </a>
        )}
      </section>

      {/* ── Panel Settings ── */}
      <section style={s.section}>
        <div style={s.sectionLabel}>Panel Bağlantısı</div>

        <label style={s.label}>Panel URL</label>
        <input
          style={s.input}
          type="url"
          placeholder="https://xxxx.replit.dev"
          value={settings.panelUrl}
          onChange={(e) => updateSetting("panelUrl", e.target.value)}
          spellCheck={false}
        />

        <label style={s.label}>Kullanıcı Adı</label>
        <input
          style={s.input}
          type="text"
          placeholder="admin"
          value={settings.username}
          onChange={(e) => updateSetting("username", e.target.value)}
          autoComplete="off"
        />

        <label style={s.label}>Şifre</label>
        <input
          style={s.input}
          type="password"
          placeholder="••••••••"
          value={settings.password}
          onChange={(e) => updateSetting("password", e.target.value)}
          autoComplete="current-password"
        />

        <button
          onClick={saveSettings}
          style={{
            ...s.saveBtn,
            ...(saveFlash ? s.saveBtnFlash : {}),
          }}
        >
          {saveFlash ? "✓ Kaydedildi" : settingsDirty ? "Kaydet *" : "Kaydedildi"}
        </button>
      </section>

      {/* ── Send Button ── */}
      <button
        onClick={sendToPanel}
        disabled={!canSend}
        style={{ ...s.sendBtn, opacity: canSend ? 1 : 0.45 }}
      >
        {sendStatus.kind === "loading"
          ? sendStatus.step
          : "Oturumu Panele Gönder"}
      </button>

      {/* ── Result ── */}
      {sendStatus.kind === "success" && (
        <div style={{ ...s.alert, ...s.alertSuccess }}>{sendStatus.message}</div>
      )}
      {sendStatus.kind === "error" && (
        <div style={{ ...s.alert, ...s.alertError }}>{sendStatus.message}</div>
      )}

      {sendStatus.kind !== "idle" && sendStatus.kind !== "loading" && (
        <button
          onClick={() => setSendStatus({ kind: "idle" })}
          style={s.resetBtn}
        >
          Temizle
        </button>
      )}
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    width: 340,
    minHeight: 400,
    background: "#0f0f0f",
    color: "#f5f5f5",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    fontSize: 13,
    padding: 0,
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 16px 12px",
    background: "linear-gradient(135deg, #1a1a1a 0%, #111 100%)",
    borderBottom: "1px solid #222",
  },
  logo: {
    fontSize: 24,
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: "-0.3px",
  },
  headerSub: {
    color: "#666",
    fontSize: 11,
    marginTop: 1,
  },
  section: {
    padding: "12px 16px",
    borderBottom: "1px solid #1e1e1e",
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    color: "#555",
    marginBottom: 8,
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
    flex: 1,
    color: "#ccc",
    fontSize: 12,
  },
  iconBtn: {
    background: "none",
    border: "none",
    color: "#555",
    fontSize: 15,
    cursor: "pointer",
    padding: "2px 4px",
    borderRadius: 4,
    lineHeight: 1,
  },
  link: {
    display: "inline-block",
    marginTop: 6,
    color: "#c13584",
    fontSize: 12,
    textDecoration: "none",
  },
  label: {
    display: "block",
    color: "#666",
    fontSize: 11,
    marginBottom: 3,
    marginTop: 8,
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
  saveBtn: {
    marginTop: 10,
    background: "#1e1e1e",
    border: "1px solid #333",
    borderRadius: 6,
    color: "#999",
    fontSize: 12,
    padding: "6px 14px",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  saveBtnFlash: {
    borderColor: "#22c55e",
    color: "#22c55e",
  },
  sendBtn: {
    display: "block",
    width: "calc(100% - 32px)",
    margin: "12px 16px 0",
    background: "linear-gradient(135deg, #c13584, #e1306c, #fd1d1d)",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    padding: "11px 0",
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
  alert: {
    margin: "10px 16px 0",
    padding: "9px 12px",
    borderRadius: 7,
    fontSize: 12,
    lineHeight: 1.5,
  },
  alertSuccess: {
    background: "#0d2d1a",
    border: "1px solid #166534",
    color: "#86efac",
  },
  alertError: {
    background: "#2d0d0d",
    border: "1px solid #991b1b",
    color: "#fca5a5",
  },
  resetBtn: {
    display: "block",
    margin: "6px 16px 12px auto",
    background: "none",
    border: "none",
    color: "#444",
    fontSize: 11,
    cursor: "pointer",
    textDecoration: "underline",
    padding: 0,
  },
};
