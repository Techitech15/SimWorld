// Wood was the one resource a colony could exhaust for good. These tests are
// about the two halves of that: the forest does come back, and it comes back
// slowly enough that clearing one still costs something.
import { describe, expect, it } from 'vitest';
import { setDesignation } from './actions';
import { FOREST_REGROW_CHANCE_PER_DAY, TICKS_PER_DAY } from './constants';
import { regrowForest } from './regrowth';
import { TICKS_PER_SEASON } from './season';
import { tileIdOf } from './state';
import { createHarness, idleColony, nearestTilesWithTerrain } from './testUtils';
import { addItem } from './worldgen';
import type { GameState } from './types';

const forestCount = (state: GameState) =>
  Object.values(state.tiles).filter((t) => t.terrain === 'forest').length;

/** Clear a block of woodland the hard way, by hand, so the ground is bare. */
function clearFell(state: GameState, tileIds: string[]): void {
  for (const tileId of tileIds) {
    state.tiles[tileId] = { ...state.tiles[tileId], terrain: 'grass' };
  }
}

/**
 * Regrowth only ever happens on a day boundary, so "wait N days" is N calls -
 * running the whole simulation for them would be three minutes of colonists
 * walking about to watch a handful of tiles change terrain.
 */
function waitDays(state: GameState, days: number): void {
  const startDay = Math.floor(state.tick / TICKS_PER_DAY);
  for (let day = 1; day <= days; day++) {
    state.tick = (startDay + day) * TICKS_PER_DAY;
    regrowForest(state);
  }
}

describe('the forest coming back', () => {
  it('grows into bare ground beside a standing tree', () => {
    const harness = createHarness(9001);
    idleColony(harness.state);
    const at = Object.values(harness.state.colonists)[0].position;
    const felled = nearestTilesWithTerrain(harness.state, 'forest', at, 30);
    clearFell(harness.state, felled);
    const after = forestCount(harness.state);

    waitDays(harness.state, 8);

    expect(forestCount(harness.state)).toBeGreaterThan(after);
  });

  it('takes seasons rather than days, so felling a wood still costs something', () => {
    const harness = createHarness(9007);
    idleColony(harness.state);
    const at = Object.values(harness.state.colonists)[0].position;
    const felled = nearestTilesWithTerrain(harness.state, 'forest', at, 40);
    clearFell(harness.state, felled);
    const bare = forestCount(harness.state);

    waitDays(harness.state, 2);
    const soon = forestCount(harness.state) - bare;
    // a couple of days is a handful of trees, not a wood
    expect(soon).toBeLessThan(felled.length / 2);
  });

  it('never plants a tree on ground that is spoken for', () => {
    const harness = createHarness(9013);
    idleColony(harness.state);
    const at = Object.values(harness.state.colonists)[0].position;
    // bare a ring around a surviving tree so every neighbour is a candidate
    const trees = nearestTilesWithTerrain(harness.state, 'forest', at, 20);
    clearFell(harness.state, trees.slice(1));
    const seed = harness.state.tiles[trees[0]];

    // three kinds of claim, all next to the one standing tree
    const guarded = [
      tileIdOf(seed.x + 1, seed.y),
      tileIdOf(seed.x - 1, seed.y),
      tileIdOf(seed.x, seed.y + 1),
    ];
    harness.state.tiles[guarded[0]] = { ...harness.state.tiles[guarded[0]], designation: 'chop' };
    const withItem = harness.state.tiles[guarded[1]];
    addItem(harness.state, 'wood', 10, withItem.x, withItem.y);
    const zoneTile = guarded[2];
    harness.state.zones = {
      ...harness.state.zones,
      zGuard: { id: 'zGuard', type: 'storage', tileIds: [zoneTile], accepts: ['wood'] },
    };

    waitDays(harness.state, 30);

    for (const tileId of guarded) {
      expect(harness.state.tiles[tileId].terrain).not.toBe('forest');
    }
  });

  it('stops in winter like everything else that grows', () => {
    const harness = createHarness(9019);
    idleColony(harness.state);
    const at = Object.values(harness.state.colonists)[0].position;
    clearFell(harness.state, nearestTilesWithTerrain(harness.state, 'forest', at, 40));
    harness.state.tick = TICKS_PER_SEASON * 3; // winter
    const bare = forestCount(harness.state);

    waitDays(harness.state, 4);

    expect(forestCount(harness.state)).toBe(bare);
  });

  it('does not spring up in the middle of a clearing with no tree near it', () => {
    const harness = createHarness(9023);
    const state = harness.state;
    // strip the whole map: with no tree anywhere, nothing can seed
    for (const tileId in state.tiles) {
      if (state.tiles[tileId].terrain === 'forest') {
        state.tiles[tileId] = { ...state.tiles[tileId], terrain: 'grass' };
      }
    }
    expect(forestCount(state)).toBe(0);

    waitDays(harness.state, 20);

    expect(forestCount(harness.state)).toBe(0);
  });

  it('heals a clearing but never takes the grassland', () => {
    // The rule "a bare tile beside a tree may become a tree" has no fixed point
    // on its own: measured over five years it took the forest from 1,033 tiles
    // to 2,253 and the grassland from 1,892 to 672, which eventually leaves the
    // herds nothing to graze on. What stops it is the map's own capacity.
    const harness = createHarness(9037);
    const capacity = harness.state.forestCapacity;
    expect(capacity).toBe(forestCount(harness.state));
    const grassBefore = Object.values(harness.state.tiles).filter(
      (t) => t.terrain === 'grass',
    ).length;

    waitDays(harness.state, 100); // five years of growing seasons
    expect(forestCount(harness.state)).toBe(capacity);
    expect(Object.values(harness.state.tiles).filter((t) => t.terrain === 'grass').length).toBe(
      grassBefore,
    );

    // and with room to grow it does grow, up to the cap and not past it
    const at = Object.values(harness.state.colonists)[0].position;
    clearFell(harness.state, nearestTilesWithTerrain(harness.state, 'forest', at, 40));
    expect(forestCount(harness.state)).toBeLessThan(capacity);
    waitDays(harness.state, 200);
    expect(forestCount(harness.state)).toBeGreaterThan(capacity - 40);
    expect(forestCount(harness.state)).toBeLessThanOrEqual(capacity);
  });

  it('costs one pass a day, not one a tick', () => {
    const harness = createHarness(9029);
    // a tick that is not a day boundary must do no work at all
    const before = JSON.stringify(harness.state.tiles).length;
    harness.state.tick = TICKS_PER_DAY + 1;
    regrowForest(harness.state);
    expect(JSON.stringify(harness.state.tiles).length).toBe(before);

    const started = performance.now();
    for (let day = 1; day <= 20; day++) {
      harness.state.tick = TICKS_PER_DAY * day;
      regrowForest(harness.state);
    }
    const perDay = (performance.now() - started) / 20;
    expect(perDay).toBeLessThan(20); // the whole tick budget is 200ms
  });

  it('lets a colony that chops keep chopping the same patch', () => {
    // the point of the whole feature: work the same wood over a year and there
    // is still wood there at the end of it
    const harness = createHarness(9031);
    const at = Object.values(harness.state.colonists)[0].position;
    for (const id in harness.state.colonists) {
      const colonist = harness.state.colonists[id];
      harness.state.colonists[id] = {
        ...colonist,
        workPriorities: { ...colonist.workPriorities, chop: 1 },
      };
    }

    // this one does run the real simulation: the claim is about the colony and
    // the woods together, so a shortcut would not be testing it
    let chopped = 0;
    for (let round = 0; round < 5; round++) {
      const standing = nearestTilesWithTerrain(harness.state, 'forest', at, 6);
      chopped += standing.length;
      harness.state = setDesignation(harness.state, standing, 'chop');
      harness.run(TICKS_PER_DAY * 4);
    }

    expect(chopped).toBeGreaterThan(20);
    // and the woods near the camp are not a permanent bald patch
    expect(nearestTilesWithTerrain(harness.state, 'forest', at, 1).length).toBe(1);
    expect(forestCount(harness.state)).toBeGreaterThan(0);
    void FOREST_REGROW_CHANCE_PER_DAY;
  });
});
