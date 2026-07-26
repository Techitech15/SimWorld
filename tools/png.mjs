// Minimal dependency-free PNG encoder + pixel drawing helpers.
// Used by tools/generate-sprites.mjs to produce the MVP pixel-art assets
// described in section 12 of the design document.
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Encode an RGBA byte array (width*height*4) into a PNG buffer. */
export function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter: none
    rgba.copy
      ? rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4)
      : Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, rowStart + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function parseColor(color) {
  if (Array.isArray(color)) return color;
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) : 255;
  return [r, g, b, a];
}

/** Deterministic PRNG so regenerating the sprites yields identical bytes. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 4, 0);
  }

  set(x, y, color) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const [r, g, b, a] = parseColor(color);
    const i = (y * this.width + x) * 4;
    if (a === 255 || this.data[i + 3] === 0) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = a;
      return;
    }
    // simple source-over blend
    const sa = a / 255;
    const da = this.data[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    this.data[i] = Math.round((r * sa + this.data[i] * da * (1 - sa)) / oa);
    this.data[i + 1] = Math.round((g * sa + this.data[i + 1] * da * (1 - sa)) / oa);
    this.data[i + 2] = Math.round((b * sa + this.data[i + 2] * da * (1 - sa)) / oa);
    this.data[i + 3] = Math.round(oa * 255);
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return [0, 0, 0, 0];
    const i = (y * this.width + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  fill(color) {
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) this.set(x, y, color);
  }

  rect(x, y, w, h, color) {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) this.set(x + dx, y + dy, color);
  }

  strokeRect(x, y, w, h, color) {
    for (let dx = 0; dx < w; dx++) {
      this.set(x + dx, y, color);
      this.set(x + dx, y + h - 1, color);
    }
    for (let dy = 0; dy < h; dy++) {
      this.set(x, y + dy, color);
      this.set(x + w - 1, y + dy, color);
    }
  }

  hline(x, y, w, color) {
    for (let dx = 0; dx < w; dx++) this.set(x + dx, y, color);
  }

  vline(x, y, h, color) {
    for (let dy = 0; dy < h; dy++) this.set(x, y + dy, color);
  }

  line(x0, y0, x1, y1, color) {
    let dx = Math.abs(x1 - x0);
    let dy = -Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1;
    let sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  disc(cx, cy, r, color) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d <= r * r) this.set(x, y, color);
      }
    }
  }

  /** Draw a 1px outline around every opaque pixel (section 12: 1px dark outline). */
  outline(color, region) {
    const { x = 0, y = 0, w = this.width, h = this.height } = region ?? {};
    const targets = [];
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        if (this.get(px, py)[3] !== 0) continue;
        const neighbours = [
          this.get(px - 1, py),
          this.get(px + 1, py),
          this.get(px, py - 1),
          this.get(px, py + 1),
        ];
        if (neighbours.some((n) => n[3] > 0)) targets.push([px, py]);
      }
    }
    for (const [px, py] of targets) this.set(px, py, color);
  }

  /** Copy this canvas into a destination canvas at (ox, oy). */
  blitTo(dest, ox, oy) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const [r, g, b, a] = this.get(x, y);
        if (a > 0) dest.set(ox + x, oy + y, [r, g, b, a]);
      }
    }
  }

  toPNG() {
    return encodePNG(this.width, this.height, this.data);
  }
}
