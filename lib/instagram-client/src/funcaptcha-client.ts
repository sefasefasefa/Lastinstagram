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
 * @param options Optional blob, proxy, and chrome version.
 * @returns       The solved arkose token string, or null if solving failed.
 */
export async function solveFuncaptcha(
  preset: string,
  options: { blob?: string; proxy?: string; chromeVersion?: string } = {},
): Promise<string | null> {
  try {
    // Step 1 — create task
    const createRes = await fetch(`${FUNCAPTCHA_BASE}/funcaptcha/createTask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preset,
        chrome_version: options.chromeVersion ?? "130",
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

    // Step 2 — poll until completed or timeout (60 s)
    const deadline = Date.now() + 60_000;
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
            "[funcaptcha] Solved! token starts with:",
            task.captcha.token.slice(0, 30),
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
