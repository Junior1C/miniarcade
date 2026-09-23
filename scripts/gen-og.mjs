import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 1200;
const HEIGHT = 630;

const COLORS = {
  bg: [34, 13, 13],
  band: [51, 16, 16],
  text: [243, 244, 246],
  accent: [37, 99, 235],
  focus: [251, 191, 36],
  danger: [239, 68, 68],
};

const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
};

function fillRect(px, x, y, w, h, [r, g, b]) {
  for (let row = Math.max(0, y); row < Math.min(HEIGHT, y + h); row += 1) {
    for (let col = Math.max(0, x); col < Math.min(WIDTH, x + w); col += 1) {
      const i = (row * WIDTH + col) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
}

function drawText(px, text, x, y, scale, color) {
  let cursor = x;
  for (const ch of text) {
    const glyph = FONT[ch];
    if (!glyph) {
      cursor += scale * 3;
      continue;
    }
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] === '1') {
          fillRect(px, cursor + col * scale, y + row * scale, scale, scale, color);
        }
      }
    }
    cursor += scale * 6;
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(px) {
  const stride = WIDTH * 4;
  const raw = Buffer.alloc((stride + 1) * HEIGHT);
  for (let row = 0; row < HEIGHT; row += 1) {
    raw[row * (stride + 1)] = 0;
    px.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const px = Buffer.alloc(WIDTH * HEIGHT * 4);
fillRect(px, 0, 0, WIDTH, HEIGHT, COLORS.bg);
fillRect(px, 0, 0, WIDTH, 96, COLORS.band);
fillRect(px, 0, HEIGHT - 72, WIDTH, 72, COLORS.band);

const title = 'MINIARCADE';
const scale = 16;
const textWidth = title.length * 6 * scale - scale;
drawText(px, title, Math.floor((WIDTH - textWidth) / 2), 190, scale, COLORS.text);

const cardW = 260;
const cardH = 160;
const gap = 70;
const totalW = cardW * 3 + gap * 2;
const startX = Math.floor((WIDTH - totalW) / 2);
fillRect(px, startX, 380, cardW, cardH, COLORS.accent);
fillRect(px, startX + cardW + gap, 380, cardW, cardH, COLORS.focus);
fillRect(px, startX + (cardW + gap) * 2, 380, cardW, cardH, COLORS.danger);

const png = encodePng(px);
const outPath = path.join(ROOT, 'assets', 'og.png');
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, png);
console.log(`assets/og.png: ${png.length} bytes`);
