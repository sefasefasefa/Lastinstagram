// Instagram.com sekmelerinde otomatik çalışır.
//
// İki görevi var:
// 1) Sayfa yüklenince kullanıcı verisini çekip background'a gönderir (PUSH).
//    Panel bu sayede herhangi bir API isteği başlatmak zorunda kalmaz.
// 2) Background'dan gelen anlık IG_FETCH mesajlarını karşılar (takipçi listesi vb.).

// ─── Yardımcı: sayfanın cookie'siyle fetch ───────────────────────────────────
async function igFetch(
  endpoint: string,
  params?: Record<string, string>,
  method = 'GET',
  body?: Record<string, string>,
): Promise<unknown> {
  const csrf =
    document.cookie
      .split(';')
      .find((c) => c.trim().startsWith('csrftoken='))
      ?.split('=')[1] ?? '';

  let url = endpoint.startsWith('http')
    ? endpoint
    : `https://www.instagram.com${endpoint}`;

  if (params && Object.keys(params).length > 0) {
    url += '?' + new URLSearchParams(params).toString();
  }

  const headers: Record<string, string> = {
    'X-CSRFToken': csrf,
    'X-IG-App-ID': '936619743392459',
    'X-Requested-With': 'XMLHttpRequest',
    Accept: '*/*',
    Referer: 'https://www.instagram.com/',
  };

  if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';

  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers,
    body: body ? new URLSearchParams(body).toString() : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ─── 1) Kullanıcı verisini çek ve background'a gönder ────────────────────────
async function pushUserData() {
  // sessionid HttpOnly olduğu için document.cookie'de görünmez.
  // Her zaman isteği dene — giriş yapılmamışsa API 401 döner, sessizce geçilir.

  // Yol A: Instagram'ın sayfa içine gömdüğü veriyi ağ çağrısı olmadan oku
  try {
    // window.__additionalDataCurrentUser (profil sayfası) veya _sharedData
    const win = window as Record<string, unknown>;
    const viewer =
      (win['__additionalDataCurrentUser'] as Record<string, unknown> | undefined)?.['data']?.['user'] ??
      (win['_sharedData'] as Record<string, unknown> | undefined)?.['config']?.['viewer'];
    if (viewer && (viewer as Record<string, unknown>)['pk']) {
      chrome.runtime.sendMessage({ type: 'IG_USER_DATA', user: viewer });
      return; // Başarıyla gönderildi — API çağrısına gerek yok
    }
  } catch (_) { /* devam */ }

  // Yol B: API isteği
  try {
    const data = (await igFetch('/api/v1/accounts/current_user/?edit=true')) as {
      user?: unknown;
    };
    if (data?.user) {
      chrome.runtime.sendMessage({ type: 'IG_USER_DATA', user: data.user });
      return;
    }
  } catch (err) {
    console.debug('[takipci] pushUserData API hata:', err);
  }

  // Yol C: /api/v1/accounts/current_user/ (edit parametresiz)
  try {
    const data2 = (await igFetch('/api/v1/accounts/current_user/')) as {
      user?: unknown;
    };
    if (data2?.user) {
      chrome.runtime.sendMessage({ type: 'IG_USER_DATA', user: data2.user });
    }
  } catch (err2) {
    console.debug('[takipci] pushUserData yedek API hata:', err2);
  }
}

// Sayfa yüklendikten sonra kısa bir beklemeyle çalıştır
// (Instagram SPA bazen birkaç ms sonra cookie'yi set eder)
setTimeout(() => void pushUserData(), 800);

// ─── DOM üzerinden hikaye beğeni butonu bul ve tıkla ─────────────────────────
// Bu yalnızca Instagram sayfası açıkken çalışır.
// "like=true" → beğen butonu ara; "like=false" → geri al butonu ara.
function domClickStoryLikeBtn(like: boolean): boolean {
  // aria-label değerleri: TR / EN / DE / FR / ES / PT / RU / JA / AR
  const likeLabels   = ['Beğen', 'Like', 'Gefällt mir', "J'aime", 'Me gusta', 'Curtir', 'Нравится', 'いいね！', 'أعجبني'];
  const unlikeLabels = ['Beğenme', 'Unlike', 'Gefällt mir nicht mehr', "Je n'aime plus", 'Ya no me gusta', 'Não curtir', 'Не нравится', 'いいね！を取り消す', 'إلغاء الإعجاب'];
  const labels = like ? likeLabels : unlikeLabels;

  let btn: HTMLButtonElement | null = null;
  for (const label of labels) {
    btn =
      document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ??
      (document.querySelector<SVGElement>(`svg[aria-label="${label}"]`)?.closest('button') as HTMLButtonElement | null);
    if (btn) break;
  }

  // Belirli bir etiket bulunamazsa ekranda görünen tek beğeni butonunu dene
  if (!btn) {
    btn = document.querySelector<HTMLButtonElement>('button[aria-label*="egen"]') ??
          document.querySelector<HTMLButtonElement>('button[aria-label*="ike"]');
  }

  if (!btn) return false;

  // Gerçek insan tıklamasını simüle et (bubbles:true şeffaf overlay'leri aşar)
  for (const type of ['mousedown', 'mouseup', 'click'] as const) {
    btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
  return true;
}

// ─── 2) Background'dan gelen anlık istekleri karşıla ─────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'DOM_LIKE_STORY') {
    const ok = domClickStoryLikeBtn(msg.like as boolean);
    sendResponse({ ok });
    return false;
  }

  if (msg.type !== 'IG_FETCH') return false;

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

export {};
