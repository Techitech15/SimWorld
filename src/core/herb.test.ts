// Herb (フェーズ14 段階 H-1, docs/design-phase14-water-medicine.md 4章と8章).
//
// The third wild plant, and the reason water means anything beyond "a place
// you cannot walk": a colony only gets herb from a world that has a shore.
import { describe, expect, it } from 'vitest';
import {
  CROP_GROWTH_PER_TICK,
  HERB_COUNT,
  HERB_PER_HARVEST,
  HERB_REGROW_PER_TICK,
} from './constants';
import { createSimContext } from './derived';
import { TICKS_PER_SEASON } from './season';
import { tickMany } from './simulation';
import { isWater, tileIdOf } from './state';
import { createHarness, testWorld } from './testUtils';
import {
  SCHEMA_VERSION,
  createSaveFile,
  migrations,
  parseSave,
  serializeSave,
} from '../persistence/saveFile';

import type { GameState } from './types';

const herbs = (state: GameState) =>
  Object.values(state.buildings).filter((b) => b.type === 'herb');

const totalOf = (state: GameState, resource: 'food' | 'herb') =>
  Object.values(state.items)
    .filter((item) => item.type === resource)
    .reduce((sum, item) => sum + item.quantity, 0);

describe('herb (段階 H-1)', () => {
  it('only grows on grass beside water', () => {
    // meadow keeps enough water (design-notes.md 実装メモ: 3.04% lakes alone,
    // 5.65% with rivers) that several seeds are guaranteed to grow some.
    let sawAny = false;
    for (const seed of [3001, 3002, 3003, 3004, 3005]) {
      const state = testWorld({ seed });
      for (const plant of herbs(state)) {
        sawAny = true;
        const tile = state.tiles[plant.tileId];
        expect(tile.terrain).toBe('grass');
        const nearWater = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
        ].some(([dx, dy]) => {
          const neighbour = state.tiles[tileIdOf(tile.x + dx, tile.y + dy)];
          return !!neighbour && isWater(neighbour.terrain);
        });
        expect(nearWater).toBe(true);
      }
    }
    expect(sawAny).toBe(true);
  });

  it('may grow nothing at all on a world with no water (岩尾根), and that is fine', () => {
    // crag measured at 0.27% water over 20 seeds, several with none at all
    // (design-notes.md 実装メモ). A crag seed growing zero herb is not a bug -
    // this test documents that the mechanism degrades to "no herb" rather than
    // asserting a count, exactly as the design note calls out (8章 段階 H-1 1).
    for (const seed of [4001, 4002, 4003]) {
      const state = testWorld({ seed, biome: 'crag' });
      // whatever it did place (if anything) still obeys the placement rule
      for (const plant of herbs(state)) {
        const tile = state.tiles[plant.tileId];
        expect(tile.terrain).toBe('grass');
      }
      expect(herbs(state).length).toBeGreaterThanOrEqual(0);
    }
  });

  it('does not exceed HERB_COUNT per map, mirroring how frostbloom is capped', () => {
    for (const seed of [3011, 3013, 3017]) {
      const state = testWorld({ seed });
      expect(herbs(state).length).toBeLessThanOrEqual(HERB_COUNT);
    }
  });

  it('ripens on its own and is picked into herb that reaches the store', () => {
    const harness = createHarness(3021);
    const before = totalOf(harness.state, 'herb');

    // a colony without any lake grows no herb at all, so pick a seed that has
    // some (3021 was checked to place at least one at 60x60 meadow)
    expect(herbs(harness.state).length).toBeGreaterThan(0);

    harness.run(TICKS_PER_SEASON);

    const after = totalOf(harness.state, 'herb');
    expect(after).toBeGreaterThan(before);
    // a picked plant goes back to bare and starts again, same as a berry bush
    expect(herbs(harness.state).some((b) => b.growth < 1)).toBe(true);
  });

  it('never becomes food: a starving colonist does not eat it', () => {
    const harness = createHarness(3021);
    expect(herbs(harness.state).length).toBeGreaterThan(0);

    // strip every scrap of food and everything that grows it, so the only
    // thing left to eat - if the game let a colonist eat it - is herb
    const stripFood = (state: GameState) => {
      for (const id of Object.keys(state.items)) {
        if (state.items[id].type !== 'food') continue;
        const item = state.items[id];
        const tile = state.tiles[tileIdOf(item.position.x, item.position.y)];
        state.tiles[tile.id] = { ...tile, itemIds: tile.itemIds.filter((i) => i !== id) };
        const { [id]: _removed, ...rest } = state.items;
        state.items = rest;
      }
      for (const id of Object.keys(state.buildings)) {
        const type = state.buildings[id].type;
        if (type !== 'farmPlot' && type !== 'berryBush' && type !== 'frostbloom') continue;
        const building = state.buildings[id];
        const tile = state.tiles[building.tileId];
        state.tiles[tile.id] = { ...tile, buildingId: null };
        const { [id]: _removed, ...rest } = state.buildings;
        state.buildings = rest;
      }
      state.animals = {}; // and no hunting either
    };
    stripFood(harness.state);

    // push everyone to the edge of starvation before dropping a pile of herb
    // right where they stand, so it is the only stack anybody could reach
    const colonistIds = Object.keys(harness.state.colonists);
    for (const id of colonistIds) {
      harness.state.colonists[id] = {
        ...harness.state.colonists[id],
        needs: { ...harness.state.colonists[id].needs, hunger: 99 },
      };
    }
    const at = Object.values(harness.state.colonists)[0].position;
    const tileId = tileIdOf(at.x, at.y);
    const herbItemId = 'herb_test_item';
    harness.state.items[herbItemId] = {
      id: herbItemId,
      type: 'herb',
      quantity: 200,
      position: { x: at.x, y: at.y },
      reservedByJobId: null,
    };
    harness.state.tiles[tileId] = {
      ...harness.state.tiles[tileId],
      itemIds: [...harness.state.tiles[tileId].itemIds, herbItemId],
    };

    let lowestHealth = 100;
    let sawStarvingLog = false;
    harness.run(TICKS_PER_SEASON, (state) => {
      state.animals = {};
      for (const id in state.colonists) {
        lowestHealth = Math.min(lowestHealth, state.colonists[id].health);
      }
      if (state.log.some((e) => e.key === 'colonistStarving')) sawStarvingLog = true;
    });

    // starvation actually happened: health dropped, the herb pile did not move
    expect(lowestHealth).toBeLessThan(100);
    expect(sawStarvingLog).toBe(true);
    const remainingHerb = Object.values(harness.state.items)
      .filter((i) => i.type === 'herb')
      .reduce((sum, i) => sum + i.quantity, 0);
    expect(remainingHerb).toBe(200);
  });

  it('does not grow in winter', () => {
    const state = testWorld({ seed: 3021 });
    state.tick = TICKS_PER_SEASON * 3; // winter
    for (const id in state.buildings) {
      if (state.buildings[id].type === 'herb') {
        state.buildings[id] = { ...state.buildings[id], growth: 0.2 };
      }
    }
    const total = (s: GameState) =>
      Object.values(s.buildings)
        .filter((b) => b.type === 'herb')
        .reduce((sum, b) => sum + b.growth, 0);
    const before = total(state);
    const after = tickMany(state, createSimContext(state), 600);
    expect(total(after)).toBe(before);
  });

  it('regrows over roughly two days, between the berry bush and the frostbloom', () => {
    // HERB_REGROW_PER_TICK is a rate, not a season-adjusted one - the
    // comparison is the constant itself against the design doc's 7章 starting
    // points (four days for a bush, a day and a half for frostbloom).
    expect(HERB_REGROW_PER_TICK).toBeCloseTo(1 / 6000, 10);
    expect(HERB_PER_HARVEST).toBe(3);
    // sanity: at CROP_GROWTH_PER_TICK's own spring multiplier, herb still
    // grows measurably slower than a farm plot's food value per tick
    expect(HERB_REGROW_PER_TICK * HERB_PER_HARVEST).toBeLessThan(CROP_GROWTH_PER_TICK * 16);
  });

  it('survives a save round trip: the plant and the harvested item both', () => {
    const harness = createHarness(3021);
    expect(herbs(harness.state).length).toBeGreaterThan(0);
    harness.run(TICKS_PER_SEASON); // let at least one harvest land in a stack

    const json = serializeSave(harness.state);
    const loaded = parseSave(json);
    expect(herbs(loaded.state).length).toBe(herbs(harness.state).length);
    expect(totalOf(loaded.state, 'herb')).toBe(totalOf(harness.state, 'herb'));

    // and every storage zone in the loaded state accepts herb, the same
    // guarantee the 25 -> 26 migration gives an *old* save
    for (const id in loaded.state.zones) {
      if (loaded.state.zones[id].type !== 'storage') continue;
      expect(loaded.state.zones[id].accepts).toContain('herb');
    }
  });

  it('bumped the schema by exactly one version, with a 25 -> 26 migration in place', () => {
    // Pinned to >= rather than the exact value H-1 shipped at (26): a later
    // phase (フェーズ14 段階 M-1) bumped the schema again on top of this one,
    // and that bump owns its own version-check test (illness.test.ts). What
    // this test is actually about - the 25 -> 26 step itself still existing
    // in the chain - does not change when a later step is added after it.
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(26);
    expect(typeof migrations[25]).toBe('function');
    const harness = createHarness(3033);
    expect(createSaveFile(harness.state).schemaVersion).toBe(SCHEMA_VERSION);
  });
});
