// Biomes (11章 フェーズ11 段階A, docs/design-phase11-worldmap.md 3).
//
// Same shape as a scenario (scenario.ts): a bundle of levers, not a new
// mechanism. A scenario changes what the colony starts *with*; a biome
// changes what land it starts *on* - the two are orthogonal and every
// combination is valid (a snowbound `harsh` opening in `manaheath` is fine).
//
// Stage A stores the choice directly on `GameState.biome`. The design doc's
// end state (6章) derives biome from a world-map cell and stores only that
// cell's coordinates - stage B (the world map) will make `biome` a cached
// derivation of `worldCell` instead of an independent field. Keeping the
// field now, rather than a placeholder `worldCell`, means stage A ships
// something playable and old saves migrate in one trivial step either way.
import type { AnimalSpecies } from './types';

export type BiomeName = 'meadow' | 'deepwood' | 'crag' | 'manaheath';

export const BIOME_NAMES: BiomeName[] = ['meadow', 'deepwood', 'crag', 'manaheath'];

export const DEFAULT_BIOME: BiomeName = 'meadow';

export interface BiomeProfile {
  // what a biome is called, and its one-line pitch, live in the UI dictionary
  // (src/ui/strings.ts) per language; the profile is numbers only

  /** worldgen.ts: `f > forestThreshold` turns a clearing tile into forest */
  forestThreshold: number;
  /** worldgen.ts: `s > stoneThreshold` turns a clearing tile into stone */
  stoneThreshold: number;
  /** worldgen.ts: the noise cutoff a deep-rock tile clears to become crystal */
  crystalNoiseThreshold: number;
  /** worldgen.ts: the noise cutoff a shallow-rock tile clears to become iron */
  ironNoiseThreshold: number;
  /**
   * worldgen.ts: `w > waterThreshold` turns a clearing tile into shallow
   * water, `w > waterThreshold + 0.08` into deep water (フェーズ14 段階 W-1,
   * docs/design-phase14-water-medicine.md 2.4 / 7章). Water is decided before
   * stone or forest, so this threshold is the one lever for "how much of this
   * biome is lake" - lower means more water, the same direction as
   * `stoneThreshold` and `forestThreshold`.
   */
  waterThreshold: number;
  /**
   * Floor on reachable crystal tiles after generation (design-next.md 提案
   * 1(a), taken over by this biome table per design-phase11-worldmap.md 3.3).
   * Generation tops up to this count from existing rock when a world rolls
   * under it; it never removes anything from a world that already clears it,
   * so it only touches the thin tail (design-next.md a-1 / a-2).
   */
  minCrystalTiles: number;
  /** multiplier on berry bush density (perArea(state, BERRY_BUSH_COUNT)) */
  berryDensityMultiplier: number;
  /** multiplier on FORAGE_REGROW_BY_SEASON's daily grass regrowth */
  forageRegrowMultiplier: number;
  /** multiplier on FOREST_REGROW_CHANCE_PER_DAY */
  forestRegrowMultiplier: number;
  /**
   * Multiplier on a species' starting head count and respawn target. Missing
   * species default to 1 (biomeOf(state).wildlifeMultiplier[species] ?? 1),
   * so a biome only needs to name the species it actually bends. `wolf` here
   * also bends the scenario's predator cap (the daily wolf respawn ceiling),
   * since wolves are never part of the initial-spawn list.
   */
  wildlifeMultiplier: Partial<Record<AnimalSpecies, number>>;
  /** mood bonus for standing under a lit mana lamp (base 5, thoughtsOf in mood.ts) */
  lampMoodBonus: number;
}

export const BIOMES: Record<BiomeName, BiomeProfile> = {
  /**
   * The baseline. Every lever here is the value the generator already used
   * before biomes existed, so a meadow world is byte-identical to the old
   * unconditional generation - except where the crystal floor lifts a
   * thin-tail world, which is the one behaviour this table is allowed to add
   * to the default (design-phase11-worldmap.md 3.2 / 8 stage A).
   */
  meadow: {
    forestThreshold: 0.58,
    stoneThreshold: 0.72,
    crystalNoiseThreshold: 0.62,
    ironNoiseThreshold: 0.57,
    // measured, seeds 1-20 through testWorld at 60x60: 3.04% water total
    // (2.47% shallow / 0.57% deep). Under the 4-6% the design doc's 7章
    // estimated, and left there on purpose: 段階 W-2 adds rivers on top of
    // these lakes, so raising the threshold now would overshoot once they
    // land. Re-measure the total after rivers rather than tuning twice.
    waterThreshold: 0.85,
    minCrystalTiles: 8,
    berryDensityMultiplier: 1,
    forageRegrowMultiplier: 1,
    forestRegrowMultiplier: 1,
    wildlifeMultiplier: {},
    lampMoodBonus: 5,
  },
  /** Wood without end, farmland without much room. */
  deepwood: {
    forestThreshold: 0.48,
    stoneThreshold: 0.8,
    // tightened in the same direction as the crystal threshold (both ores
    // thin out together - deepwood trades rock for trees, not one for the
    // other)
    crystalNoiseThreshold: 0.68,
    ironNoiseThreshold: 0.63,
    // measured, seeds 1-20 through testWorld at 60x60: 2.33% water total
    // (2.00% shallow / 0.33% deep) - "medium" against meadow's 3.04%, the
    // doc's own word for it (7章)
    waterThreshold: 0.865,
    minCrystalTiles: 4,
    // 40 bushes against meadow's 26 at 60x60 (design-phase11-worldmap.md
    // 7章), carried forward as a multiplier so it scales with map area
    // instead of being pinned to the old absolute count
    berryDensityMultiplier: 40 / 26,
    forageRegrowMultiplier: 1.0,
    // estimate, not yet measured against a target: "the forest comes back
    // faster" (design doc 3.4) with no number attached. Doubling the daily
    // chance is the smallest change that reads as faster without leaving the
    // fixed point (regrowForest still stops at forestCapacity)
    forestRegrowMultiplier: 2.0,
    wildlifeMultiplier: { deer: 1.5, rabbit: 1.5, wolf: 1.5 },
    lampMoodBonus: 5,
  },
  /** Stone and ore, and food that only comes if you go looking for it. */
  crag: {
    forestThreshold: 0.64,
    stoneThreshold: 0.62,
    crystalNoiseThreshold: 0.56,
    ironNoiseThreshold: 0.51,
    // measured, seeds 1-20 through testWorld at 60x60: 0.27% water total
    // (0.27% shallow / 0.00% deep) - "almost none" (7章). No deep water at
    // all across those twenty seeds, and several land on zero ponds, which
    // is the point: a crag world may simply have no lake
    waterThreshold: 0.95,
    minCrystalTiles: 16,
    // 12 bushes against meadow's 26 at 60x60
    berryDensityMultiplier: 12 / 26,
    forageRegrowMultiplier: 0.6,
    forestRegrowMultiplier: 1,
    wildlifeMultiplier: { goat: 1.5 },
    lampMoodBonus: 5,
  },
  /** Mana bleeds into the ground here; little else does well. */
  manaheath: {
    forestThreshold: 0.6,
    stoneThreshold: 0.7,
    crystalNoiseThreshold: 0.4,
    ironNoiseThreshold: 0.35,
    // measured, seeds 1-20 through testWorld at 60x60: 1.44% water total
    // (1.31% shallow / 0.12% deep) - "a bit less" than meadow's 3.04% (7章)
    waterThreshold: 0.89,
    minCrystalTiles: 32,
    // 20 bushes against meadow's 26 at 60x60
    berryDensityMultiplier: 20 / 26,
    forageRegrowMultiplier: 0.8,
    forestRegrowMultiplier: 1,
    wildlifeMultiplier: { deer: 0.7, boar: 0.7, rabbit: 0.7, chicken: 0.7, goat: 0.7, wolf: 0.7 },
    // the one place a biome bends a number that is not a generation or
    // wildlife lever: manaheath is the mana-soaked land, and the lamp is the
    // one thought that says so (design-phase11-worldmap.md 3.2)
    lampMoodBonus: 6,
  },
};

/**
 * The biome a state was generated under. Reading it through here rather than
 * off the field directly means a hand-built test state or a save from before
 * biomes existed behaves as meadow - the same old unconditional rules -
 * rather than crashing on an undefined (scenarioOf in scenario.ts is the same
 * shape for the same reason).
 */
export function biomeOf(state: { biome?: BiomeName }): BiomeProfile {
  return (state.biome && BIOMES[state.biome]) || BIOMES[DEFAULT_BIOME];
}
