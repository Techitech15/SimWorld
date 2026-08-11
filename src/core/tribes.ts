// Tribes (11章 フェーズ11 段階C, docs/design-phase11-worldmap.md 4章).
//
// A tribe is not a settlement to simulate - it is a name and a direction given
// to a pressure the game already had. Territories are the world-map cells of
// the biome each tribe is drawn to (4.1章's table), which is also the simplest
// implementation of "勢力圏は同じ世界ノイズから導出される": a manaheath cell
// already reads as Lanternfolk country on the map without a second layer of
// noise to keep in step with the first. Distance from the chosen cell to the
// nearest such cell becomes a multiplier on an existing rule - raid size and
// cadence, trader visits, migrant arrivals - and nothing else. No diplomacy,
// no population, no state saved anywhere (9章 非目標).
import type { BiomeName } from './biome';
import { WORLD_MAP_SIZE, worldMapGrid } from './worldmap';

export type TribeName = 'lanternfolk' | 'waldkin' | 'parched';

export const TRIBE_NAMES: TribeName[] = ['lanternfolk', 'waldkin', 'parched'];

interface TribeProfile {
  /** the biome its territory is the set of cells of (4.1章) */
  territoryBiome: BiomeName;
  /**
   * Chebyshev distance, in world-map cells, at and under which this tribe's
   * pull is "near" (4.2章). The Parched use the tighter of the two wordings in
   * the design text - "圏内・隣接" (inside the territory or touching it) - so
   * their reach is deliberately shorter than the other two's "近い".
   */
  nearDistance: number;
}

const TRIBES: Record<TribeName, TribeProfile> = {
  lanternfolk: { territoryBiome: 'manaheath', nearDistance: 3 },
  waldkin: { territoryBiome: 'deepwood', nearDistance: 3 },
  parched: { territoryBiome: 'crag', nearDistance: 1 },
};

/** How far `cell` is from the nearest cell of `biome`, or Infinity if the world has none. */
function nearestDistance(
  grid: ReturnType<typeof worldMapGrid>,
  cell: { x: number; y: number },
  biome: BiomeName,
): number {
  let best = Infinity;
  for (let y = 0; y < WORLD_MAP_SIZE; y++) {
    for (let x = 0; x < WORLD_MAP_SIZE; x++) {
      if (grid[y][x].biome !== biome) continue;
      const distance = Math.max(Math.abs(x - cell.x), Math.abs(y - cell.y));
      if (distance < best) best = distance;
    }
  }
  return best;
}

export interface TribalInfluence {
  lanternfolk: {
    distance: number;
    near: boolean;
    /** src/core/trade.ts: TRADE_INTERVAL_TICKS * this (7章: 5日 → 3日) */
    traderIntervalMultiplier: number;
  };
  waldkin: {
    distance: number;
    near: boolean;
    /** src/core/arrivals.ts: ARRIVAL_INTERVAL_TICKS * this (7章: 3日 → 2日) */
    migrantIntervalMultiplier: number;
  };
  parched: {
    distance: number;
    near: boolean;
    /** src/core/raid.ts: raidSize() * this (7章: ×1.5) */
    raidSizeMultiplier: number;
    /** src/core/events.ts: the 'raid' incident's season weight * this */
    raidWeightMultiplier: number;
  };
}

const NEUTRAL: TribalInfluence = {
  lanternfolk: { distance: Infinity, near: false, traderIntervalMultiplier: 1 },
  waldkin: { distance: Infinity, near: false, migrantIntervalMultiplier: 1 },
  parched: { distance: Infinity, near: false, raidSizeMultiplier: 1, raidWeightMultiplier: 1 },
};

/**
 * The distance multipliers for one world cell (4.2 / 7章 starting points).
 *
 * A world with no cell of a tribe's territory biome at all (rare - measured at
 * 2/200 worldSeeds for manaheath, docs/design-notes.md) simply has that tribe
 * nowhere near: `distance` comes back Infinity and every multiplier for it
 * stays at 1, the same as a legacy `worldCell: null` save.
 */
function computeTribalInfluence(
  worldSeed: number,
  worldCell: { x: number; y: number } | null,
): TribalInfluence {
  if (!worldCell) return NEUTRAL;
  const grid = worldMapGrid(worldSeed);

  const lanternDistance = nearestDistance(grid, worldCell, TRIBES.lanternfolk.territoryBiome);
  const waldkinDistance = nearestDistance(grid, worldCell, TRIBES.waldkin.territoryBiome);
  const parchedDistance = nearestDistance(grid, worldCell, TRIBES.parched.territoryBiome);

  const lanternNear = lanternDistance <= TRIBES.lanternfolk.nearDistance;
  const waldkinNear = waldkinDistance <= TRIBES.waldkin.nearDistance;
  const parchedNear = parchedDistance <= TRIBES.parched.nearDistance;

  return {
    lanternfolk: {
      distance: lanternDistance,
      near: lanternNear,
      traderIntervalMultiplier: lanternNear ? 0.6 : 1, // 5日 -> 3日
    },
    waldkin: {
      distance: waldkinDistance,
      near: waldkinNear,
      migrantIntervalMultiplier: waldkinNear ? 2 / 3 : 1, // 3日 -> 2日
    },
    parched: {
      distance: parchedDistance,
      near: parchedNear,
      raidSizeMultiplier: parchedNear ? 1.5 : 1,
      raidWeightMultiplier: parchedNear ? 1.5 : 1,
    },
  };
}

// Memoised on (worldSeed, worldCell): both are fixed for the lifetime of a
// running colony (only newGame/load ever changes them), so recomputing this on
// every call - several of which happen on every tick's schedule checks -
// would rebuild two 16x16 noise grids for nothing. Design-phase11-worldmap.md
// 8章 asks for exactly this: "距離乗数は開始時に一度計算すれば不変なので、
// 毎tickのコストはゼロ". This is a plain module-level cache, not GameState: it
// holds nothing that is not trivially recomputed from worldSeed + worldCell,
// so there is nothing here a save file could ever disagree with.
let cacheKey = '';
let cacheValue: TribalInfluence = NEUTRAL;

/** The tribal-distance multipliers for the state's current world cell. */
export function tribalInfluence(state: {
  worldSeed: number;
  worldCell: { x: number; y: number } | null;
}): TribalInfluence {
  const cell = state.worldCell;
  const key = cell ? `${state.worldSeed}:${cell.x},${cell.y}` : `${state.worldSeed}:null`;
  if (key !== cacheKey) {
    cacheValue = computeTribalInfluence(state.worldSeed, cell);
    cacheKey = key;
  }
  return cacheValue;
}
