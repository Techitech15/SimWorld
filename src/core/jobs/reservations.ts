// Reservations (section 6). Reserving is the only thing that stops two
// colonists from walking to the same tree, and it is part of the job lifecycle
// rather than a bolt-on, so every helper here is used by assign/execute/release.
import { updateAnimal, updateItem } from '../state';
import type { ColonistId, GameState, Job, JobId } from '../types';

/** Sentinels used by need-driven behaviour, which has no Job of its own. */
export const NEED_EAT_JOB_ID = 'need-eat' as JobId;
export const NEED_SLEEP_JOB_ID = 'need-sleep' as JobId;

export function isReserved(state: GameState, entityId: string): boolean {
  return state.reservations[entityId] !== undefined;
}

export function reservedBy(state: GameState, entityId: string): ColonistId | null {
  return state.reservations[entityId]?.colonistId ?? null;
}

/** Reserve every entity or nothing at all, so a haul never half-reserves. */
export function reserveAll(
  state: GameState,
  entityIds: string[],
  jobId: JobId,
  colonistId: ColonistId,
): boolean {
  for (const entityId of entityIds) {
    const existing = state.reservations[entityId];
    if (existing && existing.colonistId !== colonistId) return false;
  }
  const next = { ...state.reservations };
  for (const entityId of entityIds) next[entityId] = { entityId, jobId, colonistId };
  state.reservations = next;
  return true;
}

export function releaseByJob(state: GameState, jobId: JobId): void {
  const next: GameState['reservations'] = {};
  let changed = false;
  for (const key in state.reservations) {
    if (state.reservations[key].jobId === jobId) changed = true;
    else next[key] = state.reservations[key];
  }
  if (changed) state.reservations = next;
}

/**
 * Clear the "this job holds me" marker an item or animal carries alongside the
 * reservation itself. The reservation is the lock; this field only exists so the
 * renderer and the UI can show what is spoken for.
 */
export function releaseJobTarget(state: GameState, job: Job): void {
  if (!job.targetEntityId) return;
  if (state.items[job.targetEntityId]) {
    updateItem(state, job.targetEntityId, { reservedByJobId: null });
  } else if (state.animals[job.targetEntityId]) {
    updateAnimal(state, job.targetEntityId, { reservedByJobId: null });
  }
}

/** Drop every reservation a colonist holds, whatever job made it. */
export function releaseByColonist(state: GameState, colonistId: ColonistId): void {
  const next: GameState['reservations'] = {};
  let changed = false;
  for (const key in state.reservations) {
    if (state.reservations[key].colonistId === colonistId) changed = true;
    else next[key] = state.reservations[key];
  }
  if (changed) state.reservations = next;
}

export function releaseEntity(state: GameState, entityId: string): void {
  if (!state.reservations[entityId]) return;
  const { [entityId]: _removed, ...rest } = state.reservations;
  state.reservations = rest;
}

/** Composite key so several colonists can deliver different resources to one blueprint. */
export function deliveryKey(buildingId: string, resource: string): string {
  return `deliver:${buildingId}:${resource}`;
}
