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

      // ── Token okuma ─────────────────────────────────────────────────────────
      let fbDtsg = '', lsd = '', userId = '';

      // Yöntem 1: window.require() — eski layout'larda hâlâ çalışabilir
      try { fbDtsg = (win.require?.('DTSGInitData') as AnyObj | undefined)?.['token'] as string ?? ''; } catch { /* ignore */ }
      try { lsd   = (win.require?.('LSD')           as AnyObj | undefined)?.['token'] as string ?? ''; } catch { /* ignore */ }
      try {
        const u = win.require?.('CurrentUserInitialData') as AnyObj | undefined;
        userId = String(u?.['USER_ID'] ?? u?.['userId'] ?? '');
      } catch { /* ignore */ }

      // Yöntem 2: __bbox (Meta'nın bootloader bootstrap dizisi)
      // Format: [["ModuleName", [], {token:"..."}, ...], ...]
      if (!fbDtsg || !lsd) {
        try {
          const bbox = (win as AnyObj & { __bbox?: { require?: unknown[][] } })['__bbox'];
          for (const item of (bbox?.['require'] ?? []) as unknown[][]) {
            if (!Array.isArray(item)) continue;
            const name = item[0];
            const payload = (item[3] as AnyObj[] | undefined)?.[0] as AnyObj | undefined;
            if (name === 'DTSGInitData' && payload?.['token']) fbDtsg = payload['token'] as string;
            if (name === 'LSD'          && payload?.['token']) lsd    = payload['token'] as string;
            if (name === 'CurrentUserInitialData' && !userId) {
              userId = String(payload?.['USER_ID'] ?? payload?.['userId'] ?? '');
            }
          }
        } catch { /* ignore */ }
      }

      // Yöntem 3: inline <script> tag'larında regex ile tarama
      // Instagram, tokenları bootloader veri bloklarında gömer:
      // "DTSGInitData",[],{"token":"XXXX",...}
      if (!fbDtsg || !lsd || !userId) {
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const s of scripts) {
          const t = s.textContent ?? '';
          if (!t) continue;
          if (!fbDtsg) {
            const m = t.match(/"DTSGInitData"\s*,\s*\[\s*\]\s*,\s*\{\s*"token"\s*:\s*"([^"]+)"/);
            if (m) fbDtsg = m[1];
          }
          if (!lsd) {
            const m = t.match(/"LSD"\s*,\s*\[\s*\]\s*,\s*\{\s*"token"\s*:\s*"([^"]+)"/);
            if (m) lsd = m[1];
          }
          if (!userId || userId === '0') {
            const m = t.match(/"USER_ID"\s*:\s*"(\d+)"/);
            if (m) userId = m[1];
          }
          if (!userId || userId === '0') {
            const m = t.match(/"viewer_id"\s*:\s*"(\d+)"/);
            if (m) userId = m[1];
          }
          if (fbDtsg && lsd && userId && userId !== '0') break;
        }
      }

      // Yöntem 4: window globals taraması (son çare)
      if (!fbDtsg) {
        for (const k of Object.keys(win)) {
          try {
            const v = win[k] as AnyObj;
            if (v && typeof v === 'object') {
              if (typeof v['fb_dtsg'] === 'string' && v['fb_dtsg']) { fbDtsg = v['fb_dtsg'] as string; break; }
              if (typeof v['dtsg']    === 'string' && v['dtsg'])    { fbDtsg = v['dtsg']    as string; break; }
            }
          } catch { /* ignore */ }
        }
      }
      if (!lsd) {
        for (const k of Object.keys(win)) {
          try {
            const v = win[k] as AnyObj;
            if (v && typeof v === 'object' && typeof v['lsd'] === 'string' && v['lsd']) {
              lsd = v['lsd'] as string; break;
            }
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
          const vu = (r['data'] as AnyObj)?.['viewer']?.['user'] as AnyObj | undefined;
          userId = String(vu?.['pk'] ?? vu?.['fbid_v2'] ?? '');
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
        // pk veya fbid_v2 — hangisi varsa normalize et
        const pkVal = (userDict?.['pk'] ?? userDict?.['fbid_v2']) as string | undefined;
        if (pkVal) return { ok: true, user: { ...userDict, pk: pkVal } };
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

// ─── Sekmenin hâlâ açık olup olmadığını doğrula ──────────────────────────────
async function isTabAlive(tabId: number): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab != null && tab.status === 'complete';
  } catch {
    return false;
  }
}

// ─── Tüm IG API istekleri için ortak giriş noktası ────────────────────────────
async function igFetch(
  endpoint: string,
  params?: Record<string, string>,
  method = 'GET',
  body?: Record<string, string>,
): Promise<unknown> {
  const isTabError = (e: unknown) =>
    e instanceof Error && (
      e.message.includes('No tab with id') ||
      e.message.includes('Cannot access') ||
      e.message.includes('No frame with id') ||
      e.message.includes('tab') && e.message.includes('closed')
    );

  // Sekme al ve gerekirse bir kez taze sekmeyle tekrar dene
  let tabId = await getInstagramTabId();

  const run = async (tid: number): Promise<unknown> => {
    if (endpoint === '/api/v1/accounts/current_user/?edit=true' && method === 'GET') {
      return getCurrentUserViaTab(tid);
    }
    let url = endpoint.startsWith('http') ? endpoint : `https://www.instagram.com${endpoint}`;
    if (params && Object.keys(params).length > 0) url += '?' + new URLSearchParams(params).toString();
    const bodyStr = body ? new URLSearchParams(body).toString() : null;
    return igFetchViaTab(tid, url, method, bodyStr);
  };

  try {
    // Kullanmadan önce sekmenin hâlâ yaşıyor olduğunu doğrula
    if (!(await isTabAlive(tabId))) {
      tabId = await getInstagramTabId();
    }
    return await run(tabId);
  } catch (e) {
    if (isTabError(e)) {
      // Sekme kapanmış — taze bir sekme al ve bir kez daha dene
      tabId = await getInstagramTabId();
      return run(tabId);
    }
    throw e;
  }
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
