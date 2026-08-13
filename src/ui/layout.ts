// Narrow-viewport layout (GitHub issue #26).
//
// Below about 1024px the fixed-width sidebars (260px left + 300px right =
// 560px) ate most of the viewport, and `.topbar` wrapped onto two or three
// lines on top of that, leaving the board a thin strip. This module is the
// pure decision layer: given a viewport size, it says which sidebars should
// stay docked (part of the flex row, permanently taking width) versus become
// a drawer (an overlay the player opens on demand, which does not cost board
// width while closed - see `.sidebar--drawer` in styles.css), and whether the
// topbar's button group should collapse into a "..." menu.
//
// No DOM here on purpose: this file is imported by `layout.test.ts`, which
// runs under the `node` vitest environment (vite.config.ts). `useViewportSize`
// is the one function that touches `window`, and it is a hook - tests never
// call it, they only call the plain functions above it.
import { useEffect, useState } from 'react';

/** The build toolbar's fixed width when docked (`.sidebar--left` in styles.css). */
export const SIDEBAR_LEFT_WIDTH = 260;

/** The read panels' fixed width when docked (`.sidebar--right` in styles.css). */
export const SIDEBAR_RIGHT_WIDTH = 300;

/**
 * The hard floor: the board must cover more than half the viewport's *area*
 * (width x height, not just width - the topbar's own height counts against
 * it too). This is the number `layout.test.ts` holds every width against.
 */
export const BOARD_MIN_SHARE = 0.5;

/**
 * The threshold this module actually decides against. Set above
 * `BOARD_MIN_SHARE` on purpose: `TOPBAR_HEIGHT_PX` below is a model of the
 * real single-row topbar height (measured in a real browser, not computed
 * from first principles), and deciding right at the hard floor would mean any
 * small mismatch between the model and the real page tips a benchmark width
 * under 0.5. Deciding at 0.55 leaves that margin.
 */
export const DOCK_COMFORT_SHARE = 0.55;

/**
 * A single-row `.topbar`'s height, measured in a real browser at 1280x800
 * (Chromium, the button/select/font-size rules in styles.css as of this
 * change) and rounded up. Used only to model the board's remaining height
 * for the decisions in this file and for `layout.test.ts` - the real page's
 * actual height is whatever the flex layout renders, this is not read back
 * from it.
 */
export const TOPBAR_HEIGHT_PX = 49;

/**
 * Below this viewport width, `.topbar__actions` (save/load/scenario/map
 * size/world map/language/sound/new map) collapses into a single "..."
 * `<details>` menu instead of sitting in the row (TopBar.tsx), rather than
 * `.topbar` growing a horizontal scrollbar to hold it.
 *
 * Measured in a real Chromium page (`.topbar`'s `scrollWidth` against
 * `clientWidth`, `styles.css`'s button/select/font-size rules as of this
 * change): the full uncollapsed row needs ~1811px to lay out without
 * overflowing, while the row with `.topbar__actions` collapsed only needs
 * ~983px (clock + speed + jobs + the collapsed "..." button; `.topbar__status`
 * has `min-width: 0` and gives up first). This constant sits above the first
 * number and (with margin) above the second, so 1024/800/640 all get the
 * collapsed, no-scrollbar row. 1920 sits above ~1811 too, so the row fits
 * uncollapsed there without a scrollbar either way.
 */
export const ACTIONS_COLLAPSE_WIDTH = 1850;

export interface Layout {
  /** Is the build toolbar (`.sidebar--left`) a permanent column? */
  leftDocked: boolean;
  /** Is the read-panel column (`.sidebar--right`) a permanent column? */
  rightDocked: boolean;
  /** The board's modeled width in px, given the dock decision above. */
  boardWidth: number;
  /** The board's modeled height in px (viewport height minus one topbar row). */
  boardHeight: number;
  /** boardWidth * boardHeight, as a share of viewportWidth * viewportHeight. */
  boardShare: number;
  /** Should `.topbar__actions` collapse into a "..." menu? */
  collapseActions: boolean;
}

function boardShareFor(
  viewportWidth: number,
  viewportHeight: number,
  leftDocked: boolean,
  rightDocked: boolean,
): { width: number; height: number; share: number } {
  const width = Math.max(
    0,
    viewportWidth - (leftDocked ? SIDEBAR_LEFT_WIDTH : 0) - (rightDocked ? SIDEBAR_RIGHT_WIDTH : 0),
  );
  const height = Math.max(0, viewportHeight - TOPBAR_HEIGHT_PX);
  const boardArea = width * height;
  const totalArea = Math.max(viewportWidth, 1) * Math.max(viewportHeight, 1);
  return { width, height, share: boardArea / totalArea };
}

/**
 * The rule (issue #26): keep both sidebars docked as long as the board keeps
 * a comfortable majority of the viewport's area. If it does not, undock the
 * right sidebar first (the read-only panels - colonists/work/research/
 * animals/log), since giving those up costs less than giving up the build
 * toolbar. If the board still does not have a comfortable majority, undock
 * the left sidebar too. An undocked sidebar becomes a drawer (see
 * `sidebar--drawer` in styles.css) - it does not take board width while
 * closed, so this only ever *grows* boardShare, and the loop below always
 * terminates with a valid state.
 */
export function layoutFor(viewportWidth: number, viewportHeight: number): Layout {
  let leftDocked = true;
  let rightDocked = true;
  let result = boardShareFor(viewportWidth, viewportHeight, leftDocked, rightDocked);

  if (result.share < DOCK_COMFORT_SHARE) {
    rightDocked = false;
    result = boardShareFor(viewportWidth, viewportHeight, leftDocked, rightDocked);
  }
  if (result.share < DOCK_COMFORT_SHARE) {
    leftDocked = false;
    result = boardShareFor(viewportWidth, viewportHeight, leftDocked, rightDocked);
  }

  return {
    leftDocked,
    rightDocked,
    boardWidth: result.width,
    boardHeight: result.height,
    boardShare: result.share,
    collapseActions: viewportWidth < ACTIONS_COLLAPSE_WIDTH,
  };
}

/**
 * The pre-fix layout (both sidebars permanently docked, whatever the
 * viewport): what `layoutFor` replaces. Exported so `layout.test.ts` can show
 * the metric actually catches the bug this change fixes - the same shape as
 * `tileVariant.test.ts`'s "sanity check" for `worstDiagonalShare` (see
 * CLAUDE.md, "主張する前に測る").
 */
export function legacyBoardShare(viewportWidth: number, viewportHeight: number): number {
  return boardShareFor(viewportWidth, viewportHeight, true, true).share;
}

export interface ViewportSize {
  width: number;
  height: number;
}

/**
 * The live viewport size, updated on resize. There is no SSR in this app
 * (App.tsx only ever runs in the browser), so `window` is read directly
 * rather than guarded - but `layout.test.ts` runs under vitest's `node`
 * environment (vite.config.ts) and never calls this hook, only the plain
 * functions above it.
 */
export function useViewportSize(): ViewportSize {
  const [size, setSize] = useState<ViewportSize>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return size;
}
