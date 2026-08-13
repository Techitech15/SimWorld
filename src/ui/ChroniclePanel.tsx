// The colony's history, read back rather than glanced at (issue #28, stage 2).
//
// `state.chronicle` (src/core/chronicle.ts) is a *separate* buffer from
// `state.log` on purpose - see that file's header comment. `EventLog.tsx` is
// "look at this now, then forget it"; this panel is "read the colony's story
// back after a season, or ten years". They share nothing but the underlying
// `LogKey` + params shape, so this panel reuses exactly the translation path
// `EventLog` already has (`strings.log[key](params)`, 11章 フェーズ9) rather
// than inventing a second one - a chronicle entry and a log entry for the
// same event must always read as the same sentence.
import { Fragment } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DAYS_PER_SEASON, dayOfSeason, seasonOf, yearOf } from '../core/season';
import type { ChronicleEntry } from '../core/types';
import { useGameStore } from '../store/gameStore';
import { useStrings } from './language';
import type { Strings } from './strings';

/**
 * How many of the chronicle's newest entries this panel ever puts in the DOM.
 * `state.chronicle` holds up to `CHRONICLE_MAX` (500, src/core/chronicle.ts);
 * rendering all of them into a scrollable list at once would grow the DOM
 * with every year a colony survives for no reader benefit - a player scanning
 * history reads recent-first and rarely scrolls to the very bottom. Well
 * above `EventLog`'s 40: this list is meant to be scrolled through, that one
 * is meant to be glanced at.
 */
export const CHRONICLE_DISPLAY_LIMIT = 150;

/**
 * Newest first, capped - the pure half of what the panel renders, kept
 * outside the component so it is testable without a DOM (see
 * `ChroniclePanel.test.ts`; this suite runs in `environment: 'node'`, the
 * same split `panelState.test.ts` / `AlertPanel.test.ts` use).
 *
 * `state.chronicle` is stored oldest-first - `appendChronicle` in
 * chronicle.ts only ever pushes onto the end, so ticks only ever increase
 * left to right. `.slice(-limit)` keeps the newest `limit` entries while that
 * order still holds, then `.reverse()` flips to newest-on-top, the same
 * direction `EventLog` shows `state.log` in.
 */
export function visibleChronicle(
  entries: ChronicleEntry[],
  limit: number = CHRONICLE_DISPLAY_LIMIT,
): ChronicleEntry[] {
  return entries.slice(-limit).reverse();
}

/** The kinds worth calling out visually, same idea as `EventLog`'s `log__incident`
 *  (there it is driven by `LogEntry.kind`, which `ChronicleEntry` does not carry -
 *  every chronicle entry is already curated, so this reads the key directly). */
const NOTABLE_CHRONICLE_KEYS = new Set<ChronicleEntry['key']>([
  'incidentRaid',
  'colonistStarvedToDeath',
  'colonistKilledByRaider',
  'colonistKilledByAnimal',
  'colonistKilled',
]);

/** "When" for one entry, in the same vocabulary `TopBar` uses for the clock -
 *  season and day within it. The year is not repeated here: it is the group
 *  heading a run of entries sits under (see `ChroniclePanel` below). */
function seasonStampOf(strings: Strings, tick: number): string {
  return strings.seasonDay(seasonOf(tick), dayOfSeason(tick), DAYS_PER_SEASON);
}

export function ChroniclePanel(): React.JSX.Element | null {
  const strings = useStrings();
  // `useShallow`, not a bare selector on `s.state.chronicle`: the store hands
  // out a *new* GameState every tick (`beginTick`, src/core/state.ts), so this
  // selector runs every tick regardless of the chronicle. `visibleChronicle`
  // slices and reverses, which allocates a fresh array every call even on
  // ticks that never touch `state.chronicle` at all (its own reference only
  // changes on the ticks `recordChronicle` actually appends to it - same as
  // `state.log`). Without `useShallow` that fresh array would fail Zustand's
  // `Object.is` check and re-render this panel every tick anyway; `useShallow`
  // compares the entries it holds, so the panel only re-renders on the ticks
  // that actually add or evict a chronicle entry - the same guard `EventLog`
  // uses for `state.log`, for the same reason.
  const entries = useGameStore(useShallow((s) => visibleChronicle(s.state.chronicle)));
  if (entries.length === 0) return null;

  let lastYear = -1;
  return (
    <ul className="log log--scroll chronicle">
      {entries.map((entry, index) => {
        const year = yearOf(entry.tick);
        const showYear = year !== lastYear;
        lastYear = year;
        return (
          <Fragment key={`${entry.tick}-${index}`}>
            {showYear ? (
              <li className="chronicle__year" aria-hidden="true">
                {strings.yearLabel(year)}
              </li>
            ) : null}
            <li className={NOTABLE_CHRONICLE_KEYS.has(entry.key) ? 'log__incident' : undefined}>
              <span className="muted small">{seasonStampOf(strings, entry.tick)}</span>{' '}
              {strings.log[entry.key](entry.params ?? {})}
            </li>
          </Fragment>
        );
      })}
    </ul>
  );
}
