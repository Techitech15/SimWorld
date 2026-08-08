// The extractor: the first mana building that changes the production chain
// rather than how somebody feels about it (11章 フェーズ2 段階C).
//
// What the player buys is not speed - a colonist cuts a rock face far faster -
// but labour. The machine never walks anywhere, never stops for a meal, and
// never has to be told. What it costs is a furnace's whole output, and the
// crystal to keep that furnace lit.
import { describe, expect, it } from 'vitest';
import { CRYSTAL_PER_VEIN, STONE_PER_ROCK } from './constants';
import {
  BURN_TICKS_PER_CRYSTAL,
  EXTRACTOR_RADIUS,
  EXTRACTOR_TICKS_PER_ROCK,
  MANA_DRAW,
  MANA_OUTPUT,
  buildNetworks,
  extractorTarget,
  isPowered,
} from './mana';
import { isRock, tileIdOf } from './state';
import { createHarness, idleColony, recordLog } from './testUtils';
import type { BuildingType, GameState } from './types';

function put(state: GameState, type: BuildingType, x: number, y: number): string {
  const id = `b_${type}_${x}_${y}`;
  const tileId = tileIdOf(x, y);
  state.buildings[id] = {
    id,
    type,
    tileId,
    isBlueprint: false,
    hpCurrent: 100,
    hpMax: 100,
    requiredResources: [],
    buildProgress: 1,
    growth: 0,
    sown: false,
    manaFuel: 0,
    manaProgress: 0,
  };
  state.tiles[tileId] = { ...state.tiles[tileId], buildingId: id };
  return id;
}

function rock(state: GameState, x: number, y: number): void {
  const id = tileIdOf(x, y);
  state.tiles[id] = { ...state.tiles[id], terrain: 'stone', walkable: false };
}

/** A furnace with fuel, an extractor beside it, and rock beside that. */
function rig(seed: number, options: { crystal?: boolean; rocks?: number } = {}) {
  const harness = createHarness(seed);
  idleColony(harness.state);
  const x = 12;
  const y = 12;
  // Clear everything the machine can reach before laying the seam. Without
  // this the rig is at the mercy of whatever the map generated next door: the
  // first version had rock one tile north on some seeds, so the extractor cut
  // that instead and the test read as a bug in the feature.
  for (let dy = -EXTRACTOR_RADIUS - 1; dy <= EXTRACTOR_RADIUS + 1; dy++) {
    for (let dx = -EXTRACTOR_RADIUS - 2; dx <= EXTRACTOR_RADIUS + 2; dx++) {
      const id = tileIdOf(x + dx, y + dy);
      if (!harness.state.tiles[id]) continue;
      harness.state.tiles[id] = { ...harness.state.tiles[id], terrain: 'grass', walkable: true };
    }
  }
  const furnace = put(harness.state, 'manaFurnace', x - 1, y);
  harness.state.buildings[furnace] = {
    ...harness.state.buildings[furnace],
    manaFuel: BURN_TICKS_PER_CRYSTAL * 20,
  };
  const extractor = put(harness.state, 'manaExtractor', x, y);
  for (let i = 1; i <= (options.rocks ?? 3); i++) rock(harness.state, x + i, y);
  if (options.crystal) {
    const id = tileIdOf(x + 1, y);
    harness.state.tiles[id] = { ...harness.state.tiles[id], terrain: 'crystal', walkable: false };
  }
  // the rig rewrote the terrain, which in the game always goes through
  // invalidateTile; say so, or the region labels describe the map as it was
  harness.ctx.regionsDirty = true;
  return { harness, furnace, extractor, x, y };
}

function stockOf(state: GameState, type: string): number {
  let total = 0;
  for (const id in state.items) {
    if (state.items[id].type === type) total += state.items[id].quantity;
  }
  return total;
}

describe('what an extractor is for', () => {
  it('costs most of a furnace, so one furnace runs one of them', () => {
    expect(MANA_DRAW.manaExtractor).toBeGreaterThan(MANA_DRAW.manaLamp!);
    expect(MANA_DRAW.manaExtractor).toBeLessThanOrEqual(MANA_OUTPUT.manaFurnace!);
    // two of them do not fit on one furnace: that is the decision
    expect(MANA_DRAW.manaExtractor! * 2).toBeGreaterThan(MANA_OUTPUT.manaFurnace!);
  });

  it('is far slower than a colonist, per rock', () => {
    // the trade is labour, not speed - stated here so the numbers cannot drift
    // apart without somebody noticing
    expect(EXTRACTOR_TICKS_PER_ROCK).toBeGreaterThan(60 * 4);
  });

  it('takes the nearest face within reach, and nothing beyond it', () => {
    const { harness, extractor, x, y } = rig(4001);
    const target = extractorTarget(harness.state, harness.state.buildings[extractor]);
    expect(target?.id).toBe(tileIdOf(x + 1, y)); // nearest first

    // clear everything in reach: rock further out is not its problem
    for (let i = 1; i <= EXTRACTOR_RADIUS; i++) {
      const id = tileIdOf(x + i, y);
      harness.state.tiles[id] = { ...harness.state.tiles[id], terrain: 'grass', walkable: true };
    }
    rock(harness.state, x + EXTRACTOR_RADIUS + 1, y);
    expect(extractorTarget(harness.state, harness.state.buildings[extractor])).toBe(null);
  });
});

describe('cutting rock without a colonist', () => {
  it('turns rock into stone in the store, with nobody told to do anything', () => {
    const { harness, extractor, x, y } = rig(4003);
    // idleColony has switched every work priority off: nothing here is done by
    // a person, which is the whole claim
    expect(stockOf(harness.state, 'stone')).toBe(0);

    harness.run(EXTRACTOR_TICKS_PER_ROCK + 5);
    expect(stockOf(harness.state, 'stone')).toBe(STONE_PER_ROCK);
    expect(isRock(harness.state.tiles[tileIdOf(x + 1, y)].terrain)).toBe(false);
    expect(harness.state.tiles[tileIdOf(x + 1, y)].walkable).toBe(true);
    // and it has already started on the next face rather than waiting to be told
    expect(harness.state.buildings[extractor].manaProgress).toBeLessThan(
      EXTRACTOR_TICKS_PER_ROCK,
    );
  });

  it('works its way along the seam', () => {
    const { harness, x, y } = rig(4007, { rocks: 3 });
    harness.run(EXTRACTOR_TICKS_PER_ROCK * 3 + 10);
    expect(stockOf(harness.state, 'stone')).toBe(STONE_PER_ROCK * 3);
    for (let i = 1; i <= 3; i++) {
      expect(isRock(harness.state.tiles[tileIdOf(x + i, y)].terrain)).toBe(false);
    }
  });

  it('brings up crystal when it hits a vein', () => {
    const { harness } = rig(4011, { crystal: true });
    const lines = recordLog(harness, EXTRACTOR_TICKS_PER_ROCK + 5);
    expect(stockOf(harness.state, 'manaCrystal')).toBe(CRYSTAL_PER_VEIN);
    expect(lines.some((line) => line.includes('mana crystal vein'))).toBe(true);
  });

  it('says so when the face is worked out, rather than drawing mana in silence', () => {
    const { harness } = rig(4013, { rocks: 1 });
    const lines = recordLog(harness, EXTRACTOR_TICKS_PER_ROCK + 60);
    expect(lines.some((line) => line.includes('run out of rock'))).toBe(true);
    // and it does not repeat the complaint every tick
    expect(lines.filter((line) => line.includes('run out of rock')).length).toBe(1);
  });
});

describe('what happens when the power goes', () => {
  it('stops, and does not make up the lost time afterwards', () => {
    const { harness, furnace, extractor } = rig(4017);
    harness.run(200);
    const progress = harness.state.buildings[extractor].manaProgress;
    expect(progress).toBeGreaterThan(0);

    // pull the fuel: the grid goes dark
    harness.state.buildings[furnace] = { ...harness.state.buildings[furnace], manaFuel: 0 };
    expect(isPowered(buildNetworks(harness.state), extractor)).toBe(false);

    harness.run(300);
    // progress held exactly where it was - an outage that cost nothing would
    // make keeping the furnace lit pointless
    expect(harness.state.buildings[extractor].manaProgress).toBe(progress);
    expect(stockOf(harness.state, 'stone')).toBe(0);

    // power it again and it carries on from there
    harness.state.buildings[furnace] = {
      ...harness.state.buildings[furnace],
      manaFuel: BURN_TICKS_PER_CRYSTAL * 10,
    };
    harness.run(EXTRACTOR_TICKS_PER_ROCK - progress + 5);
    expect(stockOf(harness.state, 'stone')).toBe(STONE_PER_ROCK);
  });

  it('does nothing at all with no furnace on its grid', () => {
    const { harness, furnace } = rig(4019);
    delete harness.state.buildings[furnace];
    harness.run(EXTRACTOR_TICKS_PER_ROCK + 50);
    expect(stockOf(harness.state, 'stone')).toBe(0);
  });
});

describe('the ground it opens up', () => {
  it('leaves walkable ground behind, and the colony can path across it', () => {
    // the same event as a colonist mining the tile out: regions go stale and
    // cached paths through it do not
    const { harness, x, y } = rig(4023, { rocks: 1 });
    const tileId = tileIdOf(x + 1, y);
    harness.run(1); // the labels catch up with the rig's terrain
    expect(harness.ctx.regions[y * 60 + x + 1]).toBe(-1);

    harness.run(EXTRACTOR_TICKS_PER_ROCK + 60);
    expect(harness.state.tiles[tileId].walkable).toBe(true);
    expect(harness.ctx.regions[y * 60 + x + 1]).not.toBe(-1);
  });
});
