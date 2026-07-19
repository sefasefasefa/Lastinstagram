// ─── Yardımcı: Instagram sekmesi bul veya aç ─────────────────────────────────
async function getInstagramTabId(): Promise<number> {
  const tabs = await chrome.tabs.query({ url: '*://*.instagram.com/*' });
  const best =
    tabs.find((t) => t.id != null && t.status === 'complete' && !t.url?.includes('/accounts/')) ??
    tabs.find((t) => t.id != null && t.status === 'complete') ??
    tabs.find((t) => t.id != null);

  if (best?.id != null) {
    if (best.status !== 'complete') {
      await new Promise<void>((resolve) => {
        const tid = best.id!;
        const timer = setTimeout(resolve, 10_000);
        const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
          if (id !== tid || info.status !== 'complete') return;
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(timer);
          resolve();
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    }
    return best.id!;
  }

  // Hiç Instagram sekmesi yok — arka planda aç
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url: 'https://www.instagram.com/', active: false }, (tab) => {
      if (!tab.id) return reject(new Error('Sekme açılamadı'));
      const tabId = tab.id;
      const timer = setTimeout(() => reject(new Error('Sayfa yüklenme zaman aşımı')), 25_000);
      const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
        if (id !== tabId || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timer);
        setTimeout(() => resolve(tabId), 800);
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

// ─── Kullanıcı verisini sekme içinden çek ─────────────────────────────────────
// Tek bir executeScript: args geçirmeden, URL ve method bilgisini URL'e encode eder.
// Önce sayfaya gömülü window data'yı dener, sonra fetch yapar.
async function getCurrentUserViaTab(tabId: number): Promise<Record<string, unknown>> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      type AnyObj = Record<string, unknown>;

      // ── Yardımcı: nested objede pk/username olan user bul ──────────────────
      function extractUser(obj: unknown, depth = 0): AnyObj | null {
        if (!obj || typeof obj !== 'object' || depth > 6) return null;
        const o = obj as AnyObj;
        if ((o['pk'] || o['id']) && o['username']) return o;
        for (const v of Object.values(o)) {
          const found = extractUser(v, depth + 1);
          if (found) return found;
        }
        return null;
      }

      // ── Strateji 1: window globals (ağ isteği yok) ─────────────────────────
      const win = window as AnyObj;
      for (const key of ['_sharedData', '__initialData', '__additionalDataCurrentUser', '__additionalData']) {
        try {
          const u = extractUser(win[key]);
          if (u) return { ok: true, source: key, user: u };
        } catch { /* devam */ }
      }

      // ── Strateji 2: <script type="application/json"> tag'leri ──────────────
      for (const el of document.querySelectorAll('script[type="application/json"]')) {
        try {
          const u = extractUser(JSON.parse(el.textContent ?? ''));
          if (u) return { ok: true, source: 'script-tag', user: u };
        } catch { /* devam */ }
      }

      // ── Strateji 3: Inline <script> içindeki JSON bloklarını tara ──────────
      for (const el of document.querySelectorAll('script:not([src])')) {
        const text = el.textContent ?? '';
        if (!text.includes('"username"') || !text.includes('"pk"')) continue;
        const matches = text.matchAll(/\{[^{}]*"pk"\s*:\s*"?\d+"?[^{}]*"username"\s*:\s*"[^"]+[^{}]*\}/g);
        for (const m of matches) {
          try {
            const u = JSON.parse(m[0]) as AnyObj;
            if ((u['pk'] || u['id']) && u['username']) return { ok: true, source: 'inline-script', user: u };
          } catch { /* devam */ }
        }
      }

      // ── Strateji 4: Saf fetch — Instagram'a özel header yok ────────────────
      const csrf = document.cookie.split(';').find((c) => c.trim().startsWith('csrftoken='))?.split('=')[1] ?? '';
      const errors: string[] = [];

      for (const ep of ['/api/v1/accounts/current_user/?edit=true', '/api/v1/accounts/current_user/']) {
        try {
          const res = await fetch(`https://www.instagram.com${ep}`, {
            credentials: 'include',
            headers: csrf ? { 'X-CSRFToken': csrf } : {},
          });
          const text = await res.text();
          if (!text || text.trimStart().startsWith('<')) { errors.push(`${ep}:HTML`); continue; }
          const d = JSON.parse(text) as AnyObj;
          if (d['message'] === 'feedback_required') { errors.push(`${ep}:spam`); continue; }
          const u = extractUser(d);
          if (u) return { ok: true, source: ep, user: u };
          errors.push(`${ep}:no-user`);
        } catch (e) { errors.push(`${ep}:${(e as Error).message.slice(0, 40)}`); }
      }

      return { ok: false, errors };
    },
  });

  const r = results[0];
  if (r?.error) throw new Error('executeScript hatası: ' + r.error.message);
  const data = r?.result as Record<string, unknown> | null;
  if (!data) throw new Error('executeScript boş sonuç döndü');
  if (!data['ok']) {
    const errs = (data['errors'] as string[] | undefined)?.join(' | ') ?? 'bilinmeyen hata';
    throw new Error('Tüm endpoint\'ler başarısız: ' + errs);
  }
  const user = data['user'] as Record<string, unknown>;
  if (!user?.['pk'] && !user?.['id']) throw new Error('Kullanıcı pk/id eksik — ' + JSON.stringify(user).slice(0, 100));
  return user;
}

// ─── Genel API fetch: URL parametrelerini stringe encode eder ─────────────────
async function igFetchViaTab(
  tabId: number,
  fullUrl: string,
  method: string,
  bodyStr: string | null,
): Promise<unknown> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (url: string, meth: string, bd: string | null) => {
      const csrf =
        document.cookie
          .split(';')
          .find((c) => c.trim().startsWith('csrftoken='))
          ?.split('=')[1] ?? '';
      const headers: Record<string, string> = {
        'X-CSRFToken': csrf,
        'X-IG-App-ID': '936619743392459',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: '*/*',
      };
      if (bd) headers['Content-Type'] = 'application/x-www-form-urlencoded';
      return fetch(url, {
        method: meth,
        credentials: 'include',
        headers,
        body: bd ?? undefined,
      })
        .then((res) => {
          if (!res.ok) return res.text().then((t) => ({ ok: false, status: res.status, body: t.slice(0, 300) }));
          return res.json().then((d) => ({ ok: true, data: d }));
        })
        .catch((e: Error) => ({ ok: false, error: e.message }));
    },
    args: [fullUrl, method, bodyStr],
  });

  const r = results[0];
  if (r?.error) throw new Error('executeScript hatası: ' + r.error.message);
  const data = r?.result as Record<string, unknown> | null;
  if (!data) throw new Error('Yanıt boş');
  if (!data['ok']) throw new Error(`HTTP ${data['status']}: ${data['body'] ?? data['error']}`);
  return data['data'];
}

// ─── Tüm IG API istekleri için ortak giriş noktası ────────────────────────────
async function igFetch(
  endpoint: string,
  params?: Record<string, string>,
  method = 'GET',
  body?: Record<string, string>,
): Promise<unknown> {
  const tabId = await getInstagramTabId();

  // Kullanıcı bilgisi isteği → özel fonksiyon
  if (endpoint === '/api/v1/accounts/current_user/?edit=true' && method === 'GET') {
    return getCurrentUserViaTab(tabId);
  }

  // Diğer istekler → URL'e parametre encode et
  let url = endpoint.startsWith('http') ? endpoint : `https://www.instagram.com${endpoint}`;
  if (params && Object.keys(params).length > 0) url += '?' + new URLSearchParams(params).toString();
  const bodyStr = body ? new URLSearchParams(body).toString() : null;
  return igFetchViaTab(tabId, url, method, bodyStr);
}

// ─── Mesaj dinleyiciler ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'IG_USER_DATA') {
    const user = msg.user as Record<string, unknown>;
    chrome.storage.local.set({ igUser: user, igUserTs: Date.now() });
    const panelUrl = chrome.runtime.getURL('panel.html');
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.url === panelUrl && tab.id != null) {
          chrome.tabs.sendMessage(tab.id, { type: 'IG_USER_UPDATED', user }).catch(() => {});
        }
      }
    });
    return false;
  }

  if (msg.type !== 'IG_API') return false;

  igFetch(
    msg.endpoint as string,
    msg.params as Record<string, string> | undefined,
    (msg.method as string) ?? 'GET',
    msg.body as Record<string, string> | undefined,
  )
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err: Error) => sendResponse({ ok: false, error: err.message }));

  return true;
});

// ─── Oturum canlı tutma ───────────────────────────────────────────────────────
const ALARM = 'ig-keepalive';
chrome.alarms.get(ALARM, (e) => { if (!e) chrome.alarms.create(ALARM, { periodInMinutes: 20 }); });
chrome.runtime.onInstalled.addListener(() => chrome.alarms.create(ALARM, { periodInMinutes: 20 }));
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM) return;
  chrome.cookies.get({ url: 'https://www.instagram.com', name: 'sessionid' }, (c) => {
    if (!c?.value) return;
    igFetch('/api/v1/accounts/current_user/?edit=true').catch(() => {});
  });
});

// ─── Oturum cookie izleyici ───────────────────────────────────────────────────
chrome.cookies.onChanged.addListener((changeInfo) => {
  const { cookie, removed } = changeInfo;
  const isSession =
    cookie.name === 'sessionid' &&
    (cookie.domain === 'instagram.com' || cookie.domain === '.instagram.com');
  if (!isSession || removed) return;

  const panelUrl = chrome.runtime.getURL('panel.html');
  chrome.tabs.query({}, (allTabs) => {
    const existing = allTabs.find((t) => t.url === panelUrl);
    if (existing?.id != null) {
      chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId != null) chrome.windows.update(existing.windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: panelUrl });
    }
  });
});

// ─── Toolbar tıklaması ────────────────────────────────────────────────────────
chrome.action.onClicked.addListener(() => {
  const panelUrl = chrome.runtime.getURL('panel.html');
  chrome.tabs.query({}, (allTabs) => {
    const existing = allTabs.find((t) => t.url === panelUrl);
    if (existing?.id != null) {
      chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId != null) chrome.windows.update(existing.windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: panelUrl });
    }
  });
});

export {};
