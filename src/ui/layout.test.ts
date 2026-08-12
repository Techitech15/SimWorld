// The narrow-viewport layout decision (GitHub issue #26).
//
// This suite is entirely about `layoutFor`, a pure function - no DOM, no
// React, no localStorage. The Playwright measurement against a real running
// page (done separately, not part of `npm test`) is what actually proves the
// board covers the viewport in a browser; this file proves the *model*
// layoutFor uses to decide would predict that correctly.
import { describe, expect, it } from 'vitest';
import {
  ACTIONS_COLLAPSE_WIDTH,
  BOARD_MIN_SHARE,
  layoutFor,
  legacyBoardShare,
  SIDEBAR_LEFT_WIDTH,
  SIDEBAR_RIGHT_WIDTH,
} from './layout';

// The three widths the issue names, each paired with a plausible height at
// that aspect ratio (measured "board area over viewport area", not width alone
// - the topbar's own height eats into it too).
const BENCHMARKS: { width: number; height: number }[] = [
  { width: 1024, height: 768 },
  { width: 800, height: 600 },
  { width: 640, height: 480 },
];

describe('layoutFor', () => {
  it('keeps the board above BOARD_MIN_SHARE at 1024, 800 and 640', () => {
    for (const { width, height } of BENCHMARKS) {
      const layout = layoutFor(width, height);
      expect(layout.boardShare).toBeGreaterThan(BOARD_MIN_SHARE);
    }
  });

  // The metric has to catch the bug before the fix is credible (CLAUDE.md,
  // "主張する前に測る"; same shape as tileVariant.test.ts's sanity check for
  // worstDiagonalShare). The pre-fix page kept both 260px + 300px sidebars
  // docked at every width - `legacyBoardShare` models exactly that.
  it('sanity check: the pre-fix layout (both sidebars always docked) fails this same metric', () => {
    for (const { width, height } of BENCHMARKS) {
      expect(legacyBoardShare(width, height)).toBeLessThan(BOARD_MIN_SHARE);
    }
  });

  it('keeps both sidebars docked on wide viewports', () => {
    for (const [width, height] of [
      [1600, 900],
      [1920, 1080],
    ]) {
      const layout = layoutFor(width, height);
      expect(layout.leftDocked).toBe(true);
      expect(layout.rightDocked).toBe(true);
      expect(layout.boardShare).toBeGreaterThan(BOARD_MIN_SHARE);
    }
  });

  it('undocks the right sidebar (read panels) before the left (build toolbar)', () => {
    // 1024x768: too tight with both sidebars docked, but the board still has
    // a comfortable majority with only the left one - so the right one alone
    // should give way.
    const layout = layoutFor(1024, 768);
    expect(layout.leftDocked).toBe(true);
    expect(layout.rightDocked).toBe(false);
  });

  it('undocks the left sidebar too once even a right-only give-up is not enough', () => {
    // 640x480: giving up the right sidebar alone (per the case above) is not
    // enough room, so the left one has to go too.
    const layout = layoutFor(640, 480);
    expect(layout.leftDocked).toBe(false);
    expect(layout.rightDocked).toBe(false);
    // an undocked sidebar is a drawer, not gone - the board still only ever
    // grows from undocking one, so this stays comfortably clear of the floor
    expect(layout.boardShare).toBeGreaterThan(BOARD_MIN_SHARE);
  });

  it('collapses topbar__actions into a menu on narrow viewports but not wide ones', () => {
    // ACTIONS_COLLAPSE_WIDTH sits above the ~1811px a real Chromium page needs
    // to lay out the uncollapsed row without a horizontal scrollbar (see the
    // constant's own comment in layout.ts), so 1920 clears it uncollapsed.
    expect(layoutFor(1920, 1080).collapseActions).toBe(false);
    expect(layoutFor(1024, 768).collapseActions).toBe(true);
    expect(layoutFor(800, 600).collapseActions).toBe(true);
    expect(layoutFor(640, 480).collapseActions).toBe(true);
    // and the threshold itself is where the switch happens
    expect(layoutFor(ACTIONS_COLLAPSE_WIDTH, 768).collapseActions).toBe(false);
    expect(layoutFor(ACTIONS_COLLAPSE_WIDTH - 1, 768).collapseActions).toBe(true);
  });

  it('never reports a docked sidebar wider than the viewport can hold', () => {
    for (const width of [0, 1, 100, 259, 260, 261, 559, 560, 561]) {
      const layout = layoutFor(width, 480);
      expect(layout.boardWidth).toBeGreaterThanOrEqual(0);
    }
  });

  it('is continuous at the dock/undock boundary: crossing it by 1px does not make the board disappear', () => {
    // Scan widths at a fixed height and find where the dock decision flips;
    // the board must stay a sane, positive share on both sides of that pixel
    // - it is a step down in sidebar width, never a cliff to zero.
    const height = 480;
    let previous = layoutFor(200, height);
    for (let width = 201; width <= 1200; width++) {
      const current = layoutFor(width, height);
      if (current.leftDocked !== previous.leftDocked || current.rightDocked !== previous.rightDocked) {
        const before = layoutFor(width - 1, height);
        const after = layoutFor(width, height);
        expect(before.boardShare).toBeGreaterThan(0);
        expect(after.boardShare).toBeGreaterThan(0);
        expect(after.boardShare).toBeGreaterThan(BOARD_MIN_SHARE - 0.01);
      }
      previous = current;
    }
  });

  it('accounts for exactly the sidebars it says are docked, and no others', () => {
    // A drawer costs the board nothing while closed, so the reported
    // boardWidth plus whichever sidebars are still docked must add back up to
    // the whole viewport - if it did not, boardShare would be measuring
    // something other than what the page actually lays out.
    for (const { width, height } of BENCHMARKS) {
      const layout = layoutFor(width, height);
      const dockedWidth =
        (layout.leftDocked ? SIDEBAR_LEFT_WIDTH : 0) + (layout.rightDocked ? SIDEBAR_RIGHT_WIDTH : 0);
      expect(layout.boardWidth + dockedWidth).toBe(width);
    }
  });
});
