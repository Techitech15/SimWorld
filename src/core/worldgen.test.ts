// "New map" now picks a random seed, so the generator's guarantees have to hold
// for seeds nobody has ever looked at - not just the handful the other tests
// happen to use.
import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH } from './constants';
import { createSimContext } from './derived';
import { tickMany } from './simulation';
import { tileIdOf } from './state';
import { generateWorld } from './worldgen';
import type { GameState } from './types';

const SEEDS = [1, 7, 12345, 98765, 424242, 2147483646];

function centre(state: GameState) {
  return Object.values(state.colonists)[0].position;
}

function countTerrainWithin(state: GameState, terrain: string, from: { x: number; y: number }, radius: number): number {
  let count = 0;
  for (let y = from.y - radius; y <= from.y + radius; y++) {
    for (let x = from.x - radius; x <= from.x + radius; x++) {
      if (state.tiles[tileIdOf(x, y)]?.terrain === terrain) count++;
    }
  }
  return count;
}

describe('any seed makes a playable map', () => {
  it.each(SEEDS)('seed %i starts a working colony', (seed) => {
    const state = generateWorld({ seed });

    // the things the starting colony is made of
    expect(Object.keys(state.colonists)).toHaveLength(3);
    expect(Object.values(state.buildings).filter((b) => b.type === 'bed')).toHaveLength(3);
    expect(Object.values(state.buildings).filter((b) => b.type === 'farmPlot').length).toBeGreaterThan(0);
    expect(Object.values(state.zones).filter((z) => z.type === 'storage')).toHaveLength(1);
    expect(Object.keys(state.animals).length).toBeGreaterThan(0);

    // everyone stands on ground they can actually leave
    for (const id in state.colonists) {
      const at = state.colonists[id].position;
      expect(state.tiles[tileIdOf(at.x, at.y)].walkable).toBe(true);
    }

    // And there is something to work with nearby: the camp clearing is grass,
    // so both resources have to come from outside it. A sweep of the first two
    // hundred seeds put the worst case at 16 forest tiles within 14 and 62
    // stone within 20, so these floors have real headroom rather than being
    // fitted to the seeds listed above.
    const from = centre(state);
    expect(countTerrainWithin(state, 'forest', from, 14)).toBeGreaterThan(10);
    expect(countTerrainWithin(state, 'stone', from, 20)).toBeGreaterThan(0);
  });

  it.each(SEEDS)('seed %i runs a day without falling over', (seed) => {
    const state = generateWorld({ seed });
    const ctx = createSimContext(state);
    const after = tickMany(state, ctx, 1200);
    expect(after.tick).toBe(1200);
    // nobody has been left standing outside the map or inside a rock
    for (const id in after.colonists) {
      const at = after.colonists[id].position;
      expect(at.x).toBeGreaterThanOrEqual(0);
      expect(at.y).toBeGreaterThanOrEqual(0);
      expect(at.x).toBeLessThan(MAP_WIDTH);
      expect(at.y).toBeLessThan(MAP_HEIGHT);
      expect(after.tiles[tileIdOf(at.x, at.y)].walkable).toBe(true);
    }
    for (const id in after.animals) {
      const at = after.animals[id].position;
      expect(after.tiles[tileIdOf(at.x, at.y)]?.walkable).toBe(true);
    }
  });
});
