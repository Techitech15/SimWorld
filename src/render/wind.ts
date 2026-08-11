// Wind sweeping the ground as a travelling band of brightness (issue #23,
// option (c): "明度の帯を流す"). Grass-blade animation (swapping sprite
// frames) is explicitly out of scope here - see clouds.ts's header for the
// same non-goal, cited from docs/design-phase7-time.md 5. This is the same
// trick clouds.ts already uses (drift one translucent band over the map),
// run with its own direction/speed and, unlike clouds.ts, brightening the
// ground a little instead of shading it.
//
// Same split as clouds.ts and daylight.ts: a pure function of elapsed time
// producing a constant-size list, independent of map size, that the
// renderer turns into sprites. No random numbers - GUSTS is a fixed table
// (the table is the asset, exactly the choice clouds.ts's CLOUDS makes),
// and each gust's phase offset is derived from its own tile-space anchor via
// `variantAt` (tileVariant.ts) rather than a hand-picked "looks random"
// constant, so the derivation stays traceable to coordinates, not chance.
import { variantAt } from './tileVariant';
import type { Vector2 } from '../core/types';

export interface WindGust {
  /** tile coordinates, band centre. Can sit slightly outside [0, width) /
   *  [0, height) at the wrap seam - strength is faded to 0 there (see
   *  fadeFactor), so a gust in that band is never actually drawn there. */
  x: number;
  y: number;
  /** tiles, the band's long axis, along WIND_DIR */
  length: number;
  /** tiles, the band's short axis, across WIND_DIR */
  width: number;
  /** 0 (invisible) .. WIND_STRENGTH_MAX (brightest) */
  strength: number;
}

/**
 * A brightness ripple, not a light source: faint enough to read as grass
 * catching the light while wind passes over, not as a lit patch of ground.
 *
 * This started at 0.08, chosen to sit under CLOUD_ALPHA_MAX (0.18) so wind
 * would be the subtler of the two layers. Looking at the built game showed
 * that reasoning was wrong twice over. The number was invisible in play, and
 * the comparison it was based on does not hold: a cloud alpha blends a *dark*
 * texture over the ground and this one adds a *white* one, so the two scales
 * are not the same scale. See wind.test.ts for what replaced the old assertion.
 *
 * 0.22 was then judged a shade heavy against the streak texture, which
 * concentrates the same alpha into far less area than the haze it replaced.
 * 0.18 is what reads as a ripple without reading as light.
 */
export const WIND_STRENGTH_MAX = 0.18;

/** Every gust travels the same way - one wind, not a wind per gust (mirrors
 *  clouds.ts's WIND_DIR). Mostly horizontal, since that reads best for gusts
 *  running across a field of grass rather than clouds drifting overhead. */
const WIND_DIR: Vector2 = { x: 1, y: -0.2 };
const WIND_LEN = Math.hypot(WIND_DIR.x, WIND_DIR.y);
const WIND_X = WIND_DIR.x / WIND_LEN;
const WIND_Y = WIND_DIR.y / WIND_LEN;

/** radians - so the renderer can rotate the (elongated) gust sprite to line
 *  up with the direction it travels in. */
export const WIND_ANGLE = Math.atan2(WIND_Y, WIND_X);

interface GustDef {
  /** tile-space anchor at elapsedMs = 0. Also what seeds this gust's phase
   *  offset below, so gusts starting at different spots do not move in
   *  lockstep even though they share one direction and similar speeds. */
  x0: number;
  y0: number;
  /** tiles per millisecond, travelled along WIND_DIR */
  speed: number;
  /** tiles */
  length: number;
  /** tiles */
  width: number;
  /** 0..1 - so not every gust reads equally bright */
  strengthScale: number;
}

/**
 * Ten gusts, spread out so they do not clump on one side of the map at t = 0.
 * `x0`/`y0` are just a starting point for the drift below, not a position tied
 * to any particular map size (same caveat as CLOUDS).
 *
 * This was four gusts of 18x4 tiles. On the shipping 120x120 map that meant a
 * viewport of roughly 16 tiles saw a band for about three seconds at a time
 * and, most of the time, saw nothing at all - the layer was effectively absent
 * from the game. Ten longer, wider bands put it on screen often enough to
 * exist. Cost is unchanged in kind: ten sprites, still independent of how many
 * tiles the map has.
 *
 * Speed was tuned by watching, in two steps: 0.0018-0.0026 read as drifting
 * rather than gusting, 0.0054-0.0078 still read as slow, and 0.0108-0.0156
 * tiles/ms (10.8-15.6 tiles/s) is where it reads as wind. That is about an
 * order of magnitude clear of CLOUDS (0.8-1.5 tiles/s), which is the point -
 * the two layers are the same mechanism and have to be told apart by motion
 * alone, and a gust that moves like a cloud is not a gust. Note this is far
 * faster than the very first version, which was invisible: what hid that one
 * was four small bands, never their speed.
 */
const GUSTS: GustDef[] = [
  { x0: 8, y0: 12, speed: 0.0132, length: 30, width: 8, strengthScale: 1.0 },
  { x0: 45, y0: 30, speed: 0.0108, length: 36, width: 7, strengthScale: 0.75 },
  { x0: 25, y0: 55, speed: 0.0156, length: 26, width: 9, strengthScale: 0.85 },
  { x0: 75, y0: 18, speed: 0.012, length: 32, width: 8, strengthScale: 0.6 },
  { x0: 15, y0: 88, speed: 0.0144, length: 28, width: 7, strengthScale: 0.9 },
  { x0: 95, y0: 70, speed: 0.0114, length: 34, width: 9, strengthScale: 0.7 },
  { x0: 55, y0: 100, speed: 0.015, length: 27, width: 8, strengthScale: 0.8 },
  { x0: 105, y0: 45, speed: 0.0126, length: 31, width: 7, strengthScale: 0.65 },
  { x0: 35, y0: 5, speed: 0.0138, length: 29, width: 9, strengthScale: 0.95 },
  { x0: 85, y0: 112, speed: 0.012, length: 33, width: 8, strengthScale: 0.75 },
];

/**
 * Deterministic per-gust phase offset in ms, derived from the gust's own
 * tile-space anchor rather than typed in by hand - the same "derive from
 * coordinates, not chance" move tileVariant.ts makes for per-tile art
 * variation. `variantAt` returns 0..996 here, so the offset spans a bit over
 * 16 minutes, plenty to keep four gusts with similar speeds out of lockstep.
 */
function phaseOffsetMs(gust: GustDef): number {
  return variantAt(gust.x0, gust.y0, 997) * 1000;
}

/**
 * How far past the map edge a gust drifts before it wraps around. Large
 * enough that even the biggest gust in GUSTS is fully faded out (see
 * fadeFactor) before the wrap happens, so the modulo's discontinuity always
 * lands where the gust is already invisible (mirrors clouds.ts's
 * WRAP_MARGIN_TILES, sized here for the longest GUSTS entry instead of the
 * largest cloud radius).
 */
export const WRAP_MARGIN_TILES = 12;

/** Wrap `value` into [-WRAP_MARGIN_TILES, span + WRAP_MARGIN_TILES). */
function wrap(value: number, span: number): number {
  const period = span + 2 * WRAP_MARGIN_TILES;
  const shifted = (((value + WRAP_MARGIN_TILES) % period) + period) % period;
  return shifted - WRAP_MARGIN_TILES;
}

/**
 * 1 once a position is inside the map, ramping down to 0 over the margin
 * band on either side - identical shape to clouds.ts's fadeFactor, so the
 * wrap seam never shows as a jump (issue #23 acceptance: strength is 0 at
 * the wrap instant).
 */
function fadeFactor(position: number, span: number): number {
  if (position < 0) return Math.max(0, 1 + position / WRAP_MARGIN_TILES);
  if (position > span) return Math.max(0, 1 - (position - span) / WRAP_MARGIN_TILES);
  return 1;
}

/**
 * Wind gust positions and strengths at a moment in time. Pure: the same
 * `elapsedMs` always returns the same list in the same order (index i is
 * always GUSTS[i]'s gust), and nothing in this module reads a clock or rolls
 * dice of any kind - the renderer accumulates elapsed time and hands it in,
 * exactly as it does for cloudsAt.
 */
export function windAt(elapsedMs: number, width: number, height: number): WindGust[] {
  return GUSTS.map((gust) => {
    const t = elapsedMs + phaseOffsetMs(gust);
    const x = wrap(gust.x0 + WIND_X * gust.speed * t, width);
    const y = wrap(gust.y0 + WIND_Y * gust.speed * t, height);
    const strength =
      WIND_STRENGTH_MAX * gust.strengthScale * fadeFactor(x, width) * fadeFactor(y, height);
    return { x, y, length: gust.length, width: gust.width, strength };
  });
}
