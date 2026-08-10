// Time off, and the three ways a colonist comes apart (11章 フェーズ3).
//
// These are one feature, not two. The need that people meet for each other is
// what makes the hearth worth building, and running out of it is one of the
// things that now sends somebody walking off rather than standing still.
import { describe, expect, it } from 'vitest';
import {
  EAT_TICKS,
  HUNGER_THRESHOLD,
  RECREATION_PER_TICK,
  RECREATION_THRESHOLD,
  RELAX_TICKS,
  SLEEP_THRESHOLD,
} from './constants';
import { MOOD_BREAK_TICKS } from './mood';
import { thoughtsOf } from './mood';
import { tileIdOf } from './state';
import { createHarness, idleColony, recordLog } from './testUtils';
import { addItem } from './worldgen';
import type { GameState } from './types';

function only(state: GameState): string {
  const ids = Object.keys(state.colonists);
  for (const id of ids.slice(1)) delete state.colonists[id];
  return ids[0];
}

function put(state: GameState, type: 'hearth', x: number, y: number): string {
  const id = `b_${type}_${x}_${y}`;
  const tileId = tileIdOf(x, y);
  state.buildings[id] = {
    id,
    type,
    tileId,
    isBlueprint: false,
    hpCurrent: 100,
    hpMax: 100,
    requiredResources: [],
    buildProgress: 1,
    growth: 0,
    sown: false,
    manaFuel: 0,
    manaProgress: 0,
  };
  state.tiles[tileId] = { ...state.tiles[tileId], buildingId: id };
  return id;
}

/** One colonist, fed and rested, with the recreation bar wherever the test wants. */
function rested(seed: number, recreation: number) {
  const harness = createHarness(seed);
  idleColony(harness.state);
  const id = only(harness.state);
  harness.state.colonists[id] = {
    ...harness.state.colonists[id],
    needs: { hunger: 10, sleep: 10, recreation },
    health: 100,
  };
  return { harness, id };
}

describe('the third need', () => {
  it('fills up while they work and not while they sleep', () => {
    const { harness, id } = rested(6001, 0);
    harness.run(600);
    const awake = harness.state.colonists[id].needs.recreation;
    expect(awake).toBeGreaterThan(0);
    expect(awake).toBeCloseTo(600 * RECREATION_PER_TICK, 1);

    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      activity: { kind: 'sleeping', bedId: null },
    };
    harness.run(600, (state) => {
      if (state.colonists[id].activity.kind === 'none') {
        state.colonists[id] = {
          ...state.colonists[id],
          activity: { kind: 'sleeping', bedId: null },
        };
      }
    });
    // sleep is sleep; it is not time off
    expect(harness.state.colonists[id].needs.recreation).toBeCloseTo(awake, 1);
  });

  it('takes two days to fill, so it is not an afternoon habit', () => {
    expect(100 / RECREATION_PER_TICK).toBeGreaterThan(3000 * 1.5);
  });

  it('sends them to sit down when it crosses the line', () => {
    const { harness, id } = rested(6003, RECREATION_THRESHOLD + 2);
    harness.run(3);
    expect(harness.state.colonists[id].activity.kind).toBe('relaxing');
  });

  it('yields to hunger and to sleep, which are older and worse', () => {
    for (const worse of ['hunger', 'sleep'] as const) {
      const { harness, id } = rested(6007, RECREATION_THRESHOLD + 20);
      harness.state.colonists[id] = {
        ...harness.state.colonists[id],
        needs: {
          hunger: worse === 'hunger' ? HUNGER_THRESHOLD + 5 : 10,
          sleep: worse === 'sleep' ? SLEEP_THRESHOLD + 5 : 10,
          recreation: RECREATION_THRESHOLD + 20,
        },
      };
      addItem(harness.state, 'food', 50, harness.state.colonists[id].position.x, harness.state.colonists[id].position.y);
      harness.run(3);
      expect(harness.state.colonists[id].activity.kind).not.toBe('relaxing');
    }
  });
});

describe('what the hearth is for', () => {
  it('is worth more than sitting on the bare ground', () => {
    const measure = (withHearth: boolean) => {
      const { harness, id } = rested(6011, RECREATION_THRESHOLD + 20);
      const at = harness.state.colonists[id].position;
      if (withHearth) put(harness.state, 'hearth', at.x, at.y);
      harness.run(RELAX_TICKS);
      return harness.state.colonists[id].needs.recreation;
    };
    const atHearth = measure(true);
    const alone = measure(false);
    expect(atHearth).toBeLessThan(alone); // lower bar = better rested
  });

  it('gets them back to work when the sitting is over', () => {
    const { harness, id } = rested(6013, RECREATION_THRESHOLD + 5);
    const at = harness.state.colonists[id].position;
    put(harness.state, 'hearth', at.x, at.y);
    harness.run(RELAX_TICKS + 20);
    expect(harness.state.colonists[id].activity.kind).toBe('none');
    expect(harness.state.colonists[id].needs.recreation).toBeLessThan(RECREATION_THRESHOLD);
  });

  it('shows up as a thought either way round', () => {
    const { harness, id } = rested(6017, 95);
    expect(
      thoughtsOf(harness.state, harness.state.colonists[id]).some((t) => t.key === 'sickOfPlace'),
    ).toBe(true);

    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      needs: { hunger: 10, sleep: 10, recreation: 5 },
    };
    expect(
      thoughtsOf(harness.state, harness.state.colonists[id]).some((t) => t.key === 'hadTimeOff'),
    ).toBe(true);
  });
});

describe('three ways to come apart', () => {
  /**
   * Push one colonist under the line, having shaped the colony so the thought
   * the test is about is genuinely the worst one they have.
   *
   * The first version of this set health to 35 in all three cases, which made
   * "Badly hurt" the dominant thought every time and produced a brooder however
   * the rest was arranged - the selection was working and the rig was lying.
   */
  function breakWith(
    seed: number,
    needs: { hunger: number; sleep: number; recreation: number },
    shape: (state: GameState, id: string) => void,
  ) {
    const harness = createHarness(seed);
    idleColony(harness.state);
    const id = only(harness.state);
    harness.state.items = {};
    harness.state.buildings = {};
    // no traits: a cheerful colonist divides every penalty by 1.25 and simply
    // does not break at these numbers, which has nothing to do with the rule
    // under test
    harness.state.colonists[id] = { ...harness.state.colonists[id], traits: [] };
    shape(harness.state, id);
    const hold = { needs, health: harness.state.colonists[id].health };
    harness.state.colonists[id] = { ...harness.state.colonists[id], ...hold };
    const worst = thoughtsOf(harness.state, harness.state.colonists[id])[0]?.key;
    const lines = recordLog(harness, 5, (state) => {
      if (state.colonists[id]) state.colonists[id] = { ...state.colonists[id], ...hold };
    });
    return { harness, id, lines, worst, kind: harness.state.colonists[id].activity.kind };
  }

  it('sends a starving one to the larder', () => {
    // nothing to eat, so no meal interrupts them: they rummage instead
    const { kind, worst, lines } = breakWith(
      6019,
      { hunger: 95, sleep: 20, recreation: 10 },
      (state, id) => {
        state.colonists[id] = { ...state.colonists[id], health: 100 };
      },
    );
    expect(worst).toBe('starving');
    expect(kind).toBe('binge');
    expect(lines).toContain('breakBinge');
  });

  it('sends a grieving one walking', () => {
    // mid-band needs on purpose: "well fed" and "well rested" are +6 each and
    // would hold the mood above the break line on their own
    const { kind, worst, lines } = breakWith(
      6023,
      { hunger: 40, sleep: 40, recreation: 40 },
      (state, id) => {
        state.colonists[id] = { ...state.colonists[id], health: 100 };
        state.relationships = { [`${id}|zz`]: 100 };
        state.deaths = [{ colonistId: 'zz', name: 'Wren', tick: state.tick }];
      },
    );
    expect(worst).toBe('grieving');
    expect(kind).toBe('wandering');
    expect(lines).toContain('breakWandering');
  });

  it('leaves the rest standing and brooding', () => {
    // hurt, but fed and rested and grieving for nobody
    const { kind, worst } = breakWith(
      6029,
      { hunger: 40, sleep: 40, recreation: 40 },
      (state, id) => {
        state.colonists[id] = { ...state.colonists[id], health: 25 };
      },
    );
    expect(worst).toBe('badlyHurt');
    expect(kind).toBe('brooding');
  });

  it('a binge actually eats the stores', () => {
    const harness = createHarness(6031);
    idleColony(harness.state);
    const id = only(harness.state);
    const at = harness.state.colonists[id].position;
    addItem(harness.state, 'food', 200, at.x, at.y);
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      activity: { kind: 'binge', untilTick: harness.state.tick + MOOD_BREAK_TICKS, eaten: 0 },
    };
    const before = Object.values(harness.state.items).reduce((n, i) => n + i.quantity, 0);
    harness.run(EAT_TICKS * 6);
    const after = Object.values(harness.state.items).reduce((n, i) => n + i.quantity, 0);
    expect(after).toBeLessThan(before);
    const activity = harness.state.colonists[id].activity;
    expect(activity.kind === 'binge' && activity.eaten > 0).toBe(true);
  });

  it('a wanderer moves, and comes back to work at the end', () => {
    const harness = createHarness(6037);
    idleColony(harness.state);
    const id = only(harness.state);
    const from = { ...harness.state.colonists[id].position };
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      needs: { hunger: 10, sleep: 10, recreation: 10 },
      activity: { kind: 'wandering', untilTick: harness.state.tick + 400 },
    };
    // A random walk can come home. Asking whether it ended somewhere else is
    // asking about luck - seed 6037 landed back on its own doorstep after four
    // hundred ticks. What "wanders" means is that they do not stand still.
    let wandered = 0;
    // one recording across the whole thing: the break ends on the four
    // hundredth tick, so a second run started after it would miss the line
    const lines = recordLog(harness, 420, (state) => {
      const at = state.colonists[id].position;
      wandered = Math.max(wandered, Math.abs(at.x - from.x) + Math.abs(at.y - from.y));
    });
    expect(wandered).toBeGreaterThan(2);
    expect(harness.state.colonists[id].activity.kind).toBe('none');
    expect(lines).toContain('backToWork');
  });

  it('takes no jobs whichever way it shows', () => {
    for (const kind of ['brooding', 'wandering', 'binge'] as const) {
      const harness = createHarness(6041);
      const id = Object.keys(harness.state.colonists)[0];
      harness.state.colonists[id] = {
        ...harness.state.colonists[id],
        activity:
          kind === 'binge'
            ? { kind, untilTick: harness.state.tick + 400, eaten: 0 }
            : { kind, untilTick: harness.state.tick + 400 },
      };
      harness.run(60);
      expect(harness.state.colonists[id].currentJobId).toBe(null);
    }
  });
});
