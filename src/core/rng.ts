/** Deterministic PRNG so a seed reproduces the same map. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cheap value-noise field used to lay out forest and stone patches. */
export function valueNoise2D(seed: number): (x: number, y: number, scale: number) => number {
  const rnd = mulberry32(seed);
  const perm = new Float64Array(256);
  for (let i = 0; i < 256; i++) perm[i] = rnd();
  const at = (ix: number, iy: number) => perm[(ix * 73856093 + iy * 19349663) & 255];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x, y, scale) => {
    const fx = x / scale;
    const fy = y / scale;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = smooth(fx - ix);
    const ty = smooth(fy - iy);
    const a = at(ix, iy);
    const b = at(ix + 1, iy);
    const c = at(ix, iy + 1);
    const d = at(ix + 1, iy + 1);
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  };
}
