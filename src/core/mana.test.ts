// Mana crystal: the scarce input the phase-2 puzzle is built around (11章).
//
// The design document asked whether the existing `mine` job could be extended
// rather than a new job added. These tests are the answer: the same designation,
// the same job, the same haul chain - what changes is only what falls out of the
// rock face.
import { describe, expect, it } from 'vitest';
import { CRYSTAL_PER_VEIN, RESOURCE_TYPES, STONE_PER_ROCK } from './constants';
import { setDesignation } from './actions';
import { isRock, tileIdOf } from './state';
import { countStoredResource } from './storage';
import { createHarness, recordLog, tilesWithTerrain } from './testUtils';
import { generateWorld } from './worldgen';
import type { GameState, TileId } from './types';

function veins(state: GameState): TileId[] {
  return Object.values(state.tiles)
    .filter((tile) => tile.terrain === 'crystal')
    .map((tile) => tile.id);
}

function itemsOf(state: GameState, type: string): number {
  let total = 0;
  for (const id in state.items) {
    if (state.items[id].type === type) total += state.items[id].quantity;
  }
  return total;
}


/**
 * The corridor a player has to cut to reach a vein, from the nearest open
 * ground inward. Measured across eight worlds: a vein sits 2 to 4 rock tiles
 * deep (worst seen: 8), and only rarely touches open ground at all - so
 * designating the vein alone leaves a job nobody can reach, which is the point
 * of putting it in there.
 */
function quarryTo(state: GameState, veinId: TileId): { tiles: TileId[]; veins: number } {
  const parent = new Map<TileId, TileId | null>([[veinId, null]]);
  let frontier = [state.tiles[veinId]];
  let reached: TileId | null = null;
  while (frontier.length > 0 && !reached) {
    const next = [];
    for (const tile of frontier) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const step = state.tiles[tileIdOf(tile.x + dx, tile.y + dy)];
        if (!step || parent.has(step.id)) continue;
        parent.set(step.id, tile.id);
        if (!isRock(step.terrain)) {
          reached = tile.id; // the last rock before open ground
          break;
        }
        next.push(step);
      }
      if (reached) break;
    }
    frontier = next;
  }
  if (!reached) throw new Error('this vein has no route to open ground at all');

  const tiles: TileId[] = [];
  for (let at: TileId | null = reached; at; at = parent.get(at) ?? null) tiles.push(at);
  return {
    tiles,
    veins: tiles.filter((id) => state.tiles[id].terrain === 'crystal').length,
  };
}

describe('where mana comes from', () => {
  it('puts veins on every world, but never many', () => {
    // measured across ten worlds: enough that phase 2 is always reachable,
    // few enough that it stays the thing the colony has to go and get
    const counts: number[] = [];
    for (let seed = 1; seed <= 10; seed++) {
      counts.push(veins(generateWorld({ seed })).length);
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(120);
    }
  });

  it('always has rock at its back', () => {
    // Not "never reachable": measured across eight worlds, most veins sit 2 to
    // 4 rock tiles deep and have to be quarried towards, but a few do touch
    // open ground (4 of 48 on one seed). What holds everywhere is that a vein
    // is part of a rock face rather than a nugget lying on the grass.
    const state = generateWorld({ seed: 31 });
    for (const id of veins(state)) {
      const tile = state.tiles[id];
      let rockNeighbours = 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const next = state.tiles[tileIdOf(tile.x + dx, tile.y + dy)];
        if (next && isRock(next.terrain)) rockNeighbours++;
      }
      expect(rockNeighbours).toBeGreaterThan(0);
    }
  });

  it('is solid ground: a vein blocks movement exactly like stone', () => {
    const state = generateWorld({ seed: 37 });
    for (const id of veins(state)) expect(state.tiles[id].walkable).toBe(false);
    expect(isRock('crystal')).toBe(true);
    expect(isRock('stone')).toBe(true);
    expect(isRock('grass')).toBe(false);
  });
});

describe('cutting a vein open', () => {
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

  it('yields crystal rather than stone, and says so in the log', () => {
    const harness = createHarness(43);
    const vein = veins(harness.state)[0];
    const quarry = quarryTo(harness.state, vein);
    harness.state = setDesignation(harness.state, quarry.tiles, 'mine');

    const lines = recordLog(harness, 6000);
    expect(itemsOf(harness.state, 'manaCrystal')).toBe(quarry.veins * CRYSTAL_PER_VEIN);
    expect(harness.state.tiles[vein].terrain).toBe('grass');
    expect(harness.state.tiles[vein].walkable).toBe(true);
    expect(lines.some((line) => line.includes('mana crystal vein'))).toBe(true);
  });

  it('cannot be reached without cutting the rock in front of it', () => {
    // designating the vein on its own is a job with no work site: this is what
    // makes mana something the colony has to dig for rather than pick up
    const harness = createHarness(43);
    const vein = veins(harness.state).find((id) => quarryTo(harness.state, id).tiles.length > 1);
    expect(vein).toBeTruthy();
    harness.state = setDesignation(harness.state, [vein!], 'mine');
    harness.run(2600);
    expect(harness.state.tiles[vein!].terrain).toBe('crystal');
    expect(itemsOf(harness.state, 'manaCrystal')).toBe(0);
  });

  it('gives less than a rock face gives stone: mana is the scarce one', () => {
    expect(CRYSTAL_PER_VEIN).toBeLessThan(STONE_PER_ROCK);
  });

  it('leaves plain rock giving plain stone', () => {
    const harness = createHarness(47);
    const rock = tilesWithTerrain(harness.state, 'stone', 1)[0];
    harness.state = setDesignation(harness.state, [rock], 'mine');
    const before = itemsOf(harness.state, 'stone');
    harness.run(2600);
    expect(itemsOf(harness.state, 'stone')).toBe(before + STONE_PER_ROCK);
    expect(itemsOf(harness.state, 'manaCrystal')).toBe(0);
  });
});

describe('a crystal is a resource like any other', () => {
  it('is on the resource list, so storage and the panel already know it', () => {
    expect(RESOURCE_TYPES).toContain('manaCrystal');
  });

  it('gets hauled into the store without a new job type', () => {
    const harness = createHarness(53);
    const vein = veins(harness.state)[0];
    const quarry = quarryTo(harness.state, vein);
    harness.state = setDesignation(harness.state, quarry.tiles, 'mine');
    harness.run(9000);
    expect(countStoredResource(harness.state, 'manaCrystal')).toBe(
      quarry.veins * CRYSTAL_PER_VEIN,
    );
  });
});
