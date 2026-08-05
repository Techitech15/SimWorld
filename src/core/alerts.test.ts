// Alerts answer "what is wrong right now", which the event log cannot: a
// warning that scrolled past four hundred ticks ago reads the same as a live
// one. So every alert here has to appear only while its condition holds.
import { describe, expect, it } from 'vitest';
import { collectAlerts } from './alerts';
import { PREDATOR_ALERT_DISTANCE } from './alerts';
import { TICKS_PER_SEASON } from './season';
import { createHarness } from './testUtils';
import { createAnimal } from './worldgen';
import type { GameState } from './types';

const messages = (state: GameState): string[] => collectAlerts(state).map((a) => a.message);
const levels = (state: GameState): string[] => collectAlerts(state).map((a) => a.level);

function dropAllFood(state: GameState): void {
  for (const id of Object.keys(state.items)) {
    if (state.items[id].type !== 'food') continue;
    const { [id]: _removed, ...rest } = state.items;
    state.items = rest;
  }
}

describe('alerts', () => {
  it('says nothing alarming about a healthy colony', () => {
    const harness = createHarness(801);
    harness.state.animals = {};
    expect(levels(harness.state)).not.toContain('critical');
  });

  it('reports an empty larder and then starving colonists', () => {
    const harness = createHarness(803);
    harness.state.animals = {};
    dropAllFood(harness.state);
    expect(messages(harness.state)).toContain('No food anywhere in the colony');

    for (const id in harness.state.colonists) {
      harness.state.colonists[id] = {
        ...harness.state.colonists[id],
        needs: { hunger: 100, sleep: 0 },
      };
    }
    expect(messages(harness.state)).toContain('3 colonists are starving');
  });

  it('counts one hurt colonist with singular wording', () => {
    const harness = createHarness(809);
    harness.state.animals = {};
    const id = Object.keys(harness.state.colonists)[0];
    harness.state.colonists[id] = { ...harness.state.colonists[id], health: 20 };
    expect(messages(harness.state)).toContain('1 colonist is badly hurt');
  });

  it('warns about a predator near the camp but not one far away', () => {
    const harness = createHarness(811);
    harness.state.animals = {};
    const at = Object.values(harness.state.colonists)[0].position;

    const far = createAnimal(harness.state, 'wolf', at.x, at.y + PREDATOR_ALERT_DISTANCE + 6);
    expect(messages(harness.state).some((m) => m.startsWith('Predator near'))).toBe(false);

    harness.state.animals[far.id] = { ...far, position: { x: at.x + 1, y: at.y } };
    expect(messages(harness.state).some((m) => m.startsWith('Predator near'))).toBe(true);
  });

  it('names the season when nothing can grow', () => {
    const harness = createHarness(821);
    harness.state.animals = {};
    harness.state.tick = TICKS_PER_SEASON * 3; // winter
    expect(messages(harness.state)).toContain('Winter: nothing is growing');

    harness.state.tick = TICKS_PER_SEASON * 2 + 1; // early autumn
    expect(messages(harness.state)).not.toContain('Winter: nothing is growing');
  });

  it('points at where the problem is, when there is one place to look', () => {
    const harness = createHarness(827);
    harness.state.animals = {};
    const [id, other] = Object.keys(harness.state.colonists);
    harness.state.colonists[id] = { ...harness.state.colonists[id], health: 10 };
    const hurt = collectAlerts(harness.state).find((a) => a.message.includes('badly hurt'));
    expect(hurt?.at).toEqual(harness.state.colonists[id].position);
    // a colony-wide condition has nowhere in particular to point
    expect(other).toBeDefined();
    harness.state.tick = TICKS_PER_SEASON * 3;
    const winter = collectAlerts(harness.state).find((a) => a.message.includes('nothing is growing'));
    expect(winter?.at).toBeUndefined();
  });

  it('collapses to one line once everybody is gone', () => {
    const harness = createHarness(823);
    harness.state.colonists = {};
    expect(collectAlerts(harness.state)).toEqual([
      { level: 'critical', message: 'The colony has died out.' },
    ]);
  });
});
