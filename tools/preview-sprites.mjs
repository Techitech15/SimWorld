// Dev helper: builds a scaled-up contact sheet of every generated sprite so the
// art can be eyeballed without opening the game. Output is not shipped.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Canvas } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPRITES = path.join(ROOT, 'src', 'assets');
const SCALE = 3;

function decodePNG(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(width * height * 4);
  const stride = width * 4;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter !== 0) throw new Error(`unsupported filter ${filter}`);
    raw.copy(out, y * stride, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
  }
  return { width, height, data: out };
}

const files = [];
// src/assets holds sprites.ts beside the sprite directories, so this has to
// look at what each entry is rather than assuming everything there is a folder.
for (const entry of fs.readdirSync(SPRITES, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  for (const f of fs.readdirSync(path.join(SPRITES, entry.name))) {
    if (!f.endsWith('.png')) continue;
    files.push(path.join(entry.name, f));
  }
}

const images = files.map((f) => ({
  name: f,
  img: decodePNG(fs.readFileSync(path.join(SPRITES, f))),
}));
const cols = 6;
const cellW = Math.max(...images.map((i) => i.img.width)) * SCALE + 8;
const cellH = Math.max(...images.map((i) => i.img.height)) * SCALE + 8;
const rows = Math.ceil(images.length / cols);
const sheet = new Canvas(cols * cellW, rows * cellH);
sheet.fill('#202028');
images.forEach(({ img }, i) => {
  const ox = (i % cols) * cellW + 4;
  const oy = Math.floor(i / cols) * cellH + 4;
  for (let y = 0; y < img.height * SCALE; y++) {
    for (let x = 0; x < img.width * SCALE; x++) {
      const si = (Math.floor(y / SCALE) * img.width + Math.floor(x / SCALE)) * 4;
      const a = img.data[si + 3];
      if (a > 0) sheet.set(ox + x, oy + y, [img.data[si], img.data[si + 1], img.data[si + 2], a]);
    }
  }
});

const out = process.argv[2] ?? path.join(ROOT, 'sprite-preview.png');
fs.writeFileSync(out, sheet.toPNG());
console.log(`${images.length} sprites ->`, out);
images.forEach((i, idx) => console.log(`${idx}: ${i.name}`));
