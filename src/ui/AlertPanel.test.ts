// The strip has grown from three conditions to eleven, so the order and the cap
// are what keep it a strip: a starving colony must never be pushed off the
// bottom by a note about the season.
import { describe, expect, it } from 'vitest';
import { collectAlerts } from '../core/alerts';
import type { AlertLevel } from '../core/alerts';
import { TICKS_PER_SEASON } from '../core/season';
import { createHarness } from '../core/testUtils';
import type { GameState } from '../core/types';

const RANK: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2 };

/** The same ordering the panel applies. */
function ordered(state: GameState) {
  return [...collectAlerts(state)].sort((a, b) => RANK[a.level] - RANK[b.level]);
}

describe('alert ordering', () => {
  it('puts the crisis above the weather report', () => {
    const harness = createHarness(1801);
    harness.state.animals = {};
    harness.state.tick = TICKS_PER_SEASON * 3; // winter: an info-level note
    for (const id of Object.keys(harness.state.items)) {
      if (harness.state.items[id].type !== 'food') continue;
      const { [id]: _gone, ...rest } = harness.state.items;
      harness.state.items = rest;
    }

    const rows = ordered(harness.state);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0].level).toBe('critical');
    expect(rows[rows.length - 1].level).toBe('info');
    // and the order is stable enough to slice: no info before a warning
    for (let i = 1; i < rows.length; i++) {
      expect(RANK[rows[i].level]).toBeGreaterThanOrEqual(RANK[rows[i - 1].level]);
    }
  });

  it('keeps every critical line inside the first six', () => {
    const harness = createHarness(1803);
    harness.state.animals = {};
    harness.state.tick = TICKS_PER_SEASON * 3;
    for (const id of Object.keys(harness.state.items)) {
      const { [id]: _gone, ...rest } = harness.state.items;
      harness.state.items = rest;
    }
    for (const id in harness.state.colonists) {
      harness.state.colonists[id] = {
        ...harness.state.colonists[id],
        needs: { hunger: 100, sleep: 0 },
        health: 10,
      };
    }

    const rows = ordered(harness.state);
    const criticals = rows.filter((a) => a.level === 'critical');
    expect(criticals.length).toBeGreaterThan(0);
    for (const alert of criticals) expect(rows.indexOf(alert)).toBeLessThan(6);
  });
});
