// Wild berries: the food a colony can get before it has a farm running, and the
// reason to walk into the woods at all. A bush needs no sowing - it ripens on
// its own and can be picked whenever it is ready.
import { describe, expect, it } from 'vitest';
import {
  BERRY_BUSH_COUNT,
  BERRY_REGROW_PER_TICK,
  CROP_GROWTH_PER_TICK,
  FOOD_PER_BERRY_HARVEST,
  FOOD_PER_HARVEST,
  TICKS_PER_DAY,
} from './constants';
import { createSimContext } from './derived';
import { TICKS_PER_SEASON } from './season';
import { tickMany } from './simulation';
import { createHarness, testWorld } from './testUtils';

import type { GameState } from './types';

const bushes = (state: GameState) =>
  Object.values(state.buildings).filter((b) => b.type === 'berryBush');

describe('berry bushes', () => {
  it('are scattered through the woods, not the camp, at mixed ripeness', () => {
    const state = testWorld({ seed: 2001 });
    const found = bushes(state);
    expect(found.length).toBe(BERRY_BUSH_COUNT);

    const at = Object.values(state.colonists)[0].position;
    for (const bush of found) {
      const tile = state.tiles[bush.tileId];
      expect(tile.terrain).toBe('forest');
      expect(Math.abs(tile.x - at.x) + Math.abs(tile.y - at.y)).toBeGreaterThanOrEqual(5);
    }
    // not one big harvest on day one
    const ripe = found.filter((b) => b.growth >= 1).length;
    expect(ripe).toBeLessThan(found.length);
  });

  it('ripen on their own and get picked for food', () => {
    const harness = createHarness(2003);
    const before = Object.values(harness.state.items)
      .filter((item) => item.type === 'food')
      .reduce((sum, item) => sum + item.quantity, 0);

    harness.run(TICKS_PER_DAY * 2);

    expect(harness.state.log.length).toBeGreaterThanOrEqual(0);
    const after = Object.values(harness.state.items)
      .filter((item) => item.type === 'food')
      .reduce((sum, item) => sum + item.quantity, 0);
    expect(after).toBeGreaterThan(before);
    // a picked bush goes back to bare and starts again rather than vanishing
    expect(bushes(harness.state).length).toBe(BERRY_BUSH_COUNT);
    expect(bushes(harness.state).some((b) => b.growth < 1)).toBe(true);
  });

  it('feed a colony without rivalling its farm', () => {
    // The claim is that berries are early food, not a farm replacement. In
    // food per tick a bush is FOOD_PER_BERRY_HARVEST / its regrow time and a
    // plot is FOOD_PER_HARVEST / its growth time, so the whole wild supply has
    // to come out below the farm the colony starts with.
    const perBush = FOOD_PER_BERRY_HARVEST * BERRY_REGROW_PER_TICK;
    const perPlot = FOOD_PER_HARVEST * CROP_GROWTH_PER_TICK;
    expect(perBush).toBeLessThan(perPlot);

    const state = testWorld({ seed: 2017 });
    const plots = Object.values(state.buildings).filter((b) => b.type === 'farmPlot').length;
    const wild = bushes(state).length * perBush;
    const farmed = plots * perPlot;
    expect(wild).toBeLessThan(farmed);
    // and it is not negligible either, or there was no point adding them
    expect(wild).toBeGreaterThan(farmed * 0.2);
  });

  it('stop ripening in winter like everything else', () => {
    const state = testWorld({ seed: 2011 });
    state.tick = TICKS_PER_SEASON * 3;
    for (const id in state.buildings) {
      if (state.buildings[id].type === 'berryBush') {
        state.buildings[id] = { ...state.buildings[id], growth: 0.2 };
      }
    }
    const total = (s: GameState) =>
      bushes(s).reduce((sum, b) => sum + b.growth, 0);
    const before = total(state);
    const after = tickMany(state, createSimContext(state), 600);
    expect(total(after)).toBe(before);
  });
});
