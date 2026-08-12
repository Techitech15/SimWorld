// screenCoverage's own inputs are synthetic here on purpose (issue #30):
// this module knows nothing about clouds, so its tests should not need
// clouds.ts either. clouds.test.ts is where the real cloudsAt-driven
// measurements live.
import { describe, expect, it } from 'vitest';
import {
  VISIBLE_STRENGTH_THRESHOLD,
  WINDOW_HEIGHT_TILES,
  WINDOW_WIDTH_TILES,
  type CoverageDisc,
  screenCoverage,
} from './screenCoverage';

const DURATION_MS = 60_000;

describe('screenCoverage is a pure function of its inputs', () => {
  it('returns the same value for the same sampler and options', () => {
    const discsAt = (t: number): CoverageDisc[] => [{ x: (t / 1000) % 60, y: 30, radius: 8, strength: 0.2 }];
    const a = screenCoverage(discsAt, 60, 60, { durationMs: DURATION_MS });
    const b = screenCoverage(discsAt, 60, 60, { durationMs: DURATION_MS });
    expect(a).toBe(b);
  });
});

describe('screenCoverage at the extremes', () => {
  it('is 0 when the sampler never returns any discs', () => {
    const cov = screenCoverage(() => [], 60, 60, { durationMs: DURATION_MS });
    expect(cov).toBe(0);
  });

  it('is 0 when every disc is below the visible-strength threshold', () => {
    const discsAt = (): CoverageDisc[] => [
      { x: 30, y: 30, radius: 100, strength: VISIBLE_STRENGTH_THRESHOLD / 2 },
    ];
    const cov = screenCoverage(discsAt, 60, 60, { durationMs: DURATION_MS });
    expect(cov).toBe(0);
  });

  it('is 1 when a single disc is big enough to cover the whole map at every sample', () => {
    // Centered on the map with a radius that reaches every corner, so every
    // window position at every time sample overlaps it.
    const discsAt = (): CoverageDisc[] => [{ x: 30, y: 30, radius: 100, strength: 1 }];
    const cov = screenCoverage(discsAt, 60, 60, { durationMs: DURATION_MS });
    expect(cov).toBe(1);
  });

  it('handles a map smaller than the sampling window without throwing (single window position)', () => {
    const discsAt = (): CoverageDisc[] => [{ x: 2, y: 2, radius: 20, strength: 1 }];
    expect(() =>
      screenCoverage(discsAt, WINDOW_WIDTH_TILES - 1, WINDOW_HEIGHT_TILES - 1, {
        durationMs: DURATION_MS,
      }),
    ).not.toThrow();
    const cov = screenCoverage(discsAt, WINDOW_WIDTH_TILES - 1, WINDOW_HEIGHT_TILES - 1, {
      durationMs: DURATION_MS,
    });
    expect(cov).toBe(1);
  });
});

describe('screenCoverage measures a partial-coverage case in between', () => {
  it('is strictly between 0 and 1 when a disc only covers part of the map, part of the time', () => {
    // A single small disc sitting still in one corner: most window
    // positions across the map never see it, so coverage should be low but
    // not zero (the corner near the disc is always covered).
    const discsAt = (): CoverageDisc[] => [{ x: 5, y: 5, radius: 3, strength: 1 }];
    const cov = screenCoverage(discsAt, 120, 120, { durationMs: DURATION_MS });
    expect(cov).toBeGreaterThan(0);
    expect(cov).toBeLessThan(1);
  });

  it('goes up when the disc is replaced with a bigger one covering more ground, all else equal', () => {
    const small = (): CoverageDisc[] => [{ x: 60, y: 60, radius: 5, strength: 1 }];
    const big = (): CoverageDisc[] => [{ x: 60, y: 60, radius: 40, strength: 1 }];
    const covSmall = screenCoverage(small, 120, 120, { durationMs: DURATION_MS });
    const covBig = screenCoverage(big, 120, 120, { durationMs: DURATION_MS });
    expect(covBig).toBeGreaterThan(covSmall);
  });
});

describe('screenCoverage does not depend on any particular effect (issue #30: reusable for wind, #23)', () => {
  it('scores a sampler that has nothing to do with clouds the same way it would score clouds', () => {
    // No import of clouds.ts anywhere in this file - CoverageDisc is the
    // only contract, and any future effect (e.g. a wind gust field) can
    // supply its own adapter to the same function.
    const gustsAt = (t: number): CoverageDisc[] => [
      { x: 10 + (t / 500) % 100, y: 50, radius: 6, strength: 0.5 },
    ];
    const cov = screenCoverage(gustsAt, 120, 120, { durationMs: DURATION_MS });
    expect(cov).toBeGreaterThanOrEqual(0);
    expect(cov).toBeLessThanOrEqual(1);
  });
});
