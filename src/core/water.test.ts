// Water terrain (フェーズ14 段階 W-1, docs/design-phase14-water-medicine.md
// 2章 / 8章). Shallow water is walkable ground that cannot be built on or
// mined; deep water is neither walkable nor buildable. Both are terrain, not
// a new `Tile` field (2.1), so these tests hold water to the same standard
// crystal and iron were held to: it generates, it behaves through the
// existing predicates, and nobody ever ends up standing where they should not.
import { describe, expect, it } from 'vitest';
import { placeBuildingBlueprint, setDesignation } from './actions';
import { TICKS_PER_DAY } from './constants';
import { isReachable, regionAt } from './derived';
import { isWalkable } from './pathfinding';
import { isRock, isWater, tileIdOf } from './state';
import { BIOME_NAMES, BIOMES } from './biome';
import { createHarness, testWorld } from './testUtils';
import { generateWorld } from './worldgen';
import type { GameState, TileId } from './types';

function tilesWithTerrain(state: GameState, terrain: 'shallowWater' | 'deepWater'): TileId[] {
  return Object.values(state.tiles)
    .filter((t) => t.terrain === terrain)
    .map((t) => t.id);
}

describe('walking on water', () => {
  it('lets a colonist walk shallow water but not deep water', () => {
    // sweep enough seeds that both terrains are guaranteed to show up
    let shallowChecked = 0;
    let deepChecked = 0;
    for (let seed = 1; seed <= 40 && (shallowChecked === 0 || deepChecked === 0); seed++) {
      const state = testWorld({ seed });
      for (const id of tilesWithTerrain(state, 'shallowWater')) {
        const tile = state.tiles[id];
        expect(isWalkable(state, tile.x, tile.y)).toBe(true);
        expect(tile.walkable).toBe(true);
        shallowChecked++;
      }
      for (const id of tilesWithTerrain(state, 'deepWater')) {
        const tile = state.tiles[id];
        expect(isWalkable(state, tile.x, tile.y)).toBe(false);
        expect(tile.walkable).toBe(false);
        deepChecked++;
      }
    }
    expect(shallowChecked).toBeGreaterThan(0);
    expect(deepChecked).toBeGreaterThan(0);
  });
});

describe('building on water', () => {
  it('refuses a blueprint on shallow water and on deep water alike', () => {
    let shallowChecked = 0;
    let deepChecked = 0;
    for (let seed = 1; seed <= 40 && (shallowChecked === 0 || deepChecked === 0); seed++) {
      const state = testWorld({ seed });
      for (const terrain of ['shallowWater', 'deepWater'] as const) {
        const [tileId] = tilesWithTerrain(state, terrain);
        if (!tileId) continue;
        const before = state.tiles[tileId];
        expect(before.buildingId).toBeNull();
        const next = placeBuildingBlueprint(state, 'wall', [tileId]);
        // a refused placement returns the exact state it was given
        expect(next).toBe(state);
        expect(next.tiles[tileId].buildingId).toBeNull();
        if (terrain === 'shallowWater') shallowChecked++;
        else deepChecked++;
      }
    }
    expect(shallowChecked).toBeGreaterThan(0);
    expect(deepChecked).toBeGreaterThan(0);
  });
});

describe('mining water', () => {
  it('refuses the mine designation on water, so a lake cannot be quarried into stone', () => {
    let checked = 0;
    for (let seed = 1; seed <= 40 && checked < 5; seed++) {
      const state = testWorld({ seed });
      for (const terrain of ['shallowWater', 'deepWater'] as const) {
        const [tileId] = tilesWithTerrain(state, terrain);
        if (!tileId) continue;
        const next = setDesignation(state, [tileId], 'mine');
        expect(next).toBe(state); // nothing changed: the designation was refused
        expect(next.tiles[tileId].designation).toBeNull();
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('a lake does not cut the colony off from the land it needs', () => {
  it('keeps forest and rock reachable from the camp by region, across several seeds', () => {
    let seedsWithBoth = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const harness = createHarness(seed);
      const camp = Object.values(harness.state.colonists)[0].position;
      let forestReachable = false;
      let rockReachable = false;
      for (const id in harness.state.tiles) {
        const tile = harness.state.tiles[id];
        if (tile.terrain === 'forest' && isReachable(harness.ctx, camp, tile, false)) {
          forestReachable = true;
        }
        if ((tile.terrain === 'stone' || tile.terrain === 'crystal' || tile.terrain === 'ironVein') &&
          isReachable(harness.ctx, camp, { x: tile.x, y: tile.y }, true)) {
          rockReachable = true;
        }
        if (forestReachable && rockReachable) break;
      }
      expect(forestReachable).toBe(true);
      expect(rockReachable).toBe(true);
      seedsWithBoth++;
    }
    expect(seedsWithBoth).toBe(30);
  });

  it('reads region membership through regionAt for a water tile itself (shallow joins land, deep joins nothing walkable)', () => {
    const harness = createHarness(7);
    const shallow = tilesWithTerrain(harness.state, 'shallowWater')[0];
    if (shallow) {
      const tile = harness.state.tiles[shallow];
      expect(regionAt(harness.ctx, tile.x, tile.y)).toBeGreaterThanOrEqual(0);
    }
    const deep = tilesWithTerrain(harness.state, 'deepWater')[0];
    if (deep) {
      const tile = harness.state.tiles[deep];
      expect(regionAt(harness.ctx, tile.x, tile.y)).toBe(-1);
    }
  });
});

describe('nobody stands in deep water', () => {
  it('after a few unattended days, no colonist or animal occupies a deep-water tile', () => {
    const harness = createHarness(13);
    harness.run(3 * TICKS_PER_DAY); // three days
    for (const id in harness.state.colonists) {
      const at = harness.state.colonists[id].position;
      const tile = harness.state.tiles[`${Math.round(at.x)},${Math.round(at.y)}`];
      if (tile) expect(tile.terrain).not.toBe('deepWater');
    }
    for (const id in harness.state.animals) {
      const at = harness.state.animals[id].position;
      const tile = harness.state.tiles[`${Math.round(at.x)},${Math.round(at.y)}`];
      if (tile) expect(tile.terrain).not.toBe('deepWater');
    }
  });
});

describe('how much of the map is water', () => {
  it('lands in a plausible, biome-shaped range across 20 seeds per biome (60x60)', () => {
    // Not a strict acceptance number - the design doc (7章) calls these
    // estimates. This is the measurement that backs up the actual biome.ts
    // thresholds, run as a regression so a future change to the noise or the
    // thresholds cannot silently drift the game's lakes without a test
    // noticing.
    const SEEDS = Array.from({ length: 20 }, (_, i) => 2000 + i * 53);
    const ranges: Record<string, [number, number]> = {
      meadow: [2, 9],
      deepwood: [1, 8],
      crag: [0, 3],
      manaheath: [0.5, 6],
    };
    for (const biome of BIOME_NAMES) {
      let waterTiles = 0;
      let totalTiles = 0;
      for (const seed of SEEDS) {
        const state = testWorld({ seed, biome });
        for (const id in state.tiles) {
          totalTiles++;
          if (isWater(state.tiles[id].terrain)) waterTiles++;
        }
      }
      const pct = (100 * waterTiles) / totalTiles;
      const [lo, hi] = ranges[biome];
      expect(pct).toBeGreaterThanOrEqual(lo);
      expect(pct).toBeLessThanOrEqual(hi);
    }
  });
});

// 段階 W-2: rivers and the connectivity floor
// (docs/design-phase14-water-medicine.md 3章). A river is always shallow
// water, so it never has to be crossed by the connectivity guarantee below -
// but crag's pre-existing rock fragmentation (measured separately: 7/20 seeds
// under 90%, unrelated to water) does, and these tests hold both to account.
describe('段階 W-2: rivers do not fragment the map, and the connectivity floor holds', () => {
  it('reaches 10+ forest tiles, 1+ rock tile, and the mana vein from the camp region, across 30+ seeds', () => {
    let checked = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const harness = createHarness(seed);
      const camp = Object.values(harness.state.colonists)[0].position;
      let forestReachable = 0;
      let rockReachable = false;
      let veinReachable = false;
      for (const id in harness.state.tiles) {
        const tile = harness.state.tiles[id];
        if (tile.terrain === 'forest' && isReachable(harness.ctx, camp, tile, false)) {
          forestReachable++;
        }
        if (isRock(tile.terrain) && isReachable(harness.ctx, camp, { x: tile.x, y: tile.y }, true)) {
          rockReachable = true;
        }
        if (
          (tile.terrain === 'crystal' || tile.terrain === 'ironVein') &&
          isReachable(harness.ctx, camp, { x: tile.x, y: tile.y }, true)
        ) {
          veinReachable = true;
        }
      }
      expect(forestReachable).toBeGreaterThanOrEqual(10);
      expect(rockReachable).toBe(true);
      expect(veinReachable).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(30);
  });

  it('keeps 90%+ of walkable land in the camp region on every seed, crag included', () => {
    const SEEDS = Array.from({ length: 20 }, (_, i) => 1 + i);
    for (const biome of BIOME_NAMES) {
      for (const seed of SEEDS) {
        const harness = createHarness(seed, 60, biome);
        const camp = Object.values(harness.state.colonists)[0].position;
        const campRegion = regionAt(harness.ctx, camp.x, camp.y);
        let walkable = 0;
        let inCampRegion = 0;
        for (const id in harness.state.tiles) {
          const tile = harness.state.tiles[id];
          if (!tile.walkable) continue;
          walkable++;
          if (regionAt(harness.ctx, tile.x, tile.y) === campRegion) inCampRegion++;
        }
        const pct = inCampRegion / walkable;
        expect(pct).toBeGreaterThanOrEqual(0.9);
      }
    }
  });

  it('crosses the map with a river on at least one seed (the connectivity floor has not erased every river)', () => {
    // A river reading as "crossing" means a connected band of shallow water
    // touches within 2 tiles of one edge and within 2 tiles of the opposite
    // edge - a lake alone (which sits inside the distToCamp>6 ring, nowhere
    // near a border on a 60x60 map) cannot produce this by itself.
    function crossesMap(state: GameState): boolean {
      const seen = new Set<TileId>();
      for (const id in state.tiles) {
        if (state.tiles[id].terrain !== 'shallowWater' || seen.has(id)) continue;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const stack = [id];
        seen.add(id);
        while (stack.length > 0) {
          const cur = stack.pop()!;
          const tile = state.tiles[cur];
          minX = Math.min(minX, tile.x);
          maxX = Math.max(maxX, tile.x);
          minY = Math.min(minY, tile.y);
          maxY = Math.max(maxY, tile.y);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nId = tileIdOf(tile.x + dx, tile.y + dy);
            const n = state.tiles[nId];
            if (n && n.terrain === 'shallowWater' && !seen.has(nId)) {
              seen.add(nId);
              stack.push(nId);
            }
          }
        }
        const crossesX = minX <= 2 && maxX >= state.width - 3;
        const crossesY = minY <= 2 && maxY >= state.height - 3;
        if (crossesX || crossesY) return true;
      }
      return false;
    }

    let found = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const state = testWorld({ seed });
      if (crossesMap(state)) found++;
    }
    expect(found).toBeGreaterThan(0);
  });

  it('never drops crystal below the biome floor, and never wipes ironVein out, with rivers and the connectivity floor both active', () => {
    const SEEDS = Array.from({ length: 15 }, (_, i) => 10 + i);
    for (const biome of BIOME_NAMES) {
      let ironSeen = 0;
      for (const seed of SEEDS) {
        const state = testWorld({ seed, biome });
        let crystal = 0;
        let iron = 0;
        for (const id in state.tiles) {
          if (state.tiles[id].terrain === 'crystal') crystal++;
          if (state.tiles[id].terrain === 'ironVein') iron++;
        }
        expect(crystal).toBeGreaterThanOrEqual(BIOMES[biome].minCrystalTiles);
        if (iron > 0) ironSeen++;
      }
      // iron has no floor of its own (only crystal does), but it should not
      // have been silently wiped out across every seed by the new terrain steps
      expect(ironSeen).toBeGreaterThan(0);
    }
  });

  it('is deterministic: the same seed generates the same terrain twice', () => {
    for (const seed of [3, 101, 20260726]) {
      const a = generateWorld({ seed, width: 60, height: 60 });
      const b = generateWorld({ seed, width: 60, height: 60 });
      const terrainOf = (state: GameState) =>
        Object.keys(state.tiles)
          .sort()
          .map((id) => state.tiles[id].terrain);
      expect(terrainOf(a)).toEqual(terrainOf(b));
    }
  });
});
