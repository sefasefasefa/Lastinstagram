/**
 * Manages the lifecycle of the funcaptcha solver subprocess
 * (lib/funcaptcha-solver/server.py).
 *
 * Call startFuncaptchaServer() once during API server startup. The Python
 * Flask server listens on port 8003 and is used by the Instagram login flow
 * to solve Arkose FunCaptcha challenges automatically.
 *
 * The server is optional — if Python or the solver is unavailable the login
 * flow continues without captcha solving (the user sees the challenge error).
 */

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Windows: "py" launcher is the most reliable; fallback to "python". Linux/macOS: "python3". */
function defaultPythonCmd(): string {
  return process.platform === "win32" ? "py" : "python3";
}

/**
 * Returns the Replit-specific npm global modules path if we're running inside
 * Replit (detected by REPL_ID env var), otherwise returns undefined so the
 * system default NODE_PATH is used instead.
 */
function replitNpmGlobals(): string | undefined {
  if (!process.env.REPL_ID) return undefined;
  return path.resolve(process.cwd(), ".config", "npm", "node_global", "node_modules");
}

function findSolverScript(): string {
  const candidates = [
    // Bundled: artifacts/api-server/dist -> lib/funcaptcha-solver
    path.resolve(__dirname, "..", "..", "..", "lib", "funcaptcha-solver", "app.py"),
    // Source: artifacts/api-server/src/lib -> lib/funcaptcha-solver
    path.resolve(__dirname, "..", "..", "..", "..", "lib", "funcaptcha-solver", "app.py"),
    path.resolve(process.cwd(), "lib", "funcaptcha-solver", "app.py"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
}

let solverProcess: ChildProcess | null = null;

export function startFuncaptchaServer(): void {
  const scriptPath = findSolverScript();
  if (!fs.existsSync(scriptPath)) {
    console.warn("[funcaptcha-server] app.py not found at", scriptPath, "— skipping");
    return;
  }

  const solverDir = path.dirname(scriptPath);

  console.log("[funcaptcha-server] Starting solver at", scriptPath);

  const pythonCmd = process.env.FUNCAPTCHA_PYTHON ?? process.env.STEALTH_REQUESTS_PYTHON ?? defaultPythonCmd();
  solverProcess = spawn(pythonCmd, [scriptPath], {
    cwd: solverDir,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    env: {
      ...process.env,
      // jsdom lookup path — Replit stores npm globals in a non-standard location.
      // On Windows / plain Linux VPS the standard npm prefix is used instead.
      NODE_PATH: replitNpmGlobals() ?? process.env.NODE_PATH ?? "",
    },
  });

  solverProcess.stdout?.setEncoding("utf-8");
  solverProcess.stdout?.on("data", (chunk: string) => {
    process.stdout.write(`[funcaptcha] ${chunk}`);
  });

  solverProcess.stderr?.setEncoding("utf-8");
  solverProcess.stderr?.on("data", (chunk: string) => {
    // Flask prints its startup banner to stderr — show it but don't treat as error
    process.stderr.write(`[funcaptcha] ${chunk}`);
  });

  solverProcess.on("error", (err) => {
    console.warn("[funcaptcha-server] Failed to start:", err.message);
    solverProcess = null;
  });

  solverProcess.on("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGTERM") {
      console.warn(`[funcaptcha-server] Exited with code=${code} signal=${signal}`);
    }
    solverProcess = null;
  });
}

export function stopFuncaptchaServer(): void {
  if (solverProcess) {
    // Windows does not support SIGTERM on spawned processes; kill() without
    // a signal sends SIGTERM on Unix and terminates the process on Windows.
    solverProcess.kill();
    solverProcess = null;
  }
}

// Clean up on process exit
process.on("exit", stopFuncaptchaServer);
process.on("SIGINT", () => { stopFuncaptchaServer(); process.exit(0); });
// SIGTERM is supported on Linux/macOS; on Windows it is not sent by the OS
// but Node.js still accepts it programmatically, so keep the handler.
process.on("SIGTERM", () => { stopFuncaptchaServer(); process.exit(0); });
