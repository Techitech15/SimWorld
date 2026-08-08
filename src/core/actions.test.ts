// An action that changes nothing returns the state it was given. The UI leans on
// that to tell a refused drag from a successful one, and it spares every
// subscriber a pointless new object.
import { describe, expect, it } from 'vitest';
import {
  cancelBlueprint,
  placeBuildingBlueprint,
  placePastureZone,
  removeZoneTiles,
  setDesignation,
} from './actions';
import { tileIdOf } from './state';
import { createHarness } from './testUtils';
import type { GameState } from './types';

function grassNear(state: GameState): string {
  const at = Object.values(state.colonists)[0].position;
  for (let dx = 1; dx < 6; dx++) {
    const tile = state.tiles[tileIdOf(at.x + dx, at.y - 1)];
    if (tile?.terrain === 'grass' && !tile.buildingId) return tile.id;
  }
  throw new Error('no clear grass near the camp');
}

describe('actions that refuse', () => {
  it('returns the same state when a designation applies to nothing', () => {
    const harness = createHarness(1701);
    const grass = grassNear(harness.state);
    expect(setDesignation(harness.state, [grass], 'chop')).toBe(harness.state);
    expect(setDesignation(harness.state, [grass], 'mine')).toBe(harness.state);
    expect(setDesignation(harness.state, [grass], 'deconstruct')).toBe(harness.state);
    // and a new one really does change it
    expect(setDesignation(harness.state, [grass], null)).toBe(harness.state); // already null
  });

  it('returns the same state when nothing can be built or cancelled', () => {
    const harness = createHarness(1703);
    const bed = Object.values(harness.state.buildings).find((b) => b.type === 'bed')!;
    // the tile is taken, so no blueprint goes down
    expect(placeBuildingBlueprint(harness.state, 'wall', [bed.tileId])).toBe(harness.state);
    // and a finished bed is not a blueprint to cancel
    expect(cancelBlueprint(harness.state, [bed.tileId])).toBe(harness.state);
  });

  it('returns the same state for a zone that fits nowhere', () => {
    const harness = createHarness(1707);
    const stone = Object.values(harness.state.tiles).find((t) => t.terrain === 'stone');
    if (stone) expect(placePastureZone(harness.state, [stone.id])).toBe(harness.state);
    expect(removeZoneTiles(harness.state, [grassNear(harness.state)])).toBe(harness.state);
  });

  it('still returns a new state when the drag does land', () => {
    const harness = createHarness(1709);
    const forest = Object.values(harness.state.tiles).find((t) => t.terrain === 'forest')!;
    const after = setDesignation(harness.state, [forest.id], 'chop');
    expect(after).not.toBe(harness.state);
    expect(after.tiles[forest.id].designation).toBe('chop');
  });
});
