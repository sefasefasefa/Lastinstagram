// ─── Content script'ten gelen kullanıcı verisi ────────────────────────────────
// Content script instagram.com'a yüklenince kullanıcı verisini push eder.
// Biz bunu storage'a yazıp panele haber veririz.

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'IG_USER_DATA') {
    const user = msg.user as Record<string, unknown>;
    // Storage'a kaydet
    chrome.storage.local.set({ igUser: user, igUserTs: Date.now() });

    // Açık panel varsa haber ver
    const panelUrl = chrome.runtime.getURL('panel.html');
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.url === panelUrl && tab.id != null) {
          chrome.tabs.sendMessage(tab.id, { type: 'IG_USER_UPDATED', user }).catch(() => {});
        }
      }
    });

    // Gönderen sekme login sekmesiyse kapat değil, keepalive için kalsın
    void sender;
  }
});

// ─── Panel → Background: anlık API istekleri ─────────────────────────────────
// Takipçi listesi gibi büyük veriler için content script üzerinden fetch yapılır.

async function getInstagramTabId(): Promise<number> {
  const tabs = await chrome.tabs.query({ url: '*://*.instagram.com/*' });
  // Tam yüklü ve login sayfası olmayan bir sekme ara
  const best =
    tabs.find((t) => t.id != null && t.status === 'complete' && !t.url?.includes('/accounts/')) ??
    tabs.find((t) => t.id != null && t.status === 'complete') ??
    tabs.find((t) => t.id != null);

  if (best?.id != null) {
    if (best.status !== 'complete') {
      // Yüklenip bitmesini bekle (maks 8 sn)
      await new Promise<void>((resolve) => {
        const tid = best.id!;
        const timer = setTimeout(resolve, 8000);
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
      const timer = setTimeout(() => reject(new Error('Sayfa yüklenme zaman aşımı')), 20000);
      const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
        if (id !== tabId || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timer);
        resolve(tabId);
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

async function igFetchViaContentScript(
  endpoint: string,
  params?: Record<string, string>,
  method = 'GET',
  body?: Record<string, string>,
): Promise<unknown> {
  const tabId = await getInstagramTabId();

  // Content script'e mesaj gönder; eğer henüz enjekte edilmemişse manuel inject et
  const send = (id: number) =>
    new Promise<unknown>((resolve, reject) => {
      chrome.tabs.sendMessage(
        id,
        { type: 'IG_FETCH', endpoint, params, method, body },
        (res: { ok: boolean; data?: unknown; error?: string } | undefined) => {
          if (chrome.runtime.lastError || !res) {
            reject(new Error(chrome.runtime.lastError?.message ?? 'Yanıt yok'));
          } else if (res.ok) {
            resolve(res.data);
          } else {
            reject(new Error(res.error ?? 'Bilinmeyen hata'));
          }
        },
      );
    });

  try {
    return await send(tabId);
  } catch {
    // Content script henüz enjekte edilmemiş — elle inject et, sonra tekrar dene
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-script.js'],
    });
    // Script yüklendikten sonra listener'ın aktif olması için kısa bekleme
    await new Promise((r) => setTimeout(r, 300));
    return send(tabId);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'IG_API') return false;

  igFetchViaContentScript(
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
    chrome.tabs.query({ url: '*://*.instagram.com/*' }, (tabs) => {
      const tab = tabs.find((t) => t.id != null && t.status === 'complete');
      if (!tab?.id) return;
      // Content script üzerinden hafif bir istek at
      chrome.tabs.sendMessage(
        tab.id,
        { type: 'IG_FETCH', endpoint: '/api/v1/accounts/current_user/?edit=true', method: 'GET' },
        () => { void chrome.runtime.lastError; },
      );
    });
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
