// ─── Instagram API proxy ──────────────────────────────────────────────────────
// Content script (instagram.com'da çalışan) üzerinden istek yapılır.
// Böylece browser'ın gerçek cookie'leri otomatik eklenir.

async function getInstagramTabId(): Promise<number> {
  const tabs = await chrome.tabs.query({ url: '*://*.instagram.com/*' });
  const tab = tabs.find((t) => t.id != null && !t.url?.includes('accounts/login'));
  if (tab?.id != null) return tab.id;

  // Açık sekme yok — arka planda bir tane aç, yüklenince kullan
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url: 'https://www.instagram.com/', active: false }, (newTab) => {
      if (!newTab.id) return reject(new Error('Sekme açılamadı'));
      const tabId = newTab.id;
      const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
        if (id !== tabId || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tabId);
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

async function igFetch(
  endpoint: string,
  params?: Record<string, string>,
  method = 'GET',
  body?: Record<string, string>,
) {
  const tabId = await getInstagramTabId();

  return new Promise<unknown>((resolve, reject) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: 'IG_FETCH', endpoint, params, method, body },
      (res: { ok: boolean; data?: unknown; error?: string } | undefined) => {
        if (chrome.runtime.lastError) {
          // Content script henüz enjekte edilmemiş olabilir — programatik inject et
          chrome.scripting
            .executeScript({
              target: { tabId },
              files: ['content-script.js'],
            })
            .then(() => {
              chrome.tabs.sendMessage(
                tabId,
                { type: 'IG_FETCH', endpoint, params, method, body },
                (res2: { ok: boolean; data?: unknown; error?: string } | undefined) => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                  } else if (res2?.ok) {
                    resolve(res2.data);
                  } else {
                    reject(new Error(res2?.error ?? 'Bilinmeyen hata'));
                  }
                },
              );
            })
            .catch(reject);
          return;
        }
        if (res?.ok) resolve(res.data);
        else reject(new Error(res?.error ?? 'Bilinmeyen hata'));
      },
    );
  });
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
      if (existing.windowId != null) {
        chrome.windows.update(existing.windowId, { focused: true });
      }
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
      if (existing.windowId != null) {
        chrome.windows.update(existing.windowId, { focused: true });
      }
    } else {
      chrome.tabs.create({ url: panelUrl });
    }
  });
});

export {};
