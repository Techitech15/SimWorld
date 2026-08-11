// Wind gusts' inputs (issue #23, option (c)). The drawing cannot run
// headless; the values it draws from can - the same split clouds.test.ts and
// daylight.test.ts use.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLOUD_ALPHA_MAX } from './clouds';
import { WIND_STRENGTH_MAX, WRAP_MARGIN_TILES, windAt } from './wind';

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

  it('is subtler than a cloud shadow: the ceiling is clearly lighter than CLOUD_ALPHA_MAX', () => {
    // Not a shared constant on purpose - wind and clouds are independent
    // layers (clouds.ts is left untouched) - but the acceptance condition is
    // that wind reads as the weaker of the two.
    expect(WIND_STRENGTH_MAX).toBeLessThan(CLOUD_ALPHA_MAX);
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
    // Gusts travel faster than clouds (wind.ts's fastest GUSTS entry is
    // 0.0065 tiles/ms vs. clouds.ts's fastest of 0.0015), so the per-step
    // bound is wider than clouds.test.ts's 0.1: 0.0065 tiles/ms * 50ms step
    // is already ~0.32 tiles, so 0.1 would fail on real, non-teleporting
    // motion. 0.4 keeps margin above that while still catching an actual
    // wrap-seam jump, which is many tiles in one step.
    const maxStepTiles = 0.4;
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
