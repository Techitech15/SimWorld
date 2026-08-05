// Stages 4 and 5 of the lifecycle (section 6): execute, then release.
//
// Every job advances by exactly one tick of work here: move along the cached
// path, then accumulate progress once in place, then apply the effect. Failure
// paths always go through `failJob` so a job can never leak a reservation.
import { killAnimal } from '../animals';
import {
  BLOCKS_MOVEMENT,
  BUILDING_COSTS,
  COOLDOWN_TICKS,
  DECONSTRUCT_REFUND,
  FAILED_JOB_RETENTION_TICKS,
  FOOD_PER_BERRY_HARVEST,
  FOOD_PER_HARVEST,
  HUNT_RANGE,
  MAX_RETRIES,
  SPECIES,
  STONE_PER_ROCK,
  TAME_FAIL_FLEE_TICKS,
  WOOD_PER_TREE,
  WORK_TICKS,
} from '../constants';
import { clearColonistPath, invalidateTile } from '../derived';
import type { SimContext } from '../derived';
import { advanceTowards, chase } from '../movement';
import { moodOf } from '../mood';
import { mulberry32 } from '../rng';
import { grantWorkExperience, workRate } from '../skills';
import {
  addLog,
  removeItem,
  tileIdOf,
  updateAnimal,
  updateBuilding,
  updateColonist,
  updateItem,
  updateJob,
  updateTile,
} from '../state';
import { addItem } from '../worldgen';
import { depositCarried } from '../death';
import type { GameState, JobType } from '../types';
import { isJobStillValid } from './generator';
import { jobWorkSite } from './assign';
import { releaseByJob, releaseEntity, releaseJobTarget } from './reservations';

export function runExecution(state: GameState, ctx: SimContext): void {
  for (const colonistId in state.colonists) {
    const colonist = state.colonists[colonistId];
    if (!colonist.currentJobId) continue;
    if (colonist.activity.kind !== 'none') continue;
    const job = state.jobs[colonist.currentJobId];
    if (!job || job.reservedBy !== colonistId) {
      updateColonist(state, colonistId, { currentJobId: null });
      continue;
    }
    executeJob(state, ctx, job.id, colonistId);
  }
}

function executeJob(state: GameState, ctx: SimContext, jobId: string, colonistId: string): void {
  let job = state.jobs[jobId];
  if (job.state === 'reserved') job = updateJob(state, jobId, { state: 'active' });
  if (job.state !== 'active') return;

  // A haul in its carrying phase has already consumed its source item, so the
  // "does the target still exist" check does not apply to it any more.
  const carryingForThisJob = job.type === 'haul' && state.colonists[colonistId].carrying !== null;
  if (!carryingForThisJob && !isJobStillValid(state, job)) {
    cancelJob(state, ctx, jobId, colonistId, 'target disappeared');
    return;
  }

  if (job.type === 'haul') {
    executeHaul(state, ctx, jobId, colonistId);
    return;
  }

  if (job.type === 'hunt' || job.type === 'handle') {
    executeAnimalJob(state, ctx, jobId, colonistId);
    return;
  }

  const site = jobWorkSite(state, job);
  if (!site) {
    failJob(state, ctx, jobId, colonistId, 'no work site');
    return;
  }
  const move = advanceTowards(state, ctx, colonistId, site.position, site.adjacent);
  if (move === 'blocked') {
    failJob(state, ctx, jobId, colonistId, 'unreachable');
    return;
  }
  if (move !== 'arrived') return;

  const progress = job.workProgress + putInWork(state, colonistId, job.workType);
  if (progress < WORK_TICKS[job.type]) {
    updateJob(state, jobId, { workProgress: progress });
    return;
  }
  applyJobEffect(state, ctx, jobId, colonistId);
}

/**
 * One tick of work: how much progress it makes, and the practice it is worth.
 * Only called once the colonist is in place, so walking to the site teaches
 * nobody anything and a novice's tick is worth exactly the old flat 1.
 */
function putInWork(state: GameState, colonistId: string, workType: JobType): number {
  const colonist = state.colonists[colonistId];
  const rate = workRate(colonist, workType, moodOf(state, colonist));
  grantWorkExperience(state, colonistId, workType);
  return rate;
}

function applyJobEffect(
  state: GameState,
  ctx: SimContext,
  jobId: string,
  colonistId: string,
): void {
  const job = state.jobs[jobId];
  switch (job.type) {
    case 'chop': {
      const tile = state.tiles[job.targetTileId!];
      updateTile(state, tile.id, { terrain: 'grass', designation: null });
      addItem(state, 'wood', WOOD_PER_TREE, tile.x, tile.y);
      break;
    }
    case 'mine': {
      const tile = state.tiles[job.targetTileId!];
      updateTile(state, tile.id, {
        terrain: 'grass',
        designation: null,
        walkable: true,
      });
      addItem(state, 'stone', STONE_PER_ROCK, tile.x, tile.y);
      // walkability changed: regions are stale, cached paths through it are not
      invalidateTile(ctx, state, tile.id);
      break;
    }
    case 'farm': {
      const building = state.buildings[job.targetEntityId!];
      const tile = state.tiles[building.tileId];
      if (building.type === 'berryBush') {
        updateBuilding(state, building.id, { growth: 0 });
        addItem(state, 'food', FOOD_PER_BERRY_HARVEST, tile.x, tile.y);
        break;
      }
      if (!building.sown) {
        updateBuilding(state, building.id, { sown: true, growth: 0 });
      } else {
        updateBuilding(state, building.id, { sown: false, growth: 0 });
        addItem(state, 'food', FOOD_PER_HARVEST, tile.x, tile.y);
      }
      break;
    }
    case 'build': {
      const building = state.buildings[job.targetEntityId!];
      updateBuilding(state, building.id, {
        isBlueprint: false,
        buildProgress: 1,
        hpCurrent: building.hpMax,
      });
      if (BLOCKS_MOVEMENT[building.type]) {
        updateTile(state, building.tileId, { walkable: false });
        invalidateTile(ctx, state, building.tileId);
        // The builder now stands next to the wall rather than in it, but the
        // tile stays walkable right up until this moment, so anyone else may
        // have wandered onto it. Being sealed inside a wall is not a survivable
        // state: an entity on an unwalkable tile has no region, and every job on
        // the map then reads as unreachable to them.
        evictFromTile(state, ctx, building.tileId);
      }
      break;
    }
    case 'repair': {
      const building = state.buildings[job.targetEntityId!];
      updateBuilding(state, building.id, { hpCurrent: building.hpMax });
      addLog(state, `the ${building.type} at ${building.tileId} was repaired`);
      break;
    }
    case 'deconstruct': {
      const building = state.buildings[job.targetEntityId!];
      const tile = state.tiles[building.tileId];
      // half the materials come back, rounded down: a misplaced wall costs
      // something without being a disaster
      for (const cost of BUILDING_COSTS[building.type]) {
        const refund = Math.floor(cost.quantity * DECONSTRUCT_REFUND);
        if (refund > 0) addItem(state, cost.type, refund, tile.x, tile.y);
      }
      // a bed being pulled out from under a sleeper, or reserved for a nap
      releaseEntity(state, building.id);
      for (const id in state.colonists) {
        const activity = state.colonists[id].activity;
        if (activity.kind === 'sleeping' && activity.bedId === building.id) {
          updateColonist(state, id, { activity: { kind: 'sleeping', bedId: null } });
        }
      }
      const { [building.id]: _removed, ...rest } = state.buildings;
      state.buildings = rest;
      updateTile(state, tile.id, { buildingId: null, designation: null });
      if (BLOCKS_MOVEMENT[building.type]) {
        updateTile(state, tile.id, { walkable: true });
        invalidateTile(ctx, state, tile.id);
      }
      addLog(state, `${building.type} at ${tile.id} was dismantled`);
      break;
    }
    default:
      break;
  }
  completeJob(state, jobId, colonistId);
}

/**
 * Move anyone standing on a tile that has just stopped being walkable onto a
 * neighbour that still is. Nearest first, so they step aside rather than
 * teleport; if a creature is somehow walled in on all four sides it is left
 * where it is, which at least keeps the state describable.
 */
function evictFromTile(state: GameState, ctx: SimContext, tileId: string): void {
  const tile = state.tiles[tileId];
  if (!tile) return;
  const spots = [
    { x: tile.x + 1, y: tile.y },
    { x: tile.x - 1, y: tile.y },
    { x: tile.x, y: tile.y + 1 },
    { x: tile.x, y: tile.y - 1 },
  ].filter((at) => state.tiles[tileIdOf(at.x, at.y)]?.walkable);
  if (spots.length === 0) return;

  for (const id in state.colonists) {
    const colonist = state.colonists[id];
    if (colonist.position.x !== tile.x || colonist.position.y !== tile.y) continue;
    updateColonist(state, id, {
      position: { ...spots[0] },
      path: null,
      pathTargetTileId: null,
    });
    clearColonistPath(ctx, id);
  }
  for (const id in state.animals) {
    const animal = state.animals[id];
    if (animal.position.x !== tile.x || animal.position.y !== tile.y) continue;
    updateAnimal(state, id, { position: { ...spots[0] }, path: null, pathExpiresAtTick: null });
  }
}

/**
 * Hunting and animal handling (docs/design-animals.md 3).
 *
 * Both work the same way - close in on a creature that is moving, then put in
 * the work ticks - so they share one function. Hunting is ranged (HUNT_RANGE),
 * handling needs the colonist right next to the animal.
 */
function executeAnimalJob(
  state: GameState,
  ctx: SimContext,
  jobId: string,
  colonistId: string,
): void {
  const job = state.jobs[jobId];
  const animal = job.targetEntityId ? state.animals[job.targetEntityId] : undefined;
  if (!animal) {
    cancelJob(state, ctx, jobId, colonistId, 'animal gone');
    return;
  }

  const range = job.type === 'hunt' ? HUNT_RANGE : 1;
  const move = chase(state, ctx, colonistId, animal.position, range);
  if (move === 'blocked') {
    failJob(state, ctx, jobId, colonistId, 'animal unreachable');
    return;
  }
  if (move !== 'arrived') return;

  const progress = job.workProgress + putInWork(state, colonistId, job.workType);
  if (progress < WORK_TICKS[job.type]) {
    updateJob(state, jobId, { workProgress: progress });
    return;
  }

  if (job.type === 'hunt' || animal.designation === 'slaughter') {
    killAnimal(state, animal.id, job.type === 'hunt' ? 'was hunted' : 'was slaughtered', true);
    completeJob(state, jobId, colonistId);
    return;
  }

  // taming: a roll per attempt, and a failure just spooks the animal
  const rnd = mulberry32(state.tick * 31 + hashString(animal.id));
  const profile = SPECIES[animal.species];
  if (profile.tameChance > 0 && rnd() < profile.tameChance) {
    const pasture = nearestPastureId(state, animal.position);
    updateAnimal(state, animal.id, {
      tame: true,
      pastureZoneId: pasture,
      designation: null,
      activity: { kind: 'idle' },
      nextProduceTick: state.tick + profile.produceIntervalTicks,
    });
    addLog(state, `${animal.name} the ${profile.label.toLowerCase()} was tamed`);
  } else {
    updateAnimal(state, animal.id, {
      designation: null,
      activity: {
        kind: 'fleeing',
        fromAnimalId: animal.id, // spooked, but with nothing chasing it
        untilTick: state.tick + TAME_FAIL_FLEE_TICKS,
      },
    });
    addLog(state, `${animal.name} the ${profile.label.toLowerCase()} would not be tamed`);
  }
  completeJob(state, jobId, colonistId);
}

function nearestPastureId(state: GameState, from: { x: number; y: number }): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const zoneId in state.zones) {
    const zone = state.zones[zoneId];
    if (zone.type !== 'pasture') continue;
    for (const tileId of zone.tileIds) {
      const tile = state.tiles[tileId];
      if (!tile) continue;
      const distance = Math.abs(tile.x - from.x) + Math.abs(tile.y - from.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = zoneId;
      }
    }
  }
  return best;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function executeHaul(state: GameState, ctx: SimContext, jobId: string, colonistId: string): void {
  const job = state.jobs[jobId];
  const colonist = state.colonists[colonistId];

  // phase 1: fetch the stack
  if (!colonist.carrying) {
    const item = job.targetEntityId ? state.items[job.targetEntityId] : undefined;
    if (!item) {
      cancelJob(state, ctx, jobId, colonistId, 'item gone');
      return;
    }
    const move = advanceTowards(state, ctx, colonistId, item.position, false);
    if (move === 'blocked') {
      failJob(state, ctx, jobId, colonistId, 'item unreachable');
      return;
    }
    if (move !== 'arrived') return;

    const progress = job.workProgress + putInWork(state, colonistId, job.workType);
    if (progress < WORK_TICKS.haul) {
      updateJob(state, jobId, { workProgress: progress });
      return;
    }

    // A delivery only takes what the blueprint is still missing; hauling to
    // storage takes the whole stack.
    const destination = job.destinationId ? state.buildings[job.destinationId] : undefined;
    const needed = destination
      ? (destination.requiredResources.find((r) => r.type === item.type)?.quantity ?? 0)
      : item.quantity;
    const taken = Math.max(0, Math.min(item.quantity, needed));
    if (taken === 0) {
      cancelJob(state, ctx, jobId, colonistId, 'nothing left to deliver');
      return;
    }

    updateColonist(state, colonistId, {
      carrying: { type: item.type, quantity: taken },
    });
    if (taken >= item.quantity) removeItem(state, item.id);
    else
      updateItem(state, item.id, {
        quantity: item.quantity - taken,
        reservedByJobId: null,
      });
    updateJob(state, jobId, { workProgress: 0 });
    return;
  }

  // phase 2: deliver it
  const carrying = colonist.carrying;
  const destinationId = job.destinationId;
  if (!destinationId) {
    dropCarried(state, colonistId);
    failJob(state, ctx, jobId, colonistId, 'no destination');
    return;
  }

  const destinationBuilding = state.buildings[destinationId];
  if (destinationBuilding) {
    const tile = state.tiles[destinationBuilding.tileId];
    const move = advanceTowards(state, ctx, colonistId, { x: tile.x, y: tile.y }, !tile.walkable);
    if (move === 'blocked') {
      dropCarried(state, colonistId);
      failJob(state, ctx, jobId, colonistId, 'blueprint unreachable');
      return;
    }
    if (move !== 'arrived') return;

    const need = destinationBuilding.requiredResources.find(
      (r) => r.type === carrying.type && r.quantity > 0,
    );
    const delivered = need ? Math.min(need.quantity, carrying.quantity) : 0;
    if (delivered > 0) {
      updateBuilding(state, destinationBuilding.id, {
        requiredResources: destinationBuilding.requiredResources.map((r) =>
          r.type === carrying.type ? { ...r, quantity: r.quantity - delivered } : r,
        ),
      });
    }
    const leftover = carrying.quantity - delivered;
    updateColonist(state, colonistId, { carrying: null });
    if (leftover > 0) {
      const at = state.colonists[colonistId].position;
      addItem(state, carrying.type, leftover, at.x, at.y);
    }
    completeJob(state, jobId, colonistId);
    return;
  }

  // storage tile destination
  const destinationTile = state.tiles[destinationId];
  if (!destinationTile) {
    dropCarried(state, colonistId);
    failJob(state, ctx, jobId, colonistId, 'destination gone');
    return;
  }
  const move = advanceTowards(
    state,
    ctx,
    colonistId,
    { x: destinationTile.x, y: destinationTile.y },
    false,
  );
  if (move === 'blocked') {
    dropCarried(state, colonistId);
    failJob(state, ctx, jobId, colonistId, 'storage unreachable');
    return;
  }
  if (move !== 'arrived') return;

  depositCarried(state, colonistId, destinationTile.x, destinationTile.y);
  completeJob(state, jobId, colonistId);
}

/** Put down whatever the colonist holds, splitting oversized stacks. */
function dropCarried(state: GameState, colonistId: string): void {
  const colonist = state.colonists[colonistId];
  if (!colonist.carrying) return;
  depositCarried(state, colonistId, colonist.position.x, colonist.position.y);
}

export function completeJob(state: GameState, jobId: string, colonistId: string): void {
  releaseByJob(state, jobId);
  const job = state.jobs[jobId];
  if (job) releaseJobTarget(state, job);
  updateJob(state, jobId, { state: 'completed', reservedBy: null });
  updateColonist(state, colonistId, { currentJobId: null });
}

/**
 * Release on failure: retry with a cooldown, or discard the job after
 * MAX_RETRIES so an unreachable target stops burning candidate-filter time.
 */
export function failJob(
  state: GameState,
  ctx: SimContext,
  jobId: string,
  colonistId: string,
  reason: string,
): void {
  void ctx;
  const job = state.jobs[jobId];
  releaseByJob(state, jobId);
  releaseJobTarget(state, job);
  const retryCount = job.retryCount + 1;
  if (retryCount > MAX_RETRIES) {
    // the tombstone lives until this tick (see cleanupJobs in simulation.ts)
    updateJob(state, jobId, {
      state: 'failed',
      reservedBy: null,
      retryCount,
      cooldownUntilTick: state.tick + FAILED_JOB_RETENTION_TICKS,
    });
    addLog(state, `job ${jobId} (${job.type}) failed: ${reason}`);
  } else {
    updateJob(state, jobId, {
      state: 'pending',
      reservedBy: null,
      retryCount,
      workProgress: 0,
      cooldownUntilTick: state.tick + COOLDOWN_TICKS,
    });
  }
  updateColonist(state, colonistId, {
    currentJobId: null,
    path: null,
    pathTargetTileId: null,
  });
}

function cancelJob(
  state: GameState,
  ctx: SimContext,
  jobId: string,
  colonistId: string,
  reason: string,
): void {
  void ctx;
  void reason;
  releaseByJob(state, jobId);
  const job = state.jobs[jobId];
  releaseJobTarget(state, job);
  updateJob(state, jobId, { state: 'cancelled', reservedBy: null });
  updateColonist(state, colonistId, { currentJobId: null });
  // never destroy resources: put any carried stack back on the ground
  dropCarried(state, colonistId);
}
