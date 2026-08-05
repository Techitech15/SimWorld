// Two things food and stone were missing.
//
// A full hunger bar used to be the end of the matter, so a colony with no food
// at all just carried on working; and stone could be mined but never spent on
// anything, which made half the map decorative.
import { describe, expect, it } from 'vitest';
import { placeBuildingBlueprint, setDesignation } from './actions';
import { BUILDING_COSTS, COLONIST_MAX_HEALTH, TICKS_PER_DAY } from './constants';
import { tileIdOf } from './state';
import { createHarness, nearestTilesWithTerrain } from './testUtils';
import type { GameState } from './types';

function stripAllFood(state: GameState): void {
  for (const id of Object.keys(state.items)) {
    if (state.items[id].type !== 'food') continue;
    const item = state.items[id];
    const tile = state.tiles[tileIdOf(item.position.x, item.position.y)];
    state.tiles[tile.id] = { ...tile, itemIds: tile.itemIds.filter((i) => i !== id) };
    const { [id]: _removed, ...rest } = state.items;
    state.items = rest;
  }
  // and no farms, so none can grow back
  for (const id of Object.keys(state.buildings)) {
    if (state.buildings[id].type !== 'farmPlot') continue;
    const building = state.buildings[id];
    const tile = state.tiles[building.tileId];
    state.tiles[tile.id] = { ...tile, buildingId: null };
    const { [id]: _removed, ...rest } = state.buildings;
    state.buildings = rest;
  }
}

describe('starvation', () => {
  it('costs health once the hunger bar is full, and eventually kills', () => {
    const harness = createHarness(503);
    stripAllFood(harness.state);
    harness.state.animals = {}; // no hunting, no wolves: this is about food alone

    let lowestHealth = COLONIST_MAX_HEALTH;
    harness.run(TICKS_PER_DAY * 2, (state) => {
      state.animals = {};
      for (const id in state.colonists) {
        lowestHealth = Math.min(lowestHealth, state.colonists[id].health);
      }
    });

    expect(lowestHealth).toBeLessThan(COLONIST_MAX_HEALTH);
    expect(harness.state.log.some((entry) => entry.message.includes('is starving'))).toBe(true);

    // and it does not stall halfway: keep going and the colony is gone
    harness.run(TICKS_PER_DAY * 4, (state) => {
      state.animals = {};
    });
    expect(Object.keys(harness.state.colonists)).toHaveLength(0);
    expect(harness.state.log.some((entry) => entry.message.includes('starved to death'))).toBe(
      true,
    );
  });

  it('never triggers in a colony that can feed itself', () => {
    // health is not the assertion here: a wolf bite would fail that for reasons
    // that have nothing to do with food. What must hold is that a working farm
    // keeps everyone off the starvation threshold entirely.
    const harness = createHarness(509);
    let peakHunger = 0;
    harness.run(TICKS_PER_DAY * 2, (state) => {
      for (const id in state.colonists) {
        peakHunger = Math.max(peakHunger, state.colonists[id].needs.hunger);
      }
    });
    expect(peakHunger).toBeLessThan(100);
    expect(harness.state.log.some((entry) => entry.message.includes('is starving'))).toBe(false);
    expect(Object.keys(harness.state.colonists)).toHaveLength(3);
  });
});

describe('stone construction', () => {
  it('spends mined stone on a stone wall that blocks movement', () => {
    const harness = createHarness(521);
    const centre = Object.values(harness.state.colonists)[0].position;
    harness.state = setDesignation(
      harness.state,
      nearestTilesWithTerrain(harness.state, 'stone', centre, 6),
      'mine',
    );
    // mine first so there is stone in the colony to build with
    let stone = 0;
    for (let i = 0; i < 6000 && stone < 20; i++) {
      harness.run(1);
      stone = Object.values(harness.state.items)
        .filter((item) => item.type === 'stone')
        .reduce((sum, item) => sum + item.quantity, 0);
    }
    expect(stone).toBeGreaterThanOrEqual(20);

    const tileId = tileIdOf(centre.x + 2, centre.y - 6);
    harness.state = placeBuildingBlueprint(harness.state, 'stoneWall', [tileId]);
    const cost = BUILDING_COSTS.stoneWall.find((c) => c.type === 'stone')!.quantity;
    expect(cost).toBeGreaterThan(0);

    let finished = false;
    for (let i = 0; i < 8000 && !finished; i++) {
      harness.run(1);
      const buildingId = harness.state.tiles[tileId].buildingId;
      finished = !!buildingId && !harness.state.buildings[buildingId].isBlueprint;
    }
    expect(finished).toBe(true);
    expect(harness.state.tiles[tileId].walkable).toBe(false);
    const built = harness.state.buildings[harness.state.tiles[tileId].buildingId!];
    expect(built.type).toBe('stoneWall');
    expect(built.hpMax).toBeGreaterThan(120); // tougher than the wooden one
  });
});
