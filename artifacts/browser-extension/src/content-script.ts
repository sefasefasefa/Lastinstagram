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
  try {
    const data = (await igFetch('/api/v1/accounts/current_user/?edit=true')) as {
      user?: unknown;
    };
    if (data?.user) {
      chrome.runtime.sendMessage({ type: 'IG_USER_DATA', user: data.user });
    }
  } catch (err) {
    // Sessiz geç — background retry eder
    console.debug('[takipci] pushUserData hata:', err);
  }
}

// Sayfa yüklendikten sonra kısa bir beklemeyle çalıştır
// (Instagram SPA bazen birkaç ms sonra cookie'yi set eder)
setTimeout(() => void pushUserData(), 800);

// ─── 2) Background'dan gelen anlık istekleri karşıla ─────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
