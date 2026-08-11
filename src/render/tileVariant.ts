// Deterministic per-tile variant picker (issue #19, 段階 G-1: terrain variation).
//
// The existing forest split used `(tile.x * 7 + tile.y * 13) % 2` inline in
// the renderer. That reads fine at count=2 - both multipliers are odd - but
// it does not survive being widened to more variants: 7 % 3 === 1 and
// 13 % 3 === 1, so `(x*7 + y*13) % 3` collapses to `(x + y) % 3`, which is
// constant along every diagonal (x+y = const) and draws as a visible
// diagonal stripe across the map. See tileVariant.test.ts for the regression
// check that catches exactly this failure mode.
//
// This hash instead runs the coordinates through independent large odd
// multipliers, XORs them, and mixes the result once more (Murmur-style
// finalizer) before reducing mod `count`, so the low bits `% count` actually
// reads do not inherit structure from the multipliers themselves.
export function variantAt(x: number, y: number, count: number): number {
  if (count <= 1) return 0;
  // `| 0` normalises to a 32-bit int first so negative coordinates go through
  // the same bit-mixing as positive ones instead of producing a huge float.
  let h = ((x | 0) * 73856093) ^ ((y | 0) * 19349663);
  h = h >>> 0;
  // fmix32-style finalizer (as used in MurmurHash3): spreads bits from the
  // XOR above across the whole 32-bit word before we ever look at `% count`.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h % count;
}
