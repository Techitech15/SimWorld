// Storage zone queries shared by the haul job and the resource panel.
import { STACK_MAX } from './constants';
import { isReserved } from './jobs/reservations';
import { manhattan, tileIdOf } from './state';
import type { GameState, Item, ResourceType, TileId, Vector2 } from './types';

export function storageTileIds(state: GameState): TileId[] {
  const ids: TileId[] = [];
  for (const zoneId in state.zones) ids.push(...state.zones[zoneId].tileIds);
  return ids;
}

export function isStorageTile(state: GameState, tileId: TileId): boolean {
  for (const zoneId in state.zones) {
    if (state.zones[zoneId].tileIds.includes(tileId)) return true;
  }
  return false;
}

export function itemsOnTile(state: GameState, tileId: TileId): Item[] {
  const tile = state.tiles[tileId];
  if (!tile) return [];
  return tile.itemIds.map((id) => state.items[id]).filter(Boolean);
}

/** Free capacity on a storage tile for a given resource type. */
export function freeCapacity(state: GameState, tileId: TileId, type: ResourceType): number {
  const items = itemsOnTile(state, tileId);
  if (items.length === 0) return STACK_MAX;
  const same = items.find((i) => i.type === type);
  if (!same) return 0; // one stack type per tile keeps the zone readable
  return Math.max(0, STACK_MAX - same.quantity);
}

/**
 * Nearest storage tile with room, skipping tiles another colonist has already
 * reserved as a drop-off (section 6.3: the destination is reserved too).
 */
export function findStorageDestination(
  state: GameState,
  type: ResourceType,
  quantity: number,
  from: Vector2,
): TileId | null {
  let best: TileId | null = null;
  let bestDistance = Infinity;
  for (const tileId of storageTileIds(state)) {
    if (isReserved(state, tileId)) continue;
    if (freeCapacity(state, tileId, type) < Math.min(quantity, 1)) continue;
    const tile = state.tiles[tileId];
    const distance = manhattan(from, { x: tile.x, y: tile.y });
    if (distance < bestDistance) {
      bestDistance = distance;
      best = tileId;
    }
  }
  return best;
}

/** Total of a resource anywhere on the map (used by the resource panel). */
export function countResource(state: GameState, type: ResourceType): number {
  let total = 0;
  for (const id in state.items) {
    if (state.items[id].type === type) total += state.items[id].quantity;
  }
  for (const id in state.colonists) {
    const carried = state.colonists[id].carrying;
    if (carried && carried.type === type) total += carried.quantity;
  }
  return total;
}

/** Stored-in-a-zone total, which is what the haul chain actually accumulates. */
export function countStoredResource(state: GameState, type: ResourceType): number {
  let total = 0;
  for (const tileId of storageTileIds(state)) {
    for (const item of itemsOnTile(state, tileId)) {
      if (item.type === type) total += item.quantity;
    }
  }
  return total;
}

/** Nearest unreserved item of a type, preferring stacks already in storage. */
export function findNearestItem(
  state: GameState,
  type: ResourceType,
  from: Vector2,
  options: { preferStorage?: boolean; minQuantity?: number } = {},
): Item | null {
  const minQuantity = options.minQuantity ?? 1;
  let best: Item | null = null;
  let bestScore = Infinity;
  for (const id in state.items) {
    const item = state.items[id];
    if (item.type !== type || item.quantity < minQuantity) continue;
    if (isReserved(state, item.id)) continue;
    const tileId = tileIdOf(item.position.x, item.position.y);
    const stored = isStorageTile(state, tileId);
    const distance = manhattan(from, item.position);
    const score = options.preferStorage && !stored ? distance + 1000 : distance;
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}
