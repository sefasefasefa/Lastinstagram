/**
 * Post-Vite build step.
 * 1. Copies dist/shared/ → dist/chrome/ and dist/firefox/
 * 2. Writes the correct manifest.json into each directory
 * 3. Creates zip archives: dist/takipci-paneli-chrome.zip and dist/takipci-paneli-firefox.zip
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const sharedDir = path.join(distDir, "shared");

// Copy public assets (icons) that Vite puts in dist/shared/
// (they're already there from the Vite public/ copy)

for (const browser of ["chrome", "firefox"]) {
  const outDir = path.join(distDir, browser);

  // Clean and recreate
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  // Copy all shared build output
  copyDir(sharedDir, outDir);

  // Write the correct manifest
  const manifest = fs.readFileSync(
    path.join(__dirname, "manifests", `${browser}.json`),
    "utf-8"
  );
  fs.writeFileSync(path.join(outDir, "manifest.json"), manifest);

  // Create zip
  const zipName = `takipci-paneli-${browser}.zip`;
  const zipPath = path.join(distDir, zipName);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(`cd "${outDir}" && zip -r "${zipPath}" .`, { stdio: "inherit" });

  console.log(`✓ dist/${browser}/ → dist/${zipName}`);
}

function copyDir(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
