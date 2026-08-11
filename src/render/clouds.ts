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

/** A shadow, not a second night: stays faint enough to read as weather
 *  passing overhead rather than another darkening pass on top of daylight.ts. */
export const CLOUD_ALPHA_MAX = 0.18;

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
 * Five clouds, each with its own speed/size/phase, spread out so they do not
 * clump on one side of the map at t = 0. `x0`/`y0` are just a starting point
 * for the drift below, not a position tied to any particular map size.
 */
const CLOUDS: CloudDef[] = [
  { x0: 5, y0: 8, speed: 0.0012, radius: 7, alphaScale: 1.0 },
  { x0: 40, y0: 20, speed: 0.0008, radius: 10, alphaScale: 0.7 },
  { x0: 70, y0: 5, speed: 0.0015, radius: 5, alphaScale: 0.85 },
  { x0: 20, y0: 45, speed: 0.001, radius: 8, alphaScale: 0.6 },
  { x0: 90, y0: 35, speed: 0.0009, radius: 6, alphaScale: 1.0 },
];

/**
 * How far past the map edge a cloud drifts before it wraps around. Large
 * enough that even the biggest radius in CLOUDS is fully faded out (see
 * fadeFactor) before the wrap happens, so the modulo's discontinuity always
 * lands where the cloud is already invisible.
 */
export const WRAP_MARGIN_TILES = 14;

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
 * Cloud shadow positions and strengths at a moment in time. Pure: the same
 * `elapsedMs` always returns the same list in the same order (index i is
 * always CLOUDS[i]'s shadow), and nothing in this module reads a clock -
 * the renderer is the one that accumulates elapsed time and hands it in.
 */
export function cloudsAt(elapsedMs: number, width: number, height: number): CloudShadow[] {
  return CLOUDS.map((cloud) => {
    const x = wrap(cloud.x0 + WIND_X * cloud.speed * elapsedMs, width);
    const y = wrap(cloud.y0 + WIND_Y * cloud.speed * elapsedMs, height);
    const alpha =
      CLOUD_ALPHA_MAX * cloud.alphaScale * fadeFactor(x, width) * fadeFactor(y, height);
    return { x, y, radius: cloud.radius, alpha };
  });
}
