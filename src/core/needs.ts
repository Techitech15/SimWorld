// Needs (section 5): hunger and sleep only, linear decay, threshold triggers the
// eat/sleep behaviour automatically. No mood, no thoughts - those are phase 3.
//
// Need-driven behaviour deliberately sits outside the job system: it is not
// player-prioritisable work, and it must be able to pre-empt a job.
import {
  EAT_TICKS,
  FOOD_PER_MEAL,
  HUNGER_PER_TICK,
  HUNGER_RESTORED_PER_MEAL,
  HUNGER_THRESHOLD,
  SLEEP_PER_TICK,
  SLEEP_RECOVERY_PER_TICK,
  SLEEP_THRESHOLD,
  SLEEP_WAKE_AT,
} from './constants';
import type { SimContext } from './derived';
import { advanceTowards } from './movement';
import { addLog, removeItem, updateColonist, updateItem } from './state';
import { findNearestItem } from './storage';
import type { Colonist, GameState } from './types';
import {
  NEED_EAT_JOB_ID,
  NEED_SLEEP_JOB_ID,
  isReserved,
  releaseByJob,
  reserveAll,
} from './jobs/reservations';
import { depositCarried, failJob } from './jobs/execute';

export function runNeeds(state: GameState, ctx: SimContext): void {
  for (const colonistId in state.colonists) {
    decayNeeds(state, colonistId);
    startNeedBehaviour(state, ctx, colonistId);
    runNeedBehaviour(state, ctx, colonistId);
  }
}

function decayNeeds(state: GameState, colonistId: string): void {
  const colonist = state.colonists[colonistId];
  const sleeping = colonist.activity.kind === 'sleeping';
  const hunger = Math.min(100, colonist.needs.hunger + HUNGER_PER_TICK);
  const sleep = sleeping
    ? Math.max(0, colonist.needs.sleep - SLEEP_RECOVERY_PER_TICK)
    : Math.min(100, colonist.needs.sleep + SLEEP_PER_TICK);
  updateColonist(state, colonistId, { needs: { hunger, sleep } });
}

/** Interrupt work when a need crosses its threshold. */
function startNeedBehaviour(state: GameState, ctx: SimContext, colonistId: string): void {
  const colonist = state.colonists[colonistId];
  // a player move order is interruptible; eating and sleeping are not, and
  // neither is running from a predator - lying down to sleep with a wolf on your
  // heels is how a colony loses people (docs/design-animals.md 5)
  if (
    colonist.activity.kind === 'eating' ||
    colonist.activity.kind === 'sleeping' ||
    colonist.activity.kind === 'fleeing'
  ) {
    return;
  }

  const wantsFood = colonist.needs.hunger >= HUNGER_THRESHOLD;
  const wantsSleep = colonist.needs.sleep >= SLEEP_THRESHOLD;
  if (!wantsFood && !wantsSleep) return;
  // hunger first: starving while asleep is the failure mode we care about
  const kind = wantsFood && colonist.needs.hunger >= colonist.needs.sleep ? 'eat' : 'sleep';

  if (kind === 'eat') {
    const meal = findNearestItem(state, 'food', colonist.position, {
      preferStorage: false,
      minQuantity: 1,
    });
    if (!meal) {
      if (colonist.needs.hunger > 95 && state.tick % 250 === 0) {
        addLog(state, `${colonist.name} cannot find food`);
      }
      return;
    }
    if (!reserveAll(state, [meal.id], NEED_EAT_JOB_ID, colonistId)) return;
    releaseCurrentJob(state, ctx, colonistId);
    updateItem(state, meal.id, { reservedByJobId: NEED_EAT_JOB_ID });
    updateColonist(state, colonistId, {
      activity: { kind: 'eating', itemId: meal.id, ticksRemaining: EAT_TICKS },
    });
    return;
  }

  const bed = findFreeBed(state, colonist);
  releaseCurrentJob(state, ctx, colonistId);
  if (bed) reserveAll(state, [bed], NEED_SLEEP_JOB_ID, colonistId);
  updateColonist(state, colonistId, {
    activity: { kind: 'sleeping', bedId: bed },
  });
}

function findFreeBed(state: GameState, colonist: Colonist): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const buildingId in state.buildings) {
    const building = state.buildings[buildingId];
    if (building.type !== 'bed' || building.isBlueprint) continue;
    if (isReserved(state, buildingId)) continue;
    const tile = state.tiles[building.tileId];
    const distance =
      Math.abs(tile.x - colonist.position.x) + Math.abs(tile.y - colonist.position.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = buildingId;
    }
  }
  return best;
}

/** Hand the current job back to the queue so somebody else can take it. */
function releaseCurrentJob(state: GameState, ctx: SimContext, colonistId: string): void {
  const colonist = state.colonists[colonistId];
  const jobId = colonist.currentJobId;
  if (colonist.carrying) {
    depositCarried(state, colonistId, colonist.position.x, colonist.position.y);
  }
  if (!jobId) return;
  failJob(state, ctx, jobId, colonistId, 'interrupted by a need');
  // an interruption is not the job's fault: refund the retry and the cooldown
  const job = state.jobs[jobId];
  if (job && job.state === 'pending') {
    state.jobs[jobId] = {
      ...job,
      retryCount: Math.max(0, job.retryCount - 1),
      cooldownUntilTick: null,
    };
  }
}

function runNeedBehaviour(state: GameState, ctx: SimContext, colonistId: string): void {
  const colonist = state.colonists[colonistId];
  if (colonist.activity.kind === 'eating') {
    runEating(state, ctx, colonistId);
  } else if (colonist.activity.kind === 'sleeping') {
    runSleeping(state, ctx, colonistId);
  }
}

function runEating(state: GameState, ctx: SimContext, colonistId: string): void {
  const colonist = state.colonists[colonistId];
  const activity = colonist.activity;
  if (activity.kind !== 'eating') return;
  const item = activity.itemId ? state.items[activity.itemId] : undefined;
  if (!item) {
    endActivity(state, colonistId);
    return;
  }

  const move = advanceTowards(state, ctx, colonistId, item.position, false);
  if (move === 'blocked') {
    releaseByJob(state, NEED_EAT_JOB_ID);
    updateItem(state, item.id, { reservedByJobId: null });
    endActivity(state, colonistId);
    return;
  }
  if (move !== 'arrived') return;

  const ticksRemaining = activity.ticksRemaining - 1;
  if (ticksRemaining > 0) {
    updateColonist(state, colonistId, {
      activity: { kind: 'eating', itemId: item.id, ticksRemaining },
    });
    return;
  }

  const eaten = Math.min(FOOD_PER_MEAL, item.quantity);
  if (item.quantity - eaten <= 0) removeItem(state, item.id);
  else
    updateItem(state, item.id, {
      quantity: item.quantity - eaten,
      reservedByJobId: null,
    });

  const restored = (eaten / FOOD_PER_MEAL) * HUNGER_RESTORED_PER_MEAL;
  const needs = state.colonists[colonistId].needs;
  updateColonist(state, colonistId, {
    needs: { ...needs, hunger: Math.max(0, needs.hunger - restored) },
  });
  releaseByJob(state, NEED_EAT_JOB_ID);
  endActivity(state, colonistId);
}

function runSleeping(state: GameState, ctx: SimContext, colonistId: string): void {
  const colonist = state.colonists[colonistId];
  const activity = colonist.activity;
  if (activity.kind !== 'sleeping') return;

  if (activity.bedId) {
    const bed = state.buildings[activity.bedId];
    if (bed) {
      const tile = state.tiles[bed.tileId];
      const move = advanceTowards(state, ctx, colonistId, { x: tile.x, y: tile.y }, false);
      // sleeping on the floor is fine if the bed became unreachable
      if (move === 'blocked') {
        releaseByJob(state, NEED_SLEEP_JOB_ID);
        updateColonist(state, colonistId, {
          activity: { kind: 'sleeping', bedId: null },
        });
      }
    }
  }

  if (colonist.needs.sleep <= SLEEP_WAKE_AT) {
    releaseByJob(state, NEED_SLEEP_JOB_ID);
    endActivity(state, colonistId);
  }
}

function endActivity(state: GameState, colonistId: string): void {
  updateColonist(state, colonistId, { activity: { kind: 'none' } });
}
