// Cloud shadows drifting across the ground (issue #15). Wind (grass swaying)
// is explicitly out of scope here - that is a sprite animation-frame change,
// and docs/design-phase7-time.md 5 lists exactly that kind of thing as a
// non-goal for this area of the renderer.
//
// Same split as daylight.ts: a pure function of elapsed time producing a
// constant-size list, independent of map size, that the renderer turns into
// sprites. The clouds themselves are a fixed table (their speed, size and
// starting phase), the same "the table is the asset" choice KEYFRAMES makes
// in daylight.ts - there is nothing here that needs a random number.
import type { Vector2 } from '../core/types';

export interface CloudShadow {
  /** tile coordinates. Can sit slightly outside [0, width) / [0, height) at
   *  the wrap seam - alpha is faded to 0 there (see fadeFactor), so a shadow
   *  in that band is never actually drawn dark. */
  x: number;
  y: number;
  /** tiles */
  radius: number;
  /** 0 (invisible) .. CLOUD_ALPHA_MAX (full shadow) */
  alpha: number;
}

/**
 * A shadow, not a second night: faint enough to read as weather passing
 * overhead rather than another darkening pass on top of daylight.ts.
 *
 * 0.18 was too faint to see once there were enough clouds to look at. Note
 * this is the value at the very centre of the sprite only - the texture's
 * gradient is already at half strength 60% of the way out and zero at the rim,
 * so most of a shadow's area was darkening the ground by well under a tenth,
 * which on grass is nothing.
 *
 * 0.28 rather than a rounder 0.3 because clouds.test.ts already pins the
 * ceiling under 0.3, and that rule is worth keeping: a shadow that approaches
 * NIGHT_ALPHA (0.45) stops reading as weather and starts reading as darkness
 * stacked on darkness. The test was left alone - it is the constraint doing
 * its job, not an assumption that measurement disproved.
 */
export const CLOUD_ALPHA_MAX = 0.28;

/** Every cloud drifts the same way - one wind, not a wind per cloud. */
const WIND_DIR: Vector2 = { x: 1, y: 0.35 };
const WIND_LEN = Math.hypot(WIND_DIR.x, WIND_DIR.y);
const WIND_X = WIND_DIR.x / WIND_LEN;
const WIND_Y = WIND_DIR.y / WIND_LEN;

interface CloudDef {
  /** tile-space position at elapsedMs = 0 */
  x0: number;
  y0: number;
  /** tiles per millisecond, travelled along WIND_DIR */
  speed: number;
  /** tiles */
  radius: number;
  /** 0..1 - so not every cloud reads equally dark */
  alphaScale: number;
}

/**
 * Thirty-six clouds, each with its own speed/size/phase, spread out so they do
 * not clump on one side of the map at t = 0. `x0`/`y0` are just a starting
 * point for the drift below, not a position tied to any particular map size.
 *
 * This was five, and five turned out to be too few to be seen. Measuring the
 * shipped 120x120 map over 20 minutes of drift against a viewport-sized window
 * at many places found a shadow on screen only **14.3%** of the time - six
 * times out of seven the player is looking at ground with nothing crossing it,
 * which is exactly how it was reported ("雲の影が見えない"). The original five
 * were chosen when 60x60 was the default; the map got four times the area in
 * フェーズ6 and the table never followed. Twenty-six took it to 82.4% and
 * thirty-six to **90.3%**, all measured the same way at the current
 * WRAP_MARGIN_TILES.
 *
 * 90% is deliberately not 100%: what is being bought is a sky that is usually
 * doing something, not permanent overcast. The measure counts *any* shadow
 * touching the viewport, and most of those are a soft edge crossing a corner
 * rather than the ground going dark, so the gap between this number and how
 * shaded it feels is wide.
 *
 * The first five entries are unchanged, so the clouds that were there before
 * still drift exactly as they did.
 *
 * Radius now spans 5 to 26 tiles rather than 5 to 10. The old spread was
 * narrow enough that every shadow read as the same object at slightly
 * different sizes; a sky needs big slow ones to have any sense of scale, and
 * at 26 tiles a single shadow covers a whole settlement. Size and speed move
 * together throughout - the biggest are also the slowest, because a shadow
 * that wide crossing quickly stops being a cloud and becomes a passing wall.
 *
 * Cost stays independent of map size (one sprite each) - a bigger radius is a
 * bigger scale on the same texture, not more work.
 */
const CLOUDS: CloudDef[] = [
  { x0: 5, y0: 8, speed: 0.0012, radius: 7, alphaScale: 1.0 },
  { x0: 40, y0: 20, speed: 0.0008, radius: 10, alphaScale: 0.7 },
  { x0: 70, y0: 5, speed: 0.0015, radius: 5, alphaScale: 0.85 },
  { x0: 20, y0: 45, speed: 0.001, radius: 8, alphaScale: 0.6 },
  { x0: 90, y0: 35, speed: 0.0009, radius: 6, alphaScale: 1.0 },
  { x0: 85, y0: 52, speed: 0.0008, radius: 9, alphaScale: 0.75 },
  { x0: 55, y0: 60, speed: 0.0011, radius: 9, alphaScale: 0.8 },
  { x0: 110, y0: 62, speed: 0.0014, radius: 5, alphaScale: 0.85 },
  { x0: 15, y0: 78, speed: 0.0013, radius: 6, alphaScale: 0.9 },
  { x0: 100, y0: 88, speed: 0.0009, radius: 8, alphaScale: 0.65 },
  { x0: 48, y0: 92, speed: 0.0013, radius: 6, alphaScale: 0.6 },
  { x0: 75, y0: 105, speed: 0.0012, radius: 7, alphaScale: 0.95 },
  { x0: 28, y0: 112, speed: 0.001, radius: 10, alphaScale: 0.7 },
  // The big, slow ones. Size and speed move together on purpose: a 30-tile
  // shadow crossing as briskly as a 10-tile one reads as the camera moving,
  // not as weather. These are what give the sky a sense of scale - before
  // them every shadow was within a few tiles of the same size.
  { x0: 60, y0: 15, speed: 0.0007, radius: 16, alphaScale: 0.8 },
  { x0: 10, y0: 60, speed: 0.0008, radius: 14, alphaScale: 0.7 },
  { x0: 95, y0: 8, speed: 0.0009, radius: 13, alphaScale: 0.85 },
  { x0: 40, y0: 75, speed: 0.0007, radius: 15, alphaScale: 0.75 },
  { x0: 115, y0: 30, speed: 0.001, radius: 12, alphaScale: 0.6 },
  // The bank. These are the ones that cover a whole settlement at once, and
  // they are the slowest in the table - a shadow this wide has to take its
  // time crossing or it stops being a cloud and becomes a passing wall.
  { x0: 30, y0: 28, speed: 0.0005, radius: 26, alphaScale: 0.7 },
  { x0: 100, y0: 105, speed: 0.0006, radius: 24, alphaScale: 0.65 },
  { x0: 68, y0: 70, speed: 0.0005, radius: 22, alphaScale: 0.8 },
  { x0: 8, y0: 98, speed: 0.0006, radius: 20, alphaScale: 0.6 },
  { x0: 112, y0: 12, speed: 0.0007, radius: 21, alphaScale: 0.75 },
  { x0: 52, y0: 118, speed: 0.0005, radius: 25, alphaScale: 0.7 },
  { x0: 88, y0: 42, speed: 0.0006, radius: 19, alphaScale: 0.85 },
  { x0: 20, y0: 8, speed: 0.0007, radius: 23, alphaScale: 0.6 },
  // Filling in. With composite silhouettes the shadows overlap into larger
  // irregular masses rather than stacking into visibly rounder ones, which is
  // what makes this density work where a table of circles would have turned
  // the ground into polka dots.
  { x0: 46, y0: 48, speed: 0.0009, radius: 11, alphaScale: 0.7 },
  { x0: 78, y0: 88, speed: 0.0011, radius: 8, alphaScale: 0.8 },
  { x0: 5, y0: 34, speed: 0.0012, radius: 9, alphaScale: 0.65 },
  { x0: 62, y0: 32, speed: 0.0008, radius: 17, alphaScale: 0.7 },
  { x0: 104, y0: 70, speed: 0.0007, radius: 18, alphaScale: 0.75 },
  { x0: 34, y0: 90, speed: 0.001, radius: 12, alphaScale: 0.85 },
  { x0: 92, y0: 118, speed: 0.0008, radius: 15, alphaScale: 0.6 },
  { x0: 14, y0: 118, speed: 0.0009, radius: 13, alphaScale: 0.7 },
  { x0: 118, y0: 92, speed: 0.0011, radius: 10, alphaScale: 0.8 },
  { x0: 70, y0: 58, speed: 0.0006, radius: 21, alphaScale: 0.65 },
];

/**
 * How far past the map edge a cloud drifts before it wraps around. Large
 * enough that even the biggest radius in CLOUDS is fully faded out (see
 * fadeFactor) before the wrap happens, so the modulo's discontinuity always
 * lands where the cloud is already invisible.
 */
export const WRAP_MARGIN_TILES = 28;

/** Wrap `value` into [-WRAP_MARGIN_TILES, span + WRAP_MARGIN_TILES). */
function wrap(value: number, span: number): number {
  const period = span + 2 * WRAP_MARGIN_TILES;
  const shifted = (((value + WRAP_MARGIN_TILES) % period) + period) % period;
  return shifted - WRAP_MARGIN_TILES;
}

/**
 * 1 once a position is inside the map, ramping down to 0 over the margin
 * band on either side. `wrap` jumps at exactly the two points where this is
 * 0, so the eye never sees the jump - only ever a cloud that has already
 * faded away (issue #15 acceptance: no visible teleport at the seam).
 */
function fadeFactor(position: number, span: number): number {
  if (position < 0) return Math.max(0, 1 + position / WRAP_MARGIN_TILES);
  if (position > span) return Math.max(0, 1 - (position - span) / WRAP_MARGIN_TILES);
  return 1;
}

/**
 * Area CLOUDS was tuned against (docs/design.md 11 phase 6's shipped
 * default, `frontier`, src/core/constants.ts MAP_SIZES). `cloudCountFor`
 * divides by this, so at exactly this area it returns `CLOUDS.length` and
 * `activeClouds` below takes the "count === CLOUDS.length" branch, which
 * returns CLOUDS itself unchanged - this is what keeps 120x120 output
 * bit-identical to before this module started scaling with map size.
 */
const REFERENCE_AREA = 120 * 120;

/**
 * Never go below this many clouds, no matter how small the map. Below three
 * a sky reads as "isolated shadows", not weather - and this repo ships a
 * 60x60 map (`vale`, MAP_SIZES) that this floor has to still look reasonable
 * on, not just protect degenerate/test sizes.
 */
const MIN_CLOUDS = 3;

/**
 * Upper bound so a hypothetical future map size many times larger than
 * `frontier` cannot make this draw an unbounded number of sprites. 6x
 * CLOUDS.length comfortably covers 180x180 (2.25x the reference area, see
 * clouds.test.ts) with headroom to spare, while still being a cap rather
 * than "whatever the area formula says".
 */
const MAX_CLOUDS = CLOUDS.length * 6;

/**
 * How many clouds to draw for a `width` x `height` map, derived from area so
 * it tracks whichever MAP_SIZES entries exist rather than a size hand-picked
 * for one shipped map (issue #30). Rounds rather than floors/ceils so the
 * reference area maps back onto `CLOUDS.length` exactly.
 */
function cloudCountFor(width: number, height: number): number {
  const raw = Math.round((CLOUDS.length * (width * height)) / REFERENCE_AREA);
  return Math.min(MAX_CLOUDS, Math.max(MIN_CLOUDS, raw));
}

/**
 * Deterministic per-lap position offset for `activeClouds`'s cycling branch
 * below (count > CLOUDS.length). Arbitrary tile-space values with no common
 * factor with either table length, chosen only so repeated laps land in
 * visibly different spots rather than retracing the first lap's path
 * exactly offset by wrap's period. Not tied to map size - `wrap` folds any
 * starting position into whatever span it is given (see cloudsAt).
 */
const LAP_OFFSET_X = 53;
const LAP_OFFSET_Y = 31;

/**
 * The `count` cloud definitions actually in play for one call to `cloudsAt`.
 *
 * - `count === CLOUDS.length` (the reference 120x120 area): the table
 *   unchanged, in order - the identity case that keeps 120x120 bit-for-bit
 *   stable across this module's introduction of area scaling.
 * - `count < CLOUDS.length` (smaller maps): thinned by picking every
 *   `CLOUDS.length / count`-th entry, *not* the first `count` entries. The
 *   table is ordered small -> large -> the big bank -> fill-in (see CLOUDS'
 *   comment), so taking a prefix would drop every big, slow cloud and leave
 *   only small ones; picking evenly spaced indices keeps the same mix of
 *   sizes at any count.
 * - `count > CLOUDS.length` (larger maps): the table repeated as many times
 *   as needed (`index % CLOUDS.length`), with each successive lap
 *   (`Math.floor(index / CLOUDS.length)`) nudged by a fixed offset so laps
 *   do not sit exactly on top of each other.
 */
function activeClouds(count: number): CloudDef[] {
  if (count === CLOUDS.length) return CLOUDS;
  if (count < CLOUDS.length) {
    const result: CloudDef[] = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.min(CLOUDS.length - 1, Math.round((i * CLOUDS.length) / count));
      result.push(CLOUDS[idx]);
    }
    return result;
  }
  const result: CloudDef[] = [];
  for (let index = 0; index < count; index++) {
    const base = CLOUDS[index % CLOUDS.length];
    const lap = Math.floor(index / CLOUDS.length);
    result.push(
      lap === 0
        ? base
        : { ...base, x0: base.x0 + lap * LAP_OFFSET_X, y0: base.y0 + lap * LAP_OFFSET_Y },
    );
  }
  return result;
}

/**
 * Cloud shadow positions and strengths at a moment in time. Pure: the same
 * `elapsedMs`, `width` and `height` always return the same list (issue #30:
 * the list's *length* now depends on map area too, via `cloudCountFor` /
 * `activeClouds`), and nothing in this module reads a clock - the renderer
 * is the one that accumulates elapsed time and hands it in.
 */
export function cloudsAt(elapsedMs: number, width: number, height: number): CloudShadow[] {
  const clouds = activeClouds(cloudCountFor(width, height));
  return clouds.map((cloud) => {
    const x = wrap(cloud.x0 + WIND_X * cloud.speed * elapsedMs, width);
    const y = wrap(cloud.y0 + WIND_Y * cloud.speed * elapsedMs, height);
    const alpha =
      CLOUD_ALPHA_MAX * cloud.alphaScale * fadeFactor(x, width) * fadeFactor(y, height);
    return { x, y, radius: cloud.radius, alpha };
  });
}
