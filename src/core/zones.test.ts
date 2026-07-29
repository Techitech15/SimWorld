// Zones are placed for free and instantly, so they have to come off the same
// way. Everything a zone tile owns - its marker building, a haul reserved
// against it, the herd tethered to it - has to come off with it.
import { describe, expect, it } from 'vitest';
import { placePastureZone, placeStorageZone, removeZoneTiles } from './actions';
import { createHarness } from './testUtils';
import { tileIdOf } from './state';
import { createAnimal } from './worldgen';
import type { GameState } from './types';

function zoneOf(state: GameState, type: 'storage' | 'pasture'): string | undefined {
  return Object.keys(state.zones).find((id) => state.zones[id].type === type);
}

function grassNear(state: GameState, dx: number): string[] {
  const centre = Object.values(state.colonists)[0].position;
  const ids: string[] = [];
  for (let y = centre.y - 3; y < centre.y + 1; y++) {
    for (let x = centre.x + dx; x < centre.x + dx + 4; x++) {
      const tile = state.tiles[tileIdOf(x, y)];
      if (tile?.terrain === 'grass' && !tile.buildingId) ids.push(tile.id);
    }
  }
  return ids;
}

describe('removing zone tiles', () => {
  it('takes the storage markers with it and keeps hauling working', () => {
    const harness = createHarness(307);
    const storageId = zoneOf(harness.state, 'storage')!;
    const before = harness.state.zones[storageId].tileIds;
    const dropped = before.slice(0, 4);

    harness.state = removeZoneTiles(harness.state, dropped);

    const zone = harness.state.zones[storageId];
    expect(zone.tileIds).toHaveLength(before.length - dropped.length);
    for (const tileId of dropped) {
      expect(harness.state.tiles[tileId].buildingId).toBeNull();
      expect(harness.state.reservations[tileId]).toBeUndefined();
    }
    // the colony carries on: the remaining storage still receives hauls
    harness.run(600);
    for (const entityId in harness.state.reservations) {
      const holder = harness.state.reservations[entityId].colonistId;
      expect(harness.state.colonists[holder]).toBeDefined();
    }
  });

  it('deletes an emptied pasture and unties its herd', () => {
    const harness = createHarness(311);
    const tiles = grassNear(harness.state, 4);
    expect(tiles.length).toBeGreaterThan(0);
    harness.state = placePastureZone(harness.state, tiles);
    const pastureId = zoneOf(harness.state, 'pasture')!;
    const first = harness.state.tiles[harness.state.zones[pastureId].tileIds[0]];
    const cow = createAnimal(harness.state, 'deer', first.x, first.y, {
      tame: true,
      pastureZoneId: pastureId,
    });

    harness.state = removeZoneTiles(harness.state, harness.state.zones[pastureId].tileIds);

    expect(harness.state.zones[pastureId]).toBeUndefined();
    // a tame animal pointing at a zone that no longer exists would be a dangling
    // reference; it goes back to roaming instead
    expect(harness.state.animals[cow.id].pastureZoneId).toBeNull();
    expect(() => harness.run(200)).not.toThrow();
  });

  it('is a no-op on tiles that belong to no zone', () => {
    const harness = createHarness(313);
    const before = harness.state;
    const after = removeZoneTiles(before, [tileIdOf(0, 0), tileIdOf(1, 0)]);
    expect(after).toBe(before);
  });

  it('lets a zone be re-placed on erased ground', () => {
    const harness = createHarness(317);
    const storageId = zoneOf(harness.state, 'storage')!;
    const tiles = harness.state.zones[storageId].tileIds.slice(0, 3);

    harness.state = removeZoneTiles(harness.state, tiles);
    harness.state = placeStorageZone(harness.state, tiles);

    const zone = harness.state.zones[zoneOf(harness.state, 'storage')!];
    for (const tileId of tiles) {
      expect(zone.tileIds).toContain(tileId);
      // and the marker building is back
      const buildingId = harness.state.tiles[tileId].buildingId;
      expect(buildingId).not.toBeNull();
      expect(harness.state.buildings[buildingId!].type).toBe('storageZoneMarker');
    }
  });
});
