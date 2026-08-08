// Stage 1 of the lifecycle (section 6): scan the world every tick and create the
// `pending` jobs it implies.
//
// Duplicate suppression uses a reverse index keyed by "what this job is about",
// so a designated tree never grows a second chop job while the first is alive.
import { DEFAULT_JOB_PRIORITY } from '../constants';
import { wantsFuel } from '../mana';
import { nextId, tileIdOf, isRock } from '../state';
import { acceptsHere, findNearestItem } from '../storage';
import type { GameState, Job, JobId, JobType, TileId } from '../types';

/** Identity of the work a job represents; two jobs never share one. */
function jobKey(job: Job): string {
  switch (job.type) {
    case 'hunt':
    case 'handle':
      return `${job.type}:${job.targetEntityId}`;
    case 'haul':
      // a delivery is identified by "this blueprint still needs this resource",
      // which stays stable even after the source stack is picked up
      return job.destinationId && job.payloadType
        ? `deliver:${job.destinationId}:${job.payloadType}`
        : `haul:${job.targetEntityId}`;
    case 'build':
    case 'deconstruct':
    case 'repair':
      return `${job.type}:${job.targetEntityId}`;
    default:
      return `${job.type}:${job.targetTileId}`;
  }
}

/**
 * Jobs that block a duplicate from being generated. `failed` counts: its
 * tombstone keeps the generator from immediately recreating work the colony
 * just gave up on (simulation.ts purges it once the cooldown expires).
 */
function isAlive(job: Job): boolean {
  return (
    job.state === 'pending' ||
    job.state === 'reserved' ||
    job.state === 'active' ||
    job.state === 'failed'
  );
}

function createJob(
  state: GameState,
  type: JobType,
  fields: Partial<Job> & { targetTileId: TileId | null },
): Job {
  const id: JobId = nextId(state, 'j');
  const workType = fields.workType ?? type;
  const job: Job = {
    id,
    type,
    workType,
    priority: DEFAULT_JOB_PRIORITY[workType],
    targetTileId: fields.targetTileId,
    targetEntityId: fields.targetEntityId ?? null,
    destinationId: fields.destinationId ?? null,
    payloadType: fields.payloadType ?? null,
    state: 'pending',
    reservedBy: null,
    createdAtTick: state.tick,
    retryCount: 0,
    cooldownUntilTick: null,
    workProgress: 0,
  };
  state.jobs[id] = job;
  return job;
}

/**
 * Generate the jobs implied by the current world state and drop pending jobs
 * whose reason disappeared (designation cleared, item hauled away by someone
 * else, blueprint cancelled).
 */
export function runJobGenerator(state: GameState): void {
  const existing = new Set<string>();
  for (const id in state.jobs) {
    const job = state.jobs[id];
    if (isAlive(job)) existing.add(jobKey(job));
  }

  const has = (key: string) => existing.has(key);
  const claim = (key: string) => existing.add(key);

  // --- chop / mine / deconstruct designations -------------------------------
  for (const tileId in state.tiles) {
    const tile = state.tiles[tileId];
    if (!tile.designation) continue;
    if (tile.designation === 'deconstruct') {
      // unlike chop and mine this one is about the structure, not the ground
      const building = tile.buildingId ? state.buildings[tile.buildingId] : undefined;
      if (!building || building.isBlueprint) continue;
      const key = `deconstruct:${building.id}`;
      if (has(key)) continue;
      createJob(state, 'deconstruct', {
        // pulling a wall down is construction work, so the Build column governs it
        workType: 'build',
        targetTileId: tileId,
        targetEntityId: building.id,
      });
      claim(key);
      continue;
    }
    if (tile.designation === 'chop' && tile.terrain !== 'forest') continue;
    if (tile.designation === 'mine' && !isRock(tile.terrain)) continue;
    const type: JobType = tile.designation === 'chop' ? 'chop' : 'mine';
    const key = `${type}:${tileId}`;
    if (has(key)) continue;
    createJob(state, type, { targetTileId: tileId, targetEntityId: tileId });
    claim(key);
  }

  // --- farm plots: sow when empty, harvest when ripe ------------------------
  for (const buildingId in state.buildings) {
    const building = state.buildings[buildingId];
    if (building.isBlueprint) continue;
    // a ripe bush is harvest work and nothing else: there is no sowing to do
    if (building.type === 'berryBush') {
      if (building.growth < 1) continue;
      const key = `farm:${building.tileId}`;
      if (has(key)) continue;
      createJob(state, 'farm', { targetTileId: building.tileId, targetEntityId: buildingId });
      claim(key);
      continue;
    }
    if (building.type !== 'farmPlot') continue;
    const needsWork = !building.sown || building.growth >= 1;
    if (!needsWork) continue;
    const key = `farm:${building.tileId}`;
    if (has(key)) continue;
    createJob(state, 'farm', {
      targetTileId: building.tileId,
      targetEntityId: buildingId,
    });
    claim(key);
  }

  // --- blueprints: deliver materials, then build ----------------------------
  for (const buildingId in state.buildings) {
    const building = state.buildings[buildingId];
    if (!building.isBlueprint) continue;
    const missing = building.requiredResources.filter((r) => r.quantity > 0);
    if (missing.length === 0) {
      const key = `build:${buildingId}`;
      if (has(key)) continue;
      createJob(state, 'build', {
        targetTileId: building.tileId,
        targetEntityId: buildingId,
      });
      claim(key);
      continue;
    }
    for (const need of missing) {
      const key = `deliver:${buildingId}:${need.type}`;
      if (has(key)) continue;
      const tile = state.tiles[building.tileId];
      const source = findNearestItem(
        state,
        need.type,
        { x: tile.x, y: tile.y },
        {
          preferStorage: true,
        },
      );
      if (!source) continue;
      createJob(state, 'haul', {
        // carrying materials to a blueprint is construction work
        workType: 'build',
        targetTileId: tileIdOf(source.position.x, source.position.y),
        targetEntityId: source.id,
        destinationId: buildingId,
        payloadType: need.type,
      });
      claim(key);
    }
  }

  // --- furnaces asking for fuel ---------------------------------------------
  // The same haul job a blueprint uses, pointed at a finished building. Mana
  // is a resource the colony carries, so keeping a furnace lit is hauling work
  // that competes with everything else on the same priority column - which is
  // the point of phase 2: the constraint is not the materials, it is whether
  // you can keep it supplied.
  for (const buildingId in state.buildings) {
    const building = state.buildings[buildingId];
    if (!wantsFuel(building)) continue;
    // the same key `jobKey` derives for a delivery, or the generator would make
    // a fresh fuel job every tick and the furnace would collect a queue
    const key = `deliver:${buildingId}:manaCrystal`;
    if (has(key)) continue;
    const tile = state.tiles[building.tileId];
    const source = findNearestItem(state, 'manaCrystal', { x: tile.x, y: tile.y }, {
      preferStorage: true,
    });
    if (!source) continue;
    createJob(state, 'haul', {
      targetTileId: tileIdOf(source.position.x, source.position.y),
      targetEntityId: source.id,
      destinationId: buildingId,
      payloadType: 'manaCrystal',
    });
    claim(key);
  }

  // --- damaged structures -> repair -----------------------------------------
  // Nothing damaged a building until predators started chewing on doors, which
  // is what makes this worth generating: a fence keeps wolves out only while
  // somebody keeps it standing. No materials, because a patch is work rather
  // than a rebuild - and because a delivery chain for it would be a second
  // blueprint system.
  for (const buildingId in state.buildings) {
    const building = state.buildings[buildingId];
    if (building.isBlueprint || building.hpCurrent >= building.hpMax) continue;
    const key = `repair:${buildingId}`;
    if (has(key)) continue;
    createJob(state, 'repair', {
      workType: 'build', // patching a wall is construction work, like tearing it down
      targetTileId: building.tileId,
      targetEntityId: buildingId,
    });
    claim(key);
  }

  // --- designated animals: hunt / tame / slaughter ---------------------------
  for (const animalId in state.animals) {
    const animal = state.animals[animalId];
    if (!animal.designation) continue;
    // a designation that no longer makes sense (a tamed animal marked for
    // taming, a wild one marked for slaughter) is simply skipped
    if (animal.designation === 'tame' && animal.tame) continue;
    if (animal.designation === 'slaughter' && !animal.tame) continue;
    const type: JobType = animal.designation === 'hunt' ? 'hunt' : 'handle';
    const key = `${type}:${animalId}`;
    if (has(key)) continue;
    createJob(state, type, {
      targetTileId: tileIdOf(animal.position.x, animal.position.y),
      targetEntityId: animalId,
    });
    claim(key);
  }

  // --- loose items on the ground -> storage ---------------------------------
  for (const itemId in state.items) {
    const item = state.items[itemId];
    const tileId = tileIdOf(item.position.x, item.position.y);
    // A stack already sitting somewhere that takes it stays put; re-hauling it
    // is exactly the infinite loop section 6 warns about. Narrowing a zone's
    // filter is therefore also the order "carry what no longer belongs out".
    if (acceptsHere(state, tileId, item.type)) continue;
    const key = `haul:${itemId}`;
    if (has(key)) continue;
    createJob(state, 'haul', {
      targetTileId: tileId,
      targetEntityId: itemId,
      destinationId: null, // resolved to a concrete storage tile at reservation time
      payloadType: item.type,
    });
    claim(key);
  }

  // --- drop pending jobs whose reason vanished ------------------------------
  for (const id in state.jobs) {
    const job = state.jobs[id];
    if (job.state !== 'pending') continue;
    if (!isJobStillValid(state, job)) {
      state.jobs[id] = { ...job, state: 'cancelled' };
    }
  }
}

export function isJobStillValid(state: GameState, job: Job): boolean {
  switch (job.type) {
    case 'chop': {
      const tile = job.targetTileId ? state.tiles[job.targetTileId] : undefined;
      return !!tile && tile.terrain === 'forest' && tile.designation === 'chop';
    }
    case 'mine': {
      const tile = job.targetTileId ? state.tiles[job.targetTileId] : undefined;
      return !!tile && isRock(tile.terrain) && tile.designation === 'mine';
    }
    case 'farm': {
      const building = job.targetEntityId ? state.buildings[job.targetEntityId] : undefined;
      if (!building || building.isBlueprint) return false;
      if (building.type === 'berryBush') return building.growth >= 1;
      return !building.sown || building.growth >= 1;
    }
    case 'build': {
      const building = job.targetEntityId ? state.buildings[job.targetEntityId] : undefined;
      return !!building && building.isBlueprint;
    }
    case 'deconstruct': {
      const building = job.targetEntityId ? state.buildings[job.targetEntityId] : undefined;
      const tile = job.targetTileId ? state.tiles[job.targetTileId] : undefined;
      return !!building && !building.isBlueprint && tile?.designation === 'deconstruct';
    }
    case 'repair': {
      const building = job.targetEntityId ? state.buildings[job.targetEntityId] : undefined;
      return !!building && !building.isBlueprint && building.hpCurrent < building.hpMax;
    }
    case 'hunt':
    case 'handle': {
      const animal = job.targetEntityId ? state.animals[job.targetEntityId] : undefined;
      if (!animal || !animal.designation) return false;
      if (job.type === 'hunt') return animal.designation === 'hunt';
      if (animal.designation === 'tame') return !animal.tame;
      return animal.tame; // slaughter
    }
    case 'haul': {
      const item = job.targetEntityId ? state.items[job.targetEntityId] : undefined;
      if (!item) return false;
      if (job.destinationId) {
        const destination = state.buildings[job.destinationId];
        if (destination) {
          // a furnace is the one finished building that still takes deliveries,
          // so "is it still a blueprint" is no longer the whole question
          if (destination.type === 'manaFurnace' && !destination.isBlueprint) {
            return item.type === 'manaCrystal' && wantsFuel(destination);
          }
          if (!destination.isBlueprint) return false;
          return destination.requiredResources.some((r) => r.type === item.type && r.quantity > 0);
        }
        // otherwise the destination is a storage tile chosen at reservation time
        return state.tiles[job.destinationId] !== undefined;
      }
      return !acceptsHere(state, tileIdOf(item.position.x, item.position.y), item.type);
    }
    default:
      return false;
  }
}
