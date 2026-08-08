// The clock stops when something critical *appears*. Re-pausing on a condition
// that was already true would make the game unplayable, so the rule is about
// the difference between two looks, not the state of one.
import { describe, expect, it } from 'vitest';
import { createHarness } from '../core/testUtils';
import { criticalMessages, newlyCritical } from './loop';
import type { GameState } from '../core/types';

function starve(state: GameState): void {
  for (const id of Object.keys(state.items)) {
    if (state.items[id].type !== 'food') continue;
    const { [id]: _removed, ...rest } = state.items;
    state.items = rest;
  }
}

describe('auto-pause', () => {
  it('finds nothing critical in a healthy colony', () => {
    const harness = createHarness(1501);
    harness.state.animals = {};
    expect(criticalMessages(harness.state).size).toBe(0);
  });

  it('raises the empty larder and then the starving colonists', () => {
    const harness = createHarness(1503);
    harness.state.animals = {};
    starve(harness.state);
    const emptyLarder = criticalMessages(harness.state);
    expect([...emptyLarder]).toContain('No food anywhere in the colony');

    for (const id in harness.state.colonists) {
      harness.state.colonists[id] = {
        ...harness.state.colonists[id],
        needs: { hunger: 100, sleep: 0 },
      };
    }
    const worse = criticalMessages(harness.state);
    expect(newlyCritical(emptyLarder, worse)).toEqual(['3 colonists are starving']);
  });

  it('says nothing new while the same condition persists', () => {
    const harness = createHarness(1507);
    harness.state.animals = {};
    starve(harness.state);
    const first = criticalMessages(harness.state);
    const second = criticalMessages(harness.state);
    expect(newlyCritical(first, second)).toEqual([]);
  });
});
