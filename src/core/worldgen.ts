// Map generation: one 60x60 map with grass / forest / stone (section 9).
import {
  BUILDING_HP,
  COLONIST_COLORS,
  COLONIST_NAMES,
  MAP_HEIGHT,
  MAP_WIDTH,
  STACK_MAX,
} from './constants';
import { valueNoise2D } from './rng';
import { createEmptyState, nextId, own, tileIdOf, updateTile } from './state';
import { JOB_TYPES } from './types';
import type {
  Building,
  BuildingType,
  Colonist,
  GameState,
  Item,
  JobType,
  ResourceType,
  Tile,
  Zone,
} from './types';

export interface WorldOptions {
  seed?: number;
  /** Starting stock dropped into the storage zone. */
  startingResources?: Partial<Record<ResourceType, number>>;
}

function makeTile(x: number, y: number, terrain: Tile['terrain']): Tile {
  return {
    id: tileIdOf(x, y),
    x,
    y,
    terrain,
    walkable: terrain !== 'stone',
    buildingId: null,
    itemIds: [],
    designation: null,
  };
}

function defaultPriorities(): Record<JobType, number> {
  const table = {} as Record<JobType, number>;
  for (const t of JOB_TYPES) table[t] = t === 'haul' ? 3 : 2;
  return table;
}

export function addBuilding(
  state: GameState,
  type: BuildingType,
  tileId: string,
  options: {
    isBlueprint?: boolean;
    requiredResources?: Building['requiredResources'];
  } = {},
): Building {
  const id = nextId(state, 'b');
  const isBlueprint = options.isBlueprint ?? false;
  const building: Building = {
    id,
    type,
    tileId,
    isBlueprint,
    hpCurrent: isBlueprint ? 1 : BUILDING_HP[type],
    hpMax: BUILDING_HP[type],
    requiredResources: options.requiredResources ?? [],
    buildProgress: 0,
    growth: 0,
    sown: false,
  };
  own(state, 'buildings');
  state.buildings[id] = building;
  updateTile(state, tileId, { buildingId: id });
  return building;
}

export function addItem(
  state: GameState,
  type: ResourceType,
  quantity: number,
  x: number,
  y: number,
): Item {
  const tile = state.tiles[tileIdOf(x, y)];
  own(state, 'items');
  // merge into an existing stack of the same type on this tile when possible
  for (const existingId of tile.itemIds) {
    const existing = state.items[existingId];
    if (existing.type === type && existing.quantity + quantity <= STACK_MAX) {
      const merged = { ...existing, quantity: existing.quantity + quantity };
      state.items[existingId] = merged;
      return merged;
    }
  }
  const id = nextId(state, 'i');
  const item: Item = {
    id,
    type,
    quantity,
    position: { x, y },
    reservedByJobId: null,
  };
  state.items[id] = item;
  updateTile(state, tile.id, { itemIds: [...tile.itemIds, id] });
  return item;
}

/**
 * Builds the starting colony: a storage zone, a few farm plots, three beds and
 * three colonists in the middle of a clearing.
 */
export function generateWorld(options: WorldOptions = {}): GameState {
  const seed = options.seed ?? 20260726;
  const state = createEmptyState();
  const forestNoise = valueNoise2D(seed);
  const stoneNoise = valueNoise2D(seed + 977);

  const cx = Math.floor(MAP_WIDTH / 2);
  const cy = Math.floor(MAP_HEIGHT / 2);

  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const f = forestNoise(x, y, 9);
      const s = stoneNoise(x, y, 7);
      // keep a clearing around the starting camp so the colony has room
      const distToCamp = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      let terrain: Tile['terrain'] = 'grass';
      if (distToCamp > 6) {
        if (s > 0.72) terrain = 'stone';
        else if (f > 0.58) terrain = 'forest';
      }
      const tile = makeTile(x, y, terrain);
      state.tiles[tile.id] = tile;
    }
  }

  // storage zone: 5x4 patch just south of the camp centre
  const storageTiles: string[] = [];
  for (let y = cy + 1; y < cy + 5; y++) {
    for (let x = cx - 2; x < cx + 3; x++) storageTiles.push(tileIdOf(x, y));
  }
  const zone: Zone = { id: 'z1', type: 'storage', tileIds: storageTiles };
  state.zones[zone.id] = zone;
  state.nextIds = { ...state.nextIds, z: 1 };
  for (const tileId of storageTiles) addBuilding(state, 'storageZoneMarker', tileId);

  // farm plots: two rows north of the camp. Enough to feed three colonists with
  // a surplus, but not so many that farming monopolises the whole work queue.
  for (let y = cy - 4; y < cy - 2; y++) {
    for (let x = cx - 3; x < cx + 4; x++) addBuilding(state, 'farmPlot', tileIdOf(x, y));
  }

  // beds
  for (let i = 0; i < 3; i++) addBuilding(state, 'bed', tileIdOf(cx - 4 + i * 2, cy));

  // starting stock, dropped inside the storage zone
  const stock: Partial<Record<ResourceType, number>> = {
    food: 120,
    wood: 60,
    stone: 0,
    ...options.startingResources,
  };
  let slot = 0;
  for (const type of ['food', 'wood', 'stone'] as ResourceType[]) {
    let remaining = stock[type] ?? 0;
    while (remaining > 0 && slot < storageTiles.length) {
      const amount = Math.min(STACK_MAX, remaining);
      const pos = storageTiles[slot++];
      const comma = pos.indexOf(',');
      addItem(state, type, amount, Number(pos.slice(0, comma)), Number(pos.slice(comma + 1)));
      remaining -= amount;
    }
  }

  // colonists
  for (let i = 0; i < 3; i++) {
    const id = nextId(state, 'c');
    const colonist: Colonist = {
      id,
      name: COLONIST_NAMES[i] ?? `Colonist ${i + 1}`,
      color: COLONIST_COLORS[i] ?? 0xffffff,
      position: { x: cx - 1 + i, y: cy + 6 },
      path: null,
      pathTargetTileId: null,
      needs: { hunger: 20 + i * 5, sleep: 10 + i * 5 },
      currentJobId: null,
      carrying: null,
      activity: { kind: 'none' },
      workPriorities: defaultPriorities(),
    };
    state.colonists[id] = colonist;
  }

  return state;
}
