// Movement built on the cached paths of section 7. `setDestination` recomputes
// a path exactly when a colonist gets a new goal (job reserved, or a need
// sends them to food/bed); `chase` below also caches a path, but only for as
// long as it takes to get around an obstacle in the way of a moving target -
// and only when the caller opts into that (see `ChaseOptions.persistDetour`).
import { TICKS_PER_STEP } from './constants';
import { takeStep } from './pace';
import { clearColonistPath, indexColonistPath, isReachable } from './derived';
import type { SimContext } from './derived';
import { findPath } from './pathfinding';
import { manhattan, tileIdOf, updateColonist } from './state';
import type { ColonistId, GameState, TileId, Vector2 } from './types';

export type MoveResult = 'arrived' | 'moving' | 'blocked';

export interface ChaseOptions {
  /**
   * Commit to a computed detour and walk it to completion instead of
   * recomputing greedily every tick (issue #9). Defaults to true.
   *
   * This is what fixed hunting getting stuck forever on a wide obstacle (see
   * below), but it trades away responsiveness to a target that keeps moving
   * while the detour is being walked: raid combat (`raid.ts`) chases a raider
   * that itself takes a fresh step every tick via `chaseRaider`, so a detour
   * computed from its position several ticks ago can easily be stale by the
   * time it is finished, sending the defender toward where the raider *was*.
   * Measured (60x60, seed 8117, `YEAR` = 20 in-game days, `createHarness`):
   * with this defaulted on for raid combat too, that seed's colony was wiped
   * out (0 survivors) where the pre-issue-#9 behaviour left 2; a second seed
   * (8130) went from 1 raid death to 3. Raid combat passes `false` here to
   * keep its pre-#9 behaviour - re-aiming at the raider's live position every
   * tick - while hunting (the only other caller) keeps `true`.
   */
  persistDetour?: boolean;
}

/**
 * Close in on a *moving* target (docs/design-phase2.5-animals.md 3).
 *
 * `advanceTowards` recomputes a path whenever the destination tile changes,
 * which for a wandering animal would mean an A* run every single step. So this
 * takes a greedy step towards the target instead, and only falls back to A*
 * when the direct route is blocked - that is the case where a real path is
 * actually worth computing (and, with `persistDetour` on, worth finishing -
 * see `followCachedDetour`).
 */
export function chase(
  state: GameState,
  ctx: SimContext,
  colonistId: ColonistId,
  target: Vector2,
  withinRange: number,
  options: ChaseOptions = {},
): MoveResult {
  const persistDetour = options.persistDetour ?? true;
  const colonist = state.colonists[colonistId];
  if (manhattan(colonist.position, target) <= withinRange) {
    // drop any cached detour (below): close enough that it is not being
    // followed any more, and leaving it registered in ctx.pathIndex would
    // needlessly expose this colonist to invalidation on tiles it no longer
    // cares about.
    if (persistDetour && colonist.path) {
      updateColonist(state, colonistId, { path: null, pathTargetTileId: null });
      clearColonistPath(ctx, colonistId);
    }
    return 'arrived';
  }
  if (!isReachable(ctx, colonist.position, target, true)) return 'blocked';
  if (!takeStep(state, colonistId)) return 'moving';

  // A detour already under way (below) is followed to completion before the
  // greedy check gets another say (issue #9). Without this, a colonist stuck
  // against a wide obstacle - a rock face, a lake - would start a real-path
  // detour around it, take its first step, and then have the plain greedy
  // check immediately below claim the *very next* tick anyway: standing right
  // at the obstacle's face, one tile back towards it is still a tile that
  // reduces raw distance to a wandering target, so greedy happily takes it
  // and wipes the detour with `path: null`. That put the colonist right back
  // at the face, which planned a new detour, whose first step greedy again
  // undid next tick - a two-tile walk back and forth forever, never actually
  // getting around. Once a detour is committed to, only its own terrain
  // check (does the next cached tile remain walkable) can interrupt it.
  if (persistDetour && colonist.path && colonist.path.length > 0) {
    return followCachedDetour(state, ctx, colonistId, target, withinRange, colonist.path, colonist.pathTargetTileId);
  }

  const dx = Math.sign(target.x - colonist.position.x);
  const dy = Math.sign(target.y - colonist.position.y);

  if (!persistDetour) {
    // Pre-issue-#9 behaviour (raid combat): try the larger-gap axis, then the
    // other axis as a consolation step, and only fall back to a real path
    // when *both* are blocked. A raider is a moving point target re-aimed at
    // every tick by `chaseRaider`, so re-deciding the route every tick (and
    // throwing the real-path fallback away after one step, below) matters
    // more here than finishing a detour around an obstacle would.
    const steps =
      Math.abs(target.x - colonist.position.x) >= Math.abs(target.y - colonist.position.y)
        ? [
            { x: dx, y: 0 },
            { x: 0, y: dy },
          ]
        : [
            { x: 0, y: dy },
            { x: dx, y: 0 },
          ];

    for (const step of steps) {
      if (step.x === 0 && step.y === 0) continue;
      const nx = colonist.position.x + step.x;
      const ny = colonist.position.y + step.y;
      if (!state.tiles[tileIdOf(nx, ny)]?.walkable) continue;
      updateColonist(state, colonistId, {
        position: { x: nx, y: ny },
        path: null,
        pathTargetTileId: null,
      });
      clearColonistPath(ctx, colonistId);
      return manhattan({ x: nx, y: ny }, target) <= withinRange ? 'arrived' : 'moving';
    }

    // direct route blocked (a wall, a rock face): pay for one real path,
    // take a single step from it, and throw the rest away - the next tick
    // re-aims from the target's live position rather than finishing this plan.
    const path = findPath(state, colonist.position, target, { adjacent: true });
    if (!path || path.length === 0) return 'blocked';
    const next = path[0];
    updateColonist(state, colonistId, {
      position: { x: next.x, y: next.y },
      path: null,
      pathTargetTileId: null,
    });
    clearColonistPath(ctx, colonistId);
    return manhattan(next, target) <= withinRange ? 'arrived' : 'moving';
  }

  // Only the larger-gap axis gets a greedy try. A second-axis "consolation"
  // step used to also count as progress, but when the larger-gap direction
  // is blocked by something wider than one tile that consolation step never
  // leads around it - it only ever fired the real-path fallback below when
  // *both* axes were blocked, which a wide obstacle with one open face along
  // it never triggers. A blocked primary axis now goes straight to a real
  // path, the same as a route blocked on both axes always did.
  const primary =
    Math.abs(target.x - colonist.position.x) >= Math.abs(target.y - colonist.position.y)
      ? { x: dx, y: 0 }
      : { x: 0, y: dy };

  if (primary.x !== 0 || primary.y !== 0) {
    const nx = colonist.position.x + primary.x;
    const ny = colonist.position.y + primary.y;
    if (state.tiles[tileIdOf(nx, ny)]?.walkable) {
      updateColonist(state, colonistId, {
        position: { x: nx, y: ny },
        path: null,
        pathTargetTileId: null,
      });
      clearColonistPath(ctx, colonistId);
      return manhattan({ x: nx, y: ny }, target) <= withinRange ? 'arrived' : 'moving';
    }
  }

  // Direct route blocked: pay for a real path around it, and commit to it -
  // see `followCachedDetour` for why it is not recomputed every tick.
  const path = findPath(state, colonist.position, target, { adjacent: true });
  if (!path || path.length === 0) return 'blocked';
  return followCachedDetour(state, ctx, colonistId, target, withinRange, path, tileIdOf(target.x, target.y));
}

/**
 * Consume one tile of a real-path detour around an obstacle (see `chase`).
 *
 * The plan is walked to completion - re-validating only that its very next
 * tile is still walkable - rather than being recomputed from the target's
 * live position every tick. A wandering target's tile changes almost every
 * step, and recomputing that often let a fresh A* run flip which side of the
 * obstacle looked shorter from one tick to the next, undoing the previous
 * step (issue #9). The top-of-`chase` range check still runs every tick
 * against the target's live position, so arriving early - the target
 * wandered closer while the plan was still being walked - is never missed;
 * only *replanning* is deferred to when the current plan runs out.
 */
function followCachedDetour(
  state: GameState,
  ctx: SimContext,
  colonistId: ColonistId,
  target: Vector2,
  withinRange: number,
  path: Vector2[],
  plannedTargetTileId: TileId | null,
): MoveResult {
  const next = path[0];
  if (!state.tiles[tileIdOf(next.x, next.y)]?.walkable) {
    // terrain changed under the cached detour: drop it, replan next tick
    updateColonist(state, colonistId, { path: null, pathTargetTileId: null });
    clearColonistPath(ctx, colonistId);
    return 'moving';
  }

  const remaining = path.slice(1);
  updateColonist(state, colonistId, {
    position: { x: next.x, y: next.y },
    path: remaining.length > 0 ? remaining : null,
    pathTargetTileId: remaining.length > 0 ? plannedTargetTileId : null,
  });
  indexColonistPath(ctx, state, colonistId);
  return manhattan(next, target) <= withinRange ? 'arrived' : 'moving';
}

/** Assign a new destination, running A* once and caching the result. */
export function setDestination(
  state: GameState,
  ctx: SimContext,
  colonistId: ColonistId,
  target: Vector2,
  adjacent: boolean,
): boolean {
  const colonist = state.colonists[colonistId];
  const path = findPath(state, colonist.position, target, { adjacent });
  if (path === null) {
    updateColonist(state, colonistId, { path: null, pathTargetTileId: null });
    clearColonistPath(ctx, colonistId);
    return false;
  }
  updateColonist(state, colonistId, {
    path,
    pathTargetTileId: tileIdOf(target.x, target.y),
  });
  indexColonistPath(ctx, state, colonistId);
  return true;
}

export function atDestination(
  state: GameState,
  colonistId: ColonistId,
  target: Vector2,
  adjacent: boolean,
): boolean {
  const { position } = state.colonists[colonistId];
  const distance = Math.abs(position.x - target.x) + Math.abs(position.y - target.y);
  return adjacent ? distance <= 1 : distance === 0;
}

/**
 * Walk one step along the cached path. Recomputes the path only when it is
 * missing (invalidated by a terrain change) or the next step became unwalkable.
 */
export function advanceTowards(
  state: GameState,
  ctx: SimContext,
  colonistId: ColonistId,
  target: Vector2,
  adjacent: boolean,
): MoveResult {
  if (atDestination(state, colonistId, target, adjacent)) {
    const colonist = state.colonists[colonistId];
    if (colonist.path && colonist.path.length > 0) {
      updateColonist(state, colonistId, { path: null, pathTargetTileId: null });
      clearColonistPath(ctx, colonistId);
    }
    return 'arrived';
  }

  let colonist = state.colonists[colonistId];
  const targetTileId: TileId = tileIdOf(target.x, target.y);
  if (!colonist.path || colonist.pathTargetTileId !== targetTileId) {
    if (!isReachable(ctx, colonist.position, target, adjacent)) return 'blocked';
    if (!setDestination(state, ctx, colonistId, target, adjacent)) return 'blocked';
    colonist = state.colonists[colonistId];
  }

  const path = colonist.path;
  if (!path || path.length === 0) return 'arrived';
  if (!takeStep(state, colonistId)) return 'moving';

  const next = path[0];
  if (!state.tiles[tileIdOf(next.x, next.y)].walkable) {
    // terrain changed under us: drop the cache and retry next tick
    updateColonist(state, colonistId, { path: null, pathTargetTileId: null });
    clearColonistPath(ctx, colonistId);
    return 'moving';
  }

  const remaining = path.slice(1);
  updateColonist(state, colonistId, {
    position: { x: next.x, y: next.y },
    path: remaining.length > 0 ? remaining : null,
    pathTargetTileId: remaining.length > 0 ? targetTileId : null,
  });
  indexColonistPath(ctx, state, colonistId);
  return atDestination(state, colonistId, target, adjacent) ? 'arrived' : 'moving';
}

/**
 * A raider's step towards the colony.
 *
 * The same greedy step a colonist chase uses, without the reachability check:
 * a raider walled out is *supposed* to end up standing against the wall, so it
 * can start taking the wall apart. Refusing to move because there is no route
 * would leave them milling about at the map edge.
 */
export function chaseRaider(
  state: GameState,
  _ctx: SimContext,
  raiderId: string,
  target: Vector2,
): void {
  if (state.tick % TICKS_PER_STEP !== 0) return;
  const raider = state.raiders[raiderId];
  if (!raider) return;

  const dx = Math.sign(target.x - raider.position.x);
  const dy = Math.sign(target.y - raider.position.y);
  const options =
    Math.abs(target.x - raider.position.x) >= Math.abs(target.y - raider.position.y)
      ? [
          { x: dx, y: 0 },
          { x: 0, y: dy },
        ]
      : [
          { x: 0, y: dy },
          { x: dx, y: 0 },
        ];

  for (const option of options) {
    if (option.x === 0 && option.y === 0) continue;
    const nx = raider.position.x + option.x;
    const ny = raider.position.y + option.y;
    if (!state.tiles[tileIdOf(nx, ny)]?.walkable) continue;
    state.raiders = {
      ...state.raiders,
      [raiderId]: { ...raider, position: { x: nx, y: ny } },
    };
    return;
  }
}
