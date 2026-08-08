// Raids (11章 フェーズ4).
//
// The thing being tested is not "hostiles exist" but the shape of the answer:
// somebody has to stand and fight, walls have to matter, and the mana network
// finally has something to defend.
import { describe, expect, it } from 'vitest';
import {
  COLONIST_ATTACK_INTERVAL_TICKS,
  RAIDER_ATTACK_INTERVAL_TICKS,
  RAIDER_HEALTH,
  RAID_DURATION_TICKS,
  RAID_FIRST_DAY,
  RAID_LEAVE_GRACE_TICKS,
  TICKS_PER_DAY,
  TURRET_RANGE,
} from './constants';
import { INCIDENTS } from './events';
import { BURN_TICKS_PER_CRYSTAL } from './mana';
import { damageRaider, defends, isUnderAttack, raidSize, spawnRaid } from './raid';
import { mulberry32 } from './rng';
import { tileIdOf } from './state';
import { createHarness, idleColony, recordLog } from './testUtils';
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

/** One raider standing next to one colonist, with the rest cleared away. */
function duel(seed: number, options: { defender?: boolean } = {}) {
  const harness = createHarness(seed);
  idleColony(harness.state);
  const ids = Object.keys(harness.state.colonists);
  for (const id of ids.slice(1)) delete harness.state.colonists[id];
  const colonistId = ids[0];
  harness.state.animals = {};

  const at = { x: 25, y: 25 };
  for (let dx = -2; dx <= 3; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const id = tileIdOf(at.x + dx, at.y + dy);
      harness.state.tiles[id] = {
        ...harness.state.tiles[id],
        terrain: 'grass',
        walkable: true,
        buildingId: null,
      };
    }
  }
  harness.state.colonists[colonistId] = {
    ...harness.state.colonists[colonistId],
    position: { ...at },
    needs: { hunger: 10, sleep: 10, recreation: 10 },
    health: 100,
    workPriorities: {
      ...harness.state.colonists[colonistId].workPriorities,
      hunt: options.defender ? 1 : 0,
    },
  };
  const raiderId = 'r_test';
  harness.state.raiders = {
    [raiderId]: {
      id: raiderId,
      name: 'Gash',
      position: { x: at.x + 1, y: at.y },
      path: null,
      pathExpiresAtTick: null,
      health: RAIDER_HEALTH,
      activity: { kind: 'advancing' },
      leavesAtTick: harness.state.tick + RAID_DURATION_TICKS,
    },
  };
  return { harness, colonistId, raiderId, at };
}

describe('a raid arrives', () => {
  it('does not come for a colony that has just started', () => {
    const harness = createHarness(7001);
    const raid = INCIDENTS.find((i) => i.name === 'raid')!;
    harness.state.tick = TICKS_PER_DAY * (RAID_FIRST_DAY - 1);
    expect(raid.apply(harness.state, mulberry32(1))).toBe(null);
    expect(Object.keys(harness.state.raiders).length).toBe(0);

    harness.state.tick = TICKS_PER_DAY * (RAID_FIRST_DAY + 1);
    expect(raid.apply(harness.state, mulberry32(1))).toContain('raider');
    expect(Object.keys(harness.state.raiders).length).toBeGreaterThan(0);
  });

  it('puts them on the edge of the map, on ground they can stand on', () => {
    const harness = createHarness(7003);
    const spawned = spawnRaid(harness.state, 4, mulberry32(11));
    expect(spawned.length).toBeGreaterThan(0);
    for (const id of spawned) {
      const at = harness.state.raiders[id].position;
      // They enter at the very edge and walk inwards to the first tile they can
      // stand on, so "on the edge" means near it, not exactly on it - measured,
      // a forested edge puts them three tiles in.
      const fromEdge = Math.min(at.x, at.y, 59 - at.x, 59 - at.y);
      expect(fromEdge).toBeLessThanOrEqual(8);
      expect(harness.state.tiles[tileIdOf(at.x, at.y)].walkable).toBe(true);
    }
  });

  it('scales with the colony, and never turns into a wipe', () => {
    const harness = createHarness(7007);
    for (let trial = 0; trial < 20; trial++) {
      const size = raidSize(harness.state, mulberry32(trial));
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThanOrEqual(5);
    }
  });

  it('does not start a second raid on top of the first', () => {
    const harness = createHarness(7011);
    harness.state.tick = TICKS_PER_DAY * (RAID_FIRST_DAY + 2);
    const raid = INCIDENTS.find((i) => i.name === 'raid')!;
    expect(raid.apply(harness.state, mulberry32(3))).toBeTruthy();
    expect(raid.apply(harness.state, mulberry32(5))).toBe(null);
  });
});

describe('somebody has to stand', () => {
  it('sends whoever is on hunting duty, and nobody else', () => {
    const { harness } = duel(7013, { defender: true });
    const colonist = Object.values(harness.state.colonists)[0];
    expect(defends(colonist)).toBe(true);
    expect(defends({ ...colonist, workPriorities: { ...colonist.workPriorities, hunt: 0 } })).toBe(
      false,
    );
  });

  it('a defender closes and fights', () => {
    const { harness, colonistId, raiderId } = duel(7017, { defender: true });
    harness.run(4);
    expect(harness.state.colonists[colonistId].activity.kind).toBe('fighting');

    harness.run(COLONIST_ATTACK_INTERVAL_TICKS * 3);
    expect(harness.state.raiders[raiderId]?.health ?? 0).toBeLessThan(RAIDER_HEALTH);
  });

  it('a defender kills the raider in the end, and the log says who', () => {
    const { harness, raiderId } = duel(7019, { defender: true });
    const lines = recordLog(harness, COLONIST_ATTACK_INTERVAL_TICKS * 20);
    expect(harness.state.raiders[raiderId]).toBeUndefined();
    expect(lines.some((l) => l.includes('was cut down by'))).toBe(true);
    expect(lines.some((l) => l.includes('the raid is over'))).toBe(true);
  });

  it('anybody else runs, exactly as they would from a wolf', () => {
    const { harness, colonistId } = duel(7023, { defender: false });
    harness.run(RAIDER_ATTACK_INTERVAL_TICKS * 2);
    const activity = harness.state.colonists[colonistId].activity;
    expect(activity.kind).toBe('fleeing');
    expect(harness.state.colonists[colonistId].health).toBeLessThan(100);
  });

  it('gives up and goes home rather than besieging for ever', () => {
    const { harness, raiderId } = duel(7029, { defender: false });
    // nobody to fight them: they should still leave
    harness.state.raiders[raiderId] = {
      ...harness.state.raiders[raiderId],
      leavesAtTick: harness.state.tick + 50,
    };
    const lines = recordLog(harness, 400);
    expect(lines.some((l) => l.includes('gives up'))).toBe(true);
  });

  it('is gone for good even if it cannot find the way out', () => {
    // a straggler that never reaches an edge would otherwise stand on the map
    // for the rest of the game
    const { harness, raiderId } = duel(7031, { defender: false });
    harness.state.colonists = {};
    harness.state.raiders[raiderId] = {
      ...harness.state.raiders[raiderId],
      leavesAtTick: harness.state.tick + 10,
    };
    harness.run(10 + RAID_LEAVE_GRACE_TICKS + 20);
    expect(harness.state.raiders[raiderId]).toBeUndefined();
  });
});

describe('walls are worth something', () => {
  it('a raider takes the wall apart rather than walking through it', () => {
    const harness = createHarness(7031);
    idleColony(harness.state);
    harness.state.animals = {};
    const at = Object.values(harness.state.colonists)[0].position;
    // a wall directly between the raider and the colony
    const wallId = put(harness.state, 'stoneWall', at.x + 3, at.y);
    harness.state.tiles[tileIdOf(at.x + 3, at.y)] = {
      ...harness.state.tiles[tileIdOf(at.x + 3, at.y)],
      walkable: false,
    };
    harness.state.raiders = {
      r1: {
        id: 'r1',
        name: 'Vole',
        position: { x: at.x + 4, y: at.y },
        path: null,
        pathExpiresAtTick: null,
        health: RAIDER_HEALTH,
        activity: { kind: 'advancing' },
        leavesAtTick: harness.state.tick + RAID_DURATION_TICKS,
      },
    };
    harness.run(RAIDER_ATTACK_INTERVAL_TICKS * 3);
    const wall = harness.state.buildings[wallId];
    // either chipped or already through: both mean the wall was in their way
    expect(wall === undefined || wall.hpCurrent < wall.hpMax).toBe(true);
  });
});

describe('the turret is what the network was for', () => {
  it('shoots a raider in range while the grid is lit', () => {
    const { harness, at } = duel(7037, { defender: false });
    put(harness.state, 'manaFurnace', at.x - 2, at.y, BURN_TICKS_PER_CRYSTAL * 20);
    put(harness.state, 'manaTurret', at.x - 1, at.y);

    harness.run(200);
    const raider = Object.values(harness.state.raiders)[0];
    expect((raider?.health ?? 0) < RAIDER_HEALTH || raider === undefined).toBe(true);
  });

  it('is a dead ornament with no mana behind it', () => {
    const { harness, at, raiderId } = duel(7041, { defender: false });
    put(harness.state, 'manaTurret', at.x - 1, at.y); // no furnace
    harness.run(200);
    expect(harness.state.raiders[raiderId]?.health).toBe(RAIDER_HEALTH);
  });

  it('does not reach across the map', () => {
    const { harness, at, raiderId } = duel(7043, { defender: false });
    put(harness.state, 'manaFurnace', 2, 2, BURN_TICKS_PER_CRYSTAL * 20);
    put(harness.state, 'manaTurret', 3, 2);
    expect(Math.abs(at.x - 3) + Math.abs(at.y - 2)).toBeGreaterThan(TURRET_RANGE);
    harness.run(200);
    expect(harness.state.raiders[raiderId]?.health).toBe(RAIDER_HEALTH);
  });
});

describe('bookkeeping', () => {
  it('knows when the colony is under attack and when it is not', () => {
    const { harness, raiderId } = duel(7047, { defender: false });
    expect(isUnderAttack(harness.state)).toBe(true);
    damageRaider(harness.state, raiderId, RAIDER_HEALTH, 'a test');
    expect(isUnderAttack(harness.state)).toBe(false);
  });

  it('a killed raider stops being somebody to swing at', () => {
    const { harness, colonistId, raiderId } = duel(7053, { defender: true });
    harness.run(4);
    expect(harness.state.colonists[colonistId].activity.kind).toBe('fighting');
    damageRaider(harness.state, raiderId, RAIDER_HEALTH, 'a test');
    expect(harness.state.colonists[colonistId].activity.kind).toBe('none');
  });
});
