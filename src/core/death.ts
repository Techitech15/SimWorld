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
import { recordChronicle } from './chronicle';
import { dropEquipmentOf } from './equipment';
import { recordDeath } from './relationships';
import { addLog, removeColonist, updateColonist, updateJob } from './state';
import { releaseByColonist, releaseJobTarget } from './jobs/reservations';
import { addItem } from './worldgen';
import type { ColonistId, GameState, LogKey, LogParams } from './types';

/** How they died, as a log key; the sentence is derived per language. */
export interface DeathCause {
  key: LogKey;
  params?: LogParams;
}

/** Put a carried stack on the ground: resources are never destroyed. */
export function depositCarried(
  state: GameState,
  colonistId: ColonistId,
  x: number,
  y: number,
): void {
  const colonist = state.colonists[colonistId];
  if (!colonist?.carrying) return;
  const { type, quantity, variant } = colonist.carrying;
  updateColonist(state, colonistId, { carrying: null });
  let remaining = quantity;
  while (remaining > 0) {
    const chunk = Math.min(remaining, STACK_MAX);
    addItem(state, type, chunk, x, y, variant);
    remaining -= chunk;
  }
}

export function killColonist(state: GameState, colonistId: ColonistId, cause: DeathCause): void {
  const colonist = state.colonists[colonistId];
  if (!colonist) return;

  // whatever they were carrying falls where they stood
  depositCarried(state, colonistId, colonist.position.x, colonist.position.y);
  // and so does whatever they wore (フェーズ8 E-1: no gear rides into the grave)
  dropEquipmentOf(state, colonistId, colonist.position);

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

  recordDeath(state, colonist);
  removeColonist(state, colonistId);
  const params = { ...cause.params, name: colonist.name };
  addLog(state, cause.key, params);
  recordChronicle(state, cause.key, params); // a colonist's death (issue #28)
  if (Object.keys(state.colonists).length === 0) {
    addLog(state, 'colonyDiedOut');
  }
}
