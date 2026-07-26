// The tick pipeline (sections 3 and 5).
//
// `tickOnce` is a pure-ish function of (GameState, SimContext) -> GameState: it
// never touches the DOM, PixiJS or React, which is what makes the headless tests
// in src/core/*.test.ts possible. SimContext holds only derived caches
// (section 7) that are rebuilt rather than saved.
import { CROP_GROWTH_PER_TICK } from './constants';
import { rebuildRegions } from './derived';
import type { SimContext } from './derived';
import { runAssignment } from './jobs/assign';
import { runExecution } from './jobs/execute';
import { runJobGenerator } from './jobs/generator';
import { advanceTowards } from './movement';
import { runNeeds } from './needs';
import { beginTick, updateBuilding, updateColonist } from './state';
import type { GameState } from './types';

export function tickOnce(state: GameState, ctx: SimContext): GameState {
  const next = beginTick(state);
  next.tick = state.tick + 1;

  if (ctx.regionsDirty) rebuildRegions(ctx, next);

  growCrops(next);
  // needs run first so an interrupted job is back in the queue before the
  // generator and the candidate filter look at it this same tick
  runNeeds(next, ctx);
  runMoveOrders(next, ctx);
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
  for (const buildingId in state.buildings) {
    const building = state.buildings[buildingId];
    if (building.type !== 'farmPlot' || building.isBlueprint) continue;
    if (!building.sown || building.growth >= 1) continue;
    updateBuilding(state, buildingId, {
      growth: Math.min(1, building.growth + CROP_GROWTH_PER_TICK),
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
