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

/**
 * A displayed position is more than this many tiles from its logical position
 * only when something teleported it there rather than walked it there - an
 * eviction (`evictFromTile`), a load into storage, or a save file loaded on
 * top of a view that still remembers where its id used to be. Gliding across
 * that gap at the walking interpolation speed would draw a multi-tile slide
 * with no footsteps behind it, which reads as more of a bug than the jump it
 * is standing in for. 3 is comfortably above the largest single-step distance
 * any species walks in one tick (always 1 tile), so a real step never trips it.
 */
export const TELEPORT_DISTANCE_TILES = 3;

/**
 * True when a displayed position should snap straight to its logical one
 * instead of gliding - shared by colonists, animals and raiders so the three
 * sprite kinds agree on what counts as "walked there" versus "moved there".
 */
export function isTeleport(dx: number, dy: number): boolean {
  return Math.abs(dx) > TELEPORT_DISTANCE_TILES || Math.abs(dy) > TELEPORT_DISTANCE_TILES;
}
