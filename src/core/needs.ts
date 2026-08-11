// Needs (section 5): hunger and sleep only, linear decay, threshold triggers the
// eat/sleep behaviour automatically. No mood, no thoughts - those are phase 3.
//
// Need-driven behaviour deliberately sits outside the job system: it is not
// player-prioritisable work, and it must be able to pre-empt a job.
import {
  ARMCHAIR_RECREATION_MULTIPLIER,
  DRESSER_RADIUS,
  DRESSER_REST_MULTIPLIER,
  EAT_TICKS,
  RECREATION_ALONE_MULTIPLIER,
  RECREATION_PER_TICK,
  RECREATION_RESTORED_PER_TICK,
  RECREATION_THRESHOLD,
  RELAX_TICKS,
  TICKS_PER_STEP,
  FOOD_PER_MEAL,
  HUNGER_PER_TICK,
  HUNGER_RESTORED_PER_MEAL,
  MEAL_HUNGER_RESTORED,
  MEAL_THOUGHT_TICKS,
  HUNGER_THRESHOLD,
  SLEEP_PER_TICK,
  SLEEP_RECOVERY_ON_GROUND_PER_TICK,
  SLEEP_RECOVERY_PER_TICK,
  SLEEP_THRESHOLD,
  SLEEP_WAKE_AT,
  STARVATION_DAMAGE_PER_TICK,
  STARVATION_WARNING_INTERVAL_TICKS,
} from './constants';
import type { SimContext } from './derived';
import { refreshNetworks } from './mana';
import { friendNearby } from './relationships';
import { MOOD_BREAK, MOOD_BREAK_TICKS, moodOf, thoughtsOf } from './mood';
import type { ThoughtKey } from './mood';
import { advanceTowards } from './movement';
import { mulberry32 } from './rng';
import { NIGHT_WAKE_HUNGER, isNight, sleepThresholdMultiplier } from './daynight';
import { addLog, removeItem, tileIdOf, updateColonist, updateItem } from './state';
import { findNearestItem } from './storage';
import { traitMultiplier } from './traits';
import type { Colonist, GameState, LogKey } from './types';
import {
  NEED_EAT_JOB_ID,
  NEED_SLEEP_JOB_ID,
  isReserved,
  releaseByJob,
  reserveAll,
} from './jobs/reservations';
import { depositCarried, killColonist } from './death';
import { failJob } from './jobs/execute';

export function runNeeds(state: GameState, ctx: SimContext): void {
  for (const colonistId in state.colonists) {
    decayNeeds(state, colonistId);
    if (!state.colonists[colonistId]) continue; // starved to death this tick
    startNeedBehaviour(state, ctx, colonistId);
    runMoodBreak(state, ctx, colonistId);
    runNeedBehaviour(state, ctx, colonistId);
  }
}

/**
 * The dresser's whole effect (design-phase10-ores.md 4.2): a finished dresser
 * within DRESSER_RADIUS of the bed multiplies sleep recovery. It multiplies
 * *with* traits - the same slot heavySleeper's 1.35 lives in - and the first
 * dresser found is the only one that counts: the check returns on a hit, so a
 * wall of wardrobes is worth exactly one.
 */
function dresserMultiplier(state: GameState, bedId: string): number {
  const bed = state.buildings[bedId];
  const at = bed ? state.tiles[bed.tileId] : undefined;
  if (!at) return 1;
  for (const id in state.buildings) {
    const building = state.buildings[id];
    if (building.type !== 'dresser' || building.isBlueprint) continue;
    const tile = state.tiles[building.tileId];
    if (
      tile &&
      Math.max(Math.abs(tile.x - at.x), Math.abs(tile.y - at.y)) <= DRESSER_RADIUS
    ) {
      return DRESSER_REST_MULTIPLIER;
    }
  }
  return 1;
}

function decayNeeds(state: GameState, colonistId: string): void {
  const colonist = state.colonists[colonistId];
  const activity = colonist.activity;
  const sleeping = activity.kind === 'sleeping';
  // a bed is the difference between a night's rest and a doze on the floor
  const bedId = activity.kind === 'sleeping' ? activity.bedId : null;
  const recovery =
    (bedId !== null
      ? SLEEP_RECOVERY_PER_TICK * dresserMultiplier(state, bedId)
      : SLEEP_RECOVERY_ON_GROUND_PER_TICK) * traitMultiplier(colonist, 'rest');
  const hunger = Math.min(
    100,
    colonist.needs.hunger + HUNGER_PER_TICK * traitMultiplier(colonist, 'hunger'),
  );
  const sleep = sleeping
    ? Math.max(0, colonist.needs.sleep - recovery)
    : Math.min(100, colonist.needs.sleep + SLEEP_PER_TICK * traitMultiplier(colonist, 'sleep'));
  // Time off is the one need that does not build while they are asleep. Sleep
  // is not rest from the day, it is sleep; conflating them would let a colony
  // with beds ignore the hearth entirely.
  const relaxing = activity.kind === 'relaxing';
  const recreation = relaxing
    ? Math.max(0, (colonist.needs.recreation ?? 0) - recreationGain(state, colonist))
    : sleeping
      ? (colonist.needs.recreation ?? 0)
      : Math.min(100, (colonist.needs.recreation ?? 0) + RECREATION_PER_TICK);
  updateColonist(state, colonistId, { needs: { hunger, sleep, recreation } });

  // A full hunger bar used to be the end of it, which made food optional. Now
  // it is where the damage starts - the same shape as a starving animal.
  if (hunger < 100) return;
  const health = colonist.health - STARVATION_DAMAGE_PER_TICK;
  if (health <= 0) {
    killColonist(state, colonistId, { key: 'colonistStarvedToDeath' });
    return;
  }
  updateColonist(state, colonistId, { health });
  if (state.tick % STARVATION_WARNING_INTERVAL_TICKS === 0) {
    addLog(state, 'colonistStarving', { name: colonist.name });
  }
}

/**
 * What one tick of time off is worth.
 *
 * A hearth is the whole point of the building; sitting on the bare ground with
 * nothing to look at gives less than half as much, and an armchair (フェーズ10)
 * beats the hearth's baseline - a chair built for exactly one thing. Company is
 * worth as much again in every case - the need is met by other people, which is
 * why it waited for the colonists to know each other.
 *
 * The seat is looked up rather than trusted: a chair that was dismantled under
 * them stops paying its rate the same tick, instead of a stale id keeping the
 * hearth bonus alive.
 */
function recreationGain(state: GameState, colonist: Colonist): number {
  const activity = colonist.activity;
  const seat =
    activity.kind === 'relaxing' && activity.hearthId !== null
      ? state.buildings[activity.hearthId]
      : undefined;
  let gain = RECREATION_RESTORED_PER_TICK;
  if (!seat || seat.isBlueprint) gain *= RECREATION_ALONE_MULTIPLIER;
  else if (seat.type === 'armchair') gain *= ARMCHAIR_RECREATION_MULTIPLIER;
  if (friendNearby(state, colonist)) gain *= 1.5;
  return gain;
}

/**
 * The nearest place worth relaxing at - a hearth or an armchair (フェーズ10),
 * whichever is closer. Both are shared, so no reservation; nearest rather than
 * best because time off that starts with a hike across the map is not time off.
 */
function findRelaxSpot(state: GameState, colonist: Colonist): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const buildingId in state.buildings) {
    const building = state.buildings[buildingId];
    if ((building.type !== 'hearth' && building.type !== 'armchair') || building.isBlueprint) {
      continue;
    }
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

/** Interrupt work when a need crosses its threshold. */
function startNeedBehaviour(state: GameState, ctx: SimContext, colonistId: string): void {
  const colonist = state.colonists[colonistId];
  // a player move order is interruptible; eating and sleeping are not, and
  // neither is running from a predator - lying down to sleep with a wolf on your
  // heels is how a colony loses people (docs/design-phase2.5-animals.md 5)
  if (
    colonist.activity.kind === 'eating' ||
    colonist.activity.kind === 'sleeping' ||
    colonist.activity.kind === 'fleeing'
  ) {
    return;
  }

  const wantsFood = colonist.needs.hunger >= HUNGER_THRESHOLD;
  // the clock's pull (docs/design-phase7-time.md 3.4): the same threshold,
  // lower at night and higher in daylight - never forced either way
  const wantsSleep = colonist.needs.sleep >= SLEEP_THRESHOLD * sleepThresholdMultiplier(state.tick);
  const wantsRest = (colonist.needs.recreation ?? 0) >= RECREATION_THRESHOLD;

  // Time off yields to both of the older needs: nobody sits at the fire while
  // starving, and this is the need a colony can afford to postpone.
  if (!wantsFood && !wantsSleep && wantsRest) {
    releaseCurrentJob(state, ctx, colonistId);
    updateColonist(state, colonistId, {
      activity: {
        kind: 'relaxing',
        // the field is `hearthId` whatever they sit at - see the type's note
        // on why the name outlived the hearth's monopoly
        hearthId: findRelaxSpot(state, colonist),
        untilTick: state.tick + RELAX_TICKS,
      },
    });
    return;
  }
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
        addLog(state, 'colonistCannotFindFood', { name: colonist.name });
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
  failJob(state, ctx, jobId, colonistId, 'interrupted');
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

/**
 * A colonist who has run out of patience puts their tools down.
 *
 * This sits with the needs rather than the job system for the same reason
 * eating does: it is not work the player can prioritise, and it has to be able
 * to pre-empt a job. Hunger and sleep still win over it - a starving colonist
 * goes to the larder rather than sulking to death - because those branches run
 * first and this one only touches an idle colonist.
 */
function isBreak(kind: string): boolean {
  return kind === 'brooding' || kind === 'wandering' || kind === 'binge';
}

/**
 * Which way a break shows.
 *
 * Chosen by what actually went wrong, not by a die roll: the player should be
 * able to look at what a colonist is doing and work backwards to the reason.
 * Somebody who has been walked into the ground walks off; somebody who has been
 * hungry raids the larder; everyone else stands and broods. A random pick would
 * have made three animations out of one event.
 */
function breakKind(worst: ThoughtKey | undefined): 'brooding' | 'wandering' | 'binge' {
  if (!worst) return 'brooding';
  if (worst === 'hungry' || worst === 'starving') return 'binge';
  if (
    worst === 'tired' ||
    worst === 'exhausted' ||
    worst === 'knowsNobody' ||
    worst === 'grieving'
  ) {
    return 'wandering';
  }
  return 'brooding';
}

const BREAK_LOG: Record<'brooding' | 'wandering' | 'binge', LogKey> = {
  brooding: 'breakBrooding',
  wandering: 'breakWandering',
  binge: 'breakBinge',
};

function runMoodBreak(state: GameState, ctx: SimContext, colonistId: string): void {
  const colonist = state.colonists[colonistId];
  if (isBreak(colonist.activity.kind)) {
    runBreak(state, colonistId);
    return;
  }
  if (colonist.activity.kind !== 'none' && colonist.activity.kind !== 'moving') return;
  const networks = refreshNetworks(ctx, state);
  if (moodOf(state, colonist, networks) >= MOOD_BREAK) return;

  releaseCurrentJob(state, ctx, colonistId);
  const worst = thoughtsOf(state, colonist, networks)[0];
  const kind = breakKind(worst?.key);
  const untilTick = state.tick + MOOD_BREAK_TICKS;
  updateColonist(state, colonistId, {
    activity:
      kind === 'binge'
        ? { kind: 'binge', untilTick, eaten: 0 }
        : kind === 'wandering'
          ? { kind: 'wandering', untilTick }
          : { kind: 'brooding', untilTick },
  });
  addLog(
    state,
    BREAK_LOG[kind],
    worst ? { name: colonist.name, thought: worst.key } : { name: colonist.name },
    'incident',
  );
}

/**
 * A break in progress. It outlasts whatever set it off - ending the moment mood
 * ticks back over the line would let one meal cancel the whole thing, and the
 * player would never see that anything had happened.
 */
function runBreak(state: GameState, colonistId: string): void {
  const colonist = state.colonists[colonistId];
  const activity = colonist.activity;
  if (!isBreak(activity.kind)) return;
  const untilTick = (activity as { untilTick: number }).untilTick;

  if (state.tick >= untilTick) {
    updateColonist(state, colonistId, { activity: { kind: 'none' } });
    addLog(state, 'backToWork', { name: colonist.name });
    return;
  }

  if (activity.kind === 'wandering') {
    // one step, anywhere walkable. No path, no destination - that is the point
    const rnd = mulberry32(state.tick * 31 + colonistId.length * 7919);
    const [dx, dy] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ][Math.floor(rnd() * 4)];
    const target = state.tiles[tileIdOf(colonist.position.x + dx, colonist.position.y + dy)];
    if (target && target.walkable && state.tick % TICKS_PER_STEP === 0) {
      updateColonist(state, colonistId, { position: { x: target.x, y: target.y } });
    }
    return;
  }

  if (activity.kind === 'binge') {
    if (state.tick % EAT_TICKS !== 0) return;
    const meal = findNearestItem(state, 'food', colonist.position, {
      preferStorage: true,
      minQuantity: 1,
    });
    if (!meal) return;
    const eaten = Math.min(FOOD_PER_MEAL, meal.quantity);
    if (meal.quantity - eaten <= 0) removeItem(state, meal.id);
    else updateItem(state, meal.id, { quantity: meal.quantity - eaten });
    const needs = state.colonists[colonistId].needs;
    // a binge burns through meals at raw value: wolfing the larder down is
    // not what the cook had in mind, so no glow either
    updateColonist(state, colonistId, {
      needs: { ...needs, hunger: Math.max(0, needs.hunger - HUNGER_RESTORED_PER_MEAL) },
      activity: { ...activity, eaten: activity.eaten + eaten },
    });
  }
}

function runNeedBehaviour(state: GameState, ctx: SimContext, colonistId: string): void {
  const colonist = state.colonists[colonistId];
  if (colonist.activity.kind === 'eating') {
    runEating(state, ctx, colonistId);
  } else if (colonist.activity.kind === 'sleeping') {
    runSleeping(state, ctx, colonistId);
  } else if (colonist.activity.kind === 'relaxing') {
    runRelaxing(state, ctx, colonistId);
  }
}

function runRelaxing(state: GameState, ctx: SimContext, colonistId: string): void {
  const colonist = state.colonists[colonistId];
  const activity = colonist.activity;
  if (activity.kind !== 'relaxing') return;

  if (activity.hearthId) {
    const hearth = state.buildings[activity.hearthId];
    if (hearth) {
      const tile = state.tiles[hearth.tileId];
      const move = advanceTowards(state, ctx, colonistId, { x: tile.x, y: tile.y }, false);
      // the fire went out from under them, or they cannot get to it: sitting
      // down where they are is worse but it is not nothing
      if (move === 'blocked') {
        updateColonist(state, colonistId, { activity: { ...activity, hearthId: null } });
      }
      if (move !== 'arrived') return;
    }
  }

  if (state.tick >= activity.untilTick || (colonist.needs.recreation ?? 0) <= 0) {
    endActivity(state, colonistId);
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
  const cooked = item.variant === 'meal';
  if (item.quantity - eaten <= 0) removeItem(state, item.id);
  else
    updateItem(state, item.id, {
      quantity: item.quantity - eaten,
      reservedByJobId: null,
    });

  // a cooked meal restores more and leaves a glow (design-next 提案3)
  const perMeal = cooked ? MEAL_HUNGER_RESTORED : HUNGER_RESTORED_PER_MEAL;
  const restored = (eaten / FOOD_PER_MEAL) * perMeal;
  const needs = state.colonists[colonistId].needs;
  updateColonist(state, colonistId, {
    needs: { ...needs, hunger: Math.max(0, needs.hunger - restored) },
    ...(cooked ? { mealUntilTick: state.tick + MEAL_THOUGHT_TICKS } : {}),
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

  // Real hunger interrupts even sleep: without this, a colonist who went to
  // bed with a high bar could cross 100 mid-drain and take starvation damage
  // in their bed (survival2 caught exactly this once night sleep grew longer).
  if (colonist.needs.hunger >= NIGHT_WAKE_HUNGER) {
    releaseByJob(state, NEED_SLEEP_JOB_ID);
    endActivity(state, colonistId);
    return;
  }

  if (colonist.needs.sleep <= SLEEP_WAKE_AT) {
    // Night sleep runs to dawn (docs/design-phase7-time.md 3.4 実装メモ):
    // measured, the threshold multiplier alone leaves the ~21-hour sleep cycle
    // drifting across the clock and only half the nights land right. Somebody
    // rested at 2am staying in bed until first light is the missing anchor -
    // and hunger still wakes them, so nobody starves politely in bed.
    if (isNight(state.tick) && colonist.needs.hunger < NIGHT_WAKE_HUNGER) return;
    releaseByJob(state, NEED_SLEEP_JOB_ID);
    endActivity(state, colonistId);
  }
}

function endActivity(state: GameState, colonistId: string): void {
  updateColonist(state, colonistId, { activity: { kind: 'none' } });
}
