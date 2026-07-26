// Movement built on the cached paths of section 7. Nothing here recomputes a
// path except `setDestination`, which is called exactly when a colonist gets a
// new goal (job reserved, or a need sends them to food/bed).
import { TICKS_PER_STEP } from './constants';
import { clearColonistPath, indexColonistPath, isReachable } from './derived';
import type { SimContext } from './derived';
import { findPath } from './pathfinding';
import { tileIdOf, updateColonist } from './state';
import type { ColonistId, GameState, TileId, Vector2 } from './types';

export type MoveResult = 'arrived' | 'moving' | 'blocked';

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
