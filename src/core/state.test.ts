// The copy-on-write contract that section 3 depends on: a tick must produce a
// new GameState without mutating the previous one, or store subscribers (React
// selectors, the PixiJS diff) silently miss changes.
import { describe, expect, it } from 'vitest';
import { setDesignation } from './actions';
import { createHarness, nearestTilesWithTerrain } from './testUtils';

describe('tick immutability', () => {
  it('never mutates the previous state', () => {
    const harness = createHarness(37);
    const centre = Object.values(harness.state.colonists)[0].position;
    harness.state = setDesignation(
      harness.state,
      nearestTilesWithTerrain(harness.state, 'forest', centre, 12),
      'chop',
    );

    const before = harness.state;
    const snapshot = JSON.stringify(before);
    harness.run(300);

    expect(harness.state).not.toBe(before);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('hands out fresh entity objects for whatever changed', () => {
    const harness = createHarness(41);
    const colonistId = Object.keys(harness.state.colonists)[0];
    const before = harness.state;
    harness.run(1);
    expect(harness.state.colonists[colonistId]).not.toBe(before.colonists[colonistId]);
    // untouched tiles keep their identity so the renderer can skip them
    expect(harness.state.tiles['0,0']).toBe(before.tiles['0,0']);
  });
});
