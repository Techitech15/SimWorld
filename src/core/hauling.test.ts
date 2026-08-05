// A haul is two walks: colonist to stack, then stack to storage. The first
// happens whatever we choose, so the drop-off has to be picked from the stack's
// point of view - otherwise a colonist standing by the west stockpile carries an
// eastern log right past the eastern one.
import { describe, expect, it } from 'vitest';
import { placeStorageZone } from './actions';
import { findStorageDestination } from './storage';
import { tileIdOf } from './state';
import { createHarness } from './testUtils';
import { addItem } from './worldgen';
import type { GameState } from './types';

/** Two free walkable tiles somewhere near (x, y), whatever the terrain rolled. */
function storageAt(state: GameState, x: number, y: number): string[] {
  const ids: string[] = [];
  for (let radius = 0; radius < 6 && ids.length < 2; radius++) {
    for (let dy = -radius; dy <= radius && ids.length < 2; dy++) {
      for (let dx = -radius; dx <= radius && ids.length < 2; dx++) {
        const tile = state.tiles[tileIdOf(x + dx, y + dy)];
        if (tile?.walkable && !tile.buildingId && !ids.includes(tile.id)) ids.push(tile.id);
      }
    }
  }
  return ids;
}

describe('haul destinations', () => {
  it('drops a stack at the stockpile nearest the stack', () => {
    const harness = createHarness(1401);
    const at = Object.values(harness.state.colonists)[0].position;

    const west = storageAt(harness.state, at.x - 12, at.y);
    const east = storageAt(harness.state, at.x + 12, at.y);
    harness.state = placeStorageZone(harness.state, [...west, ...east]);
    expect(west.length).toBeGreaterThan(0);
    expect(east.length).toBeGreaterThan(0);

    // a log lying next to the eastern stockpile
    const eastTile = harness.state.tiles[east[0]];
    const log = addItem(harness.state, 'wood', 20, eastTile.x, eastTile.y);

    const chosen = findStorageDestination(harness.state, 'wood', log.quantity, log.position);
    expect(east).toContain(chosen);
    expect(west).not.toContain(chosen);
  });

  it('still hauls loose stacks away over a full run', () => {
    const harness = createHarness(1409);
    const at = Object.values(harness.state.colonists)[0].position;
    addItem(harness.state, 'wood', 30, at.x + 4, at.y + 2);
    addItem(harness.state, 'stone', 15, at.x - 4, at.y + 2);

    harness.run(1500);

    const storage = new Set<string>();
    for (const id in harness.state.zones) {
      if (harness.state.zones[id].type !== 'storage') continue;
      for (const tileId of harness.state.zones[id].tileIds) storage.add(tileId);
    }
    const loose = Object.values(harness.state.items).filter(
      (item) => !storage.has(tileIdOf(item.position.x, item.position.y)),
    );
    // anything left loose is somewhere a colonist just dropped it, not the two
    // stacks we planted next to the camp
    expect(loose.some((item) => item.type === 'wood' && item.quantity >= 30)).toBe(false);
  });
});
