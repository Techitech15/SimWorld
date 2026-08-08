// A storage zone used to be one undifferentiated heap, and - because every
// zone counted as storage - a pasture was part of that heap, so haulers stacked
// firewood among the livestock. A zone now says what it takes.
import { describe, expect, it } from 'vitest';
import { placeStorageZone, setZoneAccepts } from './actions';
import { RESOURCE_TYPES } from './constants';
import { tileIdOf } from './state';
import { acceptsHere, countStoredResource, findStorageDestination, isStorageTile } from './storage';
import { createHarness, idleColony, placePastureNear } from './testUtils';
import { addItem } from './worldgen';
import type { GameState, ResourceType } from './types';

const storageZoneId = (state: GameState) =>
  Object.keys(state.zones).find((id) => state.zones[id].type === 'storage')!;

/** Where a resource actually ended up, tile by tile. */
function tilesHolding(state: GameState, type: ResourceType): string[] {
  const ids: string[] = [];
  for (const id in state.items) {
    if (state.items[id].type !== type) continue;
    ids.push(tileIdOf(state.items[id].position.x, state.items[id].position.y));
  }
  return ids;
}

describe('storage filters', () => {
  it('start open: a new store takes everything, a pen takes only feed', () => {
    const harness = createHarness(4201);
    const store = harness.state.zones[storageZoneId(harness.state)];
    expect([...store.accepts].sort()).toEqual([...RESOURCE_TYPES].sort());

    const penId = placePastureNear(harness, 4);
    expect(harness.state.zones[penId].accepts).toEqual(['food']);
    for (const tileId of harness.state.zones[penId].tileIds) {
      expect(acceptsHere(harness.state, tileId, 'food')).toBe(true);
      expect(acceptsHere(harness.state, tileId, 'wood')).toBe(false);
      // a pen is not a warehouse, whatever is lying in it
      expect(isStorageTile(harness.state, tileId)).toBe(false);
    }
  });

  it('keep firewood out of the pen even when the pen is nearer', () => {
    const harness = createHarness(4211);
    const penId = placePastureNear(harness, 4);
    const penTile = harness.state.tiles[harness.state.zones[penId].tileIds[0]];

    // dropped right on the pen's doorstep, so distance alone would send it in
    const wood = findStorageDestination(harness.state, 'wood', 20, {
      x: penTile.x,
      y: penTile.y,
    });
    expect(wood).not.toBeNull();
    expect(harness.state.zones[penId].tileIds).not.toContain(wood);

    // feed, on the other hand, is exactly what a pen is for
    const food = findStorageDestination(harness.state, 'food', 20, {
      x: penTile.x,
      y: penTile.y,
    });
    expect(harness.state.zones[penId].tileIds).toContain(food);
  });

  it('leave a filtered-out stack alone rather than shuffling it forever', () => {
    const harness = createHarness(4217);
    const zoneId = storageZoneId(harness.state);
    harness.state = setZoneAccepts(harness.state, zoneId, 'stone', false);
    expect(harness.state.zones[zoneId].accepts).not.toContain('stone');

    // nowhere in the colony takes stone now, so a loose block has no home
    const at = Object.values(harness.state.colonists)[0].position;
    addItem(harness.state, 'stone', 20, at.x + 1, at.y + 1);
    harness.run(600);

    const stone = Object.values(harness.state.items).filter((i) => i.type === 'stone');
    expect(stone.length).toBe(1);
    // and the colony did not spend the whole time failing at it over and over
    const failures = harness.state.log.filter((e) => e.message.includes('(haul) failed'));
    expect(failures.length).toBeLessThan(3);
  });

  it('turn a narrowed filter into ordinary haul work', () => {
    const harness = createHarness(4219);
    idleColony(harness.state);
    for (const id in harness.state.colonists) {
      harness.state.colonists[id] = {
        ...harness.state.colonists[id],
        workPriorities: { ...harness.state.colonists[id].workPriorities, haul: 1 },
      };
    }
    // a second store off to one side, so there is somewhere for the wood to go
    const at = Object.values(harness.state.colonists)[0].position;
    const annex: string[] = [];
    for (let x = 0; x < 3; x++) {
      const tile = harness.state.tiles[tileIdOf(at.x - 8 + x, at.y)];
      if (tile?.walkable && !tile.buildingId) annex.push(tile.id);
    }
    harness.state = placeStorageZone(harness.state, annex);
    const annexId = Object.keys(harness.state.zones).find(
      (id) => id !== storageZoneId(harness.state) && harness.state.zones[id].type === 'storage',
    );
    expect(annexId).toBeDefined();

    const mainId = storageZoneId(harness.state);
    const mainTiles = new Set(harness.state.zones[mainId].tileIds);
    expect(tilesHolding(harness.state, 'wood').some((id) => mainTiles.has(id))).toBe(true);

    // the main store stops taking wood: the stacks already in it are now
    // misplaced, and misplaced stacks are what the haul generator exists for
    harness.state = setZoneAccepts(harness.state, mainId, 'wood', false);
    harness.run(1500);

    const stillInMain = tilesHolding(harness.state, 'wood').filter((id) => mainTiles.has(id));
    expect(stillInMain.length).toBe(0);
    // nothing was destroyed on the way
    expect(countStoredResource(harness.state, 'wood')).toBeGreaterThan(0);
  });

  it('refuse to filter a pasture, and ignore a change that changes nothing', () => {
    const harness = createHarness(4223);
    const penId = placePastureNear(harness, 3);
    expect(setZoneAccepts(harness.state, penId, 'wood', true)).toBe(harness.state);

    const zoneId = storageZoneId(harness.state);
    expect(setZoneAccepts(harness.state, zoneId, 'wood', true)).toBe(harness.state);
    expect(setZoneAccepts(harness.state, 'nosuchzone', 'wood', false)).toBe(harness.state);
  });

  it('keep the accepted list in resource order however it was toggled', () => {
    const harness = createHarness(4229);
    const zoneId = storageZoneId(harness.state);
    let state = harness.state;
    for (const type of RESOURCE_TYPES) state = setZoneAccepts(state, zoneId, type, false);
    expect(state.zones[zoneId].accepts).toEqual([]);
    state = setZoneAccepts(state, zoneId, 'food', true);
    state = setZoneAccepts(state, zoneId, 'wood', true);
    // put back in the table's order, not the order the player clicked
    expect(state.zones[zoneId].accepts).toEqual(['wood', 'food']);
  });

  it('count only real storage as stored', () => {
    const harness = createHarness(4231);
    const penId = placePastureNear(harness, 4);
    const penTile = harness.state.tiles[harness.state.zones[penId].tileIds[0]];
    const before = countStoredResource(harness.state, 'food');
    addItem(harness.state, 'food', 30, penTile.x, penTile.y);
    // a feed pile is food the colony owns, but it is not in the larder
    expect(countStoredResource(harness.state, 'food')).toBe(before);
  });
});
