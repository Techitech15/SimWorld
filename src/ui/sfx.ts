// Which sound to make, decided from state differences alone (11章 フェーズ13
// 段階C, docs/design-phase13-presentation.md 5章; layered further in 段階
// S-1, GitHub issue #17).
//
// The simulation does not know sound exists. This module watches two
// consecutive looks at `GameState` and names the sounds the difference has
// earned: a blueprint that was not there is a click, a critical alert that was
// not there is an alarm, a raid line new in the log is a horn. Deciding from
// differences is what makes the acceptance conditions testable headless, and it
// is also what keeps loading a save quiet - a state that *jumps* is a load, not
// an event (see CONTINUITY_TICKS).
//
// S-1 adds a tier: every sound is `alarm`, `event` or `ambient`, and the tier
// - not the individual sound - owns gain, minimum interval and how many
// voices of it may sound at once (SFX_TIERS). `animal` is the one sound that
// is not diff-driven (5.3 of the phase13 doc is diff-only; the issue
// explicitly carves out an exception for it, see its trigger below).
//
// The actual noise lives in soundPlayer.ts; this file must stay importable in
// node with no AudioContext anywhere near it, and touches no randomness -
// the ambient pitch jitter the issue asks for is a playback-layer concern
// (soundPlayer.ts), not a decision-layer one, so this file has no
// `Math.random` in it.
import { collectAlerts } from '../core/alerts';
import type { GameState, LogEntry, LogKey } from '../core/types';

export type SfxName =
  // alarm: unmistakable, rare, never softened
  | 'raid'
  | 'alert'
  | 'death'
  | 'breakdown'
  // event: a response to something the player did or was waiting on
  | 'complete'
  | 'research'
  | 'trade'
  | 'arrival'
  | 'illness'
  // ambient: quiet, frequent, thinned hardest
  | 'place'
  | 'build'
  | 'animal'
  | 'notify';

export type SfxTier = 'alarm' | 'event' | 'ambient';

export const SFX_TIER: Record<SfxName, SfxTier> = {
  raid: 'alarm',
  alert: 'alarm',
  death: 'alarm',
  breakdown: 'alarm',
  complete: 'event',
  research: 'event',
  trade: 'event',
  arrival: 'event',
  illness: 'event',
  place: 'ambient',
  build: 'ambient',
  animal: 'ambient',
  notify: 'ambient',
};

export interface TierConfig {
  /**
   * Master gain multiplier for this tier, applied under the per-tone volume
   * and the player's own fader (soundPlayer.ts). alarm > event > ambient, and
   * ambient is deliberately much quieter than "just a bit less" - it is the
   * tier that repeats the most, so it is the one the ear should be able to
   * ignore.
   */
  gain: number;
  /**
   * The same sound name never plays twice inside this window. alarm is short
   * so a second raid horn a beat later is not swallowed; ambient is long so a
   * colony with five people building at once still ticks over at a walk.
   */
  minIntervalMs: number;
  /**
   * How many voices of this tier may be sounding at once (soundPlayer.ts
   * enforces this; it is not something the pure director can know about). At
   * 10x, ambient in particular must not be able to pile into a wall of noise
   * - see the issue's 5.3 concern - so it caps hardest.
   */
  maxConcurrent: number;
}

export const SFX_TIERS: Record<SfxTier, TierConfig> = {
  alarm: { gain: 1, minIntervalMs: 300, maxConcurrent: 3 },
  event: { gain: 0.65, minIntervalMs: 500, maxConcurrent: 3 },
  ambient: { gain: 0.3, minIntervalMs: 4000, maxConcurrent: 1 },
};

/** Back-compat name some older comments still call "the" minimum interval;
 *  kept as an alias of the event tier's value, which is what it used to be
 *  when every sound shared one interval. */
export const SFX_MIN_INTERVAL_MS = SFX_TIERS.event.minIntervalMs;

/**
 * `animal` gets a longer, dedicated cooldown on top of the ambient tier's
 * own minimum interval (5.3 of the issue: "ambient の最短間隔よりさらに長い
 * 専用の間隔"). It is not a diff-driven sound - see ANIMAL trigger below -
 * so without a cooldown of its own it would want to fire on every frame a
 * wild animal happens to exist, which at 10x is every frame of most games.
 * A single fixed value rather than a random range: the range in the issue
 * (8-15s) is about how it should *feel*, and the randomness that gives variety
 * to a fixed cadence belongs in the playback layer (soundPlayer.ts), same as
 * the pitch jitter - this module stays deterministic.
 */
export const ANIMAL_MIN_INTERVAL_MS = 12_000;

/**
 * How fast a click may answer itself. `place` is in the ambient tier for its
 * *gain and timbre* - it is a soft tick, and it repeats more than anything
 * else - but the tier's 4s interval is wrong for it, because `place` is not
 * world noise: it is the direct answer to a click the player just made
 * (design-phase13-presentation.md 5.3 files it under "プレイヤーの操作への
 * 応答", a different category from "アラート級の出来事"). Held to 4s, dropping
 * a bed and then another bed a second later answers the first click and
 * silently ignores the second, which reads as a broken control rather than as
 * restraint. 400ms is short enough that every deliberate placement is
 * answered and long enough that dragging a wall is one tick, not thirty.
 */
export const PLACE_MIN_INTERVAL_MS = 400;

/**
 * Per-sound overrides of the tier's interval. The tier decides how loud a
 * sound is and how many of it may overlap; a sound may still need its own
 * cadence, in either direction - `animal` slower because nothing else paces
 * it, `place` faster because a click has to be answered. Anything absent here
 * simply uses its tier's value.
 */
export const SFX_MIN_INTERVAL_OVERRIDE: Partial<Record<SfxName, number>> = {
  animal: ANIMAL_MIN_INTERVAL_MS,
  place: PLACE_MIN_INTERVAL_MS,
};

/** The interval this sound is actually held to: its own, or its tier's. */
export function minIntervalFor(name: SfxName): number {
  return SFX_MIN_INTERVAL_OVERRIDE[name] ?? SFX_TIERS[SFX_TIER[name]].minIntervalMs;
}

/**
 * A jump of more than this many ticks between two looks is a load or a new
 * game, not play the player watched happen. The director re-baselines silently:
 * a colony opened mid-raid should show the raid, not trumpet it.
 * MAX_CATCHUP_TICKS * 10x is 300 ticks of legitimate frame, but a frame that
 * large has stalled long enough that skipping its sounds is the right call too.
 */
const CONTINUITY_TICKS = 50;

/**
 * One synthesized tone: a plain oscillator with a fast attack and an
 * exponential decay over `duration`. The table *is* the asset - reviewable,
 * deterministic, zero bytes of it shipped as audio (5.1) - the same rule the
 * sprite tables follow.
 */
export interface ToneSpec {
  wave: 'sine' | 'square' | 'sawtooth' | 'triangle';
  /** start frequency, Hz */
  from: number;
  /** glide target; a horn falls, a click stays put */
  to?: number;
  /** offset from the start of the effect, seconds */
  at: number;
  /** seconds */
  duration: number;
  /** 0..1, scaled by the tier's gain and the player's volume before it reaches the speaker */
  volume: number;
}

export interface SfxSpec {
  tier: SfxTier;
  tones: readonly ToneSpec[];
}

/**
 * The parameter table for every sound the director can name. Tone shape
 * follows the tier (5.3 of the issue): alarm is fast-attack sawtooth/square
 * with a clear pitch move, so it reads as trouble before the player has
 * consciously placed it; ambient is sine/triangle, short and softly decayed,
 * so the same sound repeating does not grate.
 */
export const SFX: Record<SfxName, SfxSpec> = {
  // --- alarm: unmistakable, rare -------------------------------------------
  // the horn: two identical low saw blasts, close together - a raid is the
  // one thing in the game that must never be missed, so it repeats itself
  // rather than trusting a single note
  raid: {
    tier: 'alarm',
    tones: [
      { wave: 'sawtooth', from: 130.81, to: 92.5, at: 0, duration: 0.3, volume: 0.6 },
      { wave: 'sawtooth', from: 130.81, to: 92.5, at: 0.35, duration: 0.3, volume: 0.6 },
    ],
  },
  // two low notes falling (A3 -> F3): trouble, without being a siren
  alert: {
    tier: 'alarm',
    tones: [
      { wave: 'square', from: 220, at: 0, duration: 0.12, volume: 0.5 },
      { wave: 'square', from: 174.61, at: 0.15, duration: 0.18, volume: 0.5 },
    ],
  },
  // one long descending saw (B3 -> E2): the slowest, lowest, most final sound
  // in the table, kept unmistakably different from alert's two quick notes
  death: {
    tier: 'alarm',
    tones: [{ wave: 'sawtooth', from: 246.94, to: 82.41, at: 0, duration: 0.5, volume: 0.55 }],
  },
  // a wobble, not a fall: two close square notes overlapping in a minor
  // second (a clash) before settling low - unsteady rather than tragic,
  // which is the read a mental break needs
  breakdown: {
    tier: 'alarm',
    tones: [
      { wave: 'square', from: 196.0, at: 0, duration: 0.1, volume: 0.42 },
      { wave: 'square', from: 174.61, at: 0.05, duration: 0.1, volume: 0.38 },
      { wave: 'square', from: 130.81, at: 0.16, duration: 0.16, volume: 0.42 },
    ],
  },

  // --- event: a response to something worth pointing at -------------------
  // two rising notes (C5 -> G5) for a finished building
  complete: {
    tier: 'event',
    tones: [
      { wave: 'square', from: 523.25, at: 0, duration: 0.06, volume: 0.4 },
      { wave: 'square', from: 783.99, at: 0.07, duration: 0.1, volume: 0.4 },
    ],
  },
  // three rising notes (C5 -> E5 -> G5): the long project paying off
  research: {
    tier: 'event',
    tones: [
      { wave: 'square', from: 523.25, at: 0, duration: 0.07, volume: 0.4 },
      { wave: 'square', from: 659.25, at: 0.08, duration: 0.07, volume: 0.4 },
      { wave: 'square', from: 783.99, at: 0.16, duration: 0.12, volume: 0.4 },
    ],
  },
  // a coin: two very short high squares, the second higher (B5 -> E6)
  trade: {
    tier: 'event',
    tones: [
      { wave: 'square', from: 987.77, at: 0, duration: 0.035, volume: 0.4 },
      { wave: 'square', from: 1318.51, at: 0.04, duration: 0.09, volume: 0.4 },
    ],
  },
  // a warm rising third on a rounder wave than complete's - a new colonist,
  // not a new wall
  arrival: {
    tier: 'event',
    tones: [
      { wave: 'triangle', from: 440.0, at: 0, duration: 0.09, volume: 0.42 },
      { wave: 'triangle', from: 554.37, at: 0.08, duration: 0.13, volume: 0.42 },
    ],
  },
  // a falling minor third (F4 -> D4) on triangle: concerned, not alarming -
  // illness is a problem to schedule around, not a raid
  illness: {
    tier: 'event',
    tones: [
      { wave: 'triangle', from: 349.23, at: 0, duration: 0.1, volume: 0.4 },
      { wave: 'triangle', from: 293.66, at: 0.09, duration: 0.16, volume: 0.4 },
    ],
  },

  // --- ambient: quiet, frequent, softened ----------------------------------
  // a dry click for putting something down: one thin triangle, gone in 50ms -
  // softer than the old square now that it repeats under the ambient tier
  place: {
    tier: 'ambient',
    tones: [{ wave: 'triangle', from: 880, at: 0, duration: 0.05, volume: 0.3 }],
  },
  // a soft double tap - the sound of a hammer, not a bell, kept short so it
  // reads as background even when several colonists are building at once
  build: {
    tier: 'ambient',
    tones: [
      { wave: 'triangle', from: 300, at: 0, duration: 0.035, volume: 0.26 },
      { wave: 'sine', from: 210, at: 0.05, duration: 0.05, volume: 0.2 },
    ],
  },
  // a soft rising sine bleat - a creature call, not an alert
  animal: {
    tier: 'ambient',
    tones: [{ wave: 'sine', from: 420, to: 500, at: 0, duration: 0.18, volume: 0.2 }],
  },
  // one soft sine bell for "something happened, not urgently"
  notify: {
    tier: 'ambient',
    tones: [{ wave: 'sine', from: 660, at: 0, duration: 0.12, volume: 0.22 }],
  },
};

/**
 * Every log key gets an explicit row, on purpose. `Partial<Record<...>>`
 * would let a newly added `LogKey` sneak past the table with no sound and no
 * compile error - "音が付いていないことに気付けない", the same failure
 * shape the CLAUDE.md calls out for silently-invalidated jobs and vanished
 * resources. A full `Record` means the type checker fails the build the day
 * someone adds a 58th-plus log key and forgets to decide.
 *
 * `null` is a decision, not an omission: these are either too frequent to be
 * worth a sound (skill-ups, routine hauls, wildlife eating each other),
 * already covered by another signal (a colonist starving already raises the
 * critical alert that plays `alert`; raiders retreating are inside a raid
 * that already played `raid`), or purely a player-echo with no news in it
 * (orderedToMove).
 */
export const LOG_SFX: Record<LogKey, SfxName | null> = {
  legacy: null,
  colonistArrived: 'arrival',
  skillLevelUp: null, // routine, and frequent with a healthy colony
  seasonArrived: 'notify',
  colonistStarving: null, // the same colonist at hunger>=100 already raised the 'alert' critical
  colonistCannotFindFood: null, // same as above, and fires every 250 ticks while it is true
  breakBrooding: 'breakdown',
  breakWandering: 'breakdown',
  breakBinge: 'breakdown',
  backToWork: null, // the break already announced itself; recovery does not need to
  orderedToMove: null, // a player-issued order the player just watched happen on screen
  incidentBumperCrop: 'notify',
  incidentBlight: 'notify',
  incidentBerryGlut: 'notify',
  incidentWolfPack: 'notify',
  incidentHerd: 'notify',
  incidentLostSupplies: 'notify',
  incidentIllness: 'illness',
  incidentRaid: 'raid',
  raiderCutDownBy: null, // one raid can produce many of these; the horn already sounded
  raiderCutDownByTurret: null, // same
  raidOver: 'notify',
  raiderRetreats: null, // one per raider, inside a raid that already sounded
  raiderBreaking: null, // same
  buildingSmashed: null, // same
  furnaceBurnedOut: 'notify',
  furnaceStoked: null, // routine haul-job upkeep
  extractorOutOfRock: 'notify',
  extractorCutVein: 'notify',
  veinCutOpen: 'notify',
  buildingRepaired: null, // often several in a row after a raid; the raid already sounded
  buildingDismantled: null, // player action with immediate visual feedback
  animalTamed: 'notify',
  animalTameFailed: null, // retried often
  jobFailed: null, // routine, and can be frequent when a colony is short on paths or hands
  colonistStarvedToDeath: 'death',
  colonistKilledByRaider: 'death',
  colonistKilledByAnimal: 'death',
  colonistKilled: 'death',
  colonyDiedOut: 'death',
  boarTurnedOn: 'notify',
  animalTearing: 'notify',
  buildingBrokenOpen: null, // part of the same break-in the raid or predator already sounded
  animalBorn: null, // routine herd growth, can be frequent with several pastures
  animalHunted: null, // routine job outcome
  animalSlaughtered: null, // routine job outcome
  animalStarvedToDeath: null, // routine wildlife cycle
  animalKilledByPredator: null, // routine wildlife cycle
  wolfSpotted: 'notify',
  rockeaterExposedVein: 'notify',
  traderArrived: 'notify',
  traderLeft: null, // routine
  tradeSettled: 'trade',
  researchUnlocked: 'research',
  mealsCooked: null, // routine, frequent
  equipmentCrafted: null, // routine job outcome
  equipmentBroke: 'notify',
  colonistTreated: 'notify',
};

/** The same alert identity the pause-on-critical logic uses (game/loop.ts):
 *  the event, not the sentence, so a count ticking up is a new alarm and a
 *  re-render is not. */
function criticalIds(state: GameState): Set<string> {
  const ids = new Set<string>();
  for (const alert of collectAlerts(state)) {
    if (alert.level !== 'critical') continue;
    ids.add(`${alert.key}|${JSON.stringify(alert.params ?? {})}`);
  }
  return ids;
}

/** Blueprints and zone markers both go down with one click of the player's. */
function countPlaced(state: GameState): number {
  let n = 0;
  for (const b of Object.values(state.buildings)) {
    if (b.isBlueprint || b.type === 'storageZoneMarker') n++;
  }
  return n;
}

/** Finished structures; zone markers are excluded because placing one *is*
 *  finishing it, and it already got the placement click. */
function countBuilt(state: GameState): number {
  let n = 0;
  for (const b of Object.values(state.buildings)) {
    if (!b.isBlueprint && b.type !== 'storageZoneMarker') n++;
  }
  return n;
}

/**
 * How far along all of today's construction is, summed. `build` fires when
 * this total goes *up*, not on the raw number, and not per-building - a
 * dozen colonists hammering away at once is still one sum, so it is still
 * one sound at most per ambient interval (5.3 of the issue: "複数人が同時に
 * 建てていても音は増えない").
 */
function sumBuildProgress(state: GameState): number {
  let total = 0;
  for (const b of Object.values(state.buildings)) {
    if (b.isBlueprint) total += b.buildProgress;
  }
  return total;
}

/** Whether any *wild* creature exists right now - not whether one is on
 *  screen, which the director cannot see (5.3 of the issue: the renderer
 *  knows what is in frame, this module does not). */
function hasWildAnimals(state: GameState): boolean {
  for (const id in state.animals) {
    if (!state.animals[id].tame) return true;
  }
  return false;
}

/** Entries in `next` that were not in `prev`, by identity - addLog appends
 *  fresh objects and never rewrites old ones, so reference equality is exact. */
function newLogEntries(prev: readonly LogEntry[], next: readonly LogEntry[]): LogEntry[] {
  const seen = new Set<LogEntry>(prev);
  return next.filter((entry) => !seen.has(entry));
}

export class SfxDirector {
  private prev: GameState | null = null;
  private prevCritical: Set<string> = new Set();
  private lastFired: Partial<Record<SfxName, number>> = {};

  /**
   * Look at the state once and name the sounds to play now. The first look is
   * always silent - it is the baseline, not an event. `nowMs` is wall time
   * (`performance.now()`), because the minimum interval is about the player's
   * ears, not the simulation's clock.
   */
  update(state: GameState, nowMs: number): SfxName[] {
    const prev = this.prev;
    const prevCritical = this.prevCritical;
    this.prev = state;
    this.prevCritical = criticalIds(state);
    if (prev === null || state === prev) return [];
    if (Math.abs(state.tick - prev.tick) > CONTINUITY_TICKS) return [];

    const wanted: SfxName[] = [];
    if (countPlaced(state) > countPlaced(prev)) wanted.push('place');
    if (countBuilt(state) > countBuilt(prev)) wanted.push('complete');
    if (sumBuildProgress(state) > sumBuildProgress(prev)) wanted.push('build');
    for (const id of this.prevCritical) {
      if (!prevCritical.has(id)) {
        wanted.push('alert');
        break;
      }
    }
    for (const entry of newLogEntries(prev.log, state.log)) {
      const name = LOG_SFX[entry.key];
      if (name && !wanted.includes(name)) wanted.push(name);
    }
    // animal is the one sound not driven by a diff (see hasWildAnimals doc):
    // gated on a wild population existing, the game actually running, and its
    // own long cooldown rather than the ambient tier's shared one
    if (state.speed !== 0 && hasWildAnimals(state)) wanted.push('animal');

    return wanted.filter((name) => {
      const last = this.lastFired[name];
      const minInterval = minIntervalFor(name);
      if (last !== undefined && nowMs - last < minInterval) return false;
      this.lastFired[name] = nowMs;
      return true;
    });
  }
}
