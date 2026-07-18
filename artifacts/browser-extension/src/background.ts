// ─── Instagram API proxy ──────────────────────────────────────────────────────
// Service worker'lar CORS kısıtlamasına tabi değildir.
// Panel, background'a mesaj gönderir; background Instagram'ı çağırır ve
// sonucu geri döner. credentials:'include' ile oturum cookie'leri otomatik eklenir.

async function igFetch(
  endpoint: string,
  params?: Record<string, string>,
  method = 'GET',
  formBody?: Record<string, string>,
) {
  const csrfCookie = await chrome.cookies.get({
    url: 'https://www.instagram.com',
    name: 'csrftoken',
  });
  const csrf = csrfCookie?.value ?? '';

  let url = `https://www.instagram.com${endpoint}`;
  if (params && Object.keys(params).length > 0) {
    url += '?' + new URLSearchParams(params).toString();
  }

  const headers: Record<string, string> = {
    'X-CSRFToken': csrf,
    'X-IG-App-ID': '936619743392459',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': '*/*',
    'Referer': 'https://www.instagram.com/',
    'Origin': 'https://www.instagram.com',
  };

  if (formBody) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers,
    body: formBody ? new URLSearchParams(formBody).toString() : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} — ${text.slice(0, 300)}`);
  }

  return res.json();
}

// ─── Mesaj dinleyici ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'IG_API') return false;

  igFetch(msg.endpoint, msg.params, msg.method ?? 'GET', msg.body)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err: Error) => sendResponse({ ok: false, error: err.message }));

  return true; // Async kanalı açık tut
});

// ─── Instagram oturumu izleyici ───────────────────────────────────────────────
// Kullanıcı instagram.com'a giriş yapınca sessionid cookie'si oluşur.
// Oluştuğu an paneli otomatik aç veya odakla.
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

// ─── Toolbar tıklaması ───────────────────────────────────────────────────────
// Popup tanımlıysa bu tetiklenmez; popup yoksa fallback olarak paneli açar.
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
