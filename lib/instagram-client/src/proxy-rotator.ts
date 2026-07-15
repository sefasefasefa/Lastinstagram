/**
 * Proxy rotator — free proxy list'ten proxy çeker ve funcaptcha denemeleri için
 * rotasyon yapar. Liste 10 dakikada bir yenilenir; başarısız proxy'ler oturumdan
 * çıkarılır.
 */

const DEFAULT_PROXY_LIST_URL =
  "https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text";

const PROXY_LIST_URL =
  process.env["PROXY_LIST_URL"] ?? DEFAULT_PROXY_LIST_URL;

/** ms cinsinden proxy listesi önbellek süresi */
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 dakika

let cachedProxies: string[] = [];
let cacheExpiresAt = 0;
const failedProxies = new Set<string>();

/**
 * ProxyScrape URL'inden proxy listesini indirir, önbelleğe alır.
 * Hata durumunda mevcut önbelleği korur.
 */
export async function fetchProxyList(): Promise<string[]> {
  if (Date.now() < cacheExpiresAt && cachedProxies.length > 0) {
    return cachedProxies;
  }

  try {
    const res = await fetch(PROXY_LIST_URL, {
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    const proxies = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l.includes("://"));

    if (proxies.length > 0) {
      cachedProxies = proxies;
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      // Yeni liste geldiğinde başarısız listesini temizle
      failedProxies.clear();
      console.log(`[proxy-rotator] ${proxies.length} proxy yüklendi`);
    }
  } catch (err) {
    console.warn(
      "[proxy-rotator] Liste indirilemedi:",
      err instanceof Error ? err.message : err,
    );
  }

  return cachedProxies;
}

/** Bir proxy'yi başarısız olarak işaretle (bu oturumda tekrar denenmez). */
export function markProxyFailed(proxy: string): void {
  failedProxies.add(proxy);
}

/**
 * Kullanılabilir proxy listesinden rastgele `count` adet döndürür.
 * HTTP proxy'lere öncelik verir (Arkose için daha uyumlu).
 */
export function pickProxies(all: string[], count: number): string[] {
  const available = all.filter((p) => !failedProxies.has(p));

  // HTTP önce, sonra geri kalanlar
  const http = available.filter((p) => p.startsWith("http://"));
  const others = available.filter((p) => !p.startsWith("http://"));
  const ordered = [...shuffle(http), ...shuffle(others)];

  return ordered.slice(0, count);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
