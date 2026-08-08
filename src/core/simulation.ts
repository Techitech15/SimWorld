// The tick pipeline (sections 3 and 5).
//
// `tickOnce` is a pure-ish function of (GameState, SimContext) -> GameState: it
// never touches the DOM, PixiJS or React, which is what makes the headless tests
// in src/core/*.test.ts possible. SimContext holds only derived caches
// (section 7) that are rebuilt rather than saved.
import { fleeStep, healColonists, nearestPredator, runAnimals } from './animals';
import { runArrivals } from './arrivals';
import { runIncidents } from './events';
import { runMana } from './mana';
import { runRelationships } from './relationships';
import { regrowForest } from './regrowth';
import {
  BERRY_REGROW_PER_TICK,
  CROP_GROWTH_PER_TICK,
  FLEE_DURATION_TICKS,
  FLEE_TRIGGER_DISTANCE,
  TICKS_PER_STEP,
} from './constants';
import { invalidateTile, rebuildRegions } from './derived';
import { CROP_GROWTH_BY_SEASON, SEASON_LABEL, isSeasonBoundary, seasonOf } from './season';
import type { SimContext } from './derived';
import { runAssignment } from './jobs/assign';
import { runExecution } from './jobs/execute';
import { runJobGenerator } from './jobs/generator';
import { advanceTowards } from './movement';
import { runNeeds } from './needs';
import { addLog, beginTick, updateBuilding, updateColonist } from './state';
import type { GameState } from './types';

export function tickOnce(state: GameState, ctx: SimContext): GameState {
  const next = beginTick(state);
  next.tick = state.tick + 1;

  if (ctx.regionsDirty) rebuildRegions(ctx, next);

  if (isSeasonBoundary(next.tick)) {
    addLog(next, `${SEASON_LABEL[seasonOf(next.tick)]} has arrived`);
  }
  growCrops(next);
  regrowForest(next);
  runIncidents(next);
  runArrivals(next);
  // needs run first so an interrupted job is back in the queue before the
  // generator and the candidate filter look at it this same tick
  runNeeds(next, ctx);
  runMoveOrders(next, ctx);
  // bonds grow from time spent near each other, so this reads positions after
  // everyone has moved for the tick rather than before
  runRelationships(next);
  // the ecology runs before job assignment so a colonist never gets handed work
  // in the same tick a predator sent them running
  runAnimals(next, ctx);
  runFleeing(next);
  healColonists(next);
  // the mana layer runs before work is handed out, so a furnace that burned out
  // this tick is already asking for fuel when the generator looks
  for (const tileId of runMana(next, ctx)) invalidateTile(ctx, next, tileId);
  runJobGenerator(next);
  runAssignment(next, ctx);
  runExecution(next, ctx);
  cleanupJobs(next);

  return next;
}

/** Advance `count` ticks, used by the 3x speed setting and by tests. */
export function tickMany(state: GameState, ctx: SimContext, count: number): GameState {
  let current = state;
  for (let i = 0; i < count; i++) current = tickOnce(current, ctx);
  return current;
}

/**
 * A colonist under attack runs, and keeps running until the timer expires or
 * the predator is gone. They never fight back (docs/design-animals.md 5).
 */
function runFleeing(state: GameState): void {
  for (const colonistId in state.colonists) {
    const colonist = state.colonists[colonistId];
    if (colonist.activity.kind !== 'fleeing') continue;
    const threat = state.animals[colonist.activity.fromAnimalId];
    if (!threat) {
      updateColonist(state, colonistId, { activity: { kind: 'none' } });
      continue;
    }
    // The timer only starts running down once the predator is no longer on top
    // of them. Otherwise the colonist calmly goes back to work after 120 ticks,
    // takes another bite, and the wolf eventually wins by attrition.
    if (nearestPredator(state, colonist.position, FLEE_TRIGGER_DISTANCE)) {
      updateColonist(state, colonistId, {
        activity: { ...colonist.activity, untilTick: state.tick + FLEE_DURATION_TICKS },
      });
    } else if (state.tick >= colonist.activity.untilTick) {
      updateColonist(state, colonistId, { activity: { kind: 'none' } });
      continue;
    }
    if (state.tick % TICKS_PER_STEP !== 0) continue;

    const step = fleeStep(state, colonist.position, threat.position);
    if (!step) continue;
    updateColonist(state, colonistId, {
      position: step,
      path: null,
      pathTargetTileId: null,
    });
  }
}

/** Player-issued move orders (section 10, week 3): walk there, then go idle. */
function runMoveOrders(state: GameState, ctx: SimContext): void {
  for (const colonistId in state.colonists) {
    const colonist = state.colonists[colonistId];
    if (colonist.activity.kind !== 'moving') continue;
    const tile = state.tiles[colonist.activity.targetTileId];
    if (!tile || !tile.walkable) {
      updateColonist(state, colonistId, { activity: { kind: 'none' } });
      continue;
    }
    const result = advanceTowards(state, ctx, colonistId, { x: tile.x, y: tile.y }, false);
    if (result === 'arrived' || result === 'blocked') {
      updateColonist(state, colonistId, { activity: { kind: 'none' } });
    }
  }
}

function growCrops(state: GameState): void {
  // nothing grows in winter, so the year has to be planned around it
  const rate = CROP_GROWTH_PER_TICK * CROP_GROWTH_BY_SEASON[seasonOf(state.tick)];
  if (rate <= 0) return;
  const berryRate = BERRY_REGROW_PER_TICK * CROP_GROWTH_BY_SEASON[seasonOf(state.tick)];
  for (const buildingId in state.buildings) {
    const building = state.buildings[buildingId];
    if (building.isBlueprint || building.growth >= 1) continue;
    // a bush needs no sowing: it just comes back, slower than a tended plot
    if (building.type === 'berryBush') {
      updateBuilding(state, buildingId, { growth: Math.min(1, building.growth + berryRate) });
      continue;
    }
    if (building.type !== 'farmPlot' || !building.sown) continue;
    updateBuilding(state, buildingId, {
      growth: Math.min(1, building.growth + rate),
    });
  }
}

/**
 * Stage 5: completed and cancelled jobs leave the queue immediately. A `failed`
 * job lingers as a tombstone so the generator does not immediately recreate the
 * work it just gave up on; it is purged once its cooldown expires, which lets a
 * genuinely unreachable target become workable again after the map changes.
 */
function cleanupJobs(state: GameState): void {
  let changed = false;
  const jobs: GameState['jobs'] = {};
  for (const id in state.jobs) {
    const job = state.jobs[id];
    if (job.state === 'completed' || job.state === 'cancelled') {
      changed = true;
      continue;
    }
    if (
      job.state === 'failed' &&
      job.cooldownUntilTick !== null &&
      state.tick >= job.cooldownUntilTick
    ) {
      changed = true;
      continue;
    }
    jobs[id] = job;
  }
  if (changed) state.jobs = jobs;
}
