/**
 * Node.js -> Stealth-Requests (Python) bridge.
 *
 * Spawns the bundled Python bridge script, sends a request spec as JSON,
 * and returns a fetch-compatible Response object. Used by the Instagram
 * direct-login flow to make login requests with Chrome-impersonated TLS
 * and rotating user agents.
 *
 * The bridge is optional: if Python or the stealth package is unavailable,
 * the wrapper falls back to native fetch so the login flow never breaks
 * silently.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findBridgeScript(): string {
  const candidates = [
    // Bundled artifact path: artifacts/api-server/dist -> lib/stealth-requests
    path.resolve(__dirname, "..", "..", "..", "lib", "stealth-requests", "bridge.py"),
    // Source path: lib/instagram-client/src -> lib/stealth-requests
    path.resolve(__dirname, "..", "..", "stealth-requests", "bridge.py"),
    // Fallback relative to project root via cwd
    path.resolve(process.cwd(), "lib", "stealth-requests", "bridge.py"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

const BRIDGE_SCRIPT = findBridgeScript();
// Windows: "py" launcher is most reliable (installed with Python by default).
// Linux/macOS: "python3". Override via STEALTH_REQUESTS_PYTHON env var.
const PYTHON_CMD = process.env.STEALTH_REQUESTS_PYTHON ?? (process.platform === "win32" ? "py" : "python3");

function bridgeScriptExists(): boolean {
  try {
    return fs.statSync(BRIDGE_SCRIPT).isFile();
  } catch {
    return false;
  }
}

interface BridgeResponse {
  status: number;
  ok: boolean;
  url: string;
  headers: Record<string, string>;
  cookies: string[];
  body: string; // base64
  body_encoding: string;
  elapsed?: number;
  error?: string;
  trace?: string;
}

interface BridgeRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  body_encoding?: "utf-8" | "base64";
  timeout?: number;
  retry?: number;
}

function pythonAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(PYTHON_CMD, ["-c", "import sys; sys.exit(0)"], {
      stdio: "ignore",
    });
    proc.on("error", () => resolve(false));
    proc.on("exit", (code) => resolve(code === 0));
  });
}

async function callBridge(request: BridgeRequest): Promise<BridgeResponse> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_CMD, [BRIDGE_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdin!.write(JSON.stringify(request));
    proc.stdin!.end();

    proc.stdout!.setEncoding("utf-8");
    proc.stdout!.on("data", (chunk) => {
      stdout += chunk;
    });

    proc.stderr!.setEncoding("utf-8");
    proc.stderr!.on("data", (chunk) => {
      stderr += chunk;
    });

    proc.on("error", (err) => reject(err));
    proc.on("exit", (code) => {
      let parsed: BridgeResponse;
      try {
        parsed = JSON.parse(stdout) as BridgeResponse;
      } catch (parseErr) {
        reject(
          new Error(
            `Stealth bridge returned non-JSON (exit ${code}): ${stdout.slice(0, 500)}${stderr ? " | stderr: " + stderr.slice(0, 500) : ""}`,
          ),
        );
        return;
      }
      if (code !== 0 || !parsed.ok) {
        const message = parsed.error ?? `Stealth bridge failed (exit ${code})`;
        reject(new Error(message));
        return;
      }
      resolve(parsed);
    });
  });
}

class BridgeResponseWrapper {
  readonly status: number;
  readonly ok: boolean;
  readonly url: string;
  readonly headers: Headers;
  readonly body: ReadableStream<Uint8Array> | null = null;
  readonly bodyUsed = false;
  readonly redirected = false;
  readonly statusText = "OK";
  readonly type = "default" as "default";

  private _buffer: Buffer;
  private _cookies: string[];

  constructor(data: BridgeResponse) {
    this.status = data.status;
    this.ok = data.ok && this.status < 400;
    this.url = data.url;
    this.headers = new Headers(data.headers);
    this._buffer = Buffer.from(data.body, "base64");
    this._cookies = data.cookies ?? [];
  }

  clone(): Response {
    return new BridgeResponseWrapper({
      status: this.status,
      ok: this.ok,
      url: this.url,
      headers: Object.fromEntries(this.headers.entries()),
      cookies: [...this._cookies],
      body: this._buffer.toString("base64"),
      body_encoding: "base64",
    }) as unknown as Response;
  }

  arrayBuffer(): Promise<ArrayBuffer> {
    return Promise.resolve(this._buffer.buffer.slice(
      this._buffer.byteOffset,
      this._buffer.byteOffset + this._buffer.byteLength,
    ) as ArrayBuffer);
  }

  blob(): Promise<Blob> {
    return Promise.resolve(new Blob([new Uint8Array(this._buffer)]));
  }

  formData(): Promise<FormData> {
    return Promise.reject(new Error("formData not supported in stealth bridge"));
  }

  json(): Promise<unknown> {
    return Promise.resolve(JSON.parse(this._buffer.toString("utf-8")));
  }

  text(): Promise<string> {
    return Promise.resolve(this._buffer.toString("utf-8"));
  }

  bytes(): Promise<Uint8Array> {
    return Promise.resolve(new Uint8Array(this._buffer));
  }

  getSetCookie(): string[] {
    return this._cookies;
  }
}

let _pythonCheck: Promise<boolean> | null = null;
async function isAvailable(): Promise<boolean> {
  if (!bridgeScriptExists()) return false;
  if (_pythonCheck) return _pythonCheck;
  _pythonCheck = pythonAvailable();
  return _pythonCheck;
}

/**
 * Drop-in replacement for `fetch` that routes the request through the
 * Stealth-Requests Python bridge. If the bridge is unavailable or the request
 * fails, falls back to native `fetch`.
 */
export async function stealthFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  if (!(await isAvailable())) {
    return fetch(input, init);
  }

  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const method = init?.method?.toUpperCase() ?? "GET";

  const headers: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [key, value] of init.headers) {
        headers[key] = value;
      }
    } else {
      Object.assign(headers, init.headers);
    }
  }

  let body: string | undefined;
  let bodyEncoding: "utf-8" | "base64" = "utf-8";
  if (init?.body) {
    if (init.body instanceof Uint8Array || init.body instanceof ArrayBuffer) {
      const buf = Buffer.from(init.body as ArrayBufferLike);
      body = buf.toString("base64");
      bodyEncoding = "base64";
    } else if (typeof init.body === "string") {
      body = init.body;
    } else if (init.body instanceof URLSearchParams) {
      body = init.body.toString();
    } else {
      body = String(init.body);
    }
  }

  const request: BridgeRequest = {
    method,
    url,
    headers,
    body,
    body_encoding: bodyEncoding,
    timeout: 60,
    retry: 2,
  };

  try {
    const response = await callBridge(request);
    return new BridgeResponseWrapper(response) as unknown as Response;
  } catch (err) {
    // Fallback to native fetch so a bridge failure never blocks login.
    console.warn(
      "[stealth-bridge] Falling back to native fetch:",
      err instanceof Error ? err.message : err,
    );
    return fetch(input, init);
  }
}
