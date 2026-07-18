// Instagram sekmesi içinde çalışır.
// Background'dan gelen IG_FETCH mesajlarını alır, sayfanın kendi cookie'leriyle
// fetch yapar ve sonucu geri döner.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'IG_FETCH') return false;

  (async () => {
    try {
      const csrf =
        document.cookie
          .split(';')
          .find((c) => c.trim().startsWith('csrftoken='))
          ?.split('=')[1] ?? '';

      let url = `https://www.instagram.com${msg.endpoint as string}`;
      if (msg.params && Object.keys(msg.params).length > 0) {
        url += '?' + new URLSearchParams(msg.params as Record<string, string>).toString();
      }

      const headers: Record<string, string> = {
        'X-CSRFToken': csrf,
        'X-IG-App-ID': '936619743392459',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': '*/*',
        'Referer': 'https://www.instagram.com/',
      };

      let body: string | undefined;
      if (msg.body) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = new URLSearchParams(msg.body as Record<string, string>).toString();
      }

      const res = await fetch(url, {
        method: (msg.method as string) ?? 'GET',
        credentials: 'include', // sayfanın cookie'leri otomatik gider
        headers,
        body,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        sendResponse({ ok: false, error: `HTTP ${res.status} — ${text.slice(0, 300)}` });
        return;
      }

      const data = await res.json();
      sendResponse({ ok: true, data });
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  })();

  return true; // async kanalı açık tut
});

export {};
