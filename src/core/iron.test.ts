// Iron: the second ore, and the proof that veins are now a table rather than
// an if (design-phase10-ores.md 段階A).
//
// Mana crystal was the precedent: a terrain, mined by the existing `mine` job,
// hauled by the existing chain. These tests hold iron to the same standard -
// and to one more: the yield branch both the mine job and the extractor read
// is VEIN_YIELD, so what these tests really pin down is that adding an ore is
// a row in a table, not a new mechanism.
import { describe, expect, it } from 'vitest';
import {
  CRYSTAL_PER_VEIN,
  IRON_PER_VEIN,
  RESOURCE_TYPES,
  STONE_PER_ROCK,
  VEIN_YIELD,
  veinYieldOf,
} from './constants';
import { setDesignation } from './actions';
import { isRock } from './state';
import { countStoredResource } from './storage';
import { createHarness, quarryTo, recordLogEntries, testWorld } from './testUtils';
import type { GameState, TileId } from './types';

function veins(state: GameState): TileId[] {
  return Object.values(state.tiles)
    .filter((tile) => tile.terrain === 'ironVein')
    .map((tile) => tile.id);
}

function crystals(state: GameState): number {
  return Object.values(state.tiles).filter((tile) => tile.terrain === 'crystal').length;
}

function itemsOf(state: GameState, type: string): number {
  let total = 0;
  for (const id in state.items) {
    if (state.items[id].type === type) total += state.items[id].quantity;
  }
  return total;
}

describe('the vein table', () => {
  it('is the one place that says what a rock face yields', () => {
    expect(veinYieldOf('stone')).toEqual({ resource: 'stone', quantity: STONE_PER_ROCK });
    expect(veinYieldOf('crystal')).toEqual({
      resource: 'manaCrystal',
      quantity: CRYSTAL_PER_VEIN,
    });
    expect(veinYieldOf('ironVein')).toEqual({ resource: 'iron', quantity: IRON_PER_VEIN });
    // plain rock is the fallback, not a row: a terrain the table has never
    // heard of yields stone rather than silently yielding nothing
    expect(VEIN_YIELD.stone).toBeUndefined();
  });

  it('keeps the ore order: stone > iron > crystal per face', () => {
    expect(IRON_PER_VEIN).toBeLessThan(STONE_PER_ROCK);
    expect(IRON_PER_VEIN).toBeGreaterThan(CRYSTAL_PER_VEIN);
  });
});

describe('where iron comes from', () => {
  it('puts veins on every world checked, and more of them than crystal overall', () => {
    // Measured properly across 200 seeds (design-notes.md): median 114 iron
    // tiles against 40 crystal, no iron-less world. This is the cheap
    // regression version of that measurement, not the measurement.
    let iron = 0;
    let crystal = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const state = testWorld({ seed });
      const count = veins(state).length;
      expect(count).toBeGreaterThan(0);
      iron += count;
      crystal += crystals(state);
    }
    expect(iron).toBeGreaterThan(crystal);
  });

  it('is solid ground: an iron vein blocks movement exactly like stone', () => {
    const state = testWorld({ seed: 37 });
    for (const id of veins(state)) expect(state.tiles[id].walkable).toBe(false);
    expect(isRock('ironVein')).toBe(true);
  });
});

describe('cutting an iron vein open', () => {
  it('takes the mine designation, the mine job and nothing new', () => {
    const harness = createHarness(41);
    const vein = veins(harness.state)[0];
    expect(vein).toBeTruthy();

    harness.state = setDesignation(harness.state, [vein], 'mine');
    expect(harness.state.tiles[vein].designation).toBe('mine');

    harness.run(1);
    const job = Object.values(harness.state.jobs).find((j) => j.targetTileId === vein);
    expect(job?.type).toBe('mine');
    expect(job?.workType).toBe('mine'); // the mining column, not a new one
  });

  it('yields iron rather than stone, and says which ore in the log', () => {
    const harness = createHarness(43);
    const vein = veins(harness.state)[0];
    const quarry = quarryTo(harness.state, vein, 'ironVein');
    harness.state = setDesignation(harness.state, quarry.tiles, 'mine');

    const entries = recordLogEntries(harness, 6000);
    expect(itemsOf(harness.state, 'iron')).toBe(quarry.veins * IRON_PER_VEIN);
    expect(harness.state.tiles[vein].terrain).toBe('grass');
    expect(harness.state.tiles[vein].walkable).toBe(true);
    // the log names the ore, so the line the player reads can too
    expect(
      entries.some((entry) => entry.key === 'veinCutOpen' && entry.params?.resource === 'iron'),
    ).toBe(true);
  });

  it('leaves the crystal branch exactly as it was', () => {
    // the same table serves both ores; iron joining must not have moved crystal
    const state = testWorld({ seed: 43 });
    expect(crystals(state)).toBeGreaterThan(0);
    expect(veinYieldOf('crystal').resource).toBe('manaCrystal');
  });
});

describe('iron is a resource like any other', () => {
  it('is on the resource list, so storage and the panel already know it', () => {
    expect(RESOURCE_TYPES).toContain('iron');
  });

  it('gets hauled into the store without a new job type', () => {
    const harness = createHarness(53);
    const vein = veins(harness.state)[0];
    const quarry = quarryTo(harness.state, vein, 'ironVein');
    harness.state = setDesignation(harness.state, quarry.tiles, 'mine');
    harness.run(9000);
    expect(countStoredResource(harness.state, 'iron')).toBeGreaterThanOrEqual(
      quarry.veins * IRON_PER_VEIN,
    );
  });

  it('is accepted by a freshly placed storage zone', () => {
    const state = testWorld({ seed: 59 });
    for (const id in state.zones) {
      if (state.zones[id].type === 'storage') {
        expect(state.zones[id].accepts).toContain('iron');
      }
    }
  });
});
