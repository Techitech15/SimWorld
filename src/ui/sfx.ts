// Which sound to make, decided from state differences alone (11章 フェーズ13
// 段階C, docs/design-phase13-presentation.md 5章).
//
// The simulation does not know sound exists. This module watches two
// consecutive looks at `GameState` and names the sounds the difference has
// earned: a blueprint that was not there is a click, a critical alert that was
// not there is an alarm, a raid line new in the log is a horn. Deciding from
// differences is what makes the acceptance conditions testable headless, and it
// is also what keeps loading a save quiet - a state that *jumps* is a load, not
// an event (see CONTINUITY_TICKS).
//
// The actual noise lives in soundPlayer.ts; this file must stay importable in
// node with no AudioContext anywhere near it.
import { collectAlerts } from '../core/alerts';
import type { GameState, LogEntry, LogKey } from '../core/types';

export type SfxName = 'place' | 'complete' | 'alert' | 'raidHorn' | 'research' | 'trade';

/** The same sound never twice inside this window - at 10x a busy colony would
 *  otherwise turn the click into a rattle (5.3 の間引き, 見積もり500ms). */
export const SFX_MIN_INTERVAL_MS = 500;

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
  /** 0..1, scaled by the player's volume before it reaches the speaker */
  volume: number;
}

/** 5.3 の表そのまま: 操作への応答とアラート級の出来事だけ。BGM は無い。 */
export const SFX: Record<SfxName, readonly ToneSpec[]> = {
  // a dry click for putting something down: one thin square, gone in 40ms
  place: [{ wave: 'square', from: 880, at: 0, duration: 0.04, volume: 0.35 }],
  // two rising notes (C5 -> G5) for a finished building
  complete: [
    { wave: 'square', from: 523.25, at: 0, duration: 0.06, volume: 0.4 },
    { wave: 'square', from: 783.99, at: 0.07, duration: 0.1, volume: 0.4 },
  ],
  // two low notes falling (A3 -> F3): trouble, without being a siren
  alert: [
    { wave: 'square', from: 220, at: 0, duration: 0.12, volume: 0.5 },
    { wave: 'square', from: 174.61, at: 0.15, duration: 0.18, volume: 0.5 },
  ],
  // the horn: one low saw sliding down a tone, longer than everything else
  raidHorn: [{ wave: 'sawtooth', from: 110, to: 92.5, at: 0, duration: 0.35, volume: 0.55 }],
  // three rising notes (C5 -> E5 -> G5): the long project paying off
  research: [
    { wave: 'square', from: 523.25, at: 0, duration: 0.07, volume: 0.4 },
    { wave: 'square', from: 659.25, at: 0.08, duration: 0.07, volume: 0.4 },
    { wave: 'square', from: 783.99, at: 0.16, duration: 0.12, volume: 0.4 },
  ],
  // a coin: two very short high squares, the second higher (B5 -> E6)
  trade: [
    { wave: 'square', from: 987.77, at: 0, duration: 0.035, volume: 0.4 },
    { wave: 'square', from: 1318.51, at: 0.04, duration: 0.09, volume: 0.4 },
  ],
};

/** Log lines that are loud enough to hear (5.3): アラート級の出来事のみ。 */
const LOG_SFX: Partial<Record<LogKey, SfxName>> = {
  incidentRaid: 'raidHorn',
  researchUnlocked: 'research',
  tradeSettled: 'trade',
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

    return wanted.filter((name) => {
      const last = this.lastFired[name];
      if (last !== undefined && nowMs - last < SFX_MIN_INTERVAL_MS) return false;
      this.lastFired[name] = nowMs;
      return true;
    });
  }
}
