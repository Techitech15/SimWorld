// How fast a colonist walks, as multipliers over TICKS_PER_STEP
// (docs/design-phase7-time.md 2.3).
//
// Every condition is a multiplier over the one existing cadence constant, the
// same shape the traits took: no new mechanism, just existing numbers bent.
// The multipliers compose by multiplication and the total slowness is capped,
// because a carried, wounded walk through the woods that reads as standing
// still is worse than an unrealistic one.
import { COLONIST_MAX_HEALTH, TICKS_PER_STEP } from './constants';
import { tileIdOf, updateColonist } from './state';
import type { Colonist, ColonistId, GameState } from './types';

/** Carrying a stack: hauling distance starts to mean something. */
export const PACE_CARRYING = 1.15;
/** Walking through forest: terrain gets a personality. */
export const PACE_FOREST = 1.25;
/** At zero health, walking takes this much longer; scales linearly from 1.0. */
export const PACE_HURT_MAX = 1.4;
/** Running for your life is the one thing that makes you faster. */
export const PACE_FLEEING = 1 / 1.2;
/** The slowest a colonist can get, whatever combines. */
export const PACE_SLOW_CAP = 2.0;

/**
 * The combined pace multiplier for this colonist right now. 1 means the
 * pre-phase-7 cadence exactly; above 1 is slower, below 1 faster.
 */
export function paceMultiplierOf(state: GameState, colonist: Colonist): number {
  let multiplier = 1;
  if (colonist.carrying) multiplier *= PACE_CARRYING;
  const tile = state.tiles[tileIdOf(colonist.position.x, colonist.position.y)];
  if (tile?.terrain === 'forest') multiplier *= PACE_FOREST;
  multiplier *= 1 + (PACE_HURT_MAX - 1) * (1 - colonist.health / COLONIST_MAX_HEALTH);
  if (colonist.activity.kind === 'fleeing') multiplier *= PACE_FLEEING;
  return Math.min(multiplier, PACE_SLOW_CAP);
}

/**
 * The movement gate: called once per tick while a colonist is trying to walk,
 * returns true on the ticks that are actually a step.
 *
 * Replaces the old global `tick % TICKS_PER_STEP` parity with a per-colonist
 * counter (`stepProgress`, the one saved field this phase adds - absent reads
 * as 0, so no migration). With every multiplier at 1 the cadence is identical
 * to the old gate: one step per TICKS_PER_STEP ticks of walking.
 */
export function takeStep(state: GameState, colonistId: ColonistId): boolean {
  const colonist = state.colonists[colonistId];
  const pace = TICKS_PER_STEP * paceMultiplierOf(state, colonist);
  const progress = (colonist.stepProgress ?? 0) + 1;
  // the epsilon keeps a pace that is mathematically exactly N from needing
  // N+1 ticks through floating-point dust
  if (progress >= pace - 1e-9) {
    // carry the remainder: resetting to zero would round every fractional
    // pace up to whole ticks and a 1.15x load would read as 1.5x
    updateColonist(state, colonistId, { stepProgress: Math.max(0, progress - pace) });
    return true;
  }
  updateColonist(state, colonistId, { stepProgress: progress });
  return false;
}
