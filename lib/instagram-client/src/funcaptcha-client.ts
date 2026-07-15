/**
 * Funcaptcha (Arkose Labs) solver client.
 *
 * Calls the local funcaptcha solver HTTP server (lib/funcaptcha-solver/server.py)
 * which is started alongside the API server. When Instagram returns a captcha
 * challenge during login, this client obtains a bypass token that can be
 * submitted in the retry request.
 *
 * The solver runs on port 8003 (configurable via FUNCAPTCHA_SERVER_PORT).
 * If the server is unavailable, all functions return null/false gracefully.
 */

const FUNCAPTCHA_PORT = process.env["FUNCAPTCHA_SERVER_PORT"] ?? "8003";
const FUNCAPTCHA_BASE = `http://127.0.0.1:${FUNCAPTCHA_PORT}`;

interface CreateTaskResponse {
  success: boolean;
  task_id?: string;
  err?: string;
}

interface GetTaskResponse {
  type: string;
  status: "processing" | "completed";
  task_id: string;
  captcha?: {
    success: boolean;
    token?: string;
    err?: string;
    procces_time?: number;
  };
}

/**
 * Attempts to solve an Arkose FunCaptcha challenge using the local solver server.
 *
 * @param preset  Solver preset name. Use "instagram_login" for Instagram.
 * @param options Optional blob, proxy, chrome version, and timeoutMs.
 * @returns       The solved arkose token string, or null if solving failed.
 */
export async function solveFuncaptcha(
  preset: string,
  options: {
    blob?: string;
    proxy?: string;
    chromeVersion?: string;
    /** Poll timeout in ms. Default 60 000. */
    timeoutMs?: number;
  } = {},
): Promise<string | null> {
  try {
    // Step 1 — create task
    const createRes = await fetch(`${FUNCAPTCHA_BASE}/funcaptcha/createTask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preset,
        chrome_version: options.chromeVersion ?? "129",
        ...(options.proxy ? { proxy: options.proxy } : {}),
        ...(options.blob ? { blob: options.blob } : {}),
      }),
      signal: AbortSignal.timeout(5000),
    });

    const created = (await createRes.json()) as CreateTaskResponse;
    if (!created.success || !created.task_id) {
      console.warn("[funcaptcha] createTask failed:", created.err);
      return null;
    }

    const taskId = created.task_id;

    // Step 2 — poll until completed or timeout
    const deadline = Date.now() + (options.timeoutMs ?? 60_000);
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));

      const getRes = await fetch(`${FUNCAPTCHA_BASE}/funcaptcha/getTask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId }),
        signal: AbortSignal.timeout(5000),
      });

      const task = (await getRes.json()) as GetTaskResponse;

      if (task.status === "completed") {
        if (task.captcha?.success && task.captcha.token) {
          console.log(
            "[funcaptcha] Çözüldü! Token:",
            task.captcha.token.slice(0, 30) + "...",
          );
          return task.captcha.token;
        }
        console.warn("[funcaptcha] Solve failed:", task.captcha?.err);
        return null;
      }
    }

    console.warn("[funcaptcha] Timed out waiting for solve");
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
  if (proxyList.length === 0) return null;

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
    // A POST with a known-bad preset returns 200 with success:false — server is up
    const res = await fetch(`${FUNCAPTCHA_BASE}/funcaptcha/createTask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset: "_ping_" }),
      signal: AbortSignal.timeout(2000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}
