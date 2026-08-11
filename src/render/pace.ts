// Interpolation speed derived from the walking cadence
// (docs/design-phase7-time.md 2.2).
//
// The renderer has always interpolated; what it interpolated *at* was a fixed
// constant that matched no game speed but 3x. This derives the speed from the
// only three numbers that matter - how many ticks a step takes, how long a
// tick is, and how many ticks pass per real second - so a walk crosses each
// tile in exactly the time the simulation spends walking it, and the standing-
// still gap between steps disappears at every speed.
import { TICK_MS } from '../core/constants';

/**
 * Tiles per millisecond for an entity whose step takes `ticksPerStep` ticks,
 * at game speed `gameSpeed`, with the colonist's pace multiplier applied.
 * 0 while paused, so a paused game does not have sprites sliding through it.
 */
export function interpolationSpeed(
  ticksPerStep: number,
  gameSpeed: number,
  paceMultiplier = 1,
): number {
  if (gameSpeed <= 0) return 0;
  const msPerTile = (ticksPerStep * paceMultiplier * TICK_MS) / gameSpeed;
  if (msPerTile <= 0) return 0;
  return 1 / msPerTile;
}
