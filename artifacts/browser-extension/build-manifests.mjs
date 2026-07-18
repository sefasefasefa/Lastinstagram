/**
 * Post-Vite build step.
 * Copies dist/shared/ → dist/universal/, writes a single manifest that works
 * on Chrome, Edge AND Firefox, and zips it into one file.
 *
 * Chrome/Edge silently ignore the Firefox-specific `browser_specific_settings`
 * field, so a single manifest covers all three browsers.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const sharedDir = path.join(distDir, "shared");
const outDir = path.join(distDir, "universal");

// Clean and recreate
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// Copy all shared build output
copyDir(sharedDir, outDir);

// Strip crossorigin attributes from HTML files (Chrome/Firefox treat
// chrome-extension:// and moz-extension:// resources as cross-origin when
// the attribute is present, which silently drops stylesheets).
for (const file of fs.readdirSync(outDir).filter(f => f.endsWith('.html'))) {
  const htmlPath = path.join(outDir, file);
  const fixed = fs.readFileSync(htmlPath, 'utf-8').replace(/ crossorigin(?:="[^"]*")?/g, '');
  fs.writeFileSync(htmlPath, fixed);
}

// Write the universal manifest
const manifest = fs.readFileSync(
  path.join(__dirname, "manifests", "universal.json"),
  "utf-8"
);
fs.writeFileSync(path.join(outDir, "manifest.json"), manifest);

// Create a single zip
const zipPath = path.join(distDir, "takipci-paneli.zip");
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
execSync(`cd "${outDir}" && zip -r "${zipPath}" .`, { stdio: "inherit" });

console.log(`✓ dist/universal/ → dist/takipci-paneli.zip`);
console.log(`  Chrome, Edge ve Firefox ile uyumlu tek dosya.`);

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
