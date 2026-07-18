// ─── Instagram tab bulma ──────────────────────────────────────────────────────
async function getInstagramTabId(): Promise<number> {
  // Herhangi bir instagram.com sekmesi — login sayfası da dahil (cookie henüz orada set edilmiş olabilir)
  const tabs = await chrome.tabs.query({ url: '*://*.instagram.com/*' });
  const ready = tabs.find((t) => t.id != null && t.status === 'complete');
  if (ready?.id != null) return ready.id;

  // Yüklenme devam eden sekme
  const loading = tabs.find((t) => t.id != null);
  if (loading?.id != null) {
    // Yüklenip bitmesini bekle
    await new Promise<void>((resolve) => {
      const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
        if (id !== loading.id || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      };
      chrome.tabs.onUpdated.addListener(listener);
      // 5 sn timeout
      setTimeout(resolve, 5000);
    });
    return loading.id!;
  }

  // Hiç Instagram sekmesi yok — arka planda aç
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url: 'https://www.instagram.com/', active: false }, (tab) => {
      if (!tab.id) return reject(new Error('Sekme açılamadı'));
      const tabId = tab.id;
      const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
        if (id !== tabId || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tabId);
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(() => reject(new Error('Sekme zaman aşımı')), 15000);
    });
  });
}

// ─── Instagram API proxy ──────────────────────────────────────────────────────
// executeScript ile doğrudan Instagram sekmesi içinde çalıştırılır.
// Bu sayede sayfanın gerçek cookie'leri ile fetch yapılır — timing veya
// sendMessage sorunları olmaz.

async function igFetch(
  endpoint: string,
  params?: Record<string, string>,
  method = 'GET',
  body?: Record<string, string>,
) {
  const tabId = await getInstagramTabId();

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    // Bu fonksiyon doğrudan Instagram sekmesinin içinde çalışır
    func: async (
      ep: string,
      ps: Record<string, string> | undefined,
      meth: string,
      bd: Record<string, string> | null,
    ) => {
      const csrf =
        document.cookie
          .split(';')
          .find((c) => c.trim().startsWith('csrftoken='))
          ?.split('=')[1] ?? '';

      let url = `https://www.instagram.com${ep}`;
      if (ps && Object.keys(ps).length > 0) {
        url += '?' + new URLSearchParams(ps).toString();
      }

      const headers: Record<string, string> = {
        'X-CSRFToken': csrf,
        'X-IG-App-ID': '936619743392459',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': '*/*',
        'Referer': 'https://www.instagram.com/',
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
        throw new Error(`HTTP ${res.status} — ${text.slice(0, 200)}`);
      }

      return res.json() as unknown;
    },
    args: [endpoint, params ?? null, method, body ?? null],
  });

  const r = results[0];
  if (!r) throw new Error('executeScript sonuç dönmedi');
  if ('error' in r && r.error) throw new Error(String((r.error as Error).message ?? r.error));
  return r.result;
}

// ─── Mesaj dinleyici (panel → background) ─────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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

// ─── Oturum canlı tutma (keepalive) ──────────────────────────────────────────
const KEEPALIVE_ALARM = 'ig-keepalive';

chrome.alarms.get(KEEPALIVE_ALARM, (existing) => {
  if (!existing) chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 20 });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 20 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== KEEPALIVE_ALARM) return;

  chrome.cookies.get(
    { url: 'https://www.instagram.com', name: 'sessionid' },
    (cookie) => {
      if (!cookie?.value) return;

      // Sadece zaten açık olan sekme varsa keepalive yap — yeni sekme açma
      chrome.tabs.query({ url: '*://*.instagram.com/*' }, (tabs) => {
        const tab = tabs.find((t) => t.id != null && t.status === 'complete');
        if (!tab?.id) return;

        chrome.scripting
          .executeScript({
            target: { tabId: tab.id },
            func: async () => {
              const csrf =
                document.cookie
                  .split(';')
                  .find((c) => c.trim().startsWith('csrftoken='))
                  ?.split('=')[1] ?? '';
              await fetch('https://www.instagram.com/api/v1/accounts/current_user/', {
                credentials: 'include',
                headers: {
                  'X-CSRFToken': csrf,
                  'X-IG-App-ID': '936619743392459',
                  'X-Requested-With': 'XMLHttpRequest',
                },
              });
            },
            args: [],
          })
          .catch(() => {}); // sessizce geç
      });
    },
  );
});

// ─── Instagram oturumu izleyici ───────────────────────────────────────────────
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
