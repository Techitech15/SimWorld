// Stages 2 and 3 of the lifecycle (section 6): candidate filter, then reserve.
//
// Candidate conditions, in the document's order:
//   (a) reachable            -> O(1) region-label test (derived.ts)
//   (b) target not reserved  -> state.reservations
//   (c) priority enabled     -> the colonist's own work priority table
//   (d) cooldown expired     -> job.cooldownUntilTick
// Ordering inside one priority band is nearest-first, the documented deviation
// from RimWorld's distance-blind rule.
import { CANDIDATE_PATH_ATTEMPTS } from '../constants';
import { isReachable } from '../derived';
import type { SimContext } from '../derived';
import { setDestination } from '../movement';
import { manhattan, updateColonist, updateItem, updateJob } from '../state';
import { findStorageDestination } from '../storage';
import type { Colonist, GameState, Item, Job, Vector2 } from '../types';
import { deliveryKey, isReserved, releaseByJob, reserveAll } from './reservations';

/** Where the colonist has to stand, and whether standing next to it is enough. */
export function jobWorkSite(
  state: GameState,
  job: Job,
): { position: Vector2; adjacent: boolean } | null {
  switch (job.type) {
    case 'mine': {
      const tile = job.targetTileId ? state.tiles[job.targetTileId] : undefined;
      if (!tile) return null;
      return { position: { x: tile.x, y: tile.y }, adjacent: true };
    }
    case 'chop':
    case 'farm':
    case 'build': {
      const tile = job.targetTileId ? state.tiles[job.targetTileId] : undefined;
      if (!tile) return null;
      return { position: { x: tile.x, y: tile.y }, adjacent: !tile.walkable };
    }
    case 'haul': {
      const item = job.targetEntityId ? state.items[job.targetEntityId] : undefined;
      if (!item) return null;
      return { position: { ...item.position }, adjacent: false };
    }
    default:
      return null;
  }
}

/** Entities a job must hold before it can run. */
function reservationTargets(state: GameState, job: Job, colonist: Colonist): string[] | null {
  switch (job.type) {
    case 'chop':
    case 'mine':
      return job.targetTileId ? [job.targetTileId] : null;
    case 'farm':
    case 'build':
      return job.targetEntityId ? [job.targetEntityId] : null;
    case 'haul': {
      const item: Item | undefined = job.targetEntityId
        ? state.items[job.targetEntityId]
        : undefined;
      if (!item) return null;
      if (job.destinationId) {
        // delivery to a blueprint: reserve the item and this resource slot
        return [item.id, deliveryKey(job.destinationId, item.type)];
      }
      const destination = findStorageDestination(
        state,
        item.type,
        item.quantity,
        colonist.position,
      );
      if (!destination) return null;
      // section 6.3: both the source stack and the drop-off tile get reserved
      return [item.id, destination];
    }
    default:
      return null;
  }
}

function candidateBlocked(state: GameState, job: Job, colonist: Colonist): boolean {
  const targets = reservationTargets(state, job, colonist);
  if (!targets) return true;
  return targets.some((entityId) => {
    const existing = state.reservations[entityId];
    return existing !== undefined && existing.colonistId !== colonist.id;
  });
}

/**
 * Assign work to every idle colonist. Runs once per tick, after the generator.
 */
export function runAssignment(state: GameState, ctx: SimContext): void {
  for (const colonistId in state.colonists) {
    const colonist = state.colonists[colonistId];
    if (colonist.currentJobId) continue;
    if (colonist.activity.kind !== 'none') continue; // eating/sleeping wins over work
    assignJobTo(state, ctx, colonistId);
  }
}

function assignJobTo(state: GameState, ctx: SimContext, colonistId: string): void {
  const colonist = state.colonists[colonistId];

  const candidates: { job: Job; workPriority: number; distance: number }[] = [];
  for (const jobId in state.jobs) {
    const job = state.jobs[jobId];
    if (job.state !== 'pending') continue;
    // (d) cooldown
    if (job.cooldownUntilTick !== null && state.tick < job.cooldownUntilTick) continue;
    // (c) the colonist is allowed to do this kind of work
    const workPriority = colonist.workPriorities[job.workType] ?? 0;
    if (workPriority <= 0) continue;
    const site = jobWorkSite(state, job);
    if (!site) continue;
    // (a) reachable
    if (!isReachable(ctx, colonist.position, site.position, site.adjacent)) continue;
    // (b) nothing already reserved by someone else
    if (candidateBlocked(state, job, colonist)) continue;
    candidates.push({
      job,
      workPriority,
      distance: manhattan(colonist.position, site.position),
    });
  }

  if (candidates.length === 0) return;

  candidates.sort(
    (a, b) =>
      a.workPriority - b.workPriority ||
      a.job.priority - b.job.priority ||
      a.distance - b.distance ||
      (a.job.id < b.job.id ? -1 : 1),
  );

  // Region labels prove reachability cheaply; A* proves it concretely and
  // produces the cached path. Walk the whole sorted list, but spend at most
  // CANDIDATE_PATH_ATTEMPTS actual A* runs - candidates that fail on the cheap
  // reservation check cost nothing and do not consume that budget.
  let pathAttempts = 0;
  for (const { job } of candidates) {
    if (tryReserve(state, ctx, job, colonistId, () => (pathAttempts += 1))) return;
    if (pathAttempts >= CANDIDATE_PATH_ATTEMPTS) return;
  }
}

/** Stage 3: reserve the job's entities and hand it to the colonist. */
export function tryReserve(
  state: GameState,
  ctx: SimContext,
  job: Job,
  colonistId: string,
  onPathAttempt?: () => void,
): boolean {
  const colonist = state.colonists[colonistId];
  const targets = reservationTargets(state, job, colonist);
  if (!targets) return false;
  const site = jobWorkSite(state, job);
  if (!site) return false;
  if (!reserveAll(state, targets, job.id, colonistId)) return false;

  onPathAttempt?.();
  if (!setDestination(state, ctx, colonistId, site.position, site.adjacent)) {
    releaseByJob(state, job.id);
    return false;
  }

  // haul jobs resolve their concrete destination at reservation time
  let destinationId = job.destinationId;
  if (job.type === 'haul' && !destinationId) {
    destinationId = targets[1] ?? null;
  }
  if (job.type === 'haul' && job.targetEntityId) {
    updateItem(state, job.targetEntityId, { reservedByJobId: job.id });
  }

  // stage 3 only reserves; the execute stage promotes `reserved` -> `active`
  updateJob(state, job.id, {
    state: 'reserved',
    reservedBy: colonistId,
    destinationId,
    workProgress: 0,
  });
  updateColonist(state, colonistId, { currentJobId: job.id });
  return true;
}

/** True when nobody else holds any of the entities this job needs. */
export function jobIsFree(state: GameState, job: Job): boolean {
  if (job.targetEntityId && isReserved(state, job.targetEntityId)) return false;
  if (job.targetTileId && isReserved(state, job.targetTileId)) return false;
  return true;
}
