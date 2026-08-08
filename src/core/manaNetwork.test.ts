// The mana network: what phase 2 actually adds to the game.
//
// The constraint the design document is after is not "do you have the
// materials" - the build cost covers that - but "can you keep it supplied".
// These tests are about that second constraint: a run of buildings is one grid,
// a grid needs more supply than demand, and a furnace only supplies while
// somebody keeps carrying crystal to it.
import { describe, expect, it } from 'vitest';
import { placeBuildingBlueprint } from './actions';
import { BURN_TICKS_PER_CRYSTAL, FURNACE_FUEL_BATCH, LAMP_RADIUS, buildNetworks, gridFor, isPowered, manaSummary, refuel, wantsFuel } from './mana';
import { moodOf, thoughtsOf } from './mood';
import { tileIdOf } from './state';
import { createHarness, idleColony, recordLog } from './testUtils';
import { addItem } from './worldgen';
import type { BuildingType, GameState } from './types';

/** Drop a finished building straight onto the map, skipping the build job. */
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
  };
  state.tiles[tileId] = { ...state.tiles[tileId], buildingId: id };
  return id;
}

/** A furnace with fuel in it. */
function litFurnace(state: GameState, x: number, y: number): string {
  const id = put(state, 'manaFurnace', x, y);
  state.buildings[id] = { ...state.buildings[id], manaFuel: BURN_TICKS_PER_CRYSTAL };
  return id;
}

describe('what counts as one grid', () => {
  it('joins buildings that touch and separates ones that do not', () => {
    const harness = createHarness(3001);
    const furnace = litFurnace(harness.state, 10, 10);
    const conduit = put(harness.state, 'manaConduit', 11, 10);
    const lamp = put(harness.state, 'manaLamp', 12, 10);
    // a second lamp on its own, two tiles clear of the run
    const orphan = put(harness.state, 'manaLamp', 20, 20);

    const networks = buildNetworks(harness.state);
    expect(networks.grids.length).toBe(2);
    expect(networks.gridOf[furnace]).toBe(networks.gridOf[conduit]);
    expect(networks.gridOf[conduit]).toBe(networks.gridOf[lamp]);
    expect(networks.gridOf[orphan]).not.toBe(networks.gridOf[furnace]);
  });

  it('only counts diagonals as apart, so a run has to actually connect', () => {
    const harness = createHarness(3003);
    const furnace = litFurnace(harness.state, 10, 10);
    const lamp = put(harness.state, 'manaLamp', 11, 11); // corner to corner
    const networks = buildNetworks(harness.state);
    expect(networks.gridOf[lamp]).not.toBe(networks.gridOf[furnace]);
  });

  it('leaves a blueprint out until it is built', () => {
    const harness = createHarness(3005);
    litFurnace(harness.state, 10, 10);
    harness.state = placeBuildingBlueprint(harness.state, 'manaLamp', [tileIdOf(11, 10)]);
    const networks = buildNetworks(harness.state);
    expect(networks.grids.length).toBe(1);
    expect(networks.grids[0].demand).toBe(0); // the planned lamp draws nothing yet
  });

  it('costs nothing to a colony that has not started', () => {
    const harness = createHarness(3007);
    const networks = buildNetworks(harness.state);
    expect(networks.grids).toEqual([]);
    expect(manaSummary(networks)).toEqual({ grids: 0, supply: 0, demand: 0, short: 0 });
  });
});

describe('supply against demand', () => {
  it('powers a grid whose furnace can carry the load', () => {
    const harness = createHarness(3011);
    const furnace = litFurnace(harness.state, 10, 10);
    const lamp = put(harness.state, 'manaLamp', 11, 10);
    const networks = buildNetworks(harness.state);
    const grid = gridFor(networks, furnace)!;
    expect(grid.supply).toBeGreaterThan(0);
    expect(grid.demand).toBeGreaterThan(0);
    expect(grid.powered).toBe(true);
    expect(isPowered(networks, lamp)).toBe(true);
  });

  it('trips the whole grid when demand outruns supply', () => {
    // all-or-nothing: a partial brownout would need a rule for who gets cut
    // first, and the player would have to read a per-building state to find out
    const harness = createHarness(3013);
    const furnace = litFurnace(harness.state, 10, 10);
    let x = 11;
    const lamps: string[] = [];
    for (let i = 0; i < 5; i++) lamps.push(put(harness.state, 'manaLamp', x++, 10));

    const networks = buildNetworks(harness.state);
    const grid = gridFor(networks, furnace)!;
    expect(grid.demand).toBeGreaterThan(grid.supply);
    expect(grid.powered).toBe(false);
    for (const lamp of lamps) expect(isPowered(networks, lamp)).toBe(false);
  });

  it('treats an unfuelled furnace as no supply at all', () => {
    const harness = createHarness(3017);
    const furnace = put(harness.state, 'manaFurnace', 10, 10); // cold
    const lamp = put(harness.state, 'manaLamp', 11, 10);
    const cold = buildNetworks(harness.state);
    expect(gridFor(cold, furnace)!.supply).toBe(0);
    expect(isPowered(cold, lamp)).toBe(false);

    refuel(harness.state, furnace, 1);
    const lit = buildNetworks(harness.state);
    expect(gridFor(lit, furnace)!.supply).toBeGreaterThan(0);
    expect(isPowered(lit, lamp)).toBe(true);
  });
});

describe('keeping it lit', () => {
  it('burns fuel only while something is drawing', () => {
    const harness = createHarness(3019);
    idleColony(harness.state);
    const furnace = litFurnace(harness.state, 10, 10);

    // no consumer yet: an idle network costs nothing, so building ahead of
    // demand is not punished
    harness.run(200);
    expect(harness.state.buildings[furnace].manaFuel).toBe(BURN_TICKS_PER_CRYSTAL);

    put(harness.state, 'manaLamp', 11, 10);
    harness.run(200);
    expect(harness.state.buildings[furnace].manaFuel).toBeLessThan(BURN_TICKS_PER_CRYSTAL);
  });

  it('goes out when the fuel runs down, and says so', () => {
    const harness = createHarness(3023);
    idleColony(harness.state);
    const furnace = put(harness.state, 'manaFurnace', 10, 10);
    const lamp = put(harness.state, 'manaLamp', 11, 10);
    harness.state.buildings[furnace] = { ...harness.state.buildings[furnace], manaFuel: 30 };

    const lines = recordLog(harness, 60);
    expect(harness.state.buildings[furnace].manaFuel).toBe(0);
    expect(lines.some((line) => line.includes('burned out'))).toBe(true);
    expect(isPowered(buildNetworks(harness.state), lamp)).toBe(false);
  });

  it('asks for a delivery once it is down to its last crystal', () => {
    const harness = createHarness(3029);
    const furnace = put(harness.state, 'manaFurnace', 10, 10);
    expect(wantsFuel(harness.state.buildings[furnace])).toBe(true);

    refuel(harness.state, furnace, FURNACE_FUEL_BATCH);
    expect(wantsFuel(harness.state.buildings[furnace])).toBe(false);
  });
});

describe('what the light is for', () => {
  it('lifts the mood of somebody standing in it, but only while it is lit', () => {
    const harness = createHarness(3031);
    idleColony(harness.state);
    const colonist = Object.values(harness.state.colonists)[0];
    const at = colonist.position;
    const furnace = put(harness.state, 'manaFurnace', at.x + 2, at.y);
    const lamp = put(harness.state, 'manaLamp', at.x + 3, at.y);

    const dark = buildNetworks(harness.state);
    expect(isPowered(dark, lamp)).toBe(false);
    const before = moodOf(harness.state, colonist, dark);

    harness.state.buildings[furnace] = {
      ...harness.state.buildings[furnace],
      manaFuel: BURN_TICKS_PER_CRYSTAL,
    };
    const lit = buildNetworks(harness.state);
    const after = moodOf(harness.state, colonist, lit);
    expect(after).toBeGreaterThan(before);
    expect(thoughtsOf(harness.state, colonist, lit).some((t) => t.label.includes('light'))).toBe(
      true,
    );
  });

  it('does not reach across the map', () => {
    const harness = createHarness(3037);
    idleColony(harness.state);
    const colonist = Object.values(harness.state.colonists)[0];
    const at = colonist.position;
    const furnace = put(harness.state, 'manaFurnace', at.x + LAMP_RADIUS + 6, at.y);
    put(harness.state, 'manaLamp', at.x + LAMP_RADIUS + 7, at.y);
    harness.state.buildings[furnace] = {
      ...harness.state.buildings[furnace],
      manaFuel: BURN_TICKS_PER_CRYSTAL,
    };
    const networks = buildNetworks(harness.state);
    expect(thoughtsOf(harness.state, colonist, networks).some((t) => t.label.includes('light'))).toBe(
      false,
    );
  });

  it('says nothing about light when there is no mana layer at all', () => {
    // the pre-phase-2 colony has to read exactly as it did
    const harness = createHarness(3041);
    const colonist = Object.values(harness.state.colonists)[0];
    expect(thoughtsOf(harness.state, colonist).some((t) => t.label.includes('light'))).toBe(false);
  });
});

describe('the loop closes', () => {
  it('hauls crystal to a hungry furnace and lights the lamp', () => {
    // The whole phase in one run: there is crystal in the store, a furnace that
    // wants it, and a lamp waiting on the other end. Nobody is told to do any
    // of this - it is the existing haul chain finding a new destination.
    const harness = createHarness(3043);
    const colonist = Object.values(harness.state.colonists)[0];
    const at = colonist.position;
    const furnace = put(harness.state, 'manaFurnace', at.x + 3, at.y + 3);
    const lamp = put(harness.state, 'manaLamp', at.x + 4, at.y + 3);
    addItem(harness.state, 'manaCrystal', 12, at.x + 1, at.y);

    expect(isPowered(buildNetworks(harness.state), lamp)).toBe(false);
    const lines = recordLog(harness, 3000);

    expect(harness.state.buildings[furnace].manaFuel).toBeGreaterThan(0);
    expect(isPowered(buildNetworks(harness.state), lamp)).toBe(true);
    expect(lines.some((line) => line.includes('was stoked'))).toBe(true);
  });

  it('keeps it lit for as long as there is crystal, and no longer', () => {
    const harness = createHarness(3047);
    const colonist = Object.values(harness.state.colonists)[0];
    const at = colonist.position;
    const furnace = put(harness.state, 'manaFurnace', at.x + 3, at.y + 3);
    put(harness.state, 'manaLamp', at.x + 4, at.y + 3);
    // exactly one delivery's worth, and nothing else on the map
    addItem(harness.state, 'manaCrystal', FURNACE_FUEL_BATCH, at.x + 1, at.y);

    harness.run(600);
    const stoked = harness.state.buildings[furnace].manaFuel;
    expect(stoked).toBeGreaterThan(0);

    // burn it down: with no crystal left, the furnace goes cold and stays cold
    harness.run(stoked + 200);
    expect(harness.state.buildings[furnace].manaFuel).toBe(0);
    expect(
      Object.values(harness.state.items).some((item) => item.type === 'manaCrystal'),
    ).toBe(false);
  });
});
