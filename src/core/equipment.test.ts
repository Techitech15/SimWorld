// Equipment (11章 フェーズ8, docs/design-phase8-equipment.md 7章).
//
// The acceptance rows, in order: a crafted tool ends up worn and survives the
// save (E-1), an axe genuinely speeds the chop and bare hands match the
// pre-phase behaviour exactly (E-2), the bow outranges the boar's charge
// (E-3), a worn-out tool breaks loudly and its replacement is ordered (E-4),
// and the sword and armor bend the raid numbers in the directions they claim
// (E-6). E-5 (the warm coat) is deliberately unimplemented - its material was
// left undecided in the design and stays undecided.
import { describe, expect, it } from 'vitest';
import { BOAR_CHARGE_RANGE, HUNT_RANGE } from './constants';
import {
  EQUIPMENT,
  attackMultiplierOf,
  createEquipment,
  defenseMultiplierOf,
  equipmentWorkMultiplier,
  huntRangeOf,
  useEquipment,
  wornBy,
} from './equipment';
import { killColonist } from './death';
import { setDesignation } from './actions';
import { tileIdOf } from './state';
import { createHarness, idleColony, nearestTilesWithTerrain } from './testUtils';
import { addBuilding, addItem } from './worldgen';
import type { GameState } from './types';

/** Put a piece straight onto a colonist, bypassing the pickup walk. */
function wear(state: GameState, colonistId: string, kind: keyof typeof EQUIPMENT): string {
  const piece = createEquipment(state, kind, { x: 0, y: 0 });
  state.equipment = {
    ...state.equipment,
    [piece.id]: { ...piece, wornBy: colonistId, position: null },
  };
  return piece.id;
}

describe('E-1: crafted, claimed, worn, saved', () => {
  it('carries an ordered axe from the bench to an idle colonist and through a save', () => {
    const harness = createHarness(16001);
    idleColony(harness.state);
    const id = Object.keys(harness.state.colonists)[0];
    const at = harness.state.colonists[id].position;
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      needs: { hunger: 0, sleep: 10, recreation: 0 },
      traits: [],
      workPriorities: { ...harness.state.colonists[id].workPriorities, craft: 1, haul: 1 },
    };
    const benchTile = tileIdOf(at.x + 2, at.y);
    const bench = addBuilding(harness.state, 'workbench', benchTile);
    harness.state.tiles[benchTile] = { ...harness.state.tiles[benchTile], walkable: false };
    // materials in reach
    addItem(harness.state, 'wood', 20, at.x + 1, at.y + 1);
    addItem(harness.state, 'stone', 20, at.x, at.y + 1);

    harness.state.buildings[bench.id] = {
      ...harness.state.buildings[bench.id],
      craftOrders: ['axe'],
    };
    harness.run(2500);

    const pieces = Object.values(harness.state.equipment);
    expect(pieces.length).toBe(1);
    expect(pieces[0].kind).toBe('axe');
    // claimed by the idle colonist and worn, not lying at the bench
    expect(pieces[0].wornBy).toBe(id);
    expect(pieces[0].position).toBeNull();
    expect(harness.state.buildings[bench.id].craftOrders).toEqual([]);

    // the save round trip keeps who wears what
    const json = JSON.parse(JSON.stringify(harness.state)) as GameState;
    expect(wornBy(json, id).hand?.kind).toBe('axe');
  });

  it('drops everything worn where the wearer died', () => {
    const harness = createHarness(16003);
    const id = Object.keys(harness.state.colonists)[0];
    const spot = { ...harness.state.colonists[id].position };
    wear(harness.state, id, 'axe');
    wear(harness.state, id, 'ironArmor');
    killColonist(harness.state, id, { key: 'colonistKilled' });
    const pieces = Object.values(harness.state.equipment);
    expect(pieces.length).toBe(2);
    for (const piece of pieces) {
      expect(piece.wornBy).toBeNull();
      expect(piece.position).toEqual(spot);
    }
  });

  it('keeps exactly one of wornBy and position set, always', () => {
    const harness = createHarness(16005);
    const id = Object.keys(harness.state.colonists)[0];
    createEquipment(harness.state, 'sword', { x: 3, y: 3 });
    wear(harness.state, id, 'axe');
    for (const piece of Object.values(harness.state.equipment)) {
      expect(piece.wornBy === null).not.toBe(piece.position === null);
    }
  });
});

describe('E-2: the axe actually speeds the chop', () => {
  const chopTicks = (seed: number, withAxe: boolean): number => {
    const harness = createHarness(seed);
    idleColony(harness.state);
    const id = Object.keys(harness.state.colonists)[0];
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      needs: { hunger: 0, sleep: 0, recreation: 50 },
      traits: [],
      skills: { ...harness.state.colonists[id].skills, chop: 0 },
      workPriorities: { ...harness.state.colonists[id].workPriorities, chop: 1 },
    };
    if (withAxe) wear(harness.state, id, 'axe');
    const at = harness.state.colonists[id].position;
    const [tree] = nearestTilesWithTerrain(harness.state, 'forest', at, 1);
    harness.state = setDesignation(harness.state, [tree], 'chop');
    let ticks = 0;
    while (harness.state.tiles[tree].terrain === 'forest' && ticks < 1000) {
      harness.run(1);
      ticks++;
    }
    return ticks;
  };

  it('fells the same tree faster with the axe, and bare hands match before', () => {
    const bare = chopTicks(16011, false);
    const axed = chopTicks(16011, true);
    expect(axed).toBeLessThan(bare);
    // the multiplier itself: 0.8 work ticks -> 1.25x rate
    const harness = createHarness(16013);
    const id = Object.keys(harness.state.colonists)[0];
    expect(equipmentWorkMultiplier(harness.state, id, 'chop')).toBe(1);
    wear(harness.state, id, 'axe');
    expect(equipmentWorkMultiplier(harness.state, id, 'chop')).toBeCloseTo(1 / 0.8);
    // an axe does nothing for mining - the tool is per column
    expect(equipmentWorkMultiplier(harness.state, id, 'mine')).toBe(1);
  });
});

describe('E-3: the bow outranges the boar', () => {
  it('shoots from outside the charge; the spear does not', () => {
    const harness = createHarness(16021);
    const id = Object.keys(harness.state.colonists)[0];
    expect(huntRangeOf(harness.state, id)).toBe(HUNT_RANGE);
    const bowId = wear(harness.state, id, 'huntingBow');
    expect(huntRangeOf(harness.state, id)).toBe(EQUIPMENT.huntingBow.huntRange);
    expect(huntRangeOf(harness.state, id)).toBeGreaterThan(BOAR_CHARGE_RANGE);
    // swap for the spear: speed instead of reach
    const { [bowId]: _bow, ...rest } = harness.state.equipment;
    harness.state.equipment = rest;
    wear(harness.state, id, 'huntingSpear');
    expect(huntRangeOf(harness.state, id)).toBe(HUNT_RANGE);
    expect(equipmentWorkMultiplier(harness.state, id, 'hunt')).toBeCloseTo(1 / 0.75);
  });
});

describe('E-4: breakage is loud and self-replacing', () => {
  it('breaks at zero, logs it, and orders a replacement at the bench', () => {
    const harness = createHarness(16031);
    const id = Object.keys(harness.state.colonists)[0];
    const at = harness.state.colonists[id].position;
    const benchTile = tileIdOf(at.x + 3, at.y);
    const bench = addBuilding(harness.state, 'workbench', benchTile);

    const pieceId = wear(harness.state, id, 'axe');
    harness.state.equipment = {
      ...harness.state.equipment,
      [pieceId]: { ...harness.state.equipment[pieceId], condition: 1 / EQUIPMENT.axe.uses },
    };
    useEquipment(harness.state, id, 'hand');

    expect(harness.state.equipment[pieceId]).toBeUndefined();
    expect(harness.state.log.some((entry) => entry.key === 'equipmentBroke')).toBe(true);
    expect(harness.state.buildings[bench.id].craftOrders).toEqual(['axe']);
  });

  it('wears down by exactly one use per use', () => {
    const harness = createHarness(16033);
    const id = Object.keys(harness.state.colonists)[0];
    const pieceId = wear(harness.state, id, 'huntingBow');
    useEquipment(harness.state, id, 'hand');
    expect(harness.state.equipment[pieceId].condition).toBeCloseTo(
      1 - 1 / EQUIPMENT.huntingBow.uses,
    );
  });
});

describe('E-6: the sword and the armor bend the raid numbers', () => {
  it('multiplies attack up, damage taken down, and bare hands stay at 1', () => {
    const harness = createHarness(16041);
    const id = Object.keys(harness.state.colonists)[0];
    expect(attackMultiplierOf(harness.state, id)).toBe(1);
    expect(defenseMultiplierOf(harness.state, id)).toBe(1);
    wear(harness.state, id, 'sword');
    wear(harness.state, id, 'ironArmor');
    expect(attackMultiplierOf(harness.state, id)).toBe(EQUIPMENT.sword.attackMultiplier);
    expect(defenseMultiplierOf(harness.state, id)).toBe(EQUIPMENT.ironArmor.defenseMultiplier);
    expect(EQUIPMENT.sword.attackMultiplier!).toBeGreaterThan(1);
    expect(EQUIPMENT.ironArmor.defenseMultiplier!).toBeLessThan(1);
  });
});

describe('the pace of it all', () => {
  it('never bloats the save: a fresh world carries an empty record', () => {
    const harness = createHarness(16051);
    expect(harness.state.equipment).toEqual({});
  });
});
