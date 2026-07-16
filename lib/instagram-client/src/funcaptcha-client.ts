/**
 * Funcaptcha (Arkose Labs) solver client.
 *
 * Calls the local FuncapSolver HTTP server (lib/funcaptcha-solver/app.py)
 * which is started alongside the API server. When Instagram returns a captcha
 * challenge during login, this client obtains a bypass token that can be
 * submitted in the retry request.
 *
 * The solver runs on port 8003 (configurable via FUNCAPTCHA_SERVER_PORT).
 * If the server is unavailable, all functions return null/false gracefully.
 *
 * API: POST /solve → { solved, token, variant, suppressed }
 */

const FUNCAPTCHA_PORT = process.env["FUNCAPTCHA_SERVER_PORT"] ?? "8003";
const FUNCAPTCHA_BASE = `http://127.0.0.1:${FUNCAPTCHA_PORT}`;

// Instagram's Arkose FunCaptcha site key
const INSTAGRAM_SITEKEY = "B7D8911C-5CC8-A9A3-35B0-554ACEE604DA";

interface SolveResponse {
  solved: boolean;
  token?: string;
  variant?: string;
  suppressed?: boolean;
  error?: string;
}

/**
 * Attempts to solve an Arkose FunCaptcha challenge using the local solver server.
 *
 * @param preset  Solver preset name. Use "instagram_login" for Instagram.
 * @param options Optional blob, proxy, and timeoutMs.
 * @returns       The solved arkose token string, or null if solving failed.
 */
export async function solveFuncaptcha(
  preset: string,
  options: {
    blob?: string;
    proxy?: string;
    chromeVersion?: string;
    /** Request timeout in ms. Default 90 000. */
    timeoutMs?: number;
  } = {},
): Promise<string | null> {
  // Map named preset to sitekey
  const sitekey =
    preset === "instagram_login" ? INSTAGRAM_SITEKEY : preset;

  try {
    const body: Record<string, unknown> = {
      private_key: sitekey,
      niggamode: true, // proxyless — no proxy required
    };
    if (options.blob) body["blob"] = options.blob;
    if (options.proxy) body["og_proxy"] = options.proxy;

    const res = await fetch(`${FUNCAPTCHA_BASE}/solve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 90_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[funcaptcha] Solver HTTP ${res.status}:`, text.slice(0, 200));
      return null;
    }

    const result = (await res.json()) as SolveResponse;

    if (result.solved && result.token) {
      console.log(
        "[funcaptcha] Çözüldü! Token:",
        result.token.slice(0, 30) + "...",
        result.suppressed ? "(suppressed/instapass)" : `variant=${result.variant}`,
      );
      return result.token;
    }

    console.warn("[funcaptcha] Solve failed:", result.error ?? "no token");
    return null;
  } catch (err) {
    // Solver server not running or request failed — not an error for the caller
    console.warn(
      "[funcaptcha] Solver unavailable:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Proxy listesinden proxy'leri alarak paralel funcaptcha çözümü dener.
 * İlk başarılı sonucu döndürür. Tüm proxy'ler başarısız olursa null döner.
 *
 * @param preset      Solver preset adı.
 * @param proxyList   Denenecek proxy URL listesi.
 * @param concurrency Aynı anda denenen proxy sayısı (default 3).
 */
export async function solveFuncaptchaWithProxies(
  preset: string,
  proxyList: string[],
  concurrency = 3,
): Promise<string | null> {
  if (proxyList.length === 0) return solveFuncaptcha(preset);

  // Proxy'leri concurrency boyutlu gruplar halinde sıraya al
  const chunks: string[][] = [];
  for (let i = 0; i < proxyList.length; i += concurrency) {
    chunks.push(proxyList.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    console.log(
      `[funcaptcha] ${chunk.length} proxy ile paralel deneme: ${chunk.map((p) => p.split("@").pop()).join(", ")}`,
    );

    // Chunk içindeki proxy'leri aynı anda dene — ilk başarılıyı al
    const result = await Promise.any(
      chunk.map((proxy) =>
        solveFuncaptcha(preset, { proxy, timeoutMs: 30_000 }).then((token) => {
          if (!token) throw new Error("no token");
          return token;
        }),
      ),
    ).catch(() => null as string | null);

    if (result) return result;

    console.warn(`[funcaptcha] Chunk başarısız, sonraki ${concurrency} proxy deneniyor...`);
  }

  return null;
}

/**
 * Quick liveness check — returns true if the funcaptcha solver server is up.
 */
export async function isFuncaptchaAvailable(): Promise<boolean> {
  try {
    // Send a request with a bogus key — server is up if we get any JSON back
    const res = await fetch(`${FUNCAPTCHA_BASE}/solve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ private_key: "_ping_", niggamode: true }),
      signal: AbortSignal.timeout(2000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}
