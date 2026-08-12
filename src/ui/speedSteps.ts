// The four speed steps, as one table (GitHub issue #27).
//
// GameState['speed'] only ever takes 0 | 1 | 3 | 10 (design.md 4章): paused,
// then 1x/3x/10x real-time (loop.ts adds `speed` ticks per tick-boundary, and
// a tick is a fixed 200ms, so the multiplier is exactly the button's number).
// Before this table that one fact was duplicated - TopBar.tsx drew the speed
// buttons from its own `speeds` array, and useKeyboardShortcuts.ts had a
// second, separately-written `{ '1': 0, '2': 1, '3': 3, '4': 10 }` map - and
// the two were free to drift apart. They did: the buttons ended up showing
// `⏸ ▶ ▶▶▶ ▶▶▶▶`, a glyph count with no relation to 1x/3x/10x. Keeping a
// single ordered array here, with the keyboard digit implied by array index,
// makes "button N" and "key N+1" the same table by construction instead of
// two tables kept in sync by hand.
import type { GameState } from '../core/types';
import type { Strings } from './strings';

export interface SpeedStep {
  value: GameState['speed'];
  /** the topbar button's own text (e.g. "1x" / "1倍") - a dictionary lookup,
   *  never a literal, so both languages stay in strings.ts (CLAUDE.md 言語) */
  label: (strings: Strings) => string;
  /** the button's title/hover text; the fastest step keeps its "a day a
   *  minute" aside instead of collapsing to the same text as the label */
  hint: (strings: Strings) => string;
}

/**
 * Speed-value order. `useKeyboardShortcuts.ts`'s '1'/'2'/'3'/'4' keys map
 * onto this array by index (key '1' -> index 0, ... key '4' -> index 3) -
 * see SPEED_STEP_KEYS below.
 */
export const SPEED_STEPS: readonly SpeedStep[] = [
  { value: 0, label: (s) => s.speedPauseLabel, hint: (s) => s.pauseHint },
  { value: 1, label: (s) => s.speedLabel(1), hint: (s) => s.speedHint(1) },
  { value: 3, label: (s) => s.speedLabel(3), hint: (s) => s.speedHint(3) },
  { value: 10, label: (s) => s.speedLabel(10), hint: (s) => s.speedFastHint },
];

/** The keyboard digit for each SPEED_STEPS index, in order. */
export const SPEED_STEP_KEYS = ['1', '2', '3', '4'] as const;
