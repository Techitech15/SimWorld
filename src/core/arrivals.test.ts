// Population growth is tied to the larder on purpose: a surplus buys hands, and
// the hands then eat. Nothing here is stored - the schedule comes from the tick
// and the condition from the stores.
import { describe, expect, it } from 'vitest';
import {
  ARRIVAL_FOOD_PER_COLONIST,
  ARRIVAL_INTERVAL_TICKS,
  ARRIVAL_MAX_COLONISTS,
} from './constants';
import { runArrivals } from './arrivals';
import { TICKS_PER_SEASON, seasonOf } from './season';
import { tileIdOf } from './state';
import { createHarness } from './testUtils';
import { addItem } from './worldgen';
import type { GameState } from './types';

function stockTo(state: GameState, total: number): void {
  for (const id of Object.keys(state.items)) {
    if (state.items[id].type !== 'food') continue;
    const { [id]: _removed, ...rest } = state.items;
    state.items = rest;
  }
  for (const tileId in state.tiles) {
    const tile = state.tiles[tileId];
    state.tiles[tileId] = {
      ...tile,
      itemIds: tile.itemIds.filter((i) => state.items[i] !== undefined),
    };
  }
  // spread the stacks over a patch wide enough for any amount the tests use,
  // and stay inside the map
  const at = Object.values(state.colonists)[0].position;
  let left = total;
  let step = 0;
  const width = 16;
  while (left > 0 && step < width * width) {
    const chunk = Math.min(70, left);
    const x = at.x - 8 + (step % width);
    const y = at.y - 8 + Math.floor(step / width);
    if (state.tiles[tileIdOf(x, y)]) {
      addItem(state, 'food', chunk, x, y);
      left -= chunk;
    }
    step++;
  }
}

describe('wanderers', () => {
  it('joins a colony with food to spare', () => {
    const harness = createHarness(1201);
    const before = Object.keys(harness.state.colonists).length;
    stockTo(harness.state, (before + 1) * ARRIVAL_FOOD_PER_COLONIST + 50);
    harness.state.tick = ARRIVAL_INTERVAL_TICKS;

    runArrivals(harness.state);
    expect(Object.keys(harness.state.colonists)).toHaveLength(before + 1);
    expect(harness.state.log.some((e) => e.key === 'colonistArrived')).toBe(true);
  });

  it('stays away from a colony that cannot feed itself', () => {
    const harness = createHarness(1203);
    const before = Object.keys(harness.state.colonists).length;
    stockTo(harness.state, 10);
    harness.state.tick = ARRIVAL_INTERVAL_TICKS;

    runArrivals(harness.state);
    expect(Object.keys(harness.state.colonists)).toHaveLength(before);
  });

  it('nobody arrives in winter, however full the store is', () => {
    const harness = createHarness(1217);
    const before = Object.keys(harness.state.colonists).length;
    stockTo(harness.state, 5000);
    harness.state.tick = TICKS_PER_SEASON * 3 + ARRIVAL_INTERVAL_TICKS;
    expect(seasonOf(harness.state.tick)).toBe('winter');
    runArrivals(harness.state);
    expect(Object.keys(harness.state.colonists)).toHaveLength(before);
  });

  it('only considers arriving on the interval', () => {
    const harness = createHarness(1207);
    const before = Object.keys(harness.state.colonists).length;
    stockTo(harness.state, 5000);
    harness.state.tick = ARRIVAL_INTERVAL_TICKS + 1;
    runArrivals(harness.state);
    expect(Object.keys(harness.state.colonists)).toHaveLength(before);
  });

  it('stops at the population cap', () => {
    const harness = createHarness(1213);
    stockTo(harness.state, 10000);
    for (let i = 0; i < 20; i++) {
      harness.state.tick = ARRIVAL_INTERVAL_TICKS * (i + 1);
      runArrivals(harness.state);
    }
    expect(Object.keys(harness.state.colonists).length).toBe(ARRIVAL_MAX_COLONISTS);
    // and everyone has a distinct name and place to stand
    const names = new Set(Object.values(harness.state.colonists).map((c) => c.name));
    const spots = new Set(
      Object.values(harness.state.colonists).map((c) => `${c.position.x},${c.position.y}`),
    );
    expect(names.size).toBe(ARRIVAL_MAX_COLONISTS);
    expect(spots.size).toBe(ARRIVAL_MAX_COLONISTS);
  });
});
