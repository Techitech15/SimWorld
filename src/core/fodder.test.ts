// Winter stops the grass, so a penned herd used to starve with nothing the
// player could do about it. Livestock now eat a food stack lying in the pen,
// which makes a stockpile inside the fence into fodder - and the existing haul
// jobs are what fill it.
import { describe, expect, it } from 'vitest';
import { placePastureZone } from './actions';
import { TICKS_PER_SEASON } from './season';
import { tileIdOf } from './state';
import { createHarness, idleColony } from './testUtils';
import { addItem, createAnimal } from './worldgen';
import type { GameState } from './types';

function pastureNear(harness: ReturnType<typeof createHarness>, size: number): string {
  const centre = Object.values(harness.state.colonists)[0].position;
  const ids: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tile = harness.state.tiles[tileIdOf(centre.x + 4 + x, centre.y - 3 + y)];
      if (tile?.terrain === 'grass' && !tile.buildingId) ids.push(tile.id);
    }
  }
  harness.state = placePastureZone(harness.state, ids);
  return Object.keys(harness.state.zones).find((id) => harness.state.zones[id].type === 'pasture')!;
}

function stripForage(state: GameState, zoneId: string): void {
  for (const tileId of state.zones[zoneId].tileIds) {
    state.tiles[tileId] = { ...state.tiles[tileId], forage: 0 };
  }
}

function foodInPen(state: GameState, zoneId: string): number {
  let total = 0;
  for (const tileId of state.zones[zoneId].tileIds) {
    for (const itemId of state.tiles[tileId].itemIds) {
      const item = state.items[itemId];
      if (item?.type === 'food') total += item.quantity;
    }
  }
  return total;
}

describe('fodder', () => {
  it('carries a herd through a bare winter pasture', () => {
    const harness = createHarness(1103);
    idleColony(harness.state);
    harness.state.animals = {};
    harness.state.tick = TICKS_PER_SEASON * 3; // winter: the grass will not come back
    const zoneId = pastureNear(harness, 4);
    stripForage(harness.state, zoneId);

    const first = harness.state.tiles[harness.state.zones[zoneId].tileIds[0]];
    addItem(harness.state, 'food', 60, first.x, first.y);
    const before = foodInPen(harness.state, zoneId);

    const last = harness.state.tiles[harness.state.zones[zoneId].tileIds.slice(-1)[0]];
    const cow = createAnimal(harness.state, 'deer', last.x, last.y, {
      tame: true,
      pastureZoneId: zoneId,
    });
    harness.state.animals[cow.id] = { ...cow, hunger: 90 };

    harness.run(900, (state) => {
      // keep the world to this experiment: no wolves, no restocked wildlife
      for (const id in state.animals) {
        if (id !== cow.id) delete state.animals[id];
      }
    });

    const survivor = harness.state.animals[cow.id];
    expect(survivor).toBeDefined();
    expect(survivor.hunger).toBeLessThan(90); // it fed
    expect(foodInPen(harness.state, zoneId)).toBeLessThan(before); // from the stack
    expect(survivor.health).toBe(60); // and never took starvation damage
  });

  it('leaves wild animals and reserved stacks alone', () => {
    const harness = createHarness(1109);
    idleColony(harness.state);
    harness.state.animals = {};
    const zoneId = pastureNear(harness, 3);
    stripForage(harness.state, zoneId);
    const tile = harness.state.tiles[harness.state.zones[zoneId].tileIds[0]];

    // a wild animal standing on food ignores it: fodder is a livestock thing
    const wild = createAnimal(harness.state, 'deer', tile.x, tile.y);
    harness.state.animals[wild.id] = { ...wild, hunger: 95 };
    const stack = addItem(harness.state, 'food', 40, tile.x, tile.y);
    const before = harness.state.items[stack.id].quantity;

    harness.run(60, (state) => {
      for (const id in state.animals) {
        if (id !== wild.id) delete state.animals[id];
      }
    });
    expect(harness.state.items[stack.id]?.quantity ?? 0).toBe(before);
  });
});
