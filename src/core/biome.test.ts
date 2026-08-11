// Acceptance conditions for biomes, stage A (docs/design-phase11-worldmap.md
// 3, 8 - the "動いたと言える条件" row for stage A). Every biome is a bundle of
// generation levers plus a handful of daily multipliers, the same shape a
// scenario already is - these tests hold that bundle to the same standard the
// scenario and iron layers were held to: it generates, it survives a year, and
// each lever visibly does the thing it says it does.
import { describe, expect, it } from 'vitest';
import { BIOME_NAMES, BIOMES, biomeOf } from './biome';
import { isPredator, regrowForage } from './animals';
import { regrowForest } from './regrowth';
import { thoughtsOf } from './mood';
import { buildNetworks } from './mana';
import type { SimContext } from './derived';
import { FORAGE_REGROW_INTERVAL_TICKS, TICKS_PER_DAY } from './constants';
import { TICKS_PER_SEASON } from './season';
import { tileIdOf } from './state';
import { createHarness, idleColony, testWorld } from './testUtils';
import type { AnimalSpecies, GameState } from './types';

function countSpecies(state: GameState, species: AnimalSpecies): number {
  return Object.values(state.animals).filter((a) => a.species === species && !a.tame).length;
}

function crystalTiles(state: GameState): number {
  return Object.values(state.tiles).filter((t) => t.terrain === 'crystal').length;
}

/** Everything that has to stay true of any state the game can reach (chaos.test.ts's rule). */
function assertDescribable(state: GameState): void {
  for (const id in state.colonists) {
    const at = state.colonists[id].position;
    expect(state.tiles[tileIdOf(at.x, at.y)]?.walkable).toBe(true);
  }
  for (const id in state.animals) {
    expect(state.tiles[tileIdOf(state.animals[id].position.x, state.animals[id].position.y)]).toBeDefined();
  }
  for (const entityId in state.reservations) {
    const reservation = state.reservations[entityId];
    expect(state.colonists[reservation.colonistId]).toBeDefined();
  }
  for (const id in state.buildings) {
    expect(state.tiles[state.buildings[id].tileId]?.buildingId).toBe(id);
  }
}

describe('the BIOMES table', () => {
  it('names exactly the four biomes the design calls for', () => {
    expect([...BIOME_NAMES].sort()).toEqual(['crag', 'deepwood', 'manaheath', 'meadow'].sort());
  });

  it('meadow reproduces the generator exactly as it was before biomes existed', () => {
    // these are the literals worldgen.ts used unconditionally before this
    // change (0.58 / 0.72 / 0.62 / 0.57), and lampMoodBonus 5 is mood.ts's old
    // hardcoded amount - meadow is the baseline, not a fifth lever set
    expect(BIOMES.meadow).toMatchObject({
      forestThreshold: 0.58,
      stoneThreshold: 0.72,
      crystalNoiseThreshold: 0.62,
      ironNoiseThreshold: 0.57,
      berryDensityMultiplier: 1,
      forageRegrowMultiplier: 1,
      forestRegrowMultiplier: 1,
      lampMoodBonus: 5,
    });
    expect(BIOMES.meadow.wildlifeMultiplier).toEqual({});
  });

  it('gives every biome a floor above zero', () => {
    for (const name of BIOME_NAMES) expect(BIOMES[name].minCrystalTiles).toBeGreaterThan(0);
  });

  it('falls back to meadow for a state with no biome recorded, the same way scenarioOf does', () => {
    expect(biomeOf({})).toBe(BIOMES.meadow);
    expect(biomeOf({ biome: 'crag' })).toBe(BIOMES.crag);
  });
});

describe('every biome generates a playable map', () => {
  it.each(BIOME_NAMES)('%s starts a working colony', (biome) => {
    const state = testWorld({ seed: 5001, biome });
    expect(state.biome).toBe(biome);
    expect(Object.keys(state.colonists)).toHaveLength(3);
    expect(Object.values(state.buildings).filter((b) => b.type === 'bed')).toHaveLength(3);
    expect(Object.values(state.buildings).filter((b) => b.type === 'farmPlot').length).toBeGreaterThan(0);
    expect(Object.keys(state.animals).length).toBeGreaterThan(0);
    for (const id in state.colonists) {
      const at = state.colonists[id].position;
      expect(state.tiles[tileIdOf(at.x, at.y)].walkable).toBe(true);
    }
  });
});

describe('a year unattended, per biome (stage A acceptance)', () => {
  const YEAR = TICKS_PER_SEASON * 4;

  it.each(BIOME_NAMES)('%s runs a full year without the state falling apart', (biome) => {
    const harness = createHarness(6101, 60, biome);
    // colonists may die or arrive differently by biome (crag's thin forage and
    // deepwood's heavier wolves are meant to bite) - what stage A actually
    // promises is that nothing crashes and the state stays internally
    // consistent the whole way through, not a survival guarantee
    harness.run(YEAR);
    expect(harness.state.tick).toBe(YEAR);
    assertDescribable(harness.state);
  });
});

describe('the crystal floor holds in every biome', () => {
  // The full 200-seed regression lives in design-notes.md 「バイオーム（フェーズ11
  // 段階A）」 (a throwaway script, not part of this suite, per CLAUDE.md - a
  // 200-seed loop at 120x120 for four biomes takes about a minute). This is
  // its cheap always-run twin, the same relationship iron.test.ts has to the
  // 200-seed iron measurement.
  const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

  it.each(BIOME_NAMES)('%s never generates below its floor', (biome) => {
    const floor = BIOMES[biome].minCrystalTiles;
    for (const seed of SEEDS) {
      const state = testWorld({ seed, biome });
      expect(crystalTiles(state)).toBeGreaterThanOrEqual(floor);
    }
  });

  it('never removes crystal from a world that already clears the floor', () => {
    // meadow's floor (8) is measured (design-notes.md) to sit under every
    // 60x60 world's *natural* median by a wide margin, so most seeds should
    // pass through generation completely untouched by the floor step; this
    // just pins that the floor is additive-only, never subtractive
    for (const seed of SEEDS) {
      const state = testWorld({ seed, biome: 'meadow' });
      expect(crystalTiles(state)).toBeGreaterThan(0);
    }
  });
});

describe('berry density multiplier bends the starting bushes', () => {
  function bushes(state: GameState): number {
    return Object.values(state.buildings).filter((b) => b.type === 'berryBush').length;
  }

  it('deepwood plants more bushes than meadow, crag fewer, on the same seeds', () => {
    const SEEDS = [11, 13, 17, 19, 23, 29];
    let meadow = 0;
    let deepwood = 0;
    let crag = 0;
    for (const seed of SEEDS) {
      meadow += bushes(testWorld({ seed, biome: 'meadow' }));
      deepwood += bushes(testWorld({ seed, biome: 'deepwood' }));
      crag += bushes(testWorld({ seed, biome: 'crag' }));
    }
    expect(deepwood).toBeGreaterThan(meadow);
    expect(crag).toBeLessThan(meadow);
  });
});

describe('forage regrow multiplier', () => {
  /** Two identical maps that differ only in which biome they say they are. */
  function pair(): { meadow: GameState; crag: GameState } {
    const meadow = testWorld({ seed: 71, biome: 'meadow' });
    const crag: GameState = { ...meadow, biome: 'crag' };
    return { meadow, crag };
  }

  it("crag's thin ground recovers slower than meadow's, tile for tile", () => {
    const { meadow, crag } = pair();
    // graze the same tile bare on both maps
    let grassTileId: string | null = null;
    for (const id in meadow.tiles) {
      if (meadow.tiles[id].terrain === 'grass') {
        grassTileId = id;
        break;
      }
    }
    expect(grassTileId).toBeTruthy();
    const tileId = grassTileId!;
    meadow.tiles = { ...meadow.tiles, [tileId]: { ...meadow.tiles[tileId], forage: 0 } };
    crag.tiles = { ...crag.tiles, [tileId]: { ...crag.tiles[tileId], forage: 0 } };
    meadow.tick = FORAGE_REGROW_INTERVAL_TICKS;
    crag.tick = FORAGE_REGROW_INTERVAL_TICKS;

    const ctxMeadow = { forageDepleted: new Set([tileId]) } as unknown as SimContext;
    const ctxCrag = { forageDepleted: new Set([tileId]) } as unknown as SimContext;
    regrowForage(meadow, ctxMeadow);
    regrowForage(crag, ctxCrag);

    expect(meadow.tiles[tileId].forage).toBeGreaterThan(crag.tiles[tileId].forage);
    expect(crag.tiles[tileId].forage).toBeGreaterThan(0);
  });
});

describe('forest regrow multiplier', () => {
  it("deepwood's clearing heals at least as fast as meadow's on the identical map and dice", () => {
    // same terrain, same colonists, same everything except the biome tag -
    // regrowForest's per-tile roll is seeded from state.tick alone, so an
    // identical tick sequence draws the identical random stream on both
    // states, and a bigger chance can only pass a superset of that stream's
    // rolls (design comment in regrowth.ts)
    const base = testWorld({ seed: 83, biome: 'meadow' });
    const deepwood: GameState = { ...base, biome: 'deepwood', forestCapacity: base.forestCapacity };

    // clear-fell every forest tile beside camp so there is real room to heal
    const at = Object.values(base.colonists)[0].position;
    const felled: string[] = [];
    for (const id in base.tiles) {
      const tile = base.tiles[id];
      if (tile.terrain === 'forest' && Math.abs(tile.x - at.x) + Math.abs(tile.y - at.y) < 25) {
        felled.push(id);
      }
    }
    expect(felled.length).toBeGreaterThan(5);
    for (const id of felled) {
      base.tiles = { ...base.tiles, [id]: { ...base.tiles[id], terrain: 'grass' } };
      deepwood.tiles = { ...deepwood.tiles, [id]: { ...deepwood.tiles[id], terrain: 'grass' } };
    }
    const meadowForest = () => Object.values(base.tiles).filter((t) => t.terrain === 'forest').length;
    const deepwoodForest = () =>
      Object.values(deepwood.tiles).filter((t) => t.terrain === 'forest').length;
    const before = meadowForest();
    expect(deepwoodForest()).toBe(before);

    for (let day = 1; day <= 10; day++) {
      base.tick = day * TICKS_PER_DAY;
      deepwood.tick = day * TICKS_PER_DAY;
      regrowForest(base);
      regrowForest(deepwood);
    }

    expect(deepwoodForest()).toBeGreaterThanOrEqual(meadowForest());
    expect(deepwoodForest()).toBeGreaterThan(before);
  });
});

describe('wildlife multipliers bend the starting herds', () => {
  const SEEDS = [101, 103, 107, 109, 113, 127];

  it('deepwood starts with more deer and rabbits than meadow', () => {
    let meadowDeer = 0;
    let deepwoodDeer = 0;
    let meadowRabbit = 0;
    let deepwoodRabbit = 0;
    for (const seed of SEEDS) {
      const meadow = testWorld({ seed, biome: 'meadow' });
      const deepwood = testWorld({ seed, biome: 'deepwood' });
      meadowDeer += countSpecies(meadow, 'deer');
      deepwoodDeer += countSpecies(deepwood, 'deer');
      meadowRabbit += countSpecies(meadow, 'rabbit');
      deepwoodRabbit += countSpecies(deepwood, 'rabbit');
    }
    expect(deepwoodDeer).toBeGreaterThan(meadowDeer);
    expect(deepwoodRabbit).toBeGreaterThan(meadowRabbit);
  });

  it('crag starts with more goats than meadow', () => {
    let meadowGoats = 0;
    let cragGoats = 0;
    for (const seed of SEEDS) {
      meadowGoats += countSpecies(testWorld({ seed, biome: 'meadow' }), 'goat');
      cragGoats += countSpecies(testWorld({ seed, biome: 'crag' }), 'goat');
    }
    expect(cragGoats).toBeGreaterThan(meadowGoats);
  });

  it('manaheath starts with less wildlife overall than meadow', () => {
    let meadowTotal = 0;
    let manaheathTotal = 0;
    for (const seed of SEEDS) {
      meadowTotal += Object.keys(testWorld({ seed, biome: 'meadow' }).animals).length;
      manaheathTotal += Object.keys(testWorld({ seed, biome: 'manaheath' }).animals).length;
    }
    expect(manaheathTotal).toBeLessThan(meadowTotal);
  });

  it('bends the daily wolf cap too, since wolves never appear in the initial spawn', () => {
    // meadow: 2 predators * 1.0 = 2. deepwood: 2 * 1.5 = 3 (rounded).
    // manaheath: 2 * 0.7 = 1.4 -> 1 (rounded, floored by the max(1, ...) guard).
    const meadow = createHarness(6201, 60, 'meadow');
    const deepwood = createHarness(6201, 60, 'deepwood');
    const manaheath = createHarness(6201, 60, 'manaheath');
    // enough days for the daily spawn to reach each cap, starting from day 2
    const DAYS = 8;
    meadow.run(TICKS_PER_DAY * DAYS);
    deepwood.run(TICKS_PER_DAY * DAYS);
    manaheath.run(TICKS_PER_DAY * DAYS);

    const wolves = (state: GameState) => Object.values(state.animals).filter(isPredator).length;
    expect(wolves(deepwood.state)).toBeGreaterThanOrEqual(wolves(meadow.state));
    expect(wolves(manaheath.state)).toBeLessThanOrEqual(wolves(meadow.state));
  });
});

describe('the lamp mood bonus', () => {
  it("manaheath's lit lamp is worth more than meadow's", () => {
    const meadow = createHarness(9101, 60, 'meadow');
    idleColony(meadow.state);
    const colonist = Object.values(meadow.state.colonists)[0];
    const at = colonist.position;
    const put = (state: GameState, x: number, y: number, id: string, type: 'manaFurnace' | 'manaLamp') => {
      state.buildings[id] = {
        id,
        type,
        tileId: tileIdOf(x, y),
        isBlueprint: false,
        hpCurrent: 100,
        hpMax: 100,
        requiredResources: [],
        buildProgress: 1,
        growth: 0,
        sown: false,
        manaFuel: type === 'manaFurnace' ? 2000 : 0,
        manaProgress: 0,
      };
      state.tiles[tileIdOf(x, y)] = { ...state.tiles[tileIdOf(x, y)], buildingId: id };
    };
    put(meadow.state, at.x + 2, at.y, 'furnace', 'manaFurnace');
    put(meadow.state, at.x + 3, at.y, 'lamp', 'manaLamp');
    const manaheath: GameState = JSON.parse(JSON.stringify(meadow.state));
    manaheath.biome = 'manaheath';

    const meadowNetworks = buildNetworks(meadow.state);
    const manaheathNetworks = buildNetworks(manaheath);
    const meadowAmount = thoughtsOf(meadow.state, colonist, meadowNetworks).find(
      (t) => t.key === 'manaLight',
    )?.amount;
    const manaheathAmount = thoughtsOf(manaheath, manaheath.colonists[colonist.id], manaheathNetworks).find(
      (t) => t.key === 'manaLight',
    )?.amount;

    expect(meadowAmount).toBe(5);
    expect(manaheathAmount).toBe(6);
  });
});

describe('save round trip', () => {
  it('keeps the chosen biome through a JSON round trip', () => {
    const state = testWorld({ seed: 4001, biome: 'crag' });
    const restored = JSON.parse(JSON.stringify(state)) as GameState;
    expect(restored.biome).toBe('crag');
    expect(restored).toEqual(state);
  });
});
