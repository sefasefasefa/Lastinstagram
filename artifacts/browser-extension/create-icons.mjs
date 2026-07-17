/**
 * Generates simple PNG icons for the browser extension.
 * Uses only Node built-ins (zlib + Buffer) — no npm packages needed.
 */
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// CRC32 lookup table
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0);
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Draws a rounded-square icon with Instagram-style gradient (pink→red→purple).
 * Size × size pixels, RGBA (color type 6).
 */
function makePNG(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.allocUnsafe(13);
  ihdrData.writeUInt32BE(size, 0);  // width
  ihdrData.writeUInt32BE(size, 4);  // height
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // RGBA
  ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;

  // Build raw pixel data (filter byte 0 per row + RGBA pixels)
  const rowBytes = 1 + size * 4;
  const raw = Buffer.alloc(size * rowBytes);
  const radius = size * 0.22;

  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const off = y * rowBytes + 1 + x * 4;
      const t = x / (size - 1); // 0→1 horizontal gradient

      // Gradient: #c13584 (pink) → #e1306c (red-pink) → #fd1d1d (red)
      const r = Math.round(193 + (253 - 193) * t);
      const g = Math.round(53  + (29  - 53)  * t);
      const b = Math.round(132 + (29  - 132) * t);

      // Rounded corners via alpha mask
      const cx = Math.min(x, size - 1 - x);
      const cy = Math.min(y, size - 1 - y);
      const inCorner = cx < radius && cy < radius;
      const dist = inCorner
        ? Math.sqrt((radius - cx) ** 2 + (radius - cy) ** 2)
        : 0;
      const alpha = inCorner ? (dist > radius ? 0 : dist > radius - 1.5 ? Math.round((radius - dist) / 1.5 * 255) : 255) : 255;

      raw[off]     = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = alpha;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  const idat = chunk("IDAT", compressed);
  const ihdr = chunk("IHDR", ihdrData);
  const iend = chunk("IEND", Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

const outDir = path.join(__dirname, "public");
fs.mkdirSync(outDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const png = makePNG(size);
  const dest = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(dest, png);
  console.log(`✓ icon${size}.png (${png.length} bytes)`);
}
