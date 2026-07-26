// Stage 1 of the lifecycle (section 6): scan the world every tick and create the
// `pending` jobs it implies.
//
// Duplicate suppression uses a reverse index keyed by "what this job is about",
// so a designated tree never grows a second chop job while the first is alive.
import { DEFAULT_JOB_PRIORITY } from '../constants';
import { nextId, tileIdOf } from '../state';
import { findNearestItem, isStorageTile } from '../storage';
import type { GameState, Job, JobId, JobType, TileId } from '../types';

/** Identity of the work a job represents; two jobs never share one. */
function jobKey(job: Job): string {
  switch (job.type) {
    case 'haul':
      // a delivery is identified by "this blueprint still needs this resource",
      // which stays stable even after the source stack is picked up
      return job.destinationId && job.payloadType
        ? `deliver:${job.destinationId}:${job.payloadType}`
        : `haul:${job.targetEntityId}`;
    case 'build':
      return `build:${job.targetEntityId}`;
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

  // --- chop / mine designations --------------------------------------------
  for (const tileId in state.tiles) {
    const tile = state.tiles[tileId];
    if (!tile.designation) continue;
    if (tile.designation === 'chop' && tile.terrain !== 'forest') continue;
    if (tile.designation === 'mine' && tile.terrain !== 'stone') continue;
    const type: JobType = tile.designation === 'chop' ? 'chop' : 'mine';
    const key = `${type}:${tileId}`;
    if (has(key)) continue;
    createJob(state, type, { targetTileId: tileId, targetEntityId: tileId });
    claim(key);
  }

  // --- farm plots: sow when empty, harvest when ripe ------------------------
  for (const buildingId in state.buildings) {
    const building = state.buildings[buildingId];
    if (building.type !== 'farmPlot' || building.isBlueprint) continue;
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

  // --- loose items on the ground -> storage ---------------------------------
  for (const itemId in state.items) {
    const item = state.items[itemId];
    const tileId = tileIdOf(item.position.x, item.position.y);
    // Items already inside a storage zone stay put; re-hauling them is exactly
    // the infinite loop section 6 warns about.
    if (isStorageTile(state, tileId)) continue;
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
      return !!tile && tile.terrain === 'stone' && tile.designation === 'mine';
    }
    case 'farm': {
      const building = job.targetEntityId ? state.buildings[job.targetEntityId] : undefined;
      return !!building && !building.isBlueprint && (!building.sown || building.growth >= 1);
    }
    case 'build': {
      const building = job.targetEntityId ? state.buildings[job.targetEntityId] : undefined;
      return !!building && building.isBlueprint;
    }
    case 'haul': {
      const item = job.targetEntityId ? state.items[job.targetEntityId] : undefined;
      if (!item) return false;
      if (job.destinationId) {
        const blueprint = state.buildings[job.destinationId];
        if (blueprint) {
          if (!blueprint.isBlueprint) return false;
          return blueprint.requiredResources.some((r) => r.type === item.type && r.quantity > 0);
        }
        // otherwise the destination is a storage tile chosen at reservation time
        return state.tiles[job.destinationId] !== undefined;
      }
      return !isStorageTile(state, tileIdOf(item.position.x, item.position.y));
    }
    default:
      return false;
  }
}
