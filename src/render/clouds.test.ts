// Cloud shadows' inputs (issue #15). The drawing cannot run headless; the
// values it draws from can - the same split daylight.test.ts uses for the
// day/night overlay.
import { describe, expect, it } from 'vitest';
import { CLOUD_ALPHA_MAX, WRAP_MARGIN_TILES, cloudsAt } from './clouds';
import { type CoverageDisc, screenCoverage } from './screenCoverage';

const WIDTH = 60;
const HEIGHT = 60;

describe('cloudsAt is a pure function of elapsed time', () => {
  it('returns the same shadows for the same elapsedMs', () => {
    const a = cloudsAt(12345, WIDTH, HEIGHT);
    const b = cloudsAt(12345, WIDTH, HEIGHT);
    expect(a).toEqual(b);
  });

  it('moves the shadows as time advances', () => {
    const early = cloudsAt(0, WIDTH, HEIGHT);
    const later = cloudsAt(60_000, WIDTH, HEIGHT);
    // at least one cloud has actually gone somewhere else in a full minute
    const moved = early.some((cloud, i) => cloud.x !== later[i].x || cloud.y !== later[i].y);
    expect(moved).toBe(true);
  });
});

describe('alpha stays inside the published ceiling', () => {
  it('never exceeds CLOUD_ALPHA_MAX and never goes negative, across a long stretch of time', () => {
    for (let elapsedMs = 0; elapsedMs <= 600_000; elapsedMs += 5_000) {
      for (const cloud of cloudsAt(elapsedMs, WIDTH, HEIGHT)) {
        expect(cloud.alpha).toBeGreaterThanOrEqual(0);
        expect(cloud.alpha).toBeLessThanOrEqual(CLOUD_ALPHA_MAX);
      }
    }
  });

  it('is a shadow, not a second night: the ceiling is clearly lighter than a night overlay', () => {
    // NIGHT_ALPHA (daylight.ts) is 0.45; this only pins the intent that a
    // cloud shadow reads as weather, not as darkness stacked on darkness.
    expect(CLOUD_ALPHA_MAX).toBeLessThan(0.3);
  });
});

describe('wraparound does not run away', () => {
  it('keeps every shadow within the map plus its wrap margin, no matter how far time runs', () => {
    // A year of real playtime at typical frame deltas, sampled coarsely -
    // long enough that every cloud in the table has wrapped around many times.
    for (let elapsedMs = 0; elapsedMs <= 50_000_000; elapsedMs += 250_000) {
      for (const cloud of cloudsAt(elapsedMs, WIDTH, HEIGHT)) {
        expect(cloud.x).toBeGreaterThanOrEqual(-WRAP_MARGIN_TILES);
        expect(cloud.x).toBeLessThan(WIDTH + WRAP_MARGIN_TILES);
        expect(cloud.y).toBeGreaterThanOrEqual(-WRAP_MARGIN_TILES);
        expect(cloud.y).toBeLessThan(HEIGHT + WRAP_MARGIN_TILES);
      }
    }
  });
});

describe('continuity: no teleporting shadow (mirrors the day/night boundary test)', () => {
  it('never jumps a visible shadow more than a tiny step for a tiny step in time', () => {
    const stepMs = 50;
    // The wrap seam is a real discontinuity in the raw x/y, but it always
    // lands where fadeFactor has driven alpha to (near) 0 on both sides, so
    // a shadow that is actually visible (alpha above a small threshold on
    // both samples) never appears to jump - which is the acceptance
    // condition, not "the raw coordinate is monotonic".
    const visibleAlpha = 0.01;
    let previous = cloudsAt(0, WIDTH, HEIGHT);
    for (let elapsedMs = stepMs; elapsedMs <= 300_000; elapsedMs += stepMs) {
      const current = cloudsAt(elapsedMs, WIDTH, HEIGHT);
      for (let i = 0; i < current.length; i++) {
        if (previous[i].alpha < visibleAlpha || current[i].alpha < visibleAlpha) continue;
        expect(Math.abs(current[i].x - previous[i].x)).toBeLessThan(0.1);
        expect(Math.abs(current[i].y - previous[i].y)).toBeLessThan(0.1);
        expect(Math.abs(current[i].alpha - previous[i].alpha)).toBeLessThan(0.05);
      }
      previous = current;
    }
  });
});

// --- issue #30: screen coverage tracks map size -----------------------------
//
// The bug: cloudsAt used to return a fixed 5-cloud table no matter how big
// the map was. That table was tuned by eye on whatever map its author had
// open, and nothing measured what fraction of a player's actual screen it
// covered over time - so nobody noticed it stopped scaling once shipped
// maps grew to 120x120 (docs/design.md 11, phase 6) while tests kept
// running on 60x60 (CLAUDE.md). screenCoverage.ts (also added for #30) is
// that missing measurement; this section is both "prove the metric catches
// the bug" (mirrors tileVariant.test.ts's naive-hash sanity check) and the
// regression guard for the fix.
function toDiscs(shadows: { x: number; y: number; radius: number; alpha: number }[]): CoverageDisc[] {
  return shadows.map((s) => ({ x: s.x, y: s.y, radius: s.radius, strength: s.alpha }));
}

/** 20 minutes of elapsed time - long enough to see every cloud in the
 *  (small, fixed-size) table sweep across the map multiple times. */
const COVERAGE_DURATION_MS = 20 * 60 * 1000;

/**
 * The exact fixed 5-cloud table `clouds.ts` used before the #30 fix
 * (copied from this repository's history, not re-derived), replayed
 * through the same wind/wrap/fade math `cloudsAt` still uses today. Kept
 * here, rather than reused from clouds.ts, specifically *because* it is a
 * record of the old, broken parameters - CLAUDE.md 10 asks for measurements
 * to keep their conditions attached, and "here is the table that measured
 * 18.1% on the shipped map size" is a measurement worth keeping even after
 * the table itself is gone from the production module.
 */
function oldFixedCloudsAt(elapsedMs: number, width: number, height: number): CoverageDisc[] {
  const OLD_CLOUDS = [
    { x0: 5, y0: 8, speed: 0.0012, radius: 7, alphaScale: 1.0 },
    { x0: 40, y0: 20, speed: 0.0008, radius: 10, alphaScale: 0.7 },
    { x0: 70, y0: 5, speed: 0.0015, radius: 5, alphaScale: 0.85 },
    { x0: 20, y0: 45, speed: 0.001, radius: 8, alphaScale: 0.6 },
    { x0: 90, y0: 35, speed: 0.0009, radius: 6, alphaScale: 1.0 },
  ];
  const windDir = { x: 1, y: 0.35 };
  const windLen = Math.hypot(windDir.x, windDir.y);
  const windX = windDir.x / windLen;
  const windY = windDir.y / windLen;
  const wrap = (value: number, span: number): number => {
    const period = span + 2 * WRAP_MARGIN_TILES;
    const shifted = (((value + WRAP_MARGIN_TILES) % period) + period) % period;
    return shifted - WRAP_MARGIN_TILES;
  };
  const fade = (position: number, span: number): number => {
    if (position < 0) return Math.max(0, 1 + position / WRAP_MARGIN_TILES);
    if (position > span) return Math.max(0, 1 - (position - span) / WRAP_MARGIN_TILES);
    return 1;
  };
  return OLD_CLOUDS.map((cloud) => {
    const x = wrap(cloud.x0 + windX * cloud.speed * elapsedMs, width);
    const y = wrap(cloud.y0 + windY * cloud.speed * elapsedMs, height);
    const alpha = CLOUD_ALPHA_MAX * cloud.alphaScale * fade(x, width) * fade(y, height);
    return { x, y, radius: cloud.radius, strength: alpha };
  });
}

/**
 * Lower bound for `screenCoverage` on `cloudsAt` (today's, area-derived
 * implementation), across every map size below. Measured under the
 * conditions screenCoverage.ts exports as constants (16x14 tile window,
 * 0.02 visible-strength threshold, 20 simulated minutes sampled every 5s,
 * window scanned across the map every 8 tiles):
 *
 *   60x60:    70.9%
 *   120x120:  80.9%  (shipped map size, docs/design.md 11 phase 6)
 *   180x180:  84.9%  (no shipped or tested size today - guards against a
 *                      future dimension change silently regressing again)
 *
 * The floor here (55%) is comfortably below the lowest of those (60x60,
 * ~71%), and well above the old fixed-table's best case (60x60, 44.0% -
 * see the "does not catch" test below), so this only trips on a real
 * regression, not measurement noise.
 */
const COVERAGE_FLOOR = 0.55;

describe('screen coverage tracks map size (issue #30)', () => {
  it.each([
    [60, 60],
    [120, 120],
    [180, 180],
  ])('cloudsAt clears the coverage floor on a %ix%i map', (w, h) => {
    const coverage = screenCoverage((t) => toDiscs(cloudsAt(t, w, h)), w, h, {
      durationMs: COVERAGE_DURATION_MS,
    });
    expect(coverage).toBeGreaterThan(COVERAGE_FLOOR);
  });

  it('does not collapse as the map grows 4x (60x60 -> 120x120), unlike the old fixed table', () => {
    const small = screenCoverage((t) => toDiscs(cloudsAt(t, 60, 60)), 60, 60, {
      durationMs: COVERAGE_DURATION_MS,
    });
    const large = screenCoverage((t) => toDiscs(cloudsAt(t, 120, 120)), 120, 120, {
      durationMs: COVERAGE_DURATION_MS,
    });
    // Both must clear the same floor - "does not collapse" means neither
    // end of the size range is allowed to be the weak one.
    expect(small).toBeGreaterThan(COVERAGE_FLOOR);
    expect(large).toBeGreaterThan(COVERAGE_FLOOR);
  });
});

describe('screenCoverage actually catches the #30 bug (sanity check, mirrors tileVariant.test.ts)', () => {
  it('the pre-fix fixed 5-cloud table falls below the coverage floor on the shipped 120x120 map', () => {
    // If this assertion ever failed, "screen coverage tracks map size"
    // above would not be testing anything - the metric has to be able to
    // fail on the known-bad input before it means anything that it passes
    // on the fixed one.
    const coverage = screenCoverage((t) => oldFixedCloudsAt(t, 120, 120), 120, 120, {
      durationMs: COVERAGE_DURATION_MS,
    });
    expect(coverage).toBeLessThan(COVERAGE_FLOOR);
    expect(coverage).toBeCloseTo(0.181, 2); // measured figure from the #30 investigation
  });

  it('the pre-fix table even falls below the floor on the 60x60 map it was tuned to look fine on', () => {
    const coverage = screenCoverage((t) => oldFixedCloudsAt(t, 60, 60), 60, 60, {
      durationMs: COVERAGE_DURATION_MS,
    });
    expect(coverage).toBeLessThan(COVERAGE_FLOOR);
    expect(coverage).toBeCloseTo(0.44, 2);
  });
});

// --- issue #30 follow-on: many clouds must still not read as a second night --
//
// The per-cloud ceiling above (CLOUD_ALPHA_MAX) was a sufficient guard while
// there were five clouds, because five clouds spread over a map essentially
// never stacked. Deriving the count from map area (36 on the shipped
// 120x120) makes overlap ordinary, and overlapping sprites composite:
// two shadows at 0.18 already read as 0.33, three as 0.45 - which is exactly
// NIGHT_ALPHA (daylight.ts). So the ceiling that actually matters now is the
// *composited* one, and nothing was measuring it.
describe('overlapping shadows still read as weather, not as darkness', () => {
  /** What the screen actually ends up at where `clouds` overlap: sprites are
   *  drawn with normal alpha blending, so the transmitted light multiplies
   *  and the resulting darkness is 1 - product(1 - alpha_i). The shadow
   *  texture is a radial gradient (renderer.ts ensureCloudTexture), so each
   *  cloud's contribution falls off towards its edge. */
  function compositeAlphaAt(
    shadows: { x: number; y: number; radius: number; alpha: number }[],
    x: number,
    y: number,
  ): number {
    let transmitted = 1;
    for (const shadow of shadows) {
      const distance = Math.hypot(x - shadow.x, y - shadow.y);
      if (distance > shadow.radius) continue;
      transmitted *= 1 - shadow.alpha * (1 - distance / shadow.radius);
    }
    return 1 - transmitted;
  }

  // NIGHT_ALPHA (daylight.ts) is 0.45; staying under it is the line between
  // "weather passing overhead" and "a second night stacked on the first".
  // Measured worst case over 10 simulated minutes: 0.306 at 120x120, 0.257
  // at 60x60, 0.343 at 180x180 - so 0.40 leaves room for ordinary drift
  // while still failing if the cloud density were pushed much higher.
  const COMPOSITE_CEILING = 0.4;

  it.each([
    [60, 60],
    [120, 120],
    [180, 180],
  ])('never stacks past the ceiling anywhere on a %ix%i map', (width, height) => {
    let worst = 0;
    for (let elapsedMs = 0; elapsedMs <= 10 * 60 * 1000; elapsedMs += 10_000) {
      const shadows = cloudsAt(elapsedMs, width, height);
      for (let x = 0; x < width; x += 4) {
        for (let y = 0; y < height; y += 4) {
          worst = Math.max(worst, compositeAlphaAt(shadows, x, y));
        }
      }
    }
    expect(worst).toBeGreaterThan(CLOUD_ALPHA_MAX * 0.5); // the scan finds real shadows
    expect(worst).toBeLessThan(COMPOSITE_CEILING);
  });
});
