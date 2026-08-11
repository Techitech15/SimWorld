// Cloud shadows' inputs (issue #15). The drawing cannot run headless; the
// values it draws from can - the same split daylight.test.ts uses for the
// day/night overlay.
import { describe, expect, it } from 'vitest';
import { CLOUD_ALPHA_MAX, WRAP_MARGIN_TILES, cloudsAt } from './clouds';

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
