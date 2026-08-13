// Reusable "does the player actually see this" metric (issue #30).
//
// The bug #30 reports was never caught because nothing measured what
// fraction of a player's *visible screen* a moving effect covers over time -
// only "how many of them are there". This module is that measurement, and
// it deliberately knows nothing about clouds: it scores any time-varying set
// of circles against a sliding viewport window, so the same function covers
// wind (#23, grass swaying) once that exists, or any future screen-space
// weather effect, without being rewritten.
//
// Pure and random-free: screenCoverage() is a fold over two nested,
// evenly-spaced sample grids (time x window position), so the same inputs
// always produce the same output.

/**
 * A single "thing that darkens/covers part of the screen" at one instant,
 * in tile-space. Deliberately generic - a `CloudShadow` (clouds.ts) maps
 * onto this with `strength = alpha`, but nothing here says "cloud".
 */
export interface CoverageDisc {
  /** tile-space center */
  x: number;
  y: number;
  /** tiles */
  radius: number;
  /** 0..1 - how strongly this disc reads as covering the screen. A disc
   *  below VISIBLE_STRENGTH_THRESHOLD does not count as covering anything,
   *  the same way a cloud faded out at the wrap seam should not count even
   *  though it geometrically overlaps the window (see clouds.ts fadeFactor). */
  strength: number;
}

/**
 * Viewport window size, in tiles, used as the sampling window below.
 *
 * Derived from TILE_SIZE (32px, src/core/constants.ts) and a conservative
 * assumption about how much of the browser window is actually game canvas:
 * the renderer's canvas fills its host div (`resizeTo: host` in
 * renderer.ts), and that host is whatever space is left after the docked UI
 * panels (resource bar, build menu, minimap, event log - see src/ui/App.tsx)
 * take their share of a modest laptop-class viewport, at the default zoom
 * of 1 (camera.ts createCamera). Using the *smaller* end of plausible
 * viewport sizes is intentional: this metric should catch "not enough
 * coverage" under the least generous screen a player is likely to have, not
 * only on a maximized 4K monitor. 512x448 CSS px / 32px tiles = 16x14 tiles.
 */
export const WINDOW_WIDTH_TILES = 16;
export const WINDOW_HEIGHT_TILES = 14;

/** A disc only counts as visible coverage once it is at least this strong. */
export const VISIBLE_STRENGTH_THRESHOLD = 0.02;

/** How often to sample elapsed time. Coverage effects here drift at most a
 *  fraction of a tile per second, so 5s steps do not alias the motion. */
export const SAMPLE_INTERVAL_MS = 5_000;

/** How far apart (in tiles) to slide the viewport window across the map
 *  when scanning for "wherever the player happens to be looking, is there
 *  coverage". Coarse is fine - discs are several tiles wide, and this is
 *  scanning for gaps, not rendering. */
export const WINDOW_STEP_TILES = 8;

export interface ScreenCoverageOptions {
  /** Total elapsed-time span to sample, in ms. Required - callers decide
   *  how long a stretch is representative (e.g. 20 minutes of play). */
  durationMs: number;
  /** @default SAMPLE_INTERVAL_MS */
  sampleIntervalMs?: number;
  /** @default WINDOW_STEP_TILES */
  windowStepTiles?: number;
  /** @default VISIBLE_STRENGTH_THRESHOLD */
  visibleStrengthThreshold?: number;
  /** @default WINDOW_WIDTH_TILES */
  windowWidthTiles?: number;
  /** @default WINDOW_HEIGHT_TILES */
  windowHeightTiles?: number;
}

/** True if a circle (cx, cy, radius) overlaps an axis-aligned rectangle. */
function circleOverlapsRect(
  cx: number,
  cy: number,
  radius: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  const closestX = Math.min(Math.max(cx, rx), rx + rw);
  const closestY = Math.min(Math.max(cy, ry), ry + rh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

function windowIsCovered(
  discs: readonly CoverageDisc[],
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  threshold: number,
): boolean {
  for (const disc of discs) {
    if (disc.strength < threshold) continue;
    if (circleOverlapsRect(disc.x, disc.y, disc.radius, rx, ry, rw, rh)) return true;
  }
  return false;
}

/**
 * Fraction (0..1) of "a player is looking somewhere on the map, at some
 * moment in `[0, durationMs]`" samples where at least one visible disc is on
 * their screen.
 *
 * This does not model a specific camera path - it exhaustively scans every
 * window position across the map (stepped by `windowStepTiles`) at every
 * time sample, which is a stand-in for "no matter where the player happens
 * to be looking, how often do they see this effect". A fixed camera path
 * would depend on where the colony is built; this does not.
 *
 * `discsAt` is the same shape as `cloudsAt` (clouds.ts): a pure function of
 * elapsed time producing the current list of discs. Pass an adapter for any
 * other screen-space effect (e.g. future wind gusts) to reuse this unchanged.
 */
export function screenCoverage(
  discsAt: (elapsedMs: number) => readonly CoverageDisc[],
  mapWidth: number,
  mapHeight: number,
  options: ScreenCoverageOptions,
): number {
  const {
    durationMs,
    sampleIntervalMs = SAMPLE_INTERVAL_MS,
    windowStepTiles = WINDOW_STEP_TILES,
    visibleStrengthThreshold = VISIBLE_STRENGTH_THRESHOLD,
    windowWidthTiles = WINDOW_WIDTH_TILES,
    windowHeightTiles = WINDOW_HEIGHT_TILES,
  } = options;

  // Clamped to 0 so a map smaller than the window still yields one sample
  // position (at the origin) instead of an empty scan range.
  const maxWindowX = Math.max(0, mapWidth - windowWidthTiles);
  const maxWindowY = Math.max(0, mapHeight - windowHeightTiles);

  let coveredSamples = 0;
  let totalSamples = 0;

  for (let t = 0; t <= durationMs; t += sampleIntervalMs) {
    const discs = discsAt(t);
    for (let wy = 0; wy <= maxWindowY; wy += windowStepTiles) {
      for (let wx = 0; wx <= maxWindowX; wx += windowStepTiles) {
        totalSamples++;
        if (
          windowIsCovered(discs, wx, wy, windowWidthTiles, windowHeightTiles, visibleStrengthThreshold)
        ) {
          coveredSamples++;
        }
      }
    }
  }

  return totalSamples === 0 ? 0 : coveredSamples / totalSamples;
}
