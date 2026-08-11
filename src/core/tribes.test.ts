// Acceptance conditions for tribes, stage C (docs/design-phase11-worldmap.md
// 8章, the "動いたと言える条件" row for stage C).
import { describe, expect, it } from 'vitest';
import { runArrivals } from './arrivals';
import {
  ARRIVAL_FOOD_PER_COLONIST,
  ARRIVAL_INTERVAL_TICKS,
  RAID_FIRST_DAY,
  TICKS_PER_DAY,
  TRADE_INTERVAL_TICKS,
} from './constants';
import { runIncidents } from './events';
import { buildNetworks } from './mana';
import { runTrade } from './trade';
import { testWorld } from './testUtils';
import { TRIBE_NAMES, tribalInfluence } from './tribes';
import { WORLD_MAP_SIZE, worldMapGrid } from './worldmap';
import { addItem } from './worldgen';
import type { GameState } from './types';

/** The nearest-to-territory cell and furthest-from-territory cell `worldSeed`'s map has, for `tribe`. */
function nearAndFarCells(
  worldSeed: number,
  tribe: (typeof TRIBE_NAMES)[number],
): { near: { x: number; y: number } | null; far: { x: number; y: number } | null } {
  let near: { x: number; y: number } | null = null;
  let far: { x: number; y: number } | null = null;
  let maxDistance = -1;
  for (let y = 0; y < WORLD_MAP_SIZE; y++) {
    for (let x = 0; x < WORLD_MAP_SIZE; x++) {
      const influence = tribalInfluence({ worldSeed, worldCell: { x, y } })[tribe];
      if (influence.near && !near) near = { x, y };
      if (!influence.near && influence.distance > maxDistance) {
        maxDistance = influence.distance;
        far = { x, y };
      }
    }
  }
  return { near, far };
}

describe('tribalInfluence', () => {
  it('is neutral - every multiplier 1 - for a legacy worldCell: null save', () => {
    const influence = tribalInfluence({ worldSeed: 12345, worldCell: null });
    expect(influence.lanternfolk.traderIntervalMultiplier).toBe(1);
    expect(influence.waldkin.migrantIntervalMultiplier).toBe(1);
    expect(influence.parched.raidSizeMultiplier).toBe(1);
    expect(influence.parched.raidWeightMultiplier).toBe(1);
    expect(influence.lanternfolk.near).toBe(false);
    expect(influence.waldkin.near).toBe(false);
    expect(influence.parched.near).toBe(false);
  });

  it('a cell inside crag territory is "near" the Parched, distance 0', () => {
    const grid = worldMapGrid(1);
    let crag: { x: number; y: number } | null = null;
    for (let y = 0; y < WORLD_MAP_SIZE && !crag; y++) {
      for (let x = 0; x < WORLD_MAP_SIZE && !crag; x++) {
        if (grid[y][x].biome === 'crag') crag = { x, y };
      }
    }
    expect(crag).not.toBeNull();
    const influence = tribalInfluence({ worldSeed: 1, worldCell: crag! });
    expect(influence.parched.distance).toBe(0);
    expect(influence.parched.near).toBe(true);
    expect(influence.parched.raidSizeMultiplier).toBeGreaterThan(1);
  });

  it('the same worldSeed and cell always gives the same multipliers', () => {
    const a = tribalInfluence({ worldSeed: 777, worldCell: { x: 4, y: 4 } });
    const b = tribalInfluence({ worldSeed: 777, worldCell: { x: 4, y: 4 } });
    expect(a).toEqual(b);
  });

  it('recomputes correctly when the cell changes - the memo does not stick', () => {
    // exercises the module-level cache in tribes.ts: a second, different call
    // must not just return the first call's cached value
    const a = tribalInfluence({ worldSeed: 42, worldCell: { x: 0, y: 0 } });
    const b = tribalInfluence({ worldSeed: 42, worldCell: { x: 15, y: 15 } });
    const c = tribalInfluence({ worldSeed: 42, worldCell: { x: 0, y: 0 } });
    expect(a).toEqual(c);
    // not a hard guarantee for every pair of corners, but true for worldSeed 42
    expect(a.parched.distance).not.toBe(b.parched.distance);
  });
});

describe('the Waldkin interval lever', () => {
  const WORLD_SEED = 2;
  const { near, far } = nearAndFarCells(WORLD_SEED, 'waldkin');

  it('shortens ARRIVAL_INTERVAL_TICKS near deepwood territory, leaves it alone far away', () => {
    expect(near).not.toBeNull();
    expect(far).not.toBeNull();
    const nearInfluence = tribalInfluence({ worldSeed: WORLD_SEED, worldCell: near! });
    const farInfluence = tribalInfluence({ worldSeed: WORLD_SEED, worldCell: far! });
    expect(Math.round(ARRIVAL_INTERVAL_TICKS * nearInfluence.waldkin.migrantIntervalMultiplier)).toBe(
      TICKS_PER_DAY * 2,
    );
    expect(Math.round(ARRIVAL_INTERVAL_TICKS * farInfluence.waldkin.migrantIntervalMultiplier)).toBe(
      ARRIVAL_INTERVAL_TICKS,
    );
  });

  it('a colony near Waldkin territory actually gets its first arrival sooner', () => {
    // Measured: worldSeed 2, near cell (6,0) draws its first arrival at tick
    // 6000 (day 2); the far cell (0,0) at tick 9000 (day 3) - exactly the 3日
    // -> 2日 the lever promises (7章), not just a smaller number.
    function firstArrivalTick(worldCell: { x: number; y: number }): number {
      const state = testWorld({ seed: WORLD_SEED, worldCell });
      const at = Object.values(state.colonists)[0].position;
      addItem(state, 'food', 5000, at.x, at.y); // never the food gate, only the interval
      for (let tick = 0; tick <= ARRIVAL_INTERVAL_TICKS * 2; tick++) {
        state.tick = tick;
        const before = Object.keys(state.colonists).length;
        runArrivals(state);
        if (Object.keys(state.colonists).length > before) return tick;
      }
      return -1;
    }

    const nearTick = firstArrivalTick(near!);
    const farTick = firstArrivalTick(far!);
    expect(nearTick).toBe(TICKS_PER_DAY * 2);
    expect(farTick).toBe(ARRIVAL_INTERVAL_TICKS);
    expect(nearTick).toBeLessThan(farTick);
  });
});

describe('the Lanternfolk interval lever', () => {
  const WORLD_SEED = 3;
  const { near, far } = nearAndFarCells(WORLD_SEED, 'lanternfolk');

  it('shortens TRADE_INTERVAL_TICKS near manaheath territory, leaves it alone far away', () => {
    expect(near).not.toBeNull();
    expect(far).not.toBeNull();
    const nearInfluence = tribalInfluence({ worldSeed: WORLD_SEED, worldCell: near! });
    const farInfluence = tribalInfluence({ worldSeed: WORLD_SEED, worldCell: far! });
    expect(Math.round(TRADE_INTERVAL_TICKS * nearInfluence.lanternfolk.traderIntervalMultiplier)).toBe(
      TICKS_PER_DAY * 3,
    );
    expect(Math.round(TRADE_INTERVAL_TICKS * farInfluence.lanternfolk.traderIntervalMultiplier)).toBe(
      TRADE_INTERVAL_TICKS,
    );
  });

  it('a colony near Lanternfolk territory sees its first trader sooner', () => {
    // Measured: worldSeed 3, near cell (9,0) sees its first trader at tick
    // 9000 (day 3); the far cell (0,0) at tick 15000 (day 5) - the 5日 -> 3日
    // the lever promises.
    function firstVisitTick(worldCell: { x: number; y: number }): number {
      const state = testWorld({ seed: WORLD_SEED, worldCell });
      const at = Object.values(state.colonists)[0].position;
      const postId = 'b_post_test';
      const tileId = `${at.x + 2},${at.y + 2}`;
      state.buildings[postId] = {
        id: postId,
        type: 'tradingPost',
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
      state.tiles[tileId] = { ...state.tiles[tileId], buildingId: postId };
      addItem(
        state,
        'food',
        Object.keys(state.colonists).length * ARRIVAL_FOOD_PER_COLONIST + 50,
        at.x,
        at.y,
      );

      for (let tick = 0; tick <= TRADE_INTERVAL_TICKS * 2; tick++) {
        state.tick = tick;
        runTrade(state, buildNetworks(state));
        if (Object.keys(state.traders).length > 0) return tick;
      }
      return -1;
    }

    const nearTick = firstVisitTick(near!);
    const farTick = firstVisitTick(far!);
    expect(nearTick).toBe(TICKS_PER_DAY * 3);
    expect(farTick).toBe(TRADE_INTERVAL_TICKS);
    expect(nearTick).toBeLessThan(farTick);
  });
});

describe('the Parched raid pressure', () => {
  /**
   * One day's incident roll, isolated from everything runIncidents does not
   * itself control: raiders are cleared before every roll so a raid earlier
   * in the loop can never block or crowd out the next day's roll (raid only
   * fires when nobody is already under attack), and the colony's population
   * - the other input to raidSize() - stays fixed because nothing here runs
   * the rest of the tick pipeline. What is left varying is exactly the two
   * things 7章 claims the Parched bend: whether the day's incident is a raid,
   * and how big it is if so.
   */
  function measureRaidPressure(
    worldSeed: number,
    worldCell: { x: number; y: number },
    days: number,
  ): { raids: number; raiders: number } {
    const state = testWorld({ seed: worldSeed, worldCell });
    let raids = 0;
    let raiders = 0;
    for (let day = RAID_FIRST_DAY + 1; day <= RAID_FIRST_DAY + days; day++) {
      state.raiders = {};
      state.tick = day * TICKS_PER_DAY;
      const before = state.log.length;
      runIncidents(state);
      if (state.log.length === before) continue;
      const entry = state.log[state.log.length - 1];
      if (entry.key === 'incidentRaid') {
        raids++;
        raiders += Number(entry.params?.count ?? 0);
      }
    }
    return { raids, raiders };
  }

  it(
    'raises both raid frequency and average raid size near their territory',
    () => {
      // Measured (docs/design-notes.md 「世界地図と部族」): 8 worldSeeds, 1,500
      // day-rolls each side, near vs the furthest cell from crag territory that
      // worldSeed's map has. Totals: near 386 raids / 1,284 raiders (avg size
      // 3.33), far 323 raids / 754 raiders (avg size 2.33) - a ~20% rise in
      // frequency and almost exactly the ×1.5 the size lever asks for, once
      // averaged over enough raids that the population/2 term and the jitter
      // wash out. The per-seed comparison never once inverted.
      const WORLD_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
      const DAYS = 1500;
      let totalNearRaids = 0;
      let totalFarRaids = 0;
      let totalNearRaiders = 0;
      let totalFarRaiders = 0;
      let comparisons = 0;

      for (const worldSeed of WORLD_SEEDS) {
        const { near, far } = nearAndFarCells(worldSeed, 'parched');
        if (!near || !far) continue; // a world with no crag cell at all - skip, note the miss
        comparisons++;
        const nearResult = measureRaidPressure(worldSeed, near, DAYS);
        const farResult = measureRaidPressure(worldSeed, far, DAYS);
        totalNearRaids += nearResult.raids;
        totalFarRaids += farResult.raids;
        totalNearRaiders += nearResult.raiders;
        totalFarRaiders += farResult.raiders;
        // the direction has to hold seed by seed, not just in the aggregate
        expect(nearResult.raiders).toBeGreaterThan(farResult.raiders);
      }

      expect(comparisons).toBeGreaterThanOrEqual(6); // the sample the totals above are drawn from
      expect(totalNearRaids).toBeGreaterThan(totalFarRaids);
      expect(totalNearRaiders).toBeGreaterThan(totalFarRaiders * 1.3); // well short of asserting exactly ×1.5
    },
    120000,
  );

  it('every raid log line names the Parched, near their territory or not', () => {
    // runIncidents only, not a full tick simulation (createHarness().run()
    // would cost real minutes over enough days to collect a handful of
    // raids - the whole rest of the tick pipeline has nothing to do with
    // what this checks). worldCell stays unset, i.e. far from every tribe,
    // which is the case the flavour text has to hold in too.
    const state = testWorld({ seed: 7001 });
    let raids = 0;
    for (let day = RAID_FIRST_DAY + 1; day <= RAID_FIRST_DAY + 400 && raids < 5; day++) {
      state.raiders = {};
      state.tick = day * TICKS_PER_DAY;
      const before = state.log.length;
      runIncidents(state);
      if (state.log.length === before) continue;
      const entry = state.log[state.log.length - 1];
      if (entry.key !== 'incidentRaid') continue;
      raids++;
      expect(entry.params?.tribe).toBe('parched');
    }
    expect(raids).toBeGreaterThan(0);
  });
});

describe('a legacy save plays exactly as it always did', () => {
  it('worldCell: null never bends a raid, a migrant, or a trader', () => {
    const state: GameState = testWorld({ seed: 9001 });
    expect(state.worldCell).toBeNull();
    const influence = tribalInfluence(state);
    expect(influence.parched.raidSizeMultiplier).toBe(1);
    expect(influence.parched.raidWeightMultiplier).toBe(1);
    expect(influence.waldkin.migrantIntervalMultiplier).toBe(1);
    expect(influence.lanternfolk.traderIntervalMultiplier).toBe(1);
  });
});
