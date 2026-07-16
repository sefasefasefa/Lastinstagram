/**
 * Auth-platform HTML'ini analiz eder.
 *
 * Kullanım:
 *   pnpm --filter @workspace/scripts run dump:challenge
 *
 * Önce bir giriş denemesi yap — sunucu challenge_html_dump.html'yi otomatik
 * oluşturur. Ardından bu scripti çalıştır.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DUMP_PATH = path.resolve(
  __dirname,
  "../../lib/instagram-client/challenge_html_dump.html",
);

function analyzeChallengeHTML(htmlContent: string): void {
  console.log(
    "[ANALİZ] HTML analiz ediliyor... Boyut:",
    (htmlContent.length / 1024).toFixed(2),
    "KB",
  );

  // 1. Tüm script bloklarını ayıkla
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gim;
  let match: RegExpExecArray | null;
  const scriptBlocks: string[] = [];

  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    const block = (match[1] ?? "").trim();
    if (block !== "") scriptBlocks.push(block);
  }
  console.log(`[ANALİZ] Toplam ${scriptBlocks.length} adet script bloğu bulundu.`);

  // 2. Kritik anahtar kelimeler geçen blokları filtrele
  const keywords = [
    "challenge_context",
    "challenge",
    "apc",
    "sharedData",
    "additionalData",
    "_sharedData",
  ];

  const matched: string[] = [];
  scriptBlocks.forEach((code, index) => {
    const foundKeywords = keywords.filter((k) => code.includes(k));
    if (foundKeywords.length > 0) {
      matched.push(
        `\n${"=".repeat(80)}\n` +
          `SCRIPT BLOCK #${index}  (${code.length} karakter)  |  Bulunanlar: ${foundKeywords.join(", ")}\n` +
          `${"=".repeat(80)}\n` +
          code.slice(0, 4000) +
          (code.length > 4000 ? `\n... (+${code.length - 4000} karakter daha)` : ""),
      );
    }
  });

  // 3. Regex desenleri dene ve sonuçları raporla
  const patterns: Array<{ name: string; re: RegExp }> = [
    { name: "double-quote JSON", re: /"challenge_context"\s*:\s*"((?:[^"\\]|\\.)*)"/  },
    { name: "single-quote JS",   re: /'challenge_context'\s*:\s*'((?:[^'\\]|\\.)*)'/  },
    { name: "html-encoded",      re: /&quot;challenge_context&quot;\s*:\s*&quot;((?:(?!&quot;).)*)&quot;/ },
    { name: "apc=...",            re: /[?&]apc=([^&"'\s]+)/                             },
    { name: "window._sharedData",re: /window\._sharedData\s*=\s*(\{)/                  },
  ];

  console.log("\n[PATTERN TESTLERİ]");
  for (const { name, re } of patterns) {
    const m = htmlContent.match(re);
    if (m) {
      const preview = (m[1] ?? m[0]).slice(0, 120);
      console.log(`  ✓ ${name}: ${preview}${preview.length === 120 ? "..." : ""}`);
    } else {
      console.log(`  ✗ ${name}: bulunamadı`);
    }
  }

  // 4. Sonuçları dosyaya yaz
  const outPath = path.resolve(__dirname, "../../challenge_dump.js");
  fs.writeFileSync(outPath, matched.join("\n") || "(Eşleşen script bloğu bulunamadı)", "utf-8");
  console.log(`\n[BAŞARILI] ${matched.length} blok şuraya yazıldı: ${outPath}`);
  console.log(
    "[İPUCU] challenge_dump.js dosyasını aç ve 'challenge_context' kelimesinin\n" +
      "         nasıl atandığını incele (obje alt kırılımı mı, escape edilmiş mi).",
  );
}

// ── Ana akış ────────────────────────────────────────────────────────────────
if (!fs.existsSync(DUMP_PATH)) {
  console.error(
    "[HATA] Dump dosyası bulunamadı:", DUMP_PATH,
    "\nÖnce uygulamada bir Instagram girişi dene — challenge_html_dump.html otomatik oluşur.",
  );
  process.exit(1);
}

const html = fs.readFileSync(DUMP_PATH, "utf-8");
analyzeChallengeHTML(html);
