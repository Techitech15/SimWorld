// Stages 2 and 3 of the lifecycle (section 6): candidate filter, then reserve.
//
// Candidate conditions, in the document's order:
//   (a) reachable            -> O(1) region-label test (derived.ts)
//   (b) target not reserved  -> state.reservations
//   (c) priority enabled     -> the colonist's own work priority table
//   (d) cooldown expired     -> job.cooldownUntilTick
// Ordering inside one priority band is nearest-first, the documented deviation
// from RimWorld's distance-blind rule.
import { BLOCKS_MOVEMENT, CANDIDATE_PATH_ATTEMPTS } from '../constants';
import { isReachable } from '../derived';
import type { SimContext } from '../derived';
import { setDestination } from '../movement';
import { manhattan, updateAnimal, updateColonist, updateItem, updateJob } from '../state';
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
    case 'deconstruct':
    case 'repair':
    case 'research': {
      const tile = job.targetTileId ? state.tiles[job.targetTileId] : undefined;
      if (!tile) return null;
      return { position: { x: tile.x, y: tile.y }, adjacent: !tile.walkable };
    }
    case 'build': {
      const tile = job.targetTileId ? state.tiles[job.targetTileId] : undefined;
      if (!tile) return null;
      // A blueprint tile is walkable until the moment the wall goes up, so
      // without this the builder stands *inside* what they are building and the
      // finished wall seals them in - and a colonist on an unwalkable tile has
      // no region, which makes every job in the world read as unreachable.
      const building = job.targetEntityId ? state.buildings[job.targetEntityId] : undefined;
      const willBlock = building ? BLOCKS_MOVEMENT[building.type] : false;
      return { position: { x: tile.x, y: tile.y }, adjacent: !tile.walkable || willBlock };
    }
    case 'haul': {
      const item = job.targetEntityId ? state.items[job.targetEntityId] : undefined;
      if (!item) return null;
      return { position: { ...item.position }, adjacent: false };
    }
    // Animals move, so the work site is wherever the creature is *now*. Hunting
    // is ranged, which is why the hunter does not have to corner the prey
    // (docs/design-phase2.5-animals.md 3).
    case 'hunt':
    case 'handle': {
      const animal = job.targetEntityId ? state.animals[job.targetEntityId] : undefined;
      if (!animal) return null;
      return { position: { ...animal.position }, adjacent: true };
    }
    default:
      return null;
  }
}

/** Entities a job must hold before it can run. */
function reservationTargets(state: GameState, job: Job): string[] | null {
  switch (job.type) {
    case 'chop':
    case 'mine':
      return job.targetTileId ? [job.targetTileId] : null;
    case 'farm':
    case 'build':
    case 'deconstruct':
    case 'repair':
    case 'hunt':
    case 'handle':
    case 'research':
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
      // measured from the stack, not the colonist: the walk to the item happens
      // either way, so the only leg this choice controls is item -> storage
      const destination = findStorageDestination(
        state,
        item.type,
        item.quantity,
        item.position,
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
  const targets = reservationTargets(state, job);
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

/**
 * Stage 2 of the lifecycle: every job this colonist could take, in the order
 * they should be tried.
 *
 * Exported so that "is this colonist idle next to work they could be doing"
 * can be asked with the engine's own definition of could rather than a second
 * one written alongside it - a copy of this rule in a test would drift from it
 * and stop catching the thing it was written for (see chaos.test.ts).
 */
export function candidatesFor(
  state: GameState,
  ctx: SimContext,
  colonistId: string,
): { job: Job; workPriority: number; distance: number }[] {
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
    // and the job's own targets must still be claimable, or it is not work
    // anybody can pick up - a haul with nowhere left to put the stack is
    // pending for ever and belongs to nobody
    if (!reservationTargets(state, job)) continue;
    candidates.push({
      job,
      workPriority,
      distance: manhattan(colonist.position, site.position),
    });
  }
  return candidates;
}

function assignJobTo(state: GameState, ctx: SimContext, colonistId: string): void {
  const candidates = candidatesFor(state, ctx, colonistId);
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
  const targets = reservationTargets(state, job);
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
  if ((job.type === 'hunt' || job.type === 'handle') && job.targetEntityId) {
    updateAnimal(state, job.targetEntityId, { reservedByJobId: job.id });
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
