// Player actions: the second (and only other) write path into GameState
// besides the simulation tick (section 3).
//
// Each function takes a state, returns the next state, and never runs simulation
// logic itself - a placed blueprint simply exists, and the JobGenerator picks it
// up on the next tick.
import { BUILDING_COSTS, BUILDING_HP, RESOURCE_TYPES, SPECIES } from './constants';
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
import { JOB_TYPES } from './types';
import type {
  AnimalDesignation,
  BuildingId,
  BuildingType,
  ColonistId,
  Designation,
  GameState,
  JobType,
  ResourceType,
  TileId,
  Vector2,
  Zone,
  ZoneId,
} from './types';
import { releaseByJob, releaseEntity } from './jobs/reservations';
import { skillLevel } from './skills';

/** Shallow-copy the state so store subscribers see a new object. */
function edit(state: GameState): GameState {
  return beginTick(state);
}

export function setSpeed(state: GameState, speed: GameState['speed']): GameState {
  if (state.speed === speed) return state;
  return { ...state, speed };
}

/**
 * Set everybody's work table from what they are actually good at.
 *
 * Skills change how fast a colonist works and traits bend it further, and none
 * of that has ever decided *who* does the work: every colonist starts at the
 * same middling priority in every column and stays there unless the player
 * fills the table in by hand, one cell at a time. A colony a year old is idle
 * 57% of the time and its best woodcutter is as likely to be hauling as
 * felling.
 *
 * The rule is deliberately blunt: your two best columns become first call,
 * everything else you are willing to do stays where it was. It does not turn
 * anything off - a colony that stops hauling because nobody is good at hauling
 * would be a worse colony - and it never touches a column the player has
 * already disabled, because that was a decision and this is a suggestion.
 */
export function assignWorkBySkill(state: GameState): GameState {
  let next: GameState | null = null;
  for (const colonistId in state.colonists) {
    const colonist = state.colonists[colonistId];
    const ranked = JOB_TYPES.filter((jobType) => (colonist.workPriorities[jobType] ?? 0) > 0)
      .map((jobType) => ({ jobType, level: skillLevel(colonist, jobType) }))
      .sort((a, b) => b.level - a.level || (a.jobType < b.jobType ? -1 : 1));
    // somebody with no skills at all has no best two, and gets no opinion
    const best = ranked.filter((entry) => entry.level > 0).slice(0, 2);
    if (best.length === 0) continue;

    const workPriorities = { ...colonist.workPriorities };
    let changed = false;
    for (const { jobType } of best) {
      if (workPriorities[jobType] === 1) continue;
      workPriorities[jobType] = 1;
      changed = true;
    }
    if (!changed) continue;
    next ??= edit(state);
    updateColonist(next, colonistId, { workPriorities });
  }
  return next ?? state;
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
  const clamped = Math.max(0, Math.min(3, priority));
  if (colonist.workPriorities[jobType] === clamped) return state;
  updateColonist(next, colonistId, {
    workPriorities: {
      ...colonist.workPriorities,
      [jobType]: clamped,
    },
  });
  return next;
}

/** Mark a tile for chopping, mining or dismantling; null clears the designation. */
export function setDesignation(
  state: GameState,
  tileIds: TileId[],
  designation: Designation | null,
): GameState {
  const next = edit(state);
  let changed = false;
  for (const tileId of tileIds) {
    const tile = next.tiles[tileId];
    if (!tile) continue;
    if (designation === 'chop' && tile.terrain !== 'forest') continue;
    if (designation === 'mine' && tile.terrain !== 'stone') continue;
    if (designation === 'deconstruct' && !isDeconstructible(next, tile.buildingId)) continue;
    if (tile.designation === designation) continue;
    updateTile(next, tileId, { designation });
    if (designation !== null) clearFailedJobsForTile(next, tileId);
    changed = true;
  }
  // an action that changed nothing returns the state it was given: the UI can
  // then tell a refused drag from a successful one, and subscribers are spared
  // a pointless new object
  return changed ? next : state;
}

/**
 * Only a finished structure can be dismantled. A blueprint is cancelled instead
 * (nothing has been spent yet), and a storage marker belongs to its zone, so it
 * comes off with the zone rather than on its own.
 */
function isDeconstructible(state: GameState, buildingId: BuildingId | null): boolean {
  if (!buildingId) return false;
  const building = state.buildings[buildingId];
  if (!building || building.isBlueprint) return false;
  return building.type !== 'storageZoneMarker';
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
  let changed = false;
  for (const tileId of tileIds) {
    const tile = next.tiles[tileId];
    if (!tile || tile.buildingId) continue;
    if (tile.terrain === 'stone') continue; // mine it out first
    changed = true;
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
  return changed ? next : state;
}

/** Cancel a blueprint. A finished building comes down via a `deconstruct` job. */
export function cancelBlueprint(state: GameState, tileIds: TileId[]): GameState {
  const next = edit(state);
  let changed = false;
  for (const tileId of tileIds) {
    const tile = next.tiles[tileId];
    if (!tile?.buildingId) continue;
    const building = next.buildings[tile.buildingId];
    if (!building?.isBlueprint) continue;
    changed = true;
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
  return changed ? next : state;
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

/**
 * Which zone a newly painted tile belongs to.
 *
 * Both kinds of zone are *places*. For a pasture that was always true: with
 * doors keeping animals in, two pens on opposite sides of the camp have to be
 * two herds with two capacities. Storage used to be the exception - one pool
 * wherever it was painted - which was fine while every store held the same
 * heap, and stopped being fine when a zone gained a filter: a wood yard by the
 * wall and a larder by the beds are two different orders, and they cannot be
 * two orders if they are one zone.
 *
 * So a tile joins a zone of its kind that it touches, and otherwise starts a
 * new one. Painting a tile that bridges two zones leaves them separate rather
 * than merging - the simple rule is easier to predict than a clever one.
 */
function zoneForTile(state: GameState, type: Zone['type'], tileId: TileId): ZoneId | null {
  const tile = state.tiles[tileId];
  for (const id in state.zones) {
    const zone = state.zones[id];
    if (zone.type !== type) continue;
    if (zone.tileIds.includes(tileId)) return id;
    const touches = zone.tileIds.some((other) => {
      const at = state.tiles[other];
      return at && Math.abs(at.x - tile.x) + Math.abs(at.y - tile.y) === 1;
    });
    if (touches) return id;
  }
  return null;
}

function placeZone(state: GameState, type: Zone['type'], tileIds: TileId[]): GameState {
  const next = edit(state);
  /** tiles accepted so far, per zone id; a new zone id is minted on demand */
  const additions = new Map<ZoneId, TileId[]>();
  let freshZoneId: ZoneId | null = null;

  for (const tileId of tileIds) {
    const tile = next.tiles[tileId];
    if (!tile) continue;
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

    // join whatever this tile touches, including anything painted a moment ago
    let zoneId = zoneForTile(next, type, tileId);
    if (zoneId && next.zones[zoneId].tileIds.includes(tileId)) continue;
    if (!zoneId) {
      for (const [candidate, tiles] of additions) {
        if (
          tiles.some((other) => {
            const at = next.tiles[other];
            return Math.abs(at.x - tile.x) + Math.abs(at.y - tile.y) === 1;
          })
        ) {
          zoneId = candidate;
          break;
        }
      }
    }
    if (!zoneId) {
      freshZoneId ??= nextId(next, 'z');
      zoneId = freshZoneId;
      freshZoneId = null; // one drag may create several pens
    }
    const list = additions.get(zoneId);
    if (list) list.push(tileId);
    else additions.set(zoneId, [tileId]);
  }

  if (additions.size === 0) return state;
  const zones = { ...next.zones };
  for (const [zoneId, added] of additions) {
    const zone: Zone = zones[zoneId] ?? {
      id: zoneId,
      type,
      tileIds: [],
      // a new store takes everything until the player says otherwise; a pen is
      // a feed trough and nothing else, which is what stops haulers stacking
      // firewood among the livestock
      accepts: type === 'storage' ? [...RESOURCE_TYPES] : ['food'],
    };
    zones[zoneId] = { ...zone, tileIds: [...zone.tileIds, ...added] };
  }
  next.zones = zones;
  return next;
}

/**
 * Narrow or widen what a storage zone takes. A stack that no longer belongs is
 * not teleported out: it becomes ordinary haul work on the next tick, which is
 * the same path everything else in the colony travels.
 */
export function setZoneAccepts(
  state: GameState,
  zoneId: ZoneId,
  type: ResourceType,
  allowed: boolean,
): GameState {
  const zone = state.zones[zoneId];
  if (!zone || zone.type !== 'storage') return state;
  if (zone.accepts.includes(type) === allowed) return state;
  const accepts = allowed
    ? RESOURCE_TYPES.filter((r) => r === type || zone.accepts.includes(r))
    : zone.accepts.filter((r) => r !== type);
  const next = edit(state);
  next.zones = { ...next.zones, [zoneId]: { ...zone, accepts } };
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
