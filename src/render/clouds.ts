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
 * Eighteen clouds, each with its own speed/size/phase, spread out so they do
 * not clump on one side of the map at t = 0. `x0`/`y0` are just a starting
 * point for the drift below, not a position tied to any particular map size.
 *
 * This was five, and five turned out to be too few to be seen. Measuring the
 * shipped 120x120 map over 20 minutes of drift against a viewport-sized window
 * at many places found a shadow on screen only **17.2%** of the time - four
 * times out of five the player is looking at ground with nothing crossing it,
 * which is exactly how it was reported ("雲の影が見えない"). The original five
 * were chosen when 60x60 was the default; the map got four times the area in
 * フェーズ6 and the table never followed. Thirteen took it to 38.9% and
 * eighteen to **59.1%**, all three measured the same way at the current
 * WRAP_MARGIN_TILES.
 *
 * The first five entries are unchanged, so the clouds that were there before
 * still drift exactly as they did.
 *
 * Radius now spans 5 to 16 tiles rather than 5 to 10. The old spread was
 * narrow enough that every shadow read as the same object at slightly
 * different sizes; a sky needs a few big slow ones to have any sense of scale.
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
];

/**
 * How far past the map edge a cloud drifts before it wraps around. Large
 * enough that even the biggest radius in CLOUDS is fully faded out (see
 * fadeFactor) before the wrap happens, so the modulo's discontinuity always
 * lands where the cloud is already invisible.
 */
export const WRAP_MARGIN_TILES = 18;

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
