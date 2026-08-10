// GameState construction and copy-on-write helpers.
//
// Section 3 requires the simulation to hand back a *new* GameState each tick so
// React selectors and PixiJS can diff cheaply. Deep-cloning 3,600 tiles every
// tick would be wasteful, so `beginTick` shallow-copies the record containers
// (plus the handful of always-mutated colonist/job objects) and every mutation
// helper below replaces the individual entity object it touches.
import { MAP_HEIGHT, MAP_WIDTH } from './constants';
import type {
  Animal,
  AnimalId,
  Building,
  BuildingId,
  Colonist,
  ColonistId,
  GameState,
  Item,
  ItemId,
  Job,
  JobId,
  LogEntry,
  LogKey,
  LogParams,
  TerrainType,
  Tile,
  TileId,
  Vector2,
} from './types';

export function tileIdOf(x: number, y: number): TileId {
  return `${x},${y}`;
}

export function parseTileId(id: TileId): Vector2 {
  const comma = id.indexOf(',');
  return { x: Number(id.slice(0, comma)), y: Number(id.slice(comma + 1)) };
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT;
}

export function tileAt(state: GameState, x: number, y: number): Tile | undefined {
  return state.tiles[tileIdOf(x, y)];
}

export function manhattan(a: Vector2, b: Vector2): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function nextId(state: GameState, kind: string): string {
  const n = (state.nextIds[kind] ?? 0) + 1;
  state.nextIds = { ...state.nextIds, [kind]: n };
  return `${kind}${n}`;
}

export function createEmptyState(): GameState {
  return {
    tick: 0,
    speed: 1,
    tiles: {},
    colonists: {},
    buildings: {},
    items: {},
    jobs: {},
    zones: {},
    animals: {},
    raiders: {},
    reservations: {},
    forestCapacity: 0,
    worldSeed: 0,
    scenario: 'standard',
    nextIds: {},
    relationships: {},
    deaths: [],
    log: [],
  };
}

/**
 * Records this state object has already copied this tick. Copying all 3,600
 * tiles every tick costs more than the whole rest of the simulation, so the big
 * containers are copied on first write instead of unconditionally.
 */
type OwnableRecord = 'tiles' | 'items' | 'buildings' | 'zones' | 'reservations';
const ownedRecords = new WeakMap<GameState, Set<OwnableRecord>>();

/** Ensure `state` owns its own copy of a record before mutating it. */
export function own(state: GameState, key: OwnableRecord): void {
  let owned = ownedRecords.get(state);
  if (!owned) {
    owned = new Set();
    ownedRecords.set(state, owned);
  }
  if (owned.has(key)) return;
  owned.add(key);
  (state as unknown as Record<string, unknown>)[key] = { ...state[key] };
}

/** Shallow structural copy taken at the start of every tick. */
export function beginTick(state: GameState): GameState {
  const colonists: Record<ColonistId, Colonist> = {};
  for (const id in state.colonists) {
    const c = state.colonists[id];
    colonists[id] = {
      ...c,
      position: { ...c.position },
      needs: { ...c.needs },
      path: c.path ? c.path.map((p) => ({ ...p })) : null,
      activity: { ...c.activity },
      carrying: c.carrying ? { ...c.carrying } : null,
      workPriorities: { ...c.workPriorities },
      skills: { ...c.skills },
      traits: c.traits,
    };
  }
  const jobs: Record<JobId, Job> = {};
  for (const id in state.jobs) jobs[id] = { ...state.jobs[id] };
  const animals: Record<AnimalId, Animal> = {};
  for (const id in state.animals) {
    const a = state.animals[id];
    animals[id] = {
      ...a,
      position: { ...a.position },
      path: a.path ? a.path.map((p) => ({ ...p })) : null,
      activity: { ...a.activity },
    };
  }
  // colonists, jobs and animals are small and change constantly, so they are
  // copied up front; tiles/items/buildings/zones/reservations copy on first write
  const next: GameState = { ...state, colonists, jobs, animals, log: state.log };
  ownedRecords.set(next, new Set());
  return next;
}

export function updateTile(state: GameState, id: TileId, patch: Partial<Tile>): Tile {
  own(state, 'tiles');
  const updated = { ...state.tiles[id], ...patch };
  state.tiles[id] = updated;
  return updated;
}

export function updateColonist(
  state: GameState,
  id: ColonistId,
  patch: Partial<Colonist>,
): Colonist {
  const updated = { ...state.colonists[id], ...patch };
  state.colonists[id] = updated;
  return updated;
}

export function updateJob(state: GameState, id: JobId, patch: Partial<Job>): Job {
  const updated = { ...state.jobs[id], ...patch };
  state.jobs[id] = updated;
  return updated;
}

export function updateAnimal(state: GameState, id: AnimalId, patch: Partial<Animal>): Animal {
  const updated = { ...state.animals[id], ...patch };
  state.animals[id] = updated;
  return updated;
}

export function removeAnimal(state: GameState, id: AnimalId): void {
  if (!state.animals[id]) return;
  const { [id]: _removed, ...rest } = state.animals;
  state.animals = rest;
}

export function removeColonist(state: GameState, id: ColonistId): void {
  if (!state.colonists[id]) return;
  const { [id]: _removed, ...rest } = state.colonists;
  state.colonists = rest;
}

export function updateBuilding(
  state: GameState,
  id: BuildingId,
  patch: Partial<Building>,
): Building {
  own(state, 'buildings');
  const updated = { ...state.buildings[id], ...patch };
  state.buildings[id] = updated;
  return updated;
}

export function updateItem(state: GameState, id: ItemId, patch: Partial<Item>): Item {
  own(state, 'items');
  const updated = { ...state.items[id], ...patch };
  state.items[id] = updated;
  return updated;
}

export function addLog(
  state: GameState,
  key: LogKey,
  params?: LogParams,
  kind?: LogEntry['kind'],
): void {
  const entry: LogEntry = { tick: state.tick, key };
  if (params) entry.params = params;
  if (kind) entry.kind = kind;
  state.log = [...state.log.slice(-99), entry];
}

/** Remove an item entirely (from the map index and the item record). */
export function removeItem(state: GameState, itemId: ItemId): void {
  const item = state.items[itemId];
  if (!item) return;
  own(state, 'items');
  const tile = state.tiles[tileIdOf(item.position.x, item.position.y)];
  if (tile && tile.itemIds.includes(itemId)) {
    updateTile(state, tile.id, {
      itemIds: tile.itemIds.filter((id) => id !== itemId),
    });
  }
  const { [itemId]: _removed, ...rest } = state.items;
  state.items = rest;
}

/**
 * Rock faces: solid, unwalkable, and what the `mine` job removes. Mana crystal
 * is one of them (11章 フェーズ2) - having a single predicate is what stopped
 * the new terrain from being taught to the generator but not to the tool, or to
 * the tool but not to the validity check.
 */
export function isRock(terrain: TerrainType): boolean {
  return terrain === 'stone' || terrain === 'crystal';
}
