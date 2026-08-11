// Issue #19, 段階 G-1. Pins down the four properties `variantAt` must have
// to be safe to widen past the old 2-variant forest hash: pure, in-range,
// stable for negative coordinates, and - the one that actually motivated
// switching hashes - free of diagonal striping.
import { describe, expect, it } from 'vitest';
import { variantAt } from './tileVariant';

/**
 * The largest share any single variant holds on any one diagonal (x+y = d)
 * of a `size`x`size` grid, for a variant function keyed by count. 1.0 means
 * at least one diagonal is entirely one variant - a visible stripe. Short
 * diagonals near the map corners are excluded (too few tiles to say
 * anything about "dominance").
 */
function worstDiagonalShare(
  variantOf: (x: number, y: number) => number,
  size: number,
  count: number,
): number {
  const byDiagonal = new Map<number, number[]>();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = x + y;
      const counts = byDiagonal.get(d) ?? new Array(count).fill(0);
      counts[variantOf(x, y)]++;
      byDiagonal.set(d, counts);
    }
  }
  let worst = 0;
  for (const counts of byDiagonal.values()) {
    const total = counts.reduce((a, b) => a + b, 0);
    if (total < 10) continue; // corner diagonals are too short to judge
    const maxShare = Math.max(...counts) / total;
    worst = Math.max(worst, maxShare);
  }
  return worst;
}

describe('variantAt', () => {
  it('is a pure function of (x, y, count)', () => {
    for (let x = -5; x <= 5; x++) {
      for (let y = -5; y <= 5; y++) {
        for (let count = 1; count <= 5; count++) {
          expect(variantAt(x, y, count)).toBe(variantAt(x, y, count));
        }
      }
    }
  });

  it('always returns 0 <= v < count', () => {
    for (let x = -50; x <= 50; x += 3) {
      for (let y = -50; y <= 50; y += 3) {
        for (let count = 1; count <= 6; count++) {
          const v = variantAt(x, y, count);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(count);
          expect(Number.isInteger(v)).toBe(true);
        }
      }
    }
  });

  it('does not blow up on negative coordinates', () => {
    expect(() => variantAt(-1, -1, 3)).not.toThrow();
    expect(() => variantAt(-1000, -1000, 3)).not.toThrow();
    const v = variantAt(-7, -13, 3);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(3);
  });

  it('distributes roughly evenly across a 60x60 map (each variant within ±20% of the expected count)', () => {
    const size = 60;
    const count = 3;
    const counts = new Array(count).fill(0);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) counts[variantAt(x, y, count)]++;
    }
    const expected = (size * size) / count;
    for (const c of counts) {
      expect(c).toBeGreaterThan(expected * 0.8);
      expect(c).toBeLessThan(expected * 1.2);
    }
  });

  it('does not stripe diagonally on a 60x60 map', () => {
    // The failure mode this guards against: `(x*7 + y*13) % 3` reduces to
    // `(x + y) % 3`, which is one single variant per diagonal - see the
    // sanity check below for proof this metric actually catches that.
    // A well-mixed hash still has some random imbalance on any one diagonal
    // (measured up to ~0.62 here), so the bar is set well below the naive
    // hash's 1.0 rather than at a tight statistical threshold - this test is
    // about catching a stripe, not about measuring hash quality precisely.
    const worst = worstDiagonalShare((x, y) => variantAt(x, y, 3), 60, 3);
    expect(worst).toBeLessThan(0.75);
  });

  it('sanity check: worstDiagonalShare does catch the naive (x*7+y*13)%3 hash the issue warns against', () => {
    // 7 % 3 === 1 and 13 % 3 === 1, so this collapses to (x+y) % 3 - every
    // diagonal is 100% one variant. If this assertion ever failed, the
    // "does not stripe diagonally" test above would not be testing anything.
    const naive = (x: number, y: number) => (x * 7 + y * 13) % 3;
    const worst = worstDiagonalShare(naive, 60, 3);
    expect(worst).toBeCloseTo(1, 5);
  });
});
