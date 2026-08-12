// Cloud shadows drifting across the ground (issue #15). Wind (grass swaying)
// is explicitly out of scope here - that is a sprite animation-frame change,
// and docs/design-phase7-time.md 5 lists exactly that kind of thing as a
// non-goal for this area of the renderer.
//
// Same split as daylight.ts: a pure function of elapsed time producing a
// list of shadows that the renderer turns into sprites.
//
// issue #30: the list used to be a fixed table of 5 clouds, sized for
// whatever map the table's author had open at the time. That does not
// track map size - shipped maps are 120x120 (docs/design.md 11 phase 6)
// but the table stayed at 5, so screen coverage measured with
// screenCoverage.ts came out to ~18% there (see clouds.test.ts). The count
// is now derived from map area (CLAUDE.md "既存の数値を曲げる": widen the
// existing table-driven approach rather than add a new mechanism), and each
// cloud's speed/size/phase/starting position is derived from its index by
// hashing - `hashFrac` below - instead of Math.random(), reusing the same
// bit-mixing `variantAt` (tileVariant.ts) already uses for terrain
// variants. The "table is the asset" idea from before is preserved: the
// per-cloud parameters are still a deterministic function of nothing but
// the cloud's own index, just generated instead of hand-listed.
import type { Vector2 } from '../core/types';
import { variantAt } from './tileVariant';

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
 * How much map area (tiles^2) one cloud is spread over. Chosen so shipped
 * maps (120x120, docs/design.md 11 phase 6) land in the ~30-40 cloud range
 * and the 60x60 test default lands around 10 - see clouds.test.ts for the
 * measured screen coverage this produces at both sizes plus 180x180.
 */
const AREA_PER_CLOUD = 400;

/** Floor so a much smaller custom map is never left with zero clouds. */
const MIN_CLOUDS = 3;

/** How many clouds a map of this size gets (issue #30: derived from area
 *  instead of a fixed table length, so it tracks map size automatically). */
function cloudCount(width: number, height: number): number {
  return Math.max(MIN_CLOUDS, Math.ceil((width * height) / AREA_PER_CLOUD));
}

/**
 * Deterministic pseudo-random fraction in [0, 1), keyed by a cloud index and
 * a "channel" (which parameter of the cloud it feeds). Reuses `variantAt`'s
 * bit-mixing (tileVariant.ts) rather than adding a second hash - passing a
 * large `count` turns its usual "pick one of N variants" into "pick a
 * fraction of the way across [0, 1)".
 */
function hashFrac(index: number, channel: number): number {
  const buckets = 1_000_003; // prime, and far finer than any range below needs
  return variantAt(index, channel, buckets) / buckets;
}

/**
 * R2 low-discrepancy sequence (Roberts, 2018): `frac(0.5 + index / g)` and
 * `frac(0.5 + index / g^2)` for consecutive indices land far more evenly
 * across [0, 1) than a hash does for small index counts. A hash of `index`
 * alone (tried first) clumped badly - with only ~9 clouds on a 60x60 map,
 * `hashFrac` happened to put four of them within one quadrant and leave
 * another empty, which screenCoverage.ts caught directly (coverage stuck in
 * the low 60s% instead of climbing with the higher cloud count). Positions
 * are the one parameter where *even spread* matters more than *look
 * varied*, so this sequence is used only for x0/y0 below; speed/radius/
 * alphaScale still use hashFrac, where variety without spatial structure is
 * all that is needed.
 */
const R2_G = 1.32471795724474602596;
function r2Frac(index: number, invPower: number): number {
  const v = 0.5 + index * invPower;
  return v - Math.floor(v);
}

/**
 * Cloud definitions. `x0`/`y0` are spread with `r2Frac` directly across
 * *this* map's width/height - unlike the old fixed table, position is
 * allowed to depend on map size, because nothing requires positions to line
 * up across different (width, height) calls; only the "same index -> same
 * cloud for a given map" invariant matters, and a running game's map size
 * never changes mid-session. Placing the low-discrepancy points directly in
 * [0, width) x [0, height) (rather than in some nominal band later folded
 * down by `wrap`'s modulo) is what keeps the spread even instead of
 * aliasing against `wrap`'s period. `speed`/`radius`/`alphaScale` stay
 * index-only, no reason for those to vary with map size: speed
 * 0.0008-0.0016 tiles/ms, alphaScale 0.55-1.0 (same ranges as the old
 * 5-entry table). Radius is 6-12 tiles, a touch wider than the old table's
 * 5-10 - screenCoverage.ts showed the old 5-10 range under-covering even
 * once the count tracked map area (see clouds.test.ts), and radius is the
 * cheapest knob to widen: it does not add sprites the way another cloud
 * would.
 */
function cloudDefAt(index: number, width: number, height: number): CloudDef {
  return {
    x0: r2Frac(index, 1 / R2_G) * width,
    y0: r2Frac(index, 1 / (R2_G * R2_G)) * height,
    speed: 0.0008 + hashFrac(index, 2) * 0.0008,
    radius: 6 + hashFrac(index, 3) * 6,
    alphaScale: 0.55 + hashFrac(index, 4) * 0.45,
  };
}

/**
 * How far past the map edge a cloud drifts before it wraps around. Large
 * enough that even the biggest possible radius (12 tiles, cloudDefAt above)
 * is fully faded out (see fadeFactor) before the wrap happens, so the
 * modulo's discontinuity always lands where the cloud is already invisible.
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
 * `(elapsedMs, width, height)` always returns the same list in the same
 * order (index i is always `cloudDefAt(i, width, height)`'s shadow), and
 * nothing in this module reads a clock - the renderer is the one that
 * accumulates elapsed time and hands it in. The list length and the per-
 * index definitions both depend on `width`/`height` (issue #30), but never
 * on `elapsedMs` - for a single running game, whose map size is fixed for
 * the session, index i keeps meaning the same cloud as time passes, which
 * is all the renderer's sprite pool (syncClouds) needs: it only ever grows,
 * never reassigns a sprite to a different cloud mid-drift.
 */
export function cloudsAt(elapsedMs: number, width: number, height: number): CloudShadow[] {
  const count = cloudCount(width, height);
  const shadows: CloudShadow[] = [];
  for (let i = 0; i < count; i++) {
    const cloud = cloudDefAt(i, width, height);
    const x = wrap(cloud.x0 + WIND_X * cloud.speed * elapsedMs, width);
    const y = wrap(cloud.y0 + WIND_Y * cloud.speed * elapsedMs, height);
    const alpha =
      CLOUD_ALPHA_MAX * cloud.alphaScale * fadeFactor(x, width) * fadeFactor(y, height);
    shadows.push({ x, y, radius: cloud.radius, alpha });
  }
  return shadows;
}
