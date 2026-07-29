// Player actions: the second (and only other) write path into GameState
// besides the simulation tick (section 3).
//
// Each function takes a state, returns the next state, and never runs simulation
// logic itself - a placed blueprint simply exists, and the JobGenerator picks it
// up on the next tick.
import { BUILDING_COSTS, BUILDING_HP, SPECIES } from './constants';
import type { SimContext } from './derived';
import {
  addLog,
  beginTick,
  nextId,
  own,
  tileIdOf,
  updateAnimal,
  updateBuilding,
  updateColonist,
  updateTile,
} from './state';
import type {
  AnimalDesignation,
  BuildingType,
  ColonistId,
  Designation,
  GameState,
  JobType,
  TileId,
  Vector2,
  Zone,
} from './types';
import { releaseByJob, releaseEntity } from './jobs/reservations';

/** Shallow-copy the state so store subscribers see a new object. */
function edit(state: GameState): GameState {
  return beginTick(state);
}

export function setSpeed(state: GameState, speed: GameState['speed']): GameState {
  if (state.speed === speed) return state;
  return { ...state, speed };
}

export function setJobPriority(
  state: GameState,
  colonistId: ColonistId,
  jobType: JobType,
  priority: number,
): GameState {
  const next = edit(state);
  const colonist = next.colonists[colonistId];
  if (!colonist) return state;
  updateColonist(next, colonistId, {
    workPriorities: {
      ...colonist.workPriorities,
      [jobType]: Math.max(0, Math.min(3, priority)),
    },
  });
  return next;
}

/** Mark a tile for chopping or mining; null clears the designation. */
export function setDesignation(
  state: GameState,
  tileIds: TileId[],
  designation: Designation | null,
): GameState {
  const next = edit(state);
  for (const tileId of tileIds) {
    const tile = next.tiles[tileId];
    if (!tile) continue;
    if (designation === 'chop' && tile.terrain !== 'forest') continue;
    if (designation === 'mine' && tile.terrain !== 'stone') continue;
    if (tile.designation === designation) continue;
    updateTile(next, tileId, { designation });
    if (designation !== null) clearFailedJobsForTile(next, tileId);
  }
  return next;
}

/** A re-designated tile deserves a fresh attempt even if it failed before. */
function clearFailedJobsForTile(state: GameState, tileId: TileId): void {
  for (const id in state.jobs) {
    const job = state.jobs[id];
    if (job.state === 'failed' && job.targetTileId === tileId) {
      const { [id]: _removed, ...rest } = state.jobs;
      state.jobs = rest;
    }
  }
}

/**
 * Place a building blueprint. Materials are hauled in by colonists, then a build
 * job finishes it (section 10, week 6).
 */
export function placeBuildingBlueprint(
  state: GameState,
  type: BuildingType,
  tileIds: TileId[],
): GameState {
  const next = edit(state);
  for (const tileId of tileIds) {
    const tile = next.tiles[tileId];
    if (!tile || tile.buildingId) continue;
    if (tile.terrain === 'stone') continue; // mine it out first
    const id = nextId(next, 'b');
    own(next, 'buildings');
    next.buildings[id] = {
      id,
      type,
      tileId,
      isBlueprint: true,
      hpCurrent: 1,
      hpMax: BUILDING_HP[type],
      requiredResources: BUILDING_COSTS[type].map((r) => ({ ...r })),
      buildProgress: 0,
      growth: 0,
      sown: false,
    };
    updateTile(next, tileId, { buildingId: id, designation: null });
  }
  return next;
}

/** Cancel a blueprint (finished buildings are not removable in the MVP). */
export function cancelBlueprint(state: GameState, tileIds: TileId[]): GameState {
  const next = edit(state);
  for (const tileId of tileIds) {
    const tile = next.tiles[tileId];
    if (!tile?.buildingId) continue;
    const building = next.buildings[tile.buildingId];
    if (!building?.isBlueprint) continue;
    for (const id in next.jobs) {
      const job = next.jobs[id];
      if (job.targetEntityId === building.id || job.destinationId === building.id) {
        releaseByJob(next, job.id);
        const colonistId = job.reservedBy;
        if (colonistId) updateColonist(next, colonistId, { currentJobId: null });
        const { [id]: _removed, ...rest } = next.jobs;
        next.jobs = rest;
      }
    }
    const { [building.id]: _dropped, ...rest } = next.buildings;
    next.buildings = rest; // whole-record replacement, no ownership needed
    updateTile(next, tileId, { buildingId: null });
  }
  return next;
}

/**
 * Erase zone tiles under the dragged area.
 *
 * Placing a zone is free and instant, so removing one has to be too - otherwise
 * a pasture dragged over the wrong field is permanent. A storage tile also owns
 * its marker building and may be some colonist's drop-off, both of which have to
 * go with it; a pasture that disappears entirely leaves its herd untethered
 * rather than pointing at a zone that no longer exists.
 */
export function removeZoneTiles(state: GameState, tileIds: TileId[]): GameState {
  const targets = new Set(tileIds);
  let next: GameState | null = null;
  for (const zoneId in state.zones) {
    const zone = state.zones[zoneId];
    const kept = zone.tileIds.filter((id) => !targets.has(id));
    if (kept.length === zone.tileIds.length) continue;
    next ??= edit(state);

    for (const tileId of zone.tileIds) {
      if (!targets.has(tileId)) continue;
      releaseEntity(next, tileId); // a haul may have this tile reserved as its destination
      const tile = next.tiles[tileId];
      const building = tile?.buildingId ? next.buildings[tile.buildingId] : undefined;
      if (building?.type === 'storageZoneMarker') {
        const { [building.id]: _dropped, ...rest } = next.buildings;
        next.buildings = rest;
        updateTile(next, tileId, { buildingId: null });
      }
    }

    if (kept.length > 0) {
      next.zones = { ...next.zones, [zoneId]: { ...zone, tileIds: kept } };
      continue;
    }
    const { [zoneId]: _removed, ...rest } = next.zones;
    next.zones = rest;
    for (const animalId in next.animals) {
      if (next.animals[animalId].pastureZoneId === zoneId) {
        updateAnimal(next, animalId, { pastureZoneId: null });
      }
    }
  }
  return next ?? state;
}

/** Storage zones cost nothing, so they are created finished (section 9). */
export function placeStorageZone(state: GameState, tileIds: TileId[]): GameState {
  return placeZone(state, 'storage', tileIds);
}

/**
 * Pasture zones bound where tamed animals graze, and their area caps the herd
 * (docs/design-animals.md 4). Like storage zones they are free and immediate.
 */
export function placePastureZone(state: GameState, tileIds: TileId[]): GameState {
  return placeZone(state, 'pasture', tileIds);
}

function placeZone(state: GameState, type: Zone['type'], tileIds: TileId[]): GameState {
  const next = edit(state);
  const existingId = Object.keys(next.zones).find((id) => next.zones[id].type === type);
  const zoneId = existingId ?? nextId(next, 'z');
  const zone: Zone = next.zones[zoneId] ?? { id: zoneId, type, tileIds: [] };
  const added: TileId[] = [];
  for (const tileId of tileIds) {
    const tile = next.tiles[tileId];
    if (!tile || zone.tileIds.includes(tileId)) continue;
    if (!tile.walkable) continue;
    // a pasture is just marked ground: grass has to stay grazeable, so unlike a
    // storage zone it does not drop a marker building on the tile
    if (type === 'storage') {
      if (tile.buildingId) continue;
      const id = nextId(next, 'b');
      own(next, 'buildings');
      next.buildings[id] = {
        id,
        type: 'storageZoneMarker',
        tileId,
        isBlueprint: false,
        hpCurrent: BUILDING_HP.storageZoneMarker,
        hpMax: BUILDING_HP.storageZoneMarker,
        requiredResources: [],
        buildProgress: 1,
        growth: 0,
        sown: false,
      };
      updateTile(next, tileId, { buildingId: id });
    } else if (tile.terrain !== 'grass') {
      continue; // nothing to graze on stone or under trees
    }
    added.push(tileId);
  }
  if (added.length === 0) return state;
  next.zones = {
    ...next.zones,
    [zoneId]: { ...zone, tileIds: [...zone.tileIds, ...added] },
  };
  return next;
}

/**
 * Mark animals inside a dragged rectangle for hunting, taming or slaughter.
 * The JobGenerator turns the designation into a job on the next tick, exactly
 * like a chop or mine designation does.
 */
export function designateAnimals(
  state: GameState,
  tileIds: TileId[],
  designation: AnimalDesignation | null,
): GameState {
  const next = edit(state);
  const targets = new Set(tileIds);
  let changed = false;
  for (const animalId in next.animals) {
    const animal = next.animals[animalId];
    if (!targets.has(tileIdOf(animal.position.x, animal.position.y))) continue;
    if (designation === 'tame' && (animal.tame || SPECIES[animal.species].tameChance <= 0)) continue;
    if (designation === 'slaughter' && !animal.tame) continue;
    if (designation === 'hunt' && animal.tame) continue;
    if (animal.designation === designation) continue;
    updateAnimal(next, animalId, { designation });
    changed = true;
  }
  return changed ? next : state;
}

/**
 * Direct move order (section 10, week 3). Drops whatever job the colonist held
 * so a player command always wins.
 */
export function orderMove(
  state: GameState,
  ctx: SimContext,
  colonistId: ColonistId,
  target: Vector2,
): GameState {
  const next = edit(state);
  const colonist = next.colonists[colonistId];
  if (!colonist) return state;
  if (colonist.currentJobId) {
    const job = next.jobs[colonist.currentJobId];
    if (job) {
      releaseByJob(next, job.id);
      next.jobs[job.id] = {
        ...job,
        state: 'pending',
        reservedBy: null,
        workProgress: 0,
        cooldownUntilTick: null,
      };
    }
  }
  updateColonist(next, colonistId, {
    currentJobId: null,
    activity: { kind: 'none' },
  });
  const tile = next.tiles[tileIdOf(target.x, target.y)];
  if (!tile?.walkable) return next;
  // the path itself is computed on the next tick by the movement phase
  updateColonist(next, colonistId, {
    path: null,
    pathTargetTileId: null,
    activity: { kind: 'moving', targetTileId: tile.id },
  });
  void ctx;
  addLog(next, `${colonist.name} ordered to ${tile.id}`);
  return next;
}

/** Toggle sowing on a farm plot: harvesting an unsown plot is a no-op. */
export function toggleFarmSowing(state: GameState, tileId: TileId): GameState {
  const next = edit(state);
  const tile = next.tiles[tileId];
  const building = tile?.buildingId ? next.buildings[tile.buildingId] : null;
  if (!building || building.type !== 'farmPlot') return state;
  updateBuilding(next, building.id, { sown: !building.sown, growth: 0 });
  return next;
}
