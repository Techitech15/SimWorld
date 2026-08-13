// Wind gusts' inputs (issue #23, option (c)). The drawing cannot run
// headless; the values it draws from can - the same split clouds.test.ts and
// daylight.test.ts use.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAP_SIZES } from '../core/constants';
import { CLOUD_ALPHA_MAX } from './clouds';
import { type CoverageDisc, screenCoverage } from './screenCoverage';
import { variantAt } from './tileVariant';
import { WIND_ANGLE, WIND_STRENGTH_MAX, WRAP_MARGIN_TILES, type WindGust, windAt } from './wind';

const WIDTH = 60;
const HEIGHT = 60;

describe('windAt is a pure function of elapsed time', () => {
  it('returns the same gusts for the same elapsedMs', () => {
    const a = windAt(12345, WIDTH, HEIGHT);
    const b = windAt(12345, WIDTH, HEIGHT);
    expect(a).toEqual(b);
  });

  it('moves the gusts as time advances', () => {
    const early = windAt(0, WIDTH, HEIGHT);
    const later = windAt(60_000, WIDTH, HEIGHT);
    // at least one gust has actually gone somewhere else in a full minute
    const moved = early.some((gust, i) => gust.x !== later[i].x || gust.y !== later[i].y);
    expect(moved).toBe(true);
  });
});

describe('no randomness (issue #23 acceptance 3)', () => {
  it('this module never calls Math.random', () => {
    const source = readFileSync(fileURLToPath(new URL('./wind.ts', import.meta.url)), 'utf8');
    // A call, not just the words "Math.random" - so this does not trip on a
    // comment that merely mentions the ban (as one did, once).
    expect(source).not.toMatch(/Math\.random\s*\(/);
  });
});

describe('strength stays inside the published ceiling', () => {
  it('never exceeds WIND_STRENGTH_MAX and never goes negative, across a long stretch of time', () => {
    for (let elapsedMs = 0; elapsedMs <= 600_000; elapsedMs += 5_000) {
      for (const gust of windAt(elapsedMs, WIDTH, HEIGHT)) {
        expect(gust.strength).toBeGreaterThanOrEqual(0);
        expect(gust.strength).toBeLessThanOrEqual(WIND_STRENGTH_MAX);
      }
    }
  });

  it('stays a ripple, not a light source: well under half of full brightness', () => {
    // This assertion used to be `WIND_STRENGTH_MAX < CLOUD_ALPHA_MAX`, on the
    // reasoning that wind should read as the weaker of the two layers. Looking
    // at the built game killed that: at 0.08 the band was invisible in normal
    // play, and the two numbers were never comparable in the first place - a
    // cloud alpha blends a *dark* texture over the ground, wind adds a *white*
    // one, so equal numbers are nowhere near equal brightness. What the layer
    // actually has to stay under is its own ceiling, not the cloud's.
    //
    // 0.5 is the line between "the ground caught some light" and "something is
    // lit here"; the shipped 0.22 sits comfortably below it. CLOUD_ALPHA_MAX is
    // still imported and asserted below so that a future change to clouds.ts
    // that made shadows drastically heavier would show up here as a prompt to
    // re-look at the pair together, rather than silently drifting apart.
    expect(WIND_STRENGTH_MAX).toBeLessThan(0.5);
    expect(CLOUD_ALPHA_MAX).toBeLessThan(0.5);
  });
});

describe('wraparound does not run away', () => {
  it('keeps every gust within the map plus its wrap margin, no matter how far time runs', () => {
    // A year of real playtime at typical frame deltas, sampled coarsely -
    // long enough that every gust in the table has wrapped around many times.
    for (let elapsedMs = 0; elapsedMs <= 50_000_000; elapsedMs += 250_000) {
      for (const gust of windAt(elapsedMs, WIDTH, HEIGHT)) {
        expect(gust.x).toBeGreaterThanOrEqual(-WRAP_MARGIN_TILES);
        expect(gust.x).toBeLessThan(WIDTH + WRAP_MARGIN_TILES);
        expect(gust.y).toBeGreaterThanOrEqual(-WRAP_MARGIN_TILES);
        expect(gust.y).toBeLessThan(HEIGHT + WRAP_MARGIN_TILES);
      }
    }
  });
});

describe('continuity: no teleporting band (mirrors clouds.test.ts)', () => {
  it('never jumps a visible gust more than a tiny step for a tiny step in time', () => {
    const stepMs = 50;
    // The wrap seam is a real discontinuity in the raw x/y, but it always
    // lands where fadeFactor has driven strength to (near) 0 on both sides,
    // so a gust that is actually visible (strength above a small threshold
    // on both samples) never appears to jump - which is the acceptance
    // condition (issue #23 acceptance 4), not "the raw coordinate is
    // monotonic".
    const visibleStrength = 0.005;
    // Gusts travel an order of magnitude faster than clouds (wind.ts's fastest
    // GUSTS entry is 0.0156 tiles/ms vs. clouds.ts's fastest of 0.0015), so
    // the per-step bound is far wider than clouds.test.ts's 0.1: 0.0156
    // tiles/ms * 50ms step is already ~0.78 tiles, so 0.1 - or either of the
    // 0.4 and 0.6 this held at earlier speeds - would fail on real,
    // non-teleporting motion. 1.2 keeps margin above the fastest entry while
    // still catching an actual wrap-seam jump, which is many tiles in one step
    // (the seam is WRAP_MARGIN_TILES * 2 = 24 tiles wide, so the gap between
    // "fastest legitimate step" and "a jump" stays two orders of magnitude).
    const maxStepTiles = 1.2;
    let previous = windAt(0, WIDTH, HEIGHT);
    for (let elapsedMs = stepMs; elapsedMs <= 300_000; elapsedMs += stepMs) {
      const current = windAt(elapsedMs, WIDTH, HEIGHT);
      for (let i = 0; i < current.length; i++) {
        if (previous[i].strength < visibleStrength || current[i].strength < visibleStrength) {
          continue;
        }
        expect(Math.abs(current[i].x - previous[i].x)).toBeLessThan(maxStepTiles);
        expect(Math.abs(current[i].y - previous[i].y)).toBeLessThan(maxStepTiles);
        expect(Math.abs(current[i].strength - previous[i].strength)).toBeLessThan(0.05);
      }
      previous = current;
    }
  });
});

describe('120x120 output is unchanged by area-derived gust counts (issue #30 invariant)', () => {
  // Mirrors clouds.test.ts's equivalent block: windAt(t, 120, 120) must come
  // out bit-for-bit identical before and after this module started scaling
  // gust count with area, since GUSTS is tuned by eye against the shipped
  // 120x120 map. Captured from the pre-this-change implementation and
  // compared byte-for-byte against the post-change output before being
  // committed here.
  it('matches the pre-area-scaling output at several points in time', () => {
    expect(windAt(0, 120, 120)).toMatchInlineSnapshot(`
      [
        {
          "length": 30,
          "strength": 0.18,
          "width": 8,
          "x": 46.74806156751765,
          "y": 61.85038768649633,
        },
        {
          "length": 36,
          "strength": 0.135,
          "width": 7,
          "x": 31.115068129953215,
          "y": 61.57698637400938,
        },
        {
          "length": 26,
          "strength": 0.153,
          "width": 9,
          "x": 61.173286528604876,
          "y": 18.965342694279116,
        },
        {
          "length": 32,
          "strength": 0.04249576678171547,
          "width": 8,
          "x": 57.39124067682678,
          "y": -7.278248135364947,
        },
        {
          "length": 28,
          "strength": 0.08911728904566737,
          "width": 7,
          "x": 121.78891737665981,
          "y": 124.24221652466849,
        },
        {
          "length": 34,
          "strength": 0.126,
          "width": 9,
          "x": 115.18398685077045,
          "y": 37.16320262984618,
        },
        {
          "length": 27,
          "strength": 0.144,
          "width": 8,
          "x": 26.316513705593024,
          "y": 76.9366972588814,
        },
        {
          "length": 31,
          "strength": 0.11699999999999999,
          "width": 7,
          "x": 48.9894128000069,
          "y": 113.80211743999848,
        },
        {
          "length": 29,
          "strength": 0.17099999999999999,
          "width": 9,
          "x": 33.54663297868865,
          "y": 5.290673404262179,
        },
        {
          "length": 33,
          "strength": 0.135,
          "width": 8,
          "x": 2.16058976649947,
          "y": 70.9678820467002,
        },
      ]
    `);
    expect(windAt(1234, 120, 120)).toMatchInlineSnapshot(`
      [
        {
          "length": 30,
          "strength": 0.18,
          "width": 8,
          "x": 62.720544077712475,
          "y": 58.65589118445746,
        },
        {
          "length": 36,
          "strength": 0.135,
          "width": 7,
          "x": 44.1834629110208,
          "y": 58.963307417795704,
        },
        {
          "length": 26,
          "strength": 0.153,
          "width": 9,
          "x": 80.04985676792603,
          "y": 15.190028646414703,
        },
        {
          "length": 32,
          "strength": 0.016358977219578488,
          "width": 8,
          "x": 71.91167932245662,
          "y": -10.182335864491279,
        },
        {
          "length": 28,
          "strength": 0.09123581577922148,
          "width": 7,
          "x": -4.786556248582201,
          "y": 120.75731124971708,
        },
        {
          "length": 34,
          "strength": 0.03172676257675357,
          "width": 9,
          "x": 128.9784035641187,
          "y": 34.40431928717612,
        },
        {
          "length": 27,
          "strength": 0.144,
          "width": 8,
          "x": 44.467062012632596,
          "y": 73.30658759747394,
        },
        {
          "length": 31,
          "strength": 0.11699999999999999,
          "width": 7,
          "x": 64.23587337792014,
          "y": 110.75282532441611,
        },
        {
          "length": 29,
          "strength": 0.17099999999999999,
          "width": 9,
          "x": 50.245137421163236,
          "y": 1.950972515767262,
        },
        {
          "length": 33,
          "strength": 0.135,
          "width": 8,
          "x": 16.681028412130672,
          "y": 68.06379431757398,
        },
      ]
    `);
    expect(windAt(60_000, 120, 120)).toMatchInlineSnapshot(`
      [
        {
          "length": 30,
          "strength": 0.18,
          "width": 8,
          "x": 103.36795671472646,
          "y": 50.52640865705462,
        },
        {
          "length": 36,
          "strength": 0.135,
          "width": 7,
          "x": 90.53134597766893,
          "y": 78.49373080446617,
        },
        {
          "length": 26,
          "strength": 0.10964183738703343,
          "width": 9,
          "x": 114.99679897530586,
          "y": 123.40064020493855,
        },
        {
          "length": 32,
          "strength": 0.06766321108628177,
          "width": 8,
          "x": 43.4093271742895,
          "y": -4.481865434857582,
        },
        {
          "length": 28,
          "strength": 0.162,
          "width": 7,
          "x": 105.01062117361471,
          "y": 98.7978757652777,
        },
        {
          "length": 34,
          "strength": 0.126,
          "width": 9,
          "x": 65.90116902336013,
          "y": 47.0197661953282,
        },
        {
          "length": 27,
          "strength": 0.144,
          "width": 8,
          "x": 44.83912182742097,
          "y": 44.43217563451617,
        },
        {
          "length": 31,
          "strength": 0.11699999999999999,
          "width": 7,
          "x": 70.30840362234267,
          "y": 109.53831927553165,
        },
        {
          "length": 29,
          "strength": 0.008482638303808781,
          "width": 9,
          "x": 125.4674324507705,
          "y": 130.9065135098458,
        },
        {
          "length": 33,
          "strength": 0.0020101079695695086,
          "width": 8,
          "x": -11.821323736038266,
          "y": 73.76426474720768,
        },
      ]
    `);
    expect(windAt(999_999, 120, 120)).toMatchInlineSnapshot(`
      [
        {
          "length": 30,
          "strength": 0.18,
          "width": 8,
          "x": 30.400037022744073,
          "y": 65.1199925954511,
        },
        {
          "length": 36,
          "strength": 0.135,
          "width": 7,
          "x": 109.37577532059186,
          "y": 103.52484493588145,
        },
        {
          "length": 26,
          "strength": 0.05665215213345937,
          "width": 9,
          "x": 94.21653024841726,
          "y": 127.55669395031691,
        },
        {
          "length": 32,
          "strength": 0.108,
          "width": 8,
          "x": 16.347581999758404,
          "y": 87.33048360004886,
        },
        {
          "length": 28,
          "strength": 0.025156885983580644,
          "width": 7,
          "x": 130.1365269641792,
          "y": 36.172694607164885,
        },
        {
          "length": 34,
          "strength": 0.126,
          "width": 9,
          "x": 61.79251110755649,
          "y": 105.44149777848907,
        },
        {
          "length": 27,
          "strength": 0.144,
          "width": 8,
          "x": 47.011940359258006,
          "y": 15.197611928148945,
        },
        {
          "length": 31,
          "strength": 0.11699999999999999,
          "width": 7,
          "x": 20.293571189085924,
          "y": 90.741285762183,
        },
        {
          "length": 29,
          "strength": 0.17099999999999999,
          "width": 9,
          "x": 29.54642550005883,
          "y": 34.89071489998787,
        },
        {
          "length": 33,
          "strength": 0.135,
          "width": 8,
          "x": 105.11693108943291,
          "y": 21.576613782113782,
        },
      ]
    `);
    expect(windAt(5_000_000, 120, 120)).toMatchInlineSnapshot(`
      [
        {
          "length": 30,
          "strength": 0.18,
          "width": 8,
          "x": 109.07265716824622,
          "y": 78.18546856635112,
        },
        {
          "length": 36,
          "strength": 0.010877109473178971,
          "width": 7,
          "x": -9.528444560361095,
          "y": 127.30568891207258,
        },
        {
          "length": 26,
          "strength": 0.02668827557192253,
          "width": 9,
          "x": 82.46599042037269,
          "y": 129.90680191592764,
        },
        {
          "length": 32,
          "strength": 0.07408603918828886,
          "width": 8,
          "x": -3.7682178679679055,
          "y": 33.75364357359467,
        },
        {
          "length": 28,
          "strength": 0.162,
          "width": 7,
          "x": 19.597567122909823,
          "y": 115.88048657542095,
        },
        {
          "length": 34,
          "strength": 0.044966262948863,
          "width": 9,
          "x": -7.717498766774952,
          "y": 90.54349975335572,
        },
        {
          "length": 27,
          "strength": 0.02559371370478766,
          "width": 8,
          "x": 129.86719052460103,
          "y": 56.22656189508052,
        },
        {
          "length": 31,
          "strength": 0.102234636410451,
          "width": 7,
          "x": 49.571981327972026,
          "y": -1.514396265594769,
        },
        {
          "length": 29,
          "strength": 0.17099999999999999,
          "width": 9,
          "x": 13.613255652177031,
          "y": 9.277348869563866,
        },
        {
          "length": 33,
          "strength": 0.135,
          "width": 8,
          "x": 85.00113122171024,
          "y": 111.9997737556605,
        },
      ]
    `);
  });
});

// --- issue #30: screen coverage tracks map size, for wind too --------------
//
// The same bug shape #30 reports for clouds.ts existed here too: `windAt`
// used to return a fixed 10-gust table (originally 4, see the sanity check
// below) no matter how big the map was, so nothing measured whether a
// player's screen actually saw a gust over time as MAP_SIZES grew or shrank.
// This section mirrors clouds.test.ts's "screen coverage tracks map size"
// block, adapted for gusts being elongated bands rather than circles.
describe('gust count follows map area (issue #30)', () => {
  it('uses the full 10-entry table, unchanged, at the reference 120x120 area', () => {
    // Mirrors clouds.test.ts's equivalent check - this is the invariant
    // the rest of the fix leans on: 120x120 output must not move.
    expect(windAt(0, 120, 120)).toHaveLength(10);
  });

  it('draws fewer gusts on the smaller 60x60 map instead of the same 10', () => {
    // 60x60 is a quarter of the reference area, so area-derived count is
    // round(10 * 0.25) = 3.
    expect(windAt(0, 60, 60)).toHaveLength(3);
  });

  it('never drops below the floor even on a tiny hypothetical map', () => {
    expect(windAt(0, 10, 10).length).toBeGreaterThanOrEqual(3);
  });
});

/**
 * Approximates one gust's rectangular band as a row of overlapping circles
 * along its long axis (`WIND_ANGLE`), each with the band's half-width as
 * radius - a capsule made of discs. `screenCoverage` only knows about
 * circles (`CoverageDisc`), so this is the same kind of adapter
 * clouds.test.ts's `toDiscs` is, just shaped for a band instead of a single
 * circle.
 */
function toDiscs(gusts: readonly WindGust[]): CoverageDisc[] {
  const discs: CoverageDisc[] = [];
  for (const gust of gusts) {
    const radius = gust.width / 2;
    const steps = Math.max(1, Math.round(gust.length / radius));
    for (let i = 0; i <= steps; i++) {
      const distanceAlongAxis = (i / steps - 0.5) * gust.length;
      discs.push({
        x: gust.x + Math.cos(WIND_ANGLE) * distanceAlongAxis,
        y: gust.y + Math.sin(WIND_ANGLE) * distanceAlongAxis,
        radius,
        strength: gust.strength,
      });
    }
  }
  return discs;
}

/** Mirrors clouds.test.ts's COVERAGE_DURATION_MS. */
const COVERAGE_DURATION_MS = 20 * 60 * 1000;

/**
 * The exact fixed 4-gust table `wind.ts` shipped with at #23's first commit
 * (da5e495, `git log -p src/render/wind.ts`), at that commit's
 * `WRAP_MARGIN_TILES` (12) and `WIND_STRENGTH_MAX` (0.08) - copied literally,
 * not imported from wind.ts, for the same reason clouds.test.ts's
 * `oldFixedCloudsAt` is self-contained: this is a record of "here is the
 * table, at the constants it ran with, that measured this coverage", and it
 * has to stay true regardless of what wind.ts's constants do later. (As it
 * happens `WRAP_MARGIN_TILES` never moved for wind - unlike clouds.ts's,
 * which went 14 -> 28 - but `WIND_STRENGTH_MAX` did, 0.08 -> 0.18 via 0.22,
 * so both are still worth hardcoding here rather than importing.)
 */
const OLD_WRAP_MARGIN_TILES = 12;
const OLD_WIND_STRENGTH_MAX = 0.08;

function oldFixedWindAt(elapsedMs: number, width: number, height: number): WindGust[] {
  const OLD_GUSTS = [
    { x0: 8, y0: 12, speed: 0.006, length: 18, width: 4, strengthScale: 1.0 },
    { x0: 45, y0: 30, speed: 0.0048, length: 22, width: 3, strengthScale: 0.75 },
    { x0: 25, y0: 55, speed: 0.0065, length: 15, width: 5, strengthScale: 0.85 },
    { x0: 75, y0: 18, speed: 0.0052, length: 20, width: 4, strengthScale: 0.6 },
  ];
  const windDir = { x: 1, y: -0.2 };
  const windLen = Math.hypot(windDir.x, windDir.y);
  const windX = windDir.x / windLen;
  const windY = windDir.y / windLen;
  const wrap = (value: number, span: number): number => {
    const period = span + 2 * OLD_WRAP_MARGIN_TILES;
    const shifted = (((value + OLD_WRAP_MARGIN_TILES) % period) + period) % period;
    return shifted - OLD_WRAP_MARGIN_TILES;
  };
  const fade = (position: number, span: number): number => {
    if (position < 0) return Math.max(0, 1 + position / OLD_WRAP_MARGIN_TILES);
    if (position > span) return Math.max(0, 1 - (position - span) / OLD_WRAP_MARGIN_TILES);
    return 1;
  };
  return OLD_GUSTS.map((gust) => {
    // variantAt is the same deterministic-phase derivation wind.ts uses
    // today (phaseOffsetMs) - unchanged since #23's first commit.
    const t = elapsedMs + variantAt(gust.x0, gust.y0, 997) * 1000;
    const x = wrap(gust.x0 + windX * gust.speed * t, width);
    const y = wrap(gust.y0 + windY * gust.speed * t, height);
    const strength = OLD_WIND_STRENGTH_MAX * gust.strengthScale * fade(x, width) * fade(y, height);
    return { x, y, length: gust.length, width: gust.width, strength };
  });
}

/**
 * Lower and upper bounds for `screenCoverage` on today's area-derived
 * `windAt`, driven by `MAP_SIZES` (src/core/constants.ts) rather than a
 * hardcoded list of sizes (mirrors clouds.test.ts's COVERAGE_FLOOR /
 * COVERAGE_CEILING; same rationale - a third MAP_SIZES entry gets measured
 * here automatically). Measured under screenCoverage.ts's exported defaults,
 * with each gust's band approximated as a capsule of discs (`toDiscs`):
 *
 *   vale (60x60):       41.6%  (3 gusts - round(10 * 60*60 / 120*120))
 *   frontier (120x120): 45.8%  (10 gusts - the untouched reference table)
 *
 * Wind is meant to be intermittent (unlike clouds, which are meant to be
 * "usually there"), so both bounds sit further from the measured values than
 * clouds.ts's do:
 *
 * WIND_COVERAGE_FLOOR (38%) sits below both real measurements (41.6%, 45.8%)
 * - deliberately *below* today's 120x120 value too, per the brief's "現在の
 * 120×120の値を壊さないことを最優先にし、下限は現状より下に置く" (nobody
 * looking at the built game has judged 45.8% too high or too low; the floor
 * only exists to catch a regression, not to declare 45.8% a target). It is
 * still above the old fixed 4-gust table's coverage at either shipped size
 * (60x60: 35.4%, 120x120: 13.6% - see the sanity check below), so it only
 * trips on a real regression, not on the ordinary, already-shipped range.
 *
 * WIND_COVERAGE_CEILING (75%) is far above both real measurements - wind is
 * allowed much more headroom than clouds before "intermittent" starts to
 * look wrong, but a ceiling still exists so an unbounded-density bug (e.g.
 * MAX_GUSTS silently removed) would eventually get caught.
 */
const WIND_COVERAGE_FLOOR = 0.38;
const WIND_COVERAGE_CEILING = 0.75;

describe('screen coverage tracks map size, wind (issue #30)', () => {
  it.each(Object.entries(MAP_SIZES).map(([name, size]) => [name, size, size] as const))(
    'windAt stays between the coverage floor and ceiling on %s (%ix%i)',
    (_name, size) => {
      const coverage = screenCoverage((t) => toDiscs(windAt(t, size, size)), size, size, {
        durationMs: COVERAGE_DURATION_MS,
      });
      expect(coverage).toBeGreaterThan(WIND_COVERAGE_FLOOR);
      expect(coverage).toBeLessThan(WIND_COVERAGE_CEILING);
    },
  );

  // Same hypothetical-future-size guard as clouds.test.ts's 180x180 case.
  it('also stays inside the band on a hypothetical 180x180 map', () => {
    const coverage = screenCoverage((t) => toDiscs(windAt(t, 180, 180)), 180, 180, {
      durationMs: COVERAGE_DURATION_MS,
    });
    expect(coverage).toBeGreaterThan(WIND_COVERAGE_FLOOR);
    expect(coverage).toBeLessThan(WIND_COVERAGE_CEILING);
  });
});

describe('screenCoverage actually catches the #23/#30 wind bug (sanity check)', () => {
  it('the pre-#23-fix fixed 4-gust table falls below the coverage floor on the shipped 120x120 map', () => {
    // If this assertion ever failed, "screen coverage tracks map size, wind"
    // above would not be testing anything - mirrors clouds.test.ts's
    // equivalent sanity check.
    const coverage = screenCoverage((t) => toDiscs(oldFixedWindAt(t, 120, 120)), 120, 120, {
      durationMs: COVERAGE_DURATION_MS,
    });
    expect(coverage).toBeLessThan(WIND_COVERAGE_FLOOR);
    expect(coverage).toBeCloseTo(0.136, 2); // measured figure, this investigation
  });

  it('the pre-#23-fix table also falls below the floor on the 60x60 map', () => {
    const coverage = screenCoverage((t) => toDiscs(oldFixedWindAt(t, 60, 60)), 60, 60, {
      durationMs: COVERAGE_DURATION_MS,
    });
    expect(coverage).toBeLessThan(WIND_COVERAGE_FLOOR);
    expect(coverage).toBeCloseTo(0.354, 2); // measured figure, this investigation
  });
});
