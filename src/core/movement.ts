// Movement built on the cached paths of section 7. Nothing here recomputes a
// path except `setDestination`, which is called exactly when a colonist gets a
// new goal (job reserved, or a need sends them to food/bed).
import { TICKS_PER_STEP } from './constants';
import { clearColonistPath, indexColonistPath, isReachable } from './derived';
import type { SimContext } from './derived';
import { findPath } from './pathfinding';
import { manhattan, tileIdOf, updateColonist } from './state';
import type { ColonistId, GameState, TileId, Vector2 } from './types';

export type MoveResult = 'arrived' | 'moving' | 'blocked';

/**
 * Close in on a *moving* target (docs/design-animals.md 3).
 *
 * `advanceTowards` recomputes a path whenever the destination tile changes,
 * which for a wandering animal would mean an A* run every single step. So this
 * takes a greedy step towards the target instead, and only falls back to A*
 * when the direct route is blocked - that is the case where a real path is
 * actually worth computing.
 */
export function chase(
  state: GameState,
  ctx: SimContext,
  colonistId: ColonistId,
  target: Vector2,
  withinRange: number,
): MoveResult {
  const colonist = state.colonists[colonistId];
  if (manhattan(colonist.position, target) <= withinRange) return 'arrived';
  if (!isReachable(ctx, colonist.position, target, true)) return 'blocked';
  if (state.tick % TICKS_PER_STEP !== 0) return 'moving';

  const dx = Math.sign(target.x - colonist.position.x);
  const dy = Math.sign(target.y - colonist.position.y);
  const options =
    Math.abs(target.x - colonist.position.x) >= Math.abs(target.y - colonist.position.y)
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
    const nx = colonist.position.x + option.x;
    const ny = colonist.position.y + option.y;
    if (!state.tiles[tileIdOf(nx, ny)]?.walkable) continue;
    updateColonist(state, colonistId, {
      position: { x: nx, y: ny },
      path: null,
      pathTargetTileId: null,
    });
    clearColonistPath(ctx, colonistId);
    return manhattan({ x: nx, y: ny }, target) <= withinRange ? 'arrived' : 'moving';
  }

  // direct route blocked (a wall, a rock face): pay for one real path
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
  if (state.tick % TICKS_PER_STEP !== 0) return 'moving';

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
