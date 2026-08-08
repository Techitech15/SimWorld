// Removing a colonist from the world.
//
// A colonist is the anchor of three things that outlive them if nobody cleans
// up: the job they held (which would stay reserved by a corpse and never run
// again), every reservation they took (which would lock a tree, a bed or a food
// stack permanently), and whatever they were carrying. Deleting the record
// alone is the bug; this is the whole operation.
//
// It lives in its own module because both the ecology (a wolf kills someone) and
// the job layer need it, and routing it through either one would make the two
// import each other.
import { STACK_MAX } from './constants';
import { addLog, removeColonist, updateColonist, updateJob } from './state';
import { releaseByColonist, releaseJobTarget } from './jobs/reservations';
import { addItem } from './worldgen';
import type { ColonistId, GameState } from './types';

/** Put a carried stack on the ground: resources are never destroyed. */
export function depositCarried(
  state: GameState,
  colonistId: ColonistId,
  x: number,
  y: number,
): void {
  const colonist = state.colonists[colonistId];
  if (!colonist?.carrying) return;
  const { type, quantity } = colonist.carrying;
  updateColonist(state, colonistId, { carrying: null });
  let remaining = quantity;
  while (remaining > 0) {
    const chunk = Math.min(remaining, STACK_MAX);
    addItem(state, type, chunk, x, y);
    remaining -= chunk;
  }
}

export function killColonist(state: GameState, colonistId: ColonistId, reason: string): void {
  const colonist = state.colonists[colonistId];
  if (!colonist) return;

  // whatever they were carrying falls where they stood
  depositCarried(state, colonistId, colonist.position.x, colonist.position.y);

  if (colonist.currentJobId) {
    const job = state.jobs[colonist.currentJobId];
    if (job) {
      releaseJobTarget(state, job);
      updateJob(state, job.id, { state: 'cancelled', reservedBy: null });
    }
  }
  // not just the current job's reservations: eating and sleeping reserve a food
  // stack and a bed under their own sentinel job ids
  releaseByColonist(state, colonistId);

  removeColonist(state, colonistId);
  addLog(state, `${colonist.name} ${reason}`);
  if (Object.keys(state.colonists).length === 0) {
    addLog(state, 'The colony has died out.');
  }
}
