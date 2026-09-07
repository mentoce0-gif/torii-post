/**
 * Writes the PWA icons as PNGs with nothing but zlib.
 *
 * A build-time image dependency for three flat squares is not worth carrying,
 * and installability needs real PNGs rather than an SVG.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, paint) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = paint(x, y);
      const offset = y * (stride + 1) + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const INK = [20, 24, 29, 255];
const PAPER = [255, 255, 255, 255];
const ACCENT = [11, 95, 214, 255];

/**
 * Three bars — the three candidates — with the first one picked out. Reads at
 * 48px on a home screen, which is the only size that matters.
 */
function mark(size, { rounded, background }) {
  const radius = size * 0.22;
  const barHeight = size * 0.13;
  const gap = size * 0.075;
  const left = size * 0.22;
  const right = size * 0.78;
  const top = size * 0.28;

  return (x, y) => {
    if (rounded) {
      const cx = Math.min(x, size - 1 - x);
      const cy = Math.min(y, size - 1 - y);
      if (cx < radius && cy < radius) {
        const dx = radius - cx;
        const dy = radius - cy;
        if (dx * dx + dy * dy > radius * radius) return [0, 0, 0, 0];
      }
    }

    for (let i = 0; i < 3; i += 1) {
      const barTop = top + i * (barHeight + gap);
      if (y >= barTop && y < barTop + barHeight && x >= left && x < right) {
        return i === 0 ? ACCENT : INK;
      }
    }
    return background;
  };
}

mkdirSync(OUT_DIR, { recursive: true });

const outputs = [
  ['icon-192.png', 192, { rounded: true, background: PAPER }],
  ['icon-512.png', 512, { rounded: true, background: PAPER }],
  // Maskable icons are cropped to a circle, so this one keeps a full bleed.
  ['maskable-512.png', 512, { rounded: false, background: PAPER }],
  ['apple-touch-icon.png', 180, { rounded: false, background: PAPER }],
];

for (const [name, size, options] of outputs) {
  writeFileSync(path.join(OUT_DIR, name), png(size, mark(size, options)));
  console.log(`wrote ${name} (${size}x${size})`);
}
