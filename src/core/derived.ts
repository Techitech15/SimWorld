// Derived, non-saved caches (sections 7 and 8).
//
// PathIndex answers "which colonists currently route through this tile?" so a
// terrain change invalidates O(affected colonists) paths instead of O(all).
// RegionIndex labels connected walkable components so the candidate filter can
// reject unreachable jobs in O(1) instead of running A* per candidate.
import { MAP_HEIGHT, MAP_WIDTH } from './constants';
import { EMPTY_NETWORKS } from './mana';
import type { ManaNetworks } from './mana';
import { tileIdOf } from './state';
import type { ColonistId, GameState, TileId } from './types';

export interface SimContext {
  /** tileId -> colonists whose cached path crosses that tile */
  pathIndex: Record<TileId, ColonistId[]>;
  /** flat grid of connected-walkable-region labels, -1 when unwalkable */
  regions: Int32Array;
  regionsDirty: boolean;
  /**
   * A* calls the herd may still make this tick. Reset at the start of every
   * animal phase so a large herd can never crowd out colonist pathfinding
   * (docs/design-phase2.5-animals.md 7).
   */
  animalPathBudget: number;
  /**
   * Grass tiles that have been grazed below full. Regrowing only these keeps
   * the per-tick cost proportional to how much grazing actually happened,
   * instead of sweeping all 3,600 tiles every tick.
   */
  forageDepleted: Set<TileId>;
  /**
   * The mana grids (src/core/mana.ts). Derived exactly like the region labels
   * and for the same reason: it is a connected-component labelling that only
   * changes when a building appears or disappears, it must never be saved, and
   * a stored copy could disagree with the buildings it claims to connect.
   */
  networks: ManaNetworks;
  networksDirty: boolean;
  /**
   * The state the networks were worked out from. A dirty flag alone is only as
   * good as the last person to remember to set one, and forgetting is silent -
   * a lamp that is on the map but not on any grid. Since every tick produces a
   * fresh state object, comparing against it makes a missed invalidation cost
   * one tick instead of lasting until something else happens to set the flag.
   */
  networksFrom: GameState | null;
}

export function createSimContext(state: GameState): SimContext {
  const ctx: SimContext = {
    pathIndex: {},
    regions: new Int32Array(MAP_WIDTH * MAP_HEIGHT).fill(-1),
    regionsDirty: true,
    networks: EMPTY_NETWORKS,
    networksDirty: true,
    networksFrom: null,
    animalPathBudget: 0,
    forageDepleted: new Set(),
  };
  rebuildPathIndex(ctx, state);
  rebuildRegions(ctx, state);
  rebuildForageIndex(ctx, state);
  return ctx;
}

/** Derived like the PathIndex: rebuilt after a load, never saved. */
export function rebuildForageIndex(ctx: SimContext, state: GameState): void {
  ctx.forageDepleted = new Set();
  for (const tileId in state.tiles) {
    const tile = state.tiles[tileId];
    if (tile.terrain === 'grass' && tile.forage < 1) ctx.forageDepleted.add(tileId);
  }
}

/** Section 8: after a load the PathIndex is rebuilt from the saved paths. */
export function rebuildPathIndex(ctx: SimContext, state: GameState): void {
  ctx.pathIndex = {};
  for (const id in state.colonists) {
    const path = state.colonists[id].path;
    if (!path) continue;
    for (const step of path) registerPathTile(ctx, tileIdOf(step.x, step.y), id);
  }
}

function registerPathTile(ctx: SimContext, tileId: TileId, colonistId: ColonistId): void {
  const list = ctx.pathIndex[tileId];
  if (!list) ctx.pathIndex[tileId] = [colonistId];
  else if (!list.includes(colonistId)) list.push(colonistId);
}

export function indexColonistPath(ctx: SimContext, state: GameState, colonistId: ColonistId): void {
  clearColonistPath(ctx, colonistId);
  const path = state.colonists[colonistId]?.path;
  if (!path) return;
  for (const step of path) registerPathTile(ctx, tileIdOf(step.x, step.y), colonistId);
}

export function clearColonistPath(ctx: SimContext, colonistId: ColonistId): void {
  for (const tileId in ctx.pathIndex) {
    const list = ctx.pathIndex[tileId];
    const at = list.indexOf(colonistId);
    if (at !== -1) {
      list.splice(at, 1);
      if (list.length === 0) delete ctx.pathIndex[tileId];
    }
  }
}

/**
 * Terrain changed on `tileId`: drop the cached path of exactly the colonists
 * routed through it (section 7 - the invalidation radius is the tile itself, not
 * its neighbours) and mark the region labels stale.
 */
export function invalidateTile(ctx: SimContext, state: GameState, tileId: TileId): void {
  ctx.regionsDirty = true;
  const affected = ctx.pathIndex[tileId];
  if (!affected || affected.length === 0) return;
  for (const colonistId of [...affected]) {
    const colonist = state.colonists[colonistId];
    if (!colonist) continue;
    state.colonists[colonistId] = {
      ...colonist,
      path: null,
      pathTargetTileId: null,
    };
    clearColonistPath(ctx, colonistId);
  }
}

export function rebuildRegions(ctx: SimContext, state: GameState): void {
  const regions = ctx.regions;
  regions.fill(-1);
  let label = 0;
  const queue = new Int32Array(MAP_WIDTH * MAP_HEIGHT);
  for (let start = 0; start < regions.length; start++) {
    if (regions[start] !== -1) continue;
    const sx = start % MAP_WIDTH;
    const sy = (start / MAP_WIDTH) | 0;
    if (!state.tiles[tileIdOf(sx, sy)].walkable) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    regions[start] = label;
    while (head < tail) {
      const idx = queue[head++];
      const x = idx % MAP_WIDTH;
      const y = (idx / MAP_WIDTH) | 0;
      const neighbours = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ];
      for (const [nx, ny] of neighbours) {
        if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
        const nIdx = ny * MAP_WIDTH + nx;
        if (regions[nIdx] !== -1) continue;
        if (!state.tiles[tileIdOf(nx, ny)].walkable) continue;
        regions[nIdx] = label;
        queue[tail++] = nIdx;
      }
    }
    label++;
  }
  ctx.regionsDirty = false;
}

export function regionAt(ctx: SimContext, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return -1;
  return ctx.regions[y * MAP_WIDTH + x];
}

/**
 * Can `from` reach the tile (or, with `adjacent`, any tile next to it)?
 * O(1) lookup against the region labels.
 */
export function isReachable(
  ctx: SimContext,
  from: { x: number; y: number },
  goal: { x: number; y: number },
  adjacent: boolean,
): boolean {
  const fromRegion = regionAt(ctx, from.x, from.y);
  if (fromRegion === -1) return false;
  if (!adjacent) return regionAt(ctx, goal.x, goal.y) === fromRegion;
  if (regionAt(ctx, goal.x, goal.y) === fromRegion) return true;
  return (
    regionAt(ctx, goal.x + 1, goal.y) === fromRegion ||
    regionAt(ctx, goal.x - 1, goal.y) === fromRegion ||
    regionAt(ctx, goal.x, goal.y + 1) === fromRegion ||
    regionAt(ctx, goal.x, goal.y - 1) === fromRegion
  );
}
