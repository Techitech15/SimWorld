// Trade (11章 フェーズ5, docs/design-phase5-trade.md 段階 T-A/T-B).
//
// The claims worth testing are the ones the design note argued for: the loop
// stays open for a world with no veins, the deal is ordinary hauling and so can
// be missed, and the market is the same on a reloaded save.
import { describe, expect, it } from 'vitest';
import {
  ARRIVAL_FOOD_PER_COLONIST,
  TRADE_BASE_VALUE,
  TRADE_BUY_RATE,
  TRADE_INTERVAL_TICKS,
  TRADE_SELL_RATE,
  TRADE_STAY_TICKS,
} from './constants';
import { BURN_TICKS_PER_CRYSTAL, buildNetworks } from './mana';
import {
  clearTradeDeal,
  creditFor,
  findTradingPost,
  goodsFor,
  hasLitLamp,
  runTrade,
  setTradeDeal,
  traderAtPost,
} from './trade';
import { tileIdOf } from './state';
import { createHarness, recordLog } from './testUtils';
import { addItem } from './worldgen';
import type { BuildingType, GameState } from './types';

function put(state: GameState, type: BuildingType, x: number, y: number, fuel = 0): string {
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
    manaFuel: fuel,
    manaProgress: 0,
  };
  state.tiles[tileId] = { ...state.tiles[tileId], buildingId: id };
  return id;
}

/** A colony with a post, food in the store, and the clock on a visit boundary. */
function market(seed: number, options: { lamp?: boolean; wood?: number } = {}) {
  const harness = createHarness(seed);
  const at = Object.values(harness.state.colonists)[0].position;
  const postId = put(harness.state, 'tradingPost', at.x + 2, at.y + 2);
  const population = Object.keys(harness.state.colonists).length;
  addItem(harness.state, 'food', population * ARRIVAL_FOOD_PER_COLONIST + 50, at.x, at.y);
  if (options.wood) addItem(harness.state, 'wood', options.wood, at.x, at.y + 1);
  if (options.lamp) {
    put(harness.state, 'manaFurnace', at.x - 3, at.y, BURN_TICKS_PER_CRYSTAL * 20);
    put(harness.state, 'manaLamp', at.x - 2, at.y);
  }
  harness.state.tick = TRADE_INTERVAL_TICKS;
  return { harness, postId, at };
}

function visit(harness: { state: GameState }): void {
  runTrade(harness.state, buildNetworks(harness.state));
}

describe('who comes to the post', () => {
  it('nobody, without a post', () => {
    const { harness } = market(8001);
    harness.state.buildings = {};
    visit(harness);
    expect(traderAtPost(harness.state)).toBe(null);
  });

  it('nobody, without food to spare', () => {
    const { harness } = market(8003);
    harness.state.items = {};
    visit(harness);
    expect(traderAtPost(harness.state)).toBe(null);
  });

  it('a pedlar, for a colony with no mana at all', () => {
    // the loop the design note nearly closed: a world with no veins must still
    // be able to trade its way to its first crystal
    const { harness } = market(8007);
    expect(hasLitLamp(harness.state, buildNetworks(harness.state))).toBe(false);
    visit(harness);
    const trader = traderAtPost(harness.state)!;
    expect(trader.kind).toBe('pedlar');
    expect(trader.offers.every((o) => o.resource !== 'manaCrystal')).toBe(true);
  });

  it('a crystal factor once a lamp is lit', () => {
    const { harness } = market(8011, { lamp: true });
    expect(hasLitLamp(harness.state, buildNetworks(harness.state))).toBe(true);
    visit(harness);
    expect(traderAtPost(harness.state)!.kind).toBe('crystalFactor');
  });

  it('comes in winter, unlike a settler', () => {
    const { harness } = market(8013);
    // five-day intervals land in every season; pick one inside winter
    harness.state.tick = TRADE_INTERVAL_TICKS * 4;
    visit(harness);
    expect(traderAtPost(harness.state)).not.toBe(null);
  });

  it('leaves after a day, and says so', () => {
    const { harness } = market(8017);
    visit(harness);
    const trader = traderAtPost(harness.state)!;
    expect(trader.departsAtTick).toBe(harness.state.tick + TRADE_STAY_TICKS);

    const lines = recordLog(harness, TRADE_STAY_TICKS + 20);
    expect(traderAtPost(harness.state)).toBe(null);
    expect(lines).toContain('traderLeft');
  });

  it('does not stack two traders at one post', () => {
    const { harness } = market(8019);
    visit(harness);
    harness.state.tick += TRADE_INTERVAL_TICKS;
    visit(harness);
    expect(Object.keys(harness.state.traders).length).toBe(1);
  });
});

describe('the prices', () => {
  it('buy low and sell high, so trade is not a free converter', () => {
    expect(TRADE_BUY_RATE).toBeLessThan(1);
    expect(TRADE_SELL_RATE).toBeGreaterThan(1);
  });

  it('makes a crystal cost about a vein of wood', () => {
    // the design note's own arithmetic: 120 wood should buy about five
    const { harness } = market(8023, { lamp: true });
    visit(harness);
    const trader = traderAtPost(harness.state)!;
    const credit = creditFor(trader, 'wood', 120);
    const crystals = goodsFor(trader, 'manaCrystal', credit);
    expect(crystals).toBeGreaterThan(2);
    expect(crystals).toBeLessThan(9);
  });

  it('brings the same trader with the same goods on a reloaded save', () => {
    const a = market(8029, { lamp: true });
    visit(a.harness);
    const b = market(8029, { lamp: true });
    visit(b.harness);
    const one = traderAtPost(a.harness.state)!;
    const two = traderAtPost(b.harness.state)!;
    expect(two.name).toBe(one.name);
    expect(two.offers).toEqual(one.offers);
  });

  it('gives different worlds different markets', () => {
    const a = market(8031, { lamp: true });
    const b = market(8037, { lamp: true });
    visit(a.harness);
    visit(b.harness);
    const one = traderAtPost(a.harness.state)!;
    const two = traderAtPost(b.harness.state)!;
    expect(`${one.name}${JSON.stringify(one.offers)}`).not.toBe(
      `${two.name}${JSON.stringify(two.offers)}`,
    );
  });
});

describe('striking a deal', () => {
  it('refuses a deal for something the trader has not got', () => {
    const { harness } = market(8041); // pedlar: no crystal
    visit(harness);
    const trader = traderAtPost(harness.state)!;
    const before = harness.state;
    expect(setTradeDeal(harness.state, trader.id, 'wood', 'manaCrystal')).toBe(before);
    expect(setTradeDeal(harness.state, trader.id, 'wood', 'wood')).toBe(before);
  });

  it('hauls the goods over and drops the payment at the post', () => {
    const { harness, postId } = market(8043, { lamp: true, wood: 200 });
    visit(harness);
    const trader = traderAtPost(harness.state)!;
    harness.state = setTradeDeal(harness.state, trader.id, 'wood', 'manaCrystal');

    const before = Object.values(harness.state.items)
      .filter((i) => i.type === 'manaCrystal')
      .reduce((n, i) => n + i.quantity, 0);
    const lines = recordLog(harness, 1200);
    const after = Object.values(harness.state.items)
      .filter((i) => i.type === 'manaCrystal')
      .reduce((n, i) => n + i.quantity, 0);

    expect(after).toBeGreaterThan(before);
    expect(lines).toContain('tradeSettled');
    expect(findTradingPost(harness.state)).toBe(postId);
  });

  it('lets the deal expire if nobody hauls it in time', () => {
    // not a bug: making a deal is hauling work, and a colony that will not haul
    // watches the trader leave. Same shape as a furnace going cold.
    const { harness } = market(8047, { lamp: true, wood: 200 });
    visit(harness);
    const trader = traderAtPost(harness.state)!;
    harness.state = setTradeDeal(harness.state, trader.id, 'wood', 'manaCrystal');
    for (const id in harness.state.colonists) {
      const colonist = harness.state.colonists[id];
      harness.state.colonists[id] = {
        ...colonist,
        workPriorities: { ...colonist.workPriorities, haul: 0, build: 0 },
      };
    }
    harness.run(TRADE_STAY_TICKS + 50);
    expect(traderAtPost(harness.state)).toBe(null);
    expect(
      Object.values(harness.state.items).some((i) => i.type === 'manaCrystal'),
    ).toBe(false);
  });

  it('can be called off', () => {
    const { harness } = market(8053, { lamp: true });
    visit(harness);
    const trader = traderAtPost(harness.state)!;
    harness.state = setTradeDeal(harness.state, trader.id, 'wood', 'manaCrystal');
    expect(harness.state.traders[trader.id].deal).not.toBe(null);
    harness.state = clearTradeDeal(harness.state, trader.id);
    expect(harness.state.traders[trader.id].deal).toBe(null);
  });

  it('leaves nothing behind when the trader goes', () => {
    // the same after-the-fact check the other layers get: no orphan jobs, no
    // held reservations, nothing carried into the void
    const { harness } = market(8059, { lamp: true, wood: 200 });
    visit(harness);
    const trader = traderAtPost(harness.state)!;
    harness.state = setTradeDeal(harness.state, trader.id, 'wood', 'manaCrystal');
    harness.run(TRADE_STAY_TICKS + 400);

    expect(harness.state.traders).toEqual({});
    for (const id in harness.state.jobs) {
      const job = harness.state.jobs[id];
      expect(job.destinationId === null || !!harness.state.buildings[job.destinationId]).toBe(true);
    }
    for (const id in harness.state.colonists) {
      const carrying = harness.state.colonists[id].carrying;
      // anything still in hand belongs to a job that still exists
      if (carrying) expect(harness.state.colonists[id].currentJobId).not.toBe(null);
    }
  });
});

describe('the base table', () => {
  it('prices mana far above the things dug out of the ground', () => {
    expect(TRADE_BASE_VALUE.manaCrystal).toBeGreaterThan(TRADE_BASE_VALUE.food);
    expect(TRADE_BASE_VALUE.food).toBeGreaterThan(TRADE_BASE_VALUE.wood);
  });
});
