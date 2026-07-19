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
        if (pkVal) return { ok: true, user: { ...userDict, pk: pkVal }, fbDtsg, lsd, csrf };
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
  // Login sırasında elde edilen tokenları storage'a kaydet — mutation'lar buradan okur
  if (data['fbDtsg'] && data['lsd']) {
    chrome.storage.local.set({
      igGqlTokens: {
        fbDtsg: data['fbDtsg'],
        lsd:    data['lsd'],
        csrf:   data['csrf'] ?? '',
        ts:     Date.now(),
      },
    });
  }
  return data['user'] as Record<string, unknown>;
}

// ─── GraphQL Mutation (beğeni vb. — HAR'a göre /graphql/query endpoint'i) ────
// HAR analizi:
//   Post/Reel like → PolarisAPILikePostMutation          doc_id=27358573637160660
//   Story like     → usePolarisStoriesV4LikeMutationLikeMutation  doc_id=26938887309082050
// Gerekli tokenlar (fb_dtsg, lsd, actor_id) sayfadan okunur; __actor_id__
// placeholder'ı varsa gerçek değerle değiştirilir.
async function igGqlMutationViaTab(
  tabId: number,
  docId: string,
  variables: Record<string, unknown>,
  friendlyName: string,
  knownActorId: string,
  cachedTokens?: Record<string, unknown>,   // login sırasında storage'a kaydedilen tokenlar
): Promise<unknown> {
  // Tokenları storage'dan kullan; yoksa sayfadan çek (fallback)
  const preFbDtsg = String(cachedTokens?.['fbDtsg'] ?? '');
  const preLsd    = String(cachedTokens?.['lsd']    ?? '');
  const preCsrf   = String(cachedTokens?.['csrf']   ?? '');

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (
      _docId: string,
      variablesJson: string,
      _friendlyName: string,
      _knownActorId: string,
      _preFbDtsg: string,
      _preLsd: string,
      _preCsrf: string,
    ) => {
      type AnyObj = Record<string, unknown>;
      const win = window as AnyObj & {
        require?: (m: string) => AnyObj;
        __bbox?: { require?: unknown[][] };
      };

      let fbDtsg = _preFbDtsg, lsd = _preLsd;

      // Sayfadan yeniden çek (cachedTokens eksikse veya başarısız olursa)
      if (!fbDtsg || !lsd) {
        // Yöntem 0: window.require()
        try {
          if (!fbDtsg) fbDtsg = (win.require?.('DTSGInitData') as AnyObj | undefined)?.['token'] as string ?? '';
          if (!lsd)    lsd    = (win.require?.('LSD')           as AnyObj | undefined)?.['token'] as string ?? '';
        } catch { /* ignore */ }

        // Yöntem 1: __bbox bootloader
        if (!fbDtsg || !lsd) {
          try {
            for (const item of ((win.__bbox?.require ?? []) as unknown[][])) {
              if (!Array.isArray(item)) continue;
              const name = item[0] as string;
              const payload = (item[3] as AnyObj[] | undefined)?.[0] as AnyObj | undefined;
              if (name === 'DTSGInitData' && payload?.['token']) fbDtsg = payload['token'] as string;
              if (name === 'LSD'          && payload?.['token']) lsd    = payload['token'] as string;
              if (fbDtsg && lsd) break;
            }
          } catch { /* ignore */ }
        }

        // Yöntem 2: inline <script> taraması
        if (!fbDtsg || !lsd) {
          for (const s of Array.from(document.querySelectorAll('script'))) {
            const t = s.textContent ?? '';
            if (!t) continue;
            if (!fbDtsg) { const m = t.match(/"DTSGInitData"\s*,\s*\[\s*\]\s*,\s*\{\s*"token"\s*:\s*"([^"]+)"/); if (m) fbDtsg = m[1]; }
            if (!lsd)    { const m = t.match(/"LSD"\s*,\s*\[\s*\]\s*,\s*\{\s*"token"\s*:\s*"([^"]+)"/);         if (m) lsd    = m[1]; }
            if (fbDtsg && lsd) break;
          }
        }
      }

      if (!fbDtsg || !lsd) {
        return { ok: false, error: `Token eksik — fb_dtsg:${!!fbDtsg} lsd:${!!lsd}` };
      }

      const csrf = _preCsrf ||
        (document.cookie.split(';').find((c) => c.trim().startsWith('csrftoken='))?.split('=')[1] ?? '');
      const jazoest = '2' + String(Array.from(fbDtsg).reduce((s, c) => s + c.charCodeAt(0), 0));

      const actorId = _knownActorId || '0';
      const vars = JSON.parse(variablesJson) as AnyObj;
      const inp = vars['input'] as AnyObj | undefined;
      if (inp && (!inp['actor_id'] || inp['actor_id'] === '__actor_id__')) {
        inp['actor_id'] = actorId;
      }

      const body = new URLSearchParams({
        av: actorId,
        __d: 'www', __user: '0', __a: '1',
        fb_dtsg: fbDtsg, jazoest, lsd,
        fb_api_caller_class: 'RelayModern',
        fb_api_req_friendly_name: _friendlyName,
        server_timestamps: 'true',
        variables: JSON.stringify(vars),
        doc_id: _docId,
      });

      const res = await fetch('https://www.instagram.com/api/graphql', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'x-asbd-id': '359341',
          'x-csrftoken': csrf,
          'x-fb-lsd': lsd,
          'x-fb-friendly-name': _friendlyName,
          'x-ig-app-id': '936619743392459',
          'x-ig-max-touch-points': '0',
        },
        body: body.toString(),
      });

      const text = await res.text();
      if (!text || text.trimStart().startsWith('<'))
        return { ok: false, error: `HTML yanıt (${res.status}): ${text.slice(0, 120)}` };
      try {
        const d = JSON.parse(text) as AnyObj;
        if ((d['errors'] as unknown[] | undefined)?.length)
          return { ok: false, error: JSON.stringify(d['errors']).slice(0, 300) };
        // GraphQL data-level errors
        const dataObj = d['data'] as AnyObj | undefined;
        if (dataObj) {
          for (const val of Object.values(dataObj)) {
            const v = val as AnyObj | null;
            if (v && typeof v === 'object' && v['__typename'] === 'XDTApiError')
              return { ok: false, error: JSON.stringify(v).slice(0, 300) };
          }
        }
        return { ok: true, data: d };
      } catch {
        return { ok: false, error: text.slice(0, 300) };
      }
    },
    args: [docId, JSON.stringify(variables), friendlyName, knownActorId, preFbDtsg, preLsd, preCsrf],
  });

  const r = results[0];
  if (r?.error) throw new Error('executeScript hatası: ' + r.error.message);
  const data = r?.result as Record<string, unknown> | null;
  if (!data) throw new Error('Yanıt boş');
  if (!data['ok']) throw new Error((data['error'] as string | undefined) ?? 'GraphQL mutation hatası');
  return data['data'];
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

// ─── Otomasyon motoru ─────────────────────────────────────────────────────────
const AUTO_ALARM = 'ig-autolike';
const AUTO_KEY   = 'igAutoState';

interface AutoState {
  enabled:          boolean;
  timeFrom:         number;   // 0-23 başlangıç saati
  timeTo:           number;   // 0-23 bitiş saati
  minDelaySec:      number;   // işlemler arası min bekleme
  maxDelaySec:      number;   // işlemler arası max bekleme
  maxPerDay:        number;   // günlük max beğeni
  targetType:       'stories' | 'reels' | 'both';
  // runtime (persist)
  todayCount:       number;
  todayDate:        string;   // 'YYYY-MM-DD'
  nextRunAt:        number;   // ms timestamp — erken çalışma
  backoffUntil:     number;   // ms timestamp — 429 bekleme
  consecutiveErrors:number;
  lastActionLabel:  string;   // son işlem açıklaması
}

const AUTO_DEFAULTS: AutoState = {
  enabled: false, timeFrom: 9, timeTo: 23,
  minDelaySec: 45, maxDelaySec: 120, maxPerDay: 50, targetType: 'stories',
  todayCount: 0, todayDate: '', nextRunAt: 0, backoffUntil: 0,
  consecutiveErrors: 0, lastActionLabel: '',
};

function getAutoState(): Promise<AutoState> {
  return new Promise((res) =>
    chrome.storage.local.get([AUTO_KEY], (r) =>
      res({ ...AUTO_DEFAULTS, ...(r[AUTO_KEY] as Partial<AutoState> ?? {}) }),
    ),
  );
}
function patchAutoState(patch: Partial<AutoState>): Promise<void> {
  return new Promise((res) =>
    chrome.storage.local.get([AUTO_KEY], (r) => {
      const cur = { ...AUTO_DEFAULTS, ...(r[AUTO_KEY] as Partial<AutoState> ?? {}) };
      chrome.storage.local.set({ [AUTO_KEY]: { ...cur, ...patch } }, res);
    }),
  );
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function inWindow(from: number, to: number): boolean {
  const h = new Date().getHours();
  return from <= to ? h >= from && h < to : h >= from || h < to;
}
function randDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Takip listesi önbelleği (4 saat geçerli)
let _followingCache: string[] = [];
let _followingCacheTs = 0;
async function getCachedFollowingPks(userId: string): Promise<string[]> {
  if (_followingCache.length > 0 && Date.now() - _followingCacheTs < 4 * 3600_000) return _followingCache;
  try {
    const data = await igFetch(`/api/v1/friendships/${userId}/following/`, { count: '200' }) as Record<string, unknown>;
    const users = (data['users'] as Array<Record<string, unknown>>) ?? [];
    _followingCache = users.map((u) => String(u['pk'] ?? '')).filter(Boolean);
    _followingCacheTs = Date.now();
  } catch { /* önbelleksiz devam */ }
  return _followingCache;
}

function broadcastAutoStatus(): void {
  const panelUrl = chrome.runtime.getURL('panel.html');
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      if (t.url === panelUrl && t.id != null)
        chrome.tabs.sendMessage(t.id, { type: 'IG_AUTO_STATUS' }).catch(() => {});
    }
  });
}

async function runAutoLikeTick(): Promise<void> {
  const s = await getAutoState();
  if (!s.enabled) return;
  const now = Date.now();
  if (s.backoffUntil > now) return;
  if (!inWindow(s.timeFrom, s.timeTo)) return;

  // Günlük sayaç sıfırla
  const today = todayStr();
  if (s.todayDate !== today) { await patchAutoState({ todayCount: 0, todayDate: today }); s.todayCount = 0; }
  if (s.todayCount >= s.maxPerDay) return;
  if (s.nextRunAt > now) return;

  // Aktif kullanıcı al
  const stored = await new Promise<Record<string, unknown>>((res) =>
    chrome.storage.local.get(['igUser'], (r) => res(r as Record<string, unknown>)),
  );
  const igUserData = stored['igUser'] as Record<string, unknown> | undefined;
  const userId = String(igUserData?.['pk'] ?? igUserData?.['fbid_v2'] ?? '');
  if (!userId) return;

  const targets = await getCachedFollowingPks(userId);
  if (targets.length === 0) return;
  const targetPk = targets[Math.floor(Math.random() * targets.length)];

  try {
    let liked = false;
    let label = '';

    if (s.targetType === 'stories' || s.targetType === 'both') {
      const data = await igFetch(`/api/v1/feed/reels_media/`, { reel_ids: targetPk }) as Record<string, unknown>;
      const reel = ((data['reels'] as Record<string, unknown> | undefined)?.[targetPk]) as Record<string, unknown> | undefined;
      const items = ((reel?.['items'] as Array<Record<string, unknown>>) ?? []).filter((i) => !(i['has_liked'] as boolean));
      if (items.length > 0) {
        const story = items[Math.floor(Math.random() * items.length)];
        const sid = String(story['pk'] ?? String(story['id'] ?? '').split('_')[0]);
        await igFetch(`/api/v1/media/${sid}/like/`, undefined, 'POST', { media_id: sid, d: '1' });
        liked = true; label = `Hikaye beğenildi (${targetPk})`;
      }
    }

    if (!liked && (s.targetType === 'reels' || s.targetType === 'both')) {
      const data = await igFetch(`/api/v1/clips/user/`, undefined, 'POST',
        { target_user_id: targetPk, page_size: '6', include_feed_video: 'true' }) as Record<string, unknown>;
      const items = ((data['items'] as Array<Record<string, unknown>>) ?? [])
        .map((w) => ((w['media'] as Record<string, unknown> | undefined) ?? w))
        .filter((m) => !(m['has_liked'] as boolean));
      if (items.length > 0) {
        const media = items[Math.floor(Math.random() * items.length)];
        const mid = String(media['pk'] ?? media['id'] ?? '');
        await igFetch(`/api/v1/media/${mid}/like/`, undefined, 'POST', { media_id: mid, d: '1' });
        liked = true; label = `Reel beğenildi (${targetPk})`;
      }
    }

    await patchAutoState({
      todayCount: s.todayCount + (liked ? 1 : 0),
      todayDate: today,
      nextRunAt: now + randDelay(s.minDelaySec, s.maxDelaySec) * 1000,
      consecutiveErrors: 0,
      lastActionLabel: label || `İçerik bulunamadı (${targetPk})`,
    });
    broadcastAutoStatus();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const is429 = /429|rate.?limit|spam|feedback_required/i.test(msg);
    const newErrors = s.consecutiveErrors + 1;
    const backoff = is429 ? 30 * 60_000 : Math.min(newErrors * 5 * 60_000, 60 * 60_000);
    await patchAutoState({ consecutiveErrors: newErrors, backoffUntil: now + backoff, lastActionLabel: `Hata: ${msg.slice(0,80)}` });
    broadcastAutoStatus();
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

  if (msg.type === 'IG_GQL_MUTATION') {
    // actor_id + gql tokenlarını storage'dan oku (login sırasında kaydedildi)
    chrome.storage.local.get(['igUser', 'igGqlTokens'], (result) => {
      const storedUser   = result['igUser']      as Record<string, unknown> | undefined;
      const storedTokens = result['igGqlTokens'] as Record<string, unknown> | undefined;
      const knownActorId = String(storedUser?.['pk'] ?? storedUser?.['fbid_v2'] ?? '');
      getInstagramTabId()
        .then((tabId) =>
          igGqlMutationViaTab(
            tabId,
            msg.docId as string,
            msg.variables as Record<string, unknown>,
            msg.friendlyName as string,
            knownActorId,
            storedTokens,
          ),
        )
        .then((result) => {
            // igGqlMutationViaTab { ok, data?, error? } döndürür — iç ok'u
            // doğrudan ilet; her zaman { ok: true } sarmalamak hataları gizler.
            if (!result.ok)
              sendResponse({ ok: false, error: (result as { ok: false; error: string }).error ?? 'GraphQL mutation başarısız' });
            else
              sendResponse({ ok: true, data: (result as { ok: true; data: unknown }).data });
          })
        .catch((err: Error) => sendResponse({ ok: false, error: err.message }));
    });
    return true;
  }

  // Otomasyon: mevcut durumu oku
  if (msg.type === 'IG_AUTO_GET') {
    getAutoState().then((st) => sendResponse(st));
    return true;
  }

  // Otomasyon: ayarları güncelle (sadece izin verilen alanlar)
  if (msg.type === 'IG_AUTO_SET') {
    const allowed: (keyof AutoState)[] = ['enabled','timeFrom','timeTo','minDelaySec','maxDelaySec','maxPerDay','targetType'];
    const patch: Partial<AutoState> = {};
    for (const k of allowed) {
      if (k in (msg.patch as object)) (patch as Record<string, unknown>)[k] = (msg.patch as Record<string, unknown>)[k];
    }
    // Aktifleştiriliyorsa nextRunAt'ı sıfırla (hemen çalışabilsin)
    if (patch.enabled === true) patch.nextRunAt = 0;
    patchAutoState(patch).then(() => {
      broadcastAutoStatus();
      sendResponse({ ok: true });
    });
    return true;
  }

  // Otomasyon: takip önbelleğini temizle (liste değişince kullanıcı tetikler)
  if (msg.type === 'IG_AUTO_CLEAR_CACHE') {
    _followingCache = []; _followingCacheTs = 0;
    sendResponse({ ok: true });
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

// ─── Alarmlar ─────────────────────────────────────────────────────────────────
const ALARM = 'ig-keepalive';

function ensureAlarms() {
  chrome.alarms.get(ALARM, (e) => { if (!e) chrome.alarms.create(ALARM, { periodInMinutes: 20 }); });
  chrome.alarms.get(AUTO_ALARM, (e) => { if (!e) chrome.alarms.create(AUTO_ALARM, { periodInMinutes: 1 }); });
}
ensureAlarms();
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM, { periodInMinutes: 20 });
  chrome.alarms.create(AUTO_ALARM, { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) {
    chrome.cookies.get({ url: 'https://www.instagram.com', name: 'sessionid' }, (c) => {
      if (!c?.value) return;
      igFetch('/api/v1/accounts/current_user/?edit=true').catch(() => {});
    });
  }
  if (alarm.name === AUTO_ALARM) {
    chrome.cookies.get({ url: 'https://www.instagram.com', name: 'sessionid' }, (c) => {
      if (!c?.value) return;
      runAutoLikeTick().catch(() => {});
    });
  }
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
