// The world map (11章 フェーズ11 段階B, docs/design-phase11-worldmap.md 2章).
//
// The world map is a selection screen, not a second board (design-phase11-worldmap.md
// 1章). It is a 16x16 grid of cells, each holding a biome, derived purely from
// `worldSeed` with the same tool the local map already uses (`valueNoise2D` at a
// larger scale). Nothing about it is ever saved - not the grid, not the biome
// each cell carries, not which cells belong to which tribe (src/core/tribes.ts
// reads this module for the same reason). The only thing `GameState` remembers
// is which cell was chosen (`worldCell`), because the same worldSeed always
// derives the same grid: re-deriving it after a load costs one pass over 256
// cells and never disagrees with what was actually generated.
import type { BiomeName } from './biome';
import { mulberry32, valueNoise2D } from './rng';

/** 16x16, per design-phase11-worldmap.md 2.1 ("見積もり。実装時に見た目で調整"). */
export const WORLD_MAP_SIZE = 16;

// Offsets kept far from the ones worldgen.ts adds to a cell's own local seed
// (977 / 4231 / 7211, all under 8,000) so a world-level noise field and a
// local-map noise field never end up sampling the same permutation table by
// coincidence of seed arithmetic.
const MOISTURE_SEED_OFFSET = 501001;
const RUGGEDNESS_SEED_OFFSET = 502003;
/** Cells per noise wavelength: small enough that neighbouring cells read as
 * the same country, large enough that a 16x16 grid still shows a few of them. */
const WORLD_NOISE_SCALE = 4;

export interface WorldMapCell {
  x: number;
  y: number;
  biome: BiomeName;
}

function worldSeedOf(worldSeed: number): number {
  // worldSeed is a signed int in practice (Math.random() * 0x7fffffff, or a
  // hand-picked test seed); noise wants an unsigned one the same way the rest
  // of worldgen already floors and abs()es it before handing it to mulberry32.
  return Math.abs(Math.floor(worldSeed));
}

/** The two world-level noise fields moisture/ruggedness come from (2.3章). */
export function worldNoiseFields(
  worldSeed: number,
): { moisture: (x: number, y: number) => number; ruggedness: (x: number, y: number) => number } {
  const base = worldSeedOf(worldSeed);
  const moistureNoise = valueNoise2D(base + MOISTURE_SEED_OFFSET);
  const ruggednessNoise = valueNoise2D(base + RUGGEDNESS_SEED_OFFSET);
  return {
    moisture: (x, y) => moistureNoise(x, y, WORLD_NOISE_SCALE),
    ruggedness: (x, y) => ruggednessNoise(x, y, WORLD_NOISE_SCALE),
  };
}

/**
 * Moisture and ruggedness in [0, 1] to one of the four biomes (3.2章 profiles).
 *
 * Manaheath is deliberately the rarest combination (high on both) rather than
 * its own axis: the design keeps to two noise fields, so "mana bleeds into the
 * ground" reads as the corner case of moist *and* rugged land, not a third
 * dimension. Ordering matters here - manaheath is checked before the plain
 * ruggedness/moisture cutoffs so it is not shadowed by crag or deepwood
 * claiming the same tiles first.
 */
export function biomeFromNoise(moisture: number, ruggedness: number): BiomeName {
  if (moisture > 0.7 && ruggedness > 0.55) return 'manaheath';
  if (ruggedness > 0.6) return 'crag';
  if (moisture > 0.55) return 'deepwood';
  return 'meadow';
}

/** The biome a single world-map cell derives to, without building the whole grid. */
export function worldBiomeAt(worldSeed: number, x: number, y: number): BiomeName {
  const { moisture, ruggedness } = worldNoiseFields(worldSeed);
  return biomeFromNoise(moisture(x, y), ruggedness(x, y));
}

/**
 * The whole 16x16 grid, for the world-map overlay and for tribal-distance
 * lookups (src/core/tribes.ts) that need every cell's biome at once. Built
 * fresh from the noise fields rather than cached on the module: this runs at
 * world-map open and at world generation, never in the tick loop
 * (design-phase11-worldmap.md 8章 "性能"), so there is nothing to amortise.
 */
export function worldMapGrid(worldSeed: number): WorldMapCell[][] {
  const { moisture, ruggedness } = worldNoiseFields(worldSeed);
  const grid: WorldMapCell[][] = [];
  for (let y = 0; y < WORLD_MAP_SIZE; y++) {
    const row: WorldMapCell[] = [];
    for (let x = 0; x < WORLD_MAP_SIZE; x++) {
      row.push({ x, y, biome: biomeFromNoise(moisture(x, y), ruggedness(x, y)) });
    }
    grid.push(row);
  }
  return grid;
}

/** A cell coordinate inside the 16x16 grid, uniform over the whole map. */
export function randomWorldCell(rnd: () => number = Math.random): { x: number; y: number } {
  return {
    x: Math.floor(rnd() * WORLD_MAP_SIZE),
    y: Math.floor(rnd() * WORLD_MAP_SIZE),
  };
}

/**
 * The local map's own seed, derived from the world seed and the chosen cell
 * (2.2章): `cellSeed = hash(worldSeed, x, y)`. Two different cells of the same
 * world get two different maps; re-choosing the same cell reproduces the same
 * one. `mulberry32` already exists as the project's one deterministic-hash
 * tool, so this reuses it rather than inventing a second one: seed a generator
 * from the three numbers mixed together and take its first draw as the new
 * seed.
 */
export function cellSeed(worldSeed: number, x: number, y: number): number {
  const mixed = (worldSeedOf(worldSeed) * 1000003 + x * 9176 + y * 39119 + 7) >>> 0;
  return Math.floor(mulberry32(mixed)() * 0x7fffffff);
}
