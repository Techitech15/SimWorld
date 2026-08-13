// The chronicle: a small, curated record of the colony's history (issue #28).
//
// `state.log` (src/core/state.ts, `addLog`) is a notification feed - "look at
// this now, then forget it" - kept as the last 100 entries on purpose
// (CLAUDE.md warns against measuring a long run from it: a year of play writes
// far more than a hundred lines, so anything that reads the tail after a long
// run is measuring the buffer, not the run). Every story the colony has lived
// through - a death, a raid, a birth of a bond, a break, a season's turn - is
// written there and then quietly overwritten days later. The chronicle exists
// so a player can read the colony's story back after a season, or ten years.
//
// It shares `state.log`'s shape on purpose: a dictionary key plus primitive
// params, never a rendered sentence (11章 フェーズ9, `LogKey`/`LogParams` in
// ./types). A saved chronicle that carried English sentences would be a save
// file that disagreed with the language the player chose to load it in
// (docs/design-phase9-language.md); `src/ui/strings.ts` renders both alike.
//
// Only the seven kinds of event issue #28 names go through here: a colonist's
// death, a raid's start and its outcome, a migrant's arrival, a successful
// taming, a mental break, a season/year turning, a completed research. Every
// other `addLog` call (a failed job, a furnace running dry, a wolf sighted)
// stays in `state.log` only - the chronicle is deliberately not "the log with
// a bigger buffer": a buffer that big would keep the noise right alongside
// the story it was meant to make findable.
import type { ChronicleEntry, GameState, LogKey, LogParams } from './types';

/**
 * The events that recur by their nature - the calendar turning, a colonist's
 * mood giving out - rather than marking something that happened to this
 * colony once. Kept apart from everything else so eviction (below) can thin
 * these first: losing "spring arrived" a second time costs the story nothing
 * a player would miss, losing the colony's first death would.
 */
const MINOR_CHRONICLE_KEYS: ReadonlySet<LogKey> = new Set<LogKey>([
  'seasonArrived',
  'breakBrooding',
  'breakWandering',
  'breakBinge',
]);

function isMinor(key: LogKey): boolean {
  return MINOR_CHRONICLE_KEYS.has(key);
}

/**
 * How many entries the chronicle keeps.
 *
 * Measured (headless, no player input, 60x60 map, `createHarness`'s default -
 * see the task report for the full seed x key table): 10 seeds x one year
 * (60,000 ticks) wrote 92 of these events total, averaging 9.2/year (worst
 * single seed: 17). The breakdown is lopsided - `seasonArrived` alone is
 * exactly 4/year/seed by construction (40 of the 92); `colonistArrived` is
 * next (29, capped by `ARRIVAL_MAX_COLONISTS = 8`); mood breaks, raids and
 * deaths together make up the rest in the single digits. `researchUnlocked`
 * and `animalTamed` never fired once across all 10 seeds, because both need a
 * player to have built a research desk or ordered a taming - nothing a no-op
 * run ever does, but also both are naturally bounded even in a played game
 * (`researchUnlocked` at most 4, one per `TechName`; `animalTamed` bounded by
 * how much wildlife a map sustains).
 *
 * A played, larger (120x120, more population) colony will write more than an
 * idle one - more colonists means more mood breaks, and an actively defended
 * colony survives to see more raids and more years - so this rounds the
 * measured 9.2/year up generously to 50/year as a ceiling that assumes a busy
 * colony, not the idle one actually measured. Ten years at that rate is 500
 * entries; `CHRONICLE_MAX` is set at exactly that, which is itself generous
 * headroom over the ~90-190 entries ten years at the *measured* rate would
 * actually produce. Each entry is a tick, a short key and at most a couple of
 * primitive params - measured at under 120 bytes of JSON per entry - so 500
 * of them is under 60KB, negligible next to a save that already serialises
 * every tile on the map. Beyond ten years of a busy colony, the eviction rule
 * below takes over rather than the save growing without bound.
 */
export const CHRONICLE_MAX = 500;

/**
 * How many of the chronicle's oldest entries are never evicted, minor or not.
 *
 * This is what makes "the first tale doesn't disappear" true regardless of
 * what kind of entries fill up later: the colony's opening chapter - however
 * it opened - is exempt from every eviction rule below. 30 is comfortably
 * more than three times the colony's measured first-year rate (9.2), so in
 * practice the whole first year or two survives untouched even for a busy
 * colony; it is a count rather than a tick window because a slow start
 * (nothing happens for months) should not spend its exemption on nothing, and
 * a fast one should not lose it to a single eventful week.
 */
export const CHRONICLE_PROTECTED = 30;

/**
 * Record one of the seven kinds of event issue #28 asks the chronicle to
 * keep. Call this *alongside* `addLog` at the same call site, not instead of
 * it - `state.log` still owes the player an immediate notification, the
 * chronicle owes them a history to read back later. The two are independent:
 * an entry recorded here is never read from or written back into `state.log`.
 */
export function recordChronicle(state: GameState, key: LogKey, params?: LogParams): void {
  const entry: ChronicleEntry = { tick: state.tick, key };
  if (params) entry.params = params;
  state.chronicle = appendChronicle(state.chronicle, entry);
}

/**
 * The eviction rule once the chronicle is full.
 *
 * Not a ring buffer: a ring buffer drops the oldest entry unconditionally,
 * which means the very first thing that ever happened to the colony is the
 * very first thing lost - exactly backwards for something meant to be read
 * back as a history. Instead:
 *
 * 1. The oldest `CHRONICLE_PROTECTED` entries are never touched.
 * 2. Beyond that prologue, the oldest *minor* entry (a season turn, a mood
 *    break - see `MINOR_CHRONICLE_KEYS`) is dropped to make room. These
 *    recur by nature, so losing an old one costs nothing an old *death* or
 *    *raid* losing would.
 * 3. Only once no minor entries remain outside the prologue does the oldest
 *    non-prologue entry of any kind get dropped - the chronicle keeps
 *    growing rather than silently refusing new entries forever.
 *
 * The net effect over a very long game is a colony whose opening survives
 * intact, whose milestones (deaths, raids, research, taming, arrivals) are
 * kept far longer than its routine weather, and whose oldest routine detail
 * is what quietly thins out first - the "old sections thin, first chapter
 * stays" shape the design brief asked for.
 */
function appendChronicle(chronicle: ChronicleEntry[], entry: ChronicleEntry): ChronicleEntry[] {
  if (chronicle.length < CHRONICLE_MAX) return [...chronicle, entry];

  const protectedCount = Math.min(CHRONICLE_PROTECTED, chronicle.length);
  let dropIndex = -1;
  for (let i = protectedCount; i < chronicle.length; i++) {
    if (isMinor(chronicle[i].key)) {
      dropIndex = i;
      break;
    }
  }
  if (dropIndex === -1 && protectedCount < chronicle.length) {
    // no minor entry left outside the prologue: give up the oldest major one
    // instead of refusing to record anything new
    dropIndex = protectedCount;
  }
  if (dropIndex === -1) {
    // the whole chronicle is the protected prologue - CHRONICLE_MAX would
    // have to be at or below CHRONICLE_PROTECTED for this to happen, which it
    // is not, but dropping the newcomer rather than touching history is the
    // safe fallback if that constant is ever lowered
    return chronicle;
  }

  const next = chronicle.slice(0, dropIndex).concat(chronicle.slice(dropIndex + 1));
  next.push(entry);
  return next;
}
