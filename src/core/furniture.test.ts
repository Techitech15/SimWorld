// Furniture (フェーズ10 段階B, design-phase10-ores.md 4章・8章).
//
// Five pieces, zero new systems: the acceptance here is that each one measurably
// bends a number the game already had - a thought (table, stool, statue), sleep
// recovery (dresser), recreation recovery (armchair) - that blueprints do
// nothing, and that tearing any of them down strands no job, no reservation and
// no thought.
import { describe, expect, it } from 'vitest';
import { placeBuildingBlueprint, setDesignation } from './actions';
import {
  ARMCHAIR_RECREATION_MULTIPLIER,
  BUILDING_COSTS,
  DECONSTRUCT_REFUND,
  DRESSER_REST_MULTIPLIER,
  SLEEP_RECOVERY_PER_TICK,
  STATUE_THOUGHT_BONUS,
  TABLE_THOUGHT_BONUS,
  TABLE_WITH_STOOL_THOUGHT_BONUS,
} from './constants';
import { TRAITS } from './traits';
import { thoughtsOf } from './mood';
import { isWater, tileIdOf } from './state';
import { createHarness, idleColony } from './testUtils';
import { addItem } from './worldgen';
import type { BuildingType, GameState } from './types';

/** Strip the colony to one colonist so company and bed counts stay constant. */
function only(state: GameState): string {
  const ids = Object.keys(state.colonists);
  for (const id of ids.slice(1)) delete state.colonists[id];
  return ids[0];
}

/** Drop a finished building on a tile, the way the mood/recreation tests do. */
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

function putBlueprint(state: GameState, type: BuildingType, x: number, y: number): string {
  const id = put(state, type, x, y);
  state.buildings[id] = { ...state.buildings[id], isBlueprint: true, buildProgress: 0 };
  return id;
}

/**
 * The nearest free tile to (x, y) that a fixed offset can no longer promise:
 * water terrain (フェーズ14 段階 W-1) reshuffled where this seed's ore veins
 * and shores land, so a hardcoded `at.x + 1` can now land on an unwalkable
 * rock face or unbuildable water instead of the plain ground it used to be.
 * Searches outward ring by ring - same pattern as `storageAt` in
 * hauling.test.ts - and skips tiles already handed out so callers can ask
 * for several distinct spots near the same colonist. `buildable` additionally
 * excludes water, since shallow water is walkable ground a hauler can stand
 * on but not ground a blueprint can go down on (`placeBuildingBlueprint`).
 */
function groundNear(
  state: GameState,
  x: number,
  y: number,
  taken: Set<string>,
  buildable: boolean,
): { x: number; y: number } {
  for (let radius = 0; radius < 12; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const tile = state.tiles[tileIdOf(x + dx, y + dy)];
        if (!tile || !tile.walkable || tile.buildingId || taken.has(tile.id)) continue;
        if (buildable && isWater(tile.terrain)) continue;
        taken.add(tile.id);
        return { x: tile.x, y: tile.y };
      }
    }
  }
  throw new Error(`no free ${buildable ? 'buildable' : 'walkable'} ground near (${x}, ${y})`);
}

/** One fed, rested colonist with no traits, so multipliers read exactly. */
function calm(seed: number) {
  const harness = createHarness(seed);
  idleColony(harness.state);
  const id = only(harness.state);
  harness.state.colonists[id] = {
    ...harness.state.colonists[id],
    needs: { hunger: 0, sleep: 10, recreation: 0 },
    health: 100,
    traits: [],
  };
  return { harness, id };
}

function thoughtOf(state: GameState, colonistId: string, key: string) {
  return thoughtsOf(state, state.colonists[colonistId]).find((t) => t.key === key);
}

describe('the table (and the stool that belongs to it)', () => {
  function eatingNear(tableOffset: number | null, stoolOffset?: number) {
    const { harness, id } = calm(10007);
    const at = harness.state.colonists[id].position;
    if (tableOffset !== null) put(harness.state, 'table', at.x + tableOffset, at.y);
    if (stoolOffset !== undefined) put(harness.state, 'stool', at.x + stoolOffset, at.y);
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      activity: { kind: 'eating', itemId: null, ticksRemaining: 10 },
    };
    return { harness, id };
  }

  it('gives the thought to a colonist eating within its reach', () => {
    const { harness, id } = eatingNear(2);
    expect(thoughtOf(harness.state, id, 'ateAtTable')?.amount).toBe(TABLE_THOUGHT_BONUS);
  });

  it('gives nothing outside the radius, and nothing to a colonist not eating', () => {
    const outside = eatingNear(3);
    expect(thoughtOf(outside.harness.state, outside.id, 'ateAtTable')).toBeUndefined();

    const { harness, id } = eatingNear(2);
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      activity: { kind: 'none' },
    };
    expect(thoughtOf(harness.state, id, 'ateAtTable')).toBeUndefined();
  });

  it('is worth more with a stool drawn up to it', () => {
    // stool adjacent to the table (Chebyshev 1): the upgraded thought
    const seated = eatingNear(2, 1);
    expect(thoughtOf(seated.harness.state, seated.id, 'ateAtTable')?.amount).toBe(
      TABLE_WITH_STOOL_THOUGHT_BONUS,
    );
    // a stool across the room upgrades nothing
    const apart = eatingNear(2, -2);
    expect(thoughtOf(apart.harness.state, apart.id, 'ateAtTable')?.amount).toBe(
      TABLE_THOUGHT_BONUS,
    );
  });

  it('does nothing as a blueprint', () => {
    const { harness, id } = calm(10009);
    const at = harness.state.colonists[id].position;
    putBlueprint(harness.state, 'table', at.x + 1, at.y);
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      activity: { kind: 'eating', itemId: null, ticksRemaining: 10 },
    };
    expect(thoughtOf(harness.state, id, 'ateAtTable')).toBeUndefined();
  });
});

describe('the dresser', () => {
  /** Sleep off 300 ticks in a bed, with whatever stands near it. */
  function sleptSleep(furnish: (state: GameState, x: number, y: number) => void): number {
    const { harness, id } = calm(10037);
    const at = harness.state.colonists[id].position;
    const bedId = put(harness.state, 'bed', at.x, at.y);
    furnish(harness.state, at.x, at.y);
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      needs: { hunger: 0, sleep: 100, recreation: 0 },
      activity: { kind: 'sleeping', bedId },
    };
    harness.run(300, (state) => {
      // hold hunger down so nothing but the mattress is being measured
      const needs = state.colonists[id].needs;
      state.colonists[id] = { ...state.colonists[id], needs: { ...needs, hunger: 0 } };
    });
    return harness.state.colonists[id].needs.sleep;
  }

  it('makes a bed within its reach measurably better', () => {
    const plain = sleptSleep(() => {});
    const furnished = sleptSleep((state, x, y) => put(state, 'dresser', x + 2, y));
    expect(furnished).toBeLessThan(plain); // lower bar = better rested
    // and by exactly the advertised multiplier
    const ratio = (100 - furnished) / (100 - plain);
    expect(ratio).toBeCloseTo(DRESSER_REST_MULTIPLIER, 2);
    expect(100 - plain).toBeCloseTo(300 * SLEEP_RECOVERY_PER_TICK, 1);
  });

  it('does not stack: a second dresser adds nothing', () => {
    const one = sleptSleep((state, x, y) => put(state, 'dresser', x + 2, y));
    const two = sleptSleep((state, x, y) => {
      put(state, 'dresser', x + 2, y);
      put(state, 'dresser', x - 2, y);
    });
    expect(two).toBeCloseTo(one, 5);
  });

  it('does nothing as a blueprint or from across the room', () => {
    const plain = sleptSleep(() => {});
    const planned = sleptSleep((state, x, y) => putBlueprint(state, 'dresser', x + 2, y));
    const far = sleptSleep((state, x, y) => put(state, 'dresser', x + 3, y));
    expect(planned).toBeCloseTo(plain, 5);
    expect(far).toBeCloseTo(plain, 5);
  });

  it('stays weaker than who somebody is', () => {
    // the phase-10 ordering: furniture never beats the heavySleeper trait
    expect(DRESSER_REST_MULTIPLIER).toBeLessThan(TRAITS.heavySleeper.effects.rest!);
  });
});

describe('the armchair', () => {
  /** Sixty ticks of sitting at the given seat; how much boredom it burned. */
  function relaxedBy(type: 'hearth' | 'armchair'): number {
    const { harness, id } = calm(10061);
    const at = harness.state.colonists[id].position;
    const seatId = put(harness.state, type, at.x, at.y);
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      needs: { hunger: 0, sleep: 10, recreation: 90 },
      activity: { kind: 'relaxing', hearthId: seatId, untilTick: harness.state.tick + 60 },
    };
    harness.run(60);
    return 90 - harness.state.colonists[id].needs.recreation;
  }

  it('relieves recreation faster than the hearth, by its multiplier', () => {
    const hearth = relaxedBy('hearth');
    const armchair = relaxedBy('armchair');
    expect(armchair).toBeGreaterThan(hearth);
    expect(armchair / hearth).toBeCloseTo(ARMCHAIR_RECREATION_MULTIPLIER, 2);
  });

  it('is found by a bored colonist with no hearth anywhere', () => {
    const { harness, id } = calm(10067);
    const at = harness.state.colonists[id].position;
    const seatId = put(harness.state, 'armchair', at.x + 1, at.y);
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      needs: { hunger: 0, sleep: 10, recreation: 80 },
    };
    harness.run(3);
    const activity = harness.state.colonists[id].activity;
    expect(activity.kind).toBe('relaxing');
    expect(activity.kind === 'relaxing' && activity.hearthId).toBe(seatId);
    const before = harness.state.colonists[id].needs.recreation;
    harness.run(60);
    expect(harness.state.colonists[id].needs.recreation).toBeLessThan(before);
  });
});

describe('the statue', () => {
  it('is worth a thought inside its square and nothing outside it', () => {
    const { harness, id } = calm(10093);
    const at = harness.state.colonists[id].position;
    put(harness.state, 'statue', at.x + 4, at.y - 4); // Chebyshev 4: just inside
    expect(thoughtOf(harness.state, id, 'fineStatue')?.amount).toBe(STATUE_THOUGHT_BONUS);

    const far = calm(10093);
    const fat = far.harness.state.colonists[far.id].position;
    put(far.harness.state, 'statue', fat.x + 5, fat.y);
    expect(thoughtOf(far.harness.state, far.id, 'fineStatue')).toBeUndefined();
  });

  it('does nothing as a blueprint', () => {
    const { harness, id } = calm(10097);
    const at = harness.state.colonists[id].position;
    putBlueprint(harness.state, 'statue', at.x + 2, at.y);
    expect(thoughtOf(harness.state, id, 'fineStatue')).toBeUndefined();
  });
});

describe('tearing furniture down', () => {
  const FURNITURE: BuildingType[] = ['table', 'stool', 'dresser', 'armchair', 'statue'];

  it('leaves no job, no reservation, no designation and refunds half', () => {
    for (const type of FURNITURE) {
      const harness = createHarness(10111);
      const at = Object.values(harness.state.colonists)[0].position;
      // a clear tile two steps out, so the deconstructor can stand next to it
      const x = at.x + 2;
      const y = at.y + 2;
      const tileId = tileIdOf(x, y);
      expect(harness.state.tiles[tileId].buildingId).toBeNull();
      const buildingId = put(harness.state, type, x, y);

      harness.state = setDesignation(harness.state, [tileId], 'deconstruct');
      let gone = false;
      for (let i = 0; i < 3000 && !gone; i++) {
        harness.run(1);
        gone = harness.state.buildings[buildingId] === undefined;
      }
      expect(gone, type).toBe(true);

      // half of every cost line comes back onto the tile
      for (const cost of BUILDING_COSTS[type]) {
        const refunded = harness.state.tiles[tileId].itemIds
          .map((id) => harness.state.items[id])
          .filter((item) => item?.type === cost.type)
          .reduce((sum, item) => sum + item.quantity, 0);
        expect(refunded, `${type}: ${cost.type}`).toBe(
          Math.floor(cost.quantity * DECONSTRUCT_REFUND),
        );
      }

      // nothing dangling: no live job aimed at it, no reservation, no mark
      harness.run(20);
      for (const jobId in harness.state.jobs) {
        const job = harness.state.jobs[jobId];
        if (job.state === 'pending' || job.state === 'reserved' || job.state === 'active') {
          expect(job.targetEntityId, type).not.toBe(buildingId);
        }
      }
      expect(harness.state.reservations[buildingId]).toBeUndefined();
      expect(harness.state.reservations[tileId]).toBeUndefined();
      expect(harness.state.tiles[tileId].designation).toBeNull();
      expect(harness.state.tiles[tileId].buildingId).toBeNull();
      expect(harness.state.tiles[tileId].walkable).toBe(true);
    }
  });

  it('makes the thought disappear on the very next reading', () => {
    const { harness, id } = calm(10133);
    const at = harness.state.colonists[id].position;
    const statueId = put(harness.state, 'statue', at.x + 2, at.y);
    expect(thoughtOf(harness.state, id, 'fineStatue')).toBeDefined();

    // remove it the blunt way: thoughts are derived, so no tick may run and
    // the thought must still be gone - there is nothing stored to clean up
    const tileId = harness.state.buildings[statueId].tileId;
    delete harness.state.buildings[statueId];
    harness.state.tiles[tileId] = { ...harness.state.tiles[tileId], buildingId: null };
    expect(thoughtOf(harness.state, id, 'fineStatue')).toBeUndefined();
  });

  it('stops paying the armchair rate the tick the chair is gone', () => {
    const { harness, id } = calm(10139);
    const at = harness.state.colonists[id].position;
    const seatId = put(harness.state, 'armchair', at.x, at.y);
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      needs: { hunger: 0, sleep: 10, recreation: 90 },
      activity: { kind: 'relaxing', hearthId: seatId, untilTick: harness.state.tick + 60 },
    };
    const tileId = harness.state.buildings[seatId].tileId;
    delete harness.state.buildings[seatId];
    harness.state.tiles[tileId] = { ...harness.state.tiles[tileId], buildingId: null };
    harness.run(30);
    // they kept sitting, but at the sitting-on-the-ground rate, not the chair's
    const burned = 90 - harness.state.colonists[id].needs.recreation;
    expect(burned).toBeGreaterThan(0);
    expect(burned).toBeLessThan(30 * (100 / 150)); // under even the hearth rate
  });
});

describe('what furniture costs', () => {
  it('is built through the ordinary blueprint chain, iron hauling included', () => {
    const harness = createHarness(10151);
    const at = Object.values(harness.state.colonists)[0].position;
    const taken = new Set<string>([tileIdOf(at.x, at.y)]);
    // materials on the ground beside the camp: the existing haul chain does the
    // rest. Ground picked by `groundNear` rather than a fixed offset - see its
    // comment for why a fixed offset stopped being safe for this seed.
    const woodAt = groundNear(harness.state, at.x, at.y, taken, false);
    const ironAt = groundNear(harness.state, at.x, at.y, taken, false);
    const stoneAt = groundNear(harness.state, at.x, at.y, taken, false);
    addItem(harness.state, 'wood', 60, woodAt.x, woodAt.y);
    addItem(harness.state, 'iron', 10, ironAt.x, ironAt.y);
    addItem(harness.state, 'stone', 30, stoneAt.x, stoneAt.y);

    // the dresser is gated behind ironwork (11章 フェーズ12); the table and
    // stool stayed free on purpose (design-phase12-research.md 3.1), which is
    // exactly what this test is about, so only the dresser's tech is unlocked
    harness.state.research = { ...harness.state.research, unlocked: ['ironwork'] };

    const tableAt = groundNear(harness.state, at.x, at.y, taken, true);
    const dresserAt = groundNear(harness.state, at.x, at.y, taken, true);
    const tableTile = tileIdOf(tableAt.x, tableAt.y);
    const dresserTile = tileIdOf(dresserAt.x, dresserAt.y);
    harness.state = placeBuildingBlueprint(harness.state, 'table', [tableTile]);
    harness.state = placeBuildingBlueprint(harness.state, 'dresser', [dresserTile]);

    let sawIronHaul = false;
    let done = false;
    for (let i = 0; i < 9000 && !done; i++) {
      harness.run(1);
      if (!sawIronHaul) {
        sawIronHaul = Object.values(harness.state.jobs).some(
          (job) => job.type === 'haul' && job.payloadType === 'iron',
        );
      }
      const table = harness.state.buildings[harness.state.tiles[tableTile].buildingId ?? ''];
      const dresser = harness.state.buildings[harness.state.tiles[dresserTile].buildingId ?? ''];
      done = !!table && !table.isBlueprint && !!dresser && !dresser.isBlueprint;
    }
    expect(sawIronHaul).toBe(true); // iron moved through the ordinary haul jobs
    expect(done).toBe(true); // and both pieces got finished with it
  });
});
