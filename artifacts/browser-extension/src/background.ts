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
        const timer = setTimeout(resolve, 10000);
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
      const timer = setTimeout(() => reject(new Error('Sayfa yüklenme zaman aşımı')), 25000);
      const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
        if (id !== tabId || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timer);
        // Sayfa hazır, kısa bekleme ekle (SPA DOM hazırlığı için)
        setTimeout(() => resolve(tabId), 600);
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

// ─── Doğrudan executeScript ile fetch (content script mesajlaşmasına gerek yok) ─
async function igFetchDirect(
  endpoint: string,
  params?: Record<string, string>,
  method = 'GET',
  body?: Record<string, string>,
): Promise<unknown> {
  const tabId = await getInstagramTabId();

  // CSRF token'ı sekmeden oku
  const csrfResults = await chrome.scripting.executeScript({
    target: { tabId },
    func: () =>
      document.cookie
        .split(';')
        .find((c) => c.trim().startsWith('csrftoken='))
        ?.split('=')[1] ?? '',
  });
  const csrf = (csrfResults[0]?.result as string) ?? '';

  // Fetch fonksiyonunu doğrudan sekmeye enjekte et ve çalıştır
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (
      ep: string,
      prm: Record<string, string> | undefined,
      meth: string,
      bd: Record<string, string> | undefined,
      csrfToken: string,
    ) => {
      let url = ep.startsWith('http') ? ep : `https://www.instagram.com${ep}`;
      if (prm && Object.keys(prm).length > 0) url += '?' + new URLSearchParams(prm).toString();
      const headers: Record<string, string> = {
        'X-CSRFToken': csrfToken,
        'X-IG-App-ID': '936619743392459',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: '*/*',
        Referer: 'https://www.instagram.com/',
      };
      if (bd) headers['Content-Type'] = 'application/x-www-form-urlencoded';
      const res = await fetch(url, {
        method: meth,
        credentials: 'include',
        headers,
        body: bd ? new URLSearchParams(bd).toString() : undefined,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      return res.json() as Promise<unknown>;
    },
    args: [endpoint, params, method, body, csrf],
  });

  const result = results[0];
  if (result?.error) throw new Error(result.error.message ?? 'executeScript hatası');
  return result?.result;
}

// ─── Panel → Background: anlık API istekleri ─────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'IG_USER_DATA') {
    // Content script'ten push (bonus — hâlâ desteklenir)
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

  igFetchDirect(
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
    igFetchDirect('/api/v1/accounts/current_user/?edit=true').catch(() => {});
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
