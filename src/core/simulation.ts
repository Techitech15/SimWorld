// The tick pipeline (sections 3 and 5).
//
// `tickOnce` is a pure-ish function of (GameState, SimContext) -> GameState: it
// never touches the DOM, PixiJS or React, which is what makes the headless tests
// in src/core/*.test.ts possible. SimContext holds only derived caches
// (section 7) that are rebuilt rather than saved.
import { fleeStep, healColonists, nearestPredator, runAnimals } from './animals';
import { runArrivals } from './arrivals';
import { runIncidents } from './events';
import { runMana, refreshNetworks } from './mana';
import { runTrade } from './trade';
import { runDefenders, runRaiders, runTurrets } from './raid';
import { runRelationships } from './relationships';
import { regrowForest } from './regrowth';
import {
  CROP_GROWTH_PER_TICK,
  FLEE_DURATION_TICKS,
  FLEE_TRIGGER_DISTANCE,
  TICKS_PER_STEP,
  WILD_PLANTS,
  WILD_PLANT_TYPES,
  wildPlantOf,
} from './constants';
import type { WildPlantType } from './constants';
import { invalidateTile, rebuildRegions } from './derived';
import {
  CROP_GROWTH_BY_SEASON,
  FROSTBLOOM_GROWTH_BY_SEASON,
  isSeasonBoundary,
  seasonOf,
} from './season';
import type { SimContext } from './derived';
import { runAssignment } from './jobs/assign';
import { runExecution } from './jobs/execute';
import { runJobGenerator } from './jobs/generator';
import { advanceTowards } from './movement';
import { runEquipment } from './equipment';
import { runNeeds } from './needs';
import { addLog, beginTick, updateBuilding, updateColonist } from './state';
import type { GameState } from './types';

export function tickOnce(state: GameState, ctx: SimContext): GameState {
  const next = beginTick(state);
  next.tick = state.tick + 1;

  if (ctx.regionsDirty) rebuildRegions(ctx, next);

  if (isSeasonBoundary(next.tick)) {
    addLog(next, 'seasonArrived', { season: seasonOf(next.tick) });
  }
  growCrops(next);
  regrowForest(next);
  runIncidents(next);
  runArrivals(next);
  // traders come and go on the same footing as arrivals: schedule from the
  // tick, conditions from the state, and no pathfinding at all
  runTrade(next, refreshNetworks(ctx, next));
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
  // Raiders move before the defenders answer, so a colonist swings at where the
  // raider is rather than where it was. Both run before job assignment: nobody
  // gets handed a hauling job in the tick a raider reached the storehouse.
  runRaiders(next, ctx);
  runDefenders(next, ctx);
  runTurrets(next, ctx);
  runFleeing(next);
  healColonists(next);
  // the mana layer runs before work is handed out, so a furnace that burned out
  // this tick is already asking for fuel when the generator looks
  for (const tileId of runMana(next, ctx)) invalidateTile(ctx, next, tileId);
  runJobGenerator(next);
  runAssignment(next, ctx);
  runExecution(next, ctx);
  // gear is claimed by whoever is *still* idle once work is handed out, so a
  // colonist never walks for a bow in the tick they were given a job (フェーズ8)
  runEquipment(next, ctx);
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
 * the predator is gone. They never fight back (docs/design-phase2.5-animals.md 5).
 */
function runFleeing(state: GameState): void {
  for (const colonistId in state.colonists) {
    const colonist = state.colonists[colonistId];
    if (colonist.activity.kind !== 'fleeing') continue;
    const threat =
      state.animals[colonist.activity.fromId] ?? state.raiders?.[colonist.activity.fromId];
    if (!threat) {
      updateColonist(state, colonistId, { activity: { kind: 'none' } });
      continue;
    }
    // The timer only starts running down once the predator is no longer on top
    // of them. Otherwise the colonist calmly goes back to work after 120 ticks,
    // takes another bite, and the wolf eventually wins by attrition.
    // a raider on top of them keeps the timer pinned exactly as a wolf does
    const pressed =
      nearestPredator(state, colonist.position, FLEE_TRIGGER_DISTANCE) ||
      Math.abs(threat.position.x - colonist.position.x) +
        Math.abs(threat.position.y - colonist.position.y) <=
        FLEE_TRIGGER_DISTANCE;
    if (pressed) {
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
  const season = seasonOf(state.tick);
  // nothing grows in winter, so the year has to be planned around it
  const rate = CROP_GROWTH_PER_TICK * CROP_GROWTH_BY_SEASON[season];
  // Each wild plant's rate, read off WILD_PLANTS rather than a per-type `if`
  // (フェーズ14 段階 H-1 4.3): frostbloom is the one that reads its table
  // upside down (11章 フェーズ5), so it is the only one whose rate can be
  // positive while `rate` above is zero - which is why the early return below
  // has to come after this, not before.
  const seasonMultiplier = { crop: CROP_GROWTH_BY_SEASON[season], frostbloomInverse: FROSTBLOOM_GROWTH_BY_SEASON[season] };
  const wildRate = {} as Record<WildPlantType, number>;
  let anyWildGrowing = false;
  for (const type of WILD_PLANT_TYPES) {
    const plant = WILD_PLANTS[type];
    const r = plant.regrowPerTick * seasonMultiplier[plant.seasonTable];
    wildRate[type] = r;
    if (r > 0) anyWildGrowing = true;
  }
  if (rate <= 0 && !anyWildGrowing) return;
  for (const buildingId in state.buildings) {
    const building = state.buildings[buildingId];
    if (building.isBlueprint || building.growth >= 1) continue;
    if (wildPlantOf(building.type)) {
      const r = wildRate[building.type as WildPlantType];
      if (r <= 0) continue;
      // a wild plant needs no sowing: it just comes back on its own
      updateBuilding(state, buildingId, { growth: Math.min(1, building.growth + r) });
      continue;
    }
    if (rate <= 0) continue;
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
