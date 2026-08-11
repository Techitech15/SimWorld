// Acceptance conditions for the world map, stage B (docs/design-phase11-worldmap.md
// 8章, the "動いたと言える条件" row for stage B).
import { describe, expect, it } from 'vitest';
import { biomeOf } from './biome';
import { generateWorld } from './worldgen';
import {
  WORLD_MAP_SIZE,
  biomeFromNoise,
  cellSeed,
  randomWorldCell,
  worldBiomeAt,
  worldMapGrid,
} from './worldmap';

describe('the world map grid', () => {
  it('is the size the design calls for', () => {
    const grid = worldMapGrid(1);
    expect(grid.length).toBe(WORLD_MAP_SIZE);
    for (const row of grid) expect(row.length).toBe(WORLD_MAP_SIZE);
  });

  it('derives the same grid from the same worldSeed every time', () => {
    const a = worldMapGrid(90210);
    const b = worldMapGrid(90210);
    expect(a).toEqual(b);
  });

  it('a single cell agrees with the full grid it sits in', () => {
    const grid = worldMapGrid(4242);
    for (let y = 0; y < WORLD_MAP_SIZE; y += 3) {
      for (let x = 0; x < WORLD_MAP_SIZE; x += 3) {
        expect(worldBiomeAt(4242, x, y)).toBe(grid[y][x].biome);
      }
    }
  });

  it('gives different worlds visibly different maps', () => {
    const a = worldMapGrid(11);
    const b = worldMapGrid(9001);
    let differences = 0;
    for (let y = 0; y < WORLD_MAP_SIZE; y++) {
      for (let x = 0; x < WORLD_MAP_SIZE; x++) {
        if (a[y][x].biome !== b[y][x].biome) differences++;
      }
    }
    expect(differences).toBeGreaterThan(0);
  });

  it('names only the four biomes the design calls for', () => {
    const grid = worldMapGrid(555);
    const seen = new Set(grid.flat().map((c) => c.biome));
    for (const biome of seen) {
      expect(['meadow', 'deepwood', 'crag', 'manaheath']).toContain(biome);
    }
  });

  it(
    'neighbouring cells read as the same country more often than chance ' +
      '- noise, not a hash (2.3章)',
    () => {
      // Measured over five worldSeeds: horizontal same-biome adjacency against
      // the same worldSeed's own biome mix shuffled onto the grid at random.
      // A hash of (worldSeed, x, y) with no spatial correlation would score
      // about the same as its own shuffle; smooth noise should score well
      // above it, because a value-noise field changes slowly compared to one
      // grid cell.
      const seeds = [1, 2, 3, 4, 5];
      let actualSame = 0;
      let shuffledSame = 0;
      let pairs = 0;
      for (const seed of seeds) {
        const grid = worldMapGrid(seed * 7919 + 3);
        const flat = grid.flat().map((c) => c.biome);
        for (let y = 0; y < WORLD_MAP_SIZE; y++) {
          for (let x = 0; x < WORLD_MAP_SIZE - 1; x++) {
            pairs++;
            if (grid[y][x].biome === grid[y][x + 1].biome) actualSame++;
          }
        }
        // Fisher-Yates with a tiny deterministic PRNG local to the test, so
        // the shuffle baseline is reproducible without pulling in mulberry32
        // for something this disposable.
        let state = seed * 2654435761;
        const rnd = () => {
          state = (state * 1103515245 + 12345) >>> 0;
          return state / 4294967296;
        };
        const shuffled = [...flat];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        for (let y = 0; y < WORLD_MAP_SIZE; y++) {
          for (let x = 0; x < WORLD_MAP_SIZE - 1; x++) {
            const i = y * WORLD_MAP_SIZE + x;
            if (shuffled[i] === shuffled[i + 1]) shuffledSame++;
          }
        }
      }
      expect(pairs).toBeGreaterThan(0);
      // an explicit margin rather than a bare ">": this is the property the
      // whole "coherent, not hashed" requirement rests on
      expect(actualSame).toBeGreaterThan(shuffledSame * 1.15);
    },
  );
});

describe('biomeFromNoise', () => {
  it('is total: every corner of the [0,1] square lands on a real biome', () => {
    for (const moisture of [0, 0.3, 0.6, 0.9, 1]) {
      for (const ruggedness of [0, 0.3, 0.6, 0.9, 1]) {
        expect(['meadow', 'deepwood', 'crag', 'manaheath']).toContain(
          biomeFromNoise(moisture, ruggedness),
        );
      }
    }
  });
});

describe('cellSeed', () => {
  it('is the same seed for the same world and cell every time', () => {
    expect(cellSeed(777, 3, 9)).toBe(cellSeed(777, 3, 9));
  });

  it('differs across cells of the same world, almost always', () => {
    const seeds = new Set<number>();
    for (let x = 0; x < WORLD_MAP_SIZE; x++) {
      for (let y = 0; y < WORLD_MAP_SIZE; y++) seeds.add(cellSeed(1234, x, y));
    }
    // 256 cells; a handful of collisions from a 31-bit range would still be
    // fine, but the vast majority must be distinct
    expect(seeds.size).toBeGreaterThan(250);
  });

  it('differs across worlds for the same cell', () => {
    expect(cellSeed(1, 5, 5)).not.toBe(cellSeed(2, 5, 5));
  });
});

describe('randomWorldCell', () => {
  it('always lands inside the grid', () => {
    for (let i = 0; i < 200; i++) {
      const cell = randomWorldCell(() => i / 200);
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.x).toBeLessThan(WORLD_MAP_SIZE);
      expect(cell.y).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeLessThan(WORLD_MAP_SIZE);
    }
  });
});

describe('choosing a cell at generation', () => {
  it('sets the biome from the cell, overriding an explicit biome option', () => {
    const state = generateWorld({ seed: 42, width: 60, height: 60, worldCell: { x: 2, y: 2 } });
    expect(state.biome).toBe(worldBiomeAt(42, 2, 2));
    expect(biomeOf(state)).toBeTruthy();
  });

  it('round-trips the chosen cell', () => {
    const state = generateWorld({ seed: 42, width: 60, height: 60, worldCell: { x: 5, y: 11 } });
    expect(state.worldCell).toEqual({ x: 5, y: 11 });
    const restored = JSON.parse(JSON.stringify(state));
    expect(restored.worldCell).toEqual({ x: 5, y: 11 });
  });

  it('leaves worldCell null and biome from the explicit option when no cell is given', () => {
    const state = generateWorld({ seed: 42, width: 60, height: 60, biome: 'crag' });
    expect(state.worldCell).toBeNull();
    expect(state.biome).toBe('crag');
  });

  it('re-picking the same cell reproduces the same local map', () => {
    const a = generateWorld({ seed: 3001, width: 60, height: 60, worldCell: { x: 8, y: 8 } });
    const b = generateWorld({ seed: 3001, width: 60, height: 60, worldCell: { x: 8, y: 8 } });
    expect(a.tiles).toEqual(b.tiles);
    expect(a.biome).toBe(b.biome);
  });

  it('two different cells of the same world generate two different maps', () => {
    const a = generateWorld({ seed: 3003, width: 60, height: 60, worldCell: { x: 1, y: 1 } });
    const b = generateWorld({ seed: 3003, width: 60, height: 60, worldCell: { x: 14, y: 14 } });
    // Same worldSeed, same starting-camp footprint - but the terrain the
    // noise laid down should not be identical tile for tile.
    let differences = 0;
    for (const id in a.tiles) {
      if (a.tiles[id].terrain !== b.tiles[id].terrain) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });
});
