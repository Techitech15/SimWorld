// The workbench and cooking (design-next 提案3): the entrance to second-stage
// goods. The acceptance conditions, straight from the proposal: raw and cooked
// food both find storage (variants never merge), a cooked meal actually feeds
// and cheers better than a raw one, tearing the bench down strands no jobs or
// reservations, and items from before `variant` existed read as raw untouched.
import { describe, expect, it } from 'vitest';
import { setDesignation } from './actions';
import {
  CRAFT_FOOD_RESERVE,
  CRAFT_MEAL_INPUT,
  CRAFT_MEAL_OUTPUT,
  FOOD_PER_MEAL,
  HUNGER_RESTORED_PER_MEAL,
  MEAL_HUNGER_RESTORED,
  MEAL_THOUGHT_BONUS,
  STACK_MAX,
} from './constants';
import { thoughtsOf } from './mood';
import { freeCapacity } from './storage';
import { tileIdOf } from './state';
import { createHarness, idleColony } from './testUtils';
import { addBuilding, addItem } from './worldgen';
import type { GameState } from './types';

/** One idle cook next to a bench, with everything else switched off. */
function withBench(seed: number) {
  const harness = createHarness(seed);
  idleColony(harness.state);
  const id = Object.keys(harness.state.colonists)[0];
  const at = harness.state.colonists[id].position;
  harness.state.colonists[id] = {
    ...harness.state.colonists[id],
    needs: { hunger: 0, sleep: 10, recreation: 0 },
    health: 100,
    traits: [],
    workPriorities: {
      ...harness.state.colonists[id].workPriorities,
      craft: 1,
      haul: 1,
      // the teardown test marks the bench for deconstruction, which is build work
      build: 1,
    },
  };
  const tileId = tileIdOf(at.x + 2, at.y);
  const bench = addBuilding(harness.state, 'workbench', tileId);
  harness.state.tiles[tileId] = { ...harness.state.tiles[tileId], walkable: false };
  return { harness, id, benchId: bench.id };
}

function mealCount(state: GameState): number {
  let total = 0;
  for (const id in state.items) {
    const item = state.items[id];
    if (item.type === 'food' && item.variant === 'meal') total += item.quantity;
  }
  return total;
}

function rawCount(state: GameState): number {
  let total = 0;
  for (const id in state.items) {
    const item = state.items[id];
    if (item.type === 'food' && !item.variant) total += item.quantity;
  }
  return total;
}

describe('cooking at the workbench', () => {
  it('turns a batch of raw food into meals, ten in and ten out', () => {
    const { harness } = withBench(14001);
    const before = rawCount(harness.state) + mealCount(harness.state);
    harness.run(3000);
    expect(mealCount(harness.state)).toBeGreaterThanOrEqual(CRAFT_MEAL_OUTPUT);
    // cooking upgrades food, it never creates any - the total only moves down,
    // by what the colonists ate over the day
    const after = rawCount(harness.state) + mealCount(harness.state);
    expect(after).toBeLessThanOrEqual(before);
  });

  it('keeps the reserve out of the pot', () => {
    const { harness } = withBench(14003);
    // strip the larder down to less than input + reserve
    for (const id of Object.keys(harness.state.items)) {
      const item = harness.state.items[id];
      if (item.type !== 'food') continue;
      harness.state.items[id] = { ...item, quantity: 0 };
    }
    const at = harness.state.colonists[Object.keys(harness.state.colonists)[0]].position;
    addItem(harness.state, 'food', CRAFT_MEAL_INPUT + CRAFT_FOOD_RESERVE - 1, at.x + 1, at.y);
    harness.run(1500);
    expect(mealCount(harness.state)).toBe(0);
  });

  it('never merges meals into a raw stack, in stacking or in storage maths', () => {
    const harness = createHarness(14005);
    const spot = Object.values(harness.state.colonists)[0].position;
    const raw = addItem(harness.state, 'food', 10, spot.x + 3, spot.y + 3);
    const meal = addItem(harness.state, 'food', 10, spot.x + 3, spot.y + 3, 'meal');
    expect(raw.id).not.toBe(meal.id);
    expect(harness.state.items[raw.id].variant).toBeUndefined();
    expect(harness.state.items[meal.id].variant).toBe('meal');

    // capacity questions are per variant: a tile full of raw has no room for
    // meals, so the hauler is sent somewhere else instead of overstacking
    const tileId = tileIdOf(spot.x + 3, spot.y + 3);
    expect(freeCapacity(harness.state, tileId, 'food')).toBe(STACK_MAX - 10);
    expect(freeCapacity(harness.state, tileId, 'food', 'meal')).toBe(STACK_MAX - 10);
    addItem(harness.state, 'food', STACK_MAX - 10, spot.x + 3, spot.y + 3);
    expect(freeCapacity(harness.state, tileId, 'food')).toBe(0);
  });

  it('feeds and cheers better than the same quantity raw', () => {
    // two identical colonists, one meal each - one cooked, one raw
    const harness = createHarness(14007);
    idleColony(harness.state);
    const [a, b] = Object.keys(harness.state.colonists);
    for (const id of [a, b]) {
      harness.state.colonists[id] = {
        ...harness.state.colonists[id],
        needs: { hunger: 96, sleep: 0, recreation: 50 },
        health: 100,
        traits: [], // no appetite or decay multipliers muddying the comparison
      };
    }
    // strip the map's own food so each eats exactly the stack put beside them
    for (const id of Object.keys(harness.state.items)) {
      const item = harness.state.items[id];
      if (item.type === 'food') harness.state.items[id] = { ...item, quantity: 0 };
    }
    const posA = harness.state.colonists[a].position;
    const posB = harness.state.colonists[b].position;
    addItem(harness.state, 'food', FOOD_PER_MEAL, posA.x, posA.y, 'meal');
    addItem(harness.state, 'food', FOOD_PER_MEAL, posB.x, posB.y);
    harness.run(200);

    const hungerA = harness.state.colonists[a].needs.hunger;
    const hungerB = harness.state.colonists[b].needs.hunger;
    expect(hungerA).toBeLessThan(hungerB);
    expect(hungerB - hungerA).toBeCloseTo(MEAL_HUNGER_RESTORED - HUNGER_RESTORED_PER_MEAL, 0);

    const thoughtsA = thoughtsOf(harness.state, harness.state.colonists[a]);
    const thoughtsB = thoughtsOf(harness.state, harness.state.colonists[b]);
    const glow = thoughtsA.find((t) => t.key === 'decentMeal');
    expect(glow?.amount).toBe(MEAL_THOUGHT_BONUS);
    expect(thoughtsB.some((t) => t.key === 'decentMeal')).toBe(false);
  });

  it('strands no jobs or reservations when the bench is torn down', () => {
    const { harness, benchId } = withBench(14009);
    // run just long enough for the batch to be asked for and hauled at
    harness.run(400);
    const benchTile = harness.state.buildings[benchId].tileId;
    harness.state = setDesignation(harness.state, [benchTile], 'deconstruct');
    harness.run(600);
    for (const id in harness.state.jobs) {
      const job = harness.state.jobs[id];
      if (job.state === 'completed' || job.state === 'cancelled' || job.state === 'failed') continue;
      expect(job.targetEntityId).not.toBe(benchId);
      expect(job.destinationId).not.toBe(benchId);
    }
    expect(harness.state.reservations[benchId]).toBeUndefined();
  });

  it('reads an item without a variant as raw food, untouched', () => {
    // the shape every save from before the field existed has
    const harness = createHarness(14011);
    const spot = Object.values(harness.state.colonists)[0].position;
    const item = addItem(harness.state, 'food', 5, spot.x + 4, spot.y);
    expect('variant' in harness.state.items[item.id]).toBe(false);
    const json = JSON.parse(JSON.stringify(harness.state)) as GameState;
    expect(json.items[item.id].variant).toBeUndefined();
    expect(rawCount(json)).toBeGreaterThan(0);
  });
});
