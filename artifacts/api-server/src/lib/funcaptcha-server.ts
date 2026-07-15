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

function findSolverScript(): string {
  const candidates = [
    // Bundled: artifacts/api-server/dist -> lib/funcaptcha-solver
    path.resolve(__dirname, "..", "..", "..", "lib", "funcaptcha-solver", "server.py"),
    // Source: artifacts/api-server/src/lib -> lib/funcaptcha-solver
    path.resolve(__dirname, "..", "..", "..", "..", "lib", "funcaptcha-solver", "server.py"),
    path.resolve(process.cwd(), "lib", "funcaptcha-solver", "server.py"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
}

let solverProcess: ChildProcess | null = null;

export function startFuncaptchaServer(): void {
  const scriptPath = findSolverScript();
  if (!fs.existsSync(scriptPath)) {
    console.warn("[funcaptcha-server] server.py not found at", scriptPath, "— skipping");
    return;
  }

  const solverDir = path.dirname(scriptPath);

  console.log("[funcaptcha-server] Starting solver at", scriptPath);

  solverProcess = spawn("python3", [scriptPath], {
    cwd: solverDir,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    env: {
      ...process.env,
      // jsdom is installed at .config/npm/node_global/node_modules
      NODE_PATH: path.resolve(process.cwd(), ".config", "npm", "node_global", "node_modules"),
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
    solverProcess.kill("SIGTERM");
    solverProcess = null;
  }
}

// Clean up on process exit
process.on("exit", stopFuncaptchaServer);
process.on("SIGINT", () => { stopFuncaptchaServer(); process.exit(0); });
process.on("SIGTERM", () => { stopFuncaptchaServer(); process.exit(0); });
