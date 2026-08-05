// Storage is one pool wherever it is, but a pasture is a place: with doors
// keeping animals in, two pens on opposite sides of the camp have to be two
// herds with two capacities.
import { describe, expect, it } from 'vitest';
import { placePastureZone, placeStorageZone } from './actions';
import { pastureCapacity } from './animals';
import { tileIdOf } from './state';
import { createHarness } from './testUtils';
import type { GameState } from './types';

const pastures = (state: GameState): string[] =>
  Object.keys(state.zones).filter((id) => state.zones[id].type === 'pasture');

/** A block of plain grass at an offset from the camp. */
function grassBlock(state: GameState, dx: number, dy: number, size: number): string[] {
  const centre = Object.values(state.colonists)[0].position;
  const ids: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tile = state.tiles[tileIdOf(centre.x + dx + x, centre.y + dy + y)];
      if (tile?.terrain === 'grass' && !tile.buildingId) ids.push(tile.id);
    }
  }
  return ids;
}

describe('pasture zones', () => {
  it('makes one zone out of one contiguous drag', () => {
    const harness = createHarness(1009);
    const tiles = grassBlock(harness.state, 4, -3, 3);
    expect(tiles.length).toBeGreaterThan(3);
    harness.state = placePastureZone(harness.state, tiles);
    expect(pastures(harness.state)).toHaveLength(1);
    expect(harness.state.zones[pastures(harness.state)[0]].tileIds).toHaveLength(tiles.length);
  });

  it('keeps two separate pens apart', () => {
    const harness = createHarness(1013);
    const north = grassBlock(harness.state, 4, -3, 3);
    const south = grassBlock(harness.state, -8, 3, 3);
    harness.state = placePastureZone(harness.state, north);
    harness.state = placePastureZone(harness.state, south);

    const ids = pastures(harness.state);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    // no pen may straddle both patches - that is what "separate" means here.
    // (a patch with a gap in it splits further, which is also correct)
    for (const id of ids) {
      const tiles = harness.state.zones[id].tileIds;
      const fromNorth = tiles.filter((t) => north.includes(t)).length;
      const fromSouth = tiles.filter((t) => south.includes(t)).length;
      expect(fromNorth === 0 || fromSouth === 0).toBe(true);
      expect(pastureCapacity(harness.state, id)).toBeGreaterThan(0);
    }
  });

  it('extends the pen a new tile touches rather than starting another', () => {
    const harness = createHarness(1019);
    const first = grassBlock(harness.state, 4, -3, 2);
    harness.state = placePastureZone(harness.state, first);
    const id = pastures(harness.state)[0];
    const before = harness.state.zones[id].tileIds.length;

    const centre = Object.values(harness.state.colonists)[0].position;
    const neighbour = tileIdOf(centre.x + 6, centre.y - 3); // right of the block
    harness.state = placePastureZone(harness.state, [neighbour]);

    expect(pastures(harness.state)).toHaveLength(1);
    expect(harness.state.zones[id].tileIds.length).toBe(before + 1);
  });

  it('still keeps storage as a single pool wherever it is painted', () => {
    const harness = createHarness(1021);
    const before = Object.keys(harness.state.zones).filter(
      (id) => harness.state.zones[id].type === 'storage',
    );
    harness.state = placeStorageZone(harness.state, grassBlock(harness.state, -9, -9, 2));
    const after = Object.keys(harness.state.zones).filter(
      (id) => harness.state.zones[id].type === 'storage',
    );
    expect(after).toEqual(before);
  });
});
