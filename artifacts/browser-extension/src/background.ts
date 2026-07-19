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
        setTimeout(() => resolve(tabId), 1000);
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

// ─── Kullanıcı verisini sekme içinden GraphQL ile çek ────────────────────────
// HAR analizine göre: GraphQL /api/graphql x-ig-www-claim gerektirmez.
// Gerekli tokenlar (fb_dtsg, lsd) sayfanın window.require() sisteminden okunur.
async function getCurrentUserViaTab(tabId: number): Promise<Record<string, unknown>> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      type AnyObj = Record<string, unknown>;
      const win = window as AnyObj & { require?: (m: string) => AnyObj };

      // ── Token okuma (Meta/Instagram modül sistemi) ──────────────────────────
      let fbDtsg = '', lsd = '', userId = '';
      try { fbDtsg = (win.require?.('DTSGInitData') as AnyObj | undefined)?.['token'] as string ?? ''; } catch { /* ignore */ }
      try { lsd = (win.require?.('LSD') as AnyObj | undefined)?.['token'] as string ?? ''; } catch { /* ignore */ }
      try {
        const u = win.require?.('CurrentUserInitialData') as AnyObj | undefined;
        userId = String(u?.['USER_ID'] ?? u?.['userId'] ?? '');
      } catch { /* ignore */ }

      // Fallback: window globals taraması
      if (!fbDtsg) {
        for (const k of Object.keys(win)) {
          try {
            const v = (win[k] as AnyObj);
            if (v && typeof v === 'object') {
              if (typeof v['fb_dtsg'] === 'string') { fbDtsg = v['fb_dtsg'] as string; break; }
              if (typeof v['dtsg'] === 'string') { fbDtsg = v['dtsg'] as string; break; }
            }
          } catch { /* ignore */ }
        }
      }
      if (!lsd) {
        for (const k of Object.keys(win)) {
          try {
            const v = win[k] as AnyObj;
            if (v && typeof v === 'object' && typeof v['lsd'] === 'string') { lsd = v['lsd'] as string; break; }
          } catch { /* ignore */ }
        }
      }

      if (!fbDtsg || !lsd) {
        return { ok: false, errors: [`Token eksik — fb_dtsg:${!!fbDtsg} lsd:${!!lsd} userId:${userId}`] };
      }

      const csrf = document.cookie.split(';').find((c) => c.trim().startsWith('csrftoken='))?.split('=')[1] ?? '';
      // jazoest = "2" + her karakterin ASCII toplamı
      const jazoest = '2' + String(Array.from(fbDtsg).reduce((s, c) => s + c.charCodeAt(0), 0));

      const gqlHeaders: Record<string, string> = {
        'content-type': 'application/x-www-form-urlencoded',
        'x-asbd-id': '359341',
        'x-csrftoken': csrf,
        'x-fb-lsd': lsd,
        'x-ig-app-id': '936619743392459',
        'x-ig-max-touch-points': '0',
        'x-ig-www-claim': '0',
      };

      const gqlPost = async (docId: string, variables: object, av = '0') => {
        const body = new URLSearchParams({
          av, __d: 'www', __user: '0', __a: '1',
          fb_dtsg: fbDtsg, jazoest, lsd,
          variables: JSON.stringify(variables),
          doc_id: docId,
        });
        const res = await fetch('https://www.instagram.com/api/graphql', {
          method: 'POST', credentials: 'include',
          headers: gqlHeaders,
          body: body.toString(),
        });
        const text = await res.text();
        if (!text || text.trimStart().startsWith('<')) throw new Error(`HTML yanıt (${res.status})`);
        const d = JSON.parse(text) as AnyObj;
        if ((d['errors'] as unknown[])?.length) throw new Error(JSON.stringify(d['errors']).slice(0, 100));
        return d;
      };

      // Kullanıcı ID'si bilinmiyorsa — viewer bilgisini bul
      // Herhangi bir GraphQL yanıtında viewer.user.pk her zaman döner
      if (!userId || userId === 'undefined' || userId === '0') {
        try {
          // Sahte bir userID ile sorgula, viewer.user.pk'yı oku
          const r = await gqlPost('26785645987802781',
            { userID: '1', '__relay_internal__pv__PolarisAIGMAccountLabelEnabledrelayprovider': false });
          userId = String((r['data'] as AnyObj)?.['viewer']?.['user']?.['pk'] ?? '');
        } catch { /* ignore */ }
      }

      if (!userId) return { ok: false, errors: ['USER_ID bulunamadı'] };

      // Tam profil verisi — PolarisUserHoverCardContentV2Query
      // doc_id: 26785645987802781 → xig_user_by_igid_v2.user_dict
      // Dönen alanlar: pk, username, full_name, profile_pic_url, follower_count, following_count, media_count, is_verified, is_private
      try {
        const r = await gqlPost('26785645987802781',
          { userID: userId, '__relay_internal__pv__PolarisAIGMAccountLabelEnabledrelayprovider': false },
          userId);
        const userDict = (r['data'] as AnyObj)?.['xig_user_by_igid_v2']?.['user_dict'] as AnyObj | undefined;
        if (userDict?.['pk']) return { ok: true, user: userDict };
        return { ok: false, errors: ['user_dict boş — ' + JSON.stringify(r['data']).slice(0, 120)] };
      } catch (e) {
        return { ok: false, errors: ['GraphQL hatası: ' + (e as Error).message] };
      }
    },
  });

  const r = results[0];
  if (r?.error) throw new Error('executeScript hatası: ' + r.error.message);
  const data = r?.result as Record<string, unknown> | null;
  if (!data) throw new Error('executeScript boş sonuç döndü');
  if (!data['ok']) {
    const errs = (data['errors'] as string[] | undefined)?.join(' | ') ?? 'bilinmeyen hata';
    throw new Error(errs);
  }
  return data['user'] as Record<string, unknown>;
}

// ─── Genel REST API fetch (takipçi/takip listesi, unfollow) ──────────────────
// HAR'a göre gerekli headerlar: x-ig-www-claim, x-asbd-id: 359341
async function igFetchViaTab(
  tabId: number,
  fullUrl: string,
  method: string,
  bodyStr: string | null,
): Promise<unknown> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (url: string, meth: string, bd: string | null) => {
      type AnyObj = Record<string, unknown>;
      const win = window as AnyObj;

      // x-ig-www-claim bul — localStorage, window globals, inline scriptler
      let wwwClaim = '0';
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const v = localStorage.getItem(localStorage.key(i) ?? '') ?? '';
          if (v.startsWith('hmac.')) { wwwClaim = v; break; }
        }
      } catch { /* ignore */ }
      if (wwwClaim === '0') {
        for (const v of Object.values(win)) {
          if (typeof v === 'string' && v.startsWith('hmac.')) { wwwClaim = v; break; }
        }
      }
      if (wwwClaim === '0') {
        // Inline script taraması
        for (const el of document.querySelectorAll('script:not([src])')) {
          const m = (el.textContent ?? '').match(/hmac\.[A-Za-z0-9_\-+=/.]{20,}/);
          if (m) { wwwClaim = m[0]; break; }
        }
      }

      const csrf = document.cookie.split(';').find((c) => c.trim().startsWith('csrftoken='))?.split('=')[1] ?? '';
      const headers: Record<string, string> = {
        'x-asbd-id': '359341',
        'x-csrftoken': csrf,
        'x-ig-app-id': '936619743392459',
        'x-ig-www-claim': wwwClaim,
        'x-ig-max-touch-points': '0',
        'x-requested-with': 'XMLHttpRequest',
        'accept': '*/*',
      };
      if (bd) headers['content-type'] = 'application/x-www-form-urlencoded';

      const res = await fetch(url, {
        method: meth, credentials: 'include', headers,
        body: bd ?? undefined,
      });
      const text = await res.text();
      if (!text || text.trimStart().startsWith('<')) return { ok: false, status: res.status, body: `HTML (${text.slice(0, 100)})` };
      try {
        const d = JSON.parse(text) as AnyObj;
        if (d['message'] === 'feedback_required') return { ok: false, status: res.status, body: JSON.stringify(d).slice(0, 200) };
        return { ok: true, data: d };
      } catch {
        return { ok: false, status: res.status, body: text.slice(0, 200) };
      }
    },
    args: [fullUrl, method, bodyStr],
  });

  const r = results[0];
  if (r?.error) throw new Error('executeScript hatası: ' + r.error.message);
  const data = r?.result as Record<string, unknown> | null;
  if (!data) throw new Error('Yanıt boş');
  if (!data['ok']) throw new Error(`HTTP ${data['status']}: ${data['body']}`);
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

  if (endpoint === '/api/v1/accounts/current_user/?edit=true' && method === 'GET') {
    return getCurrentUserViaTab(tabId);
  }

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
