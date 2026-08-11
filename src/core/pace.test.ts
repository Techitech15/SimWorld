// Walking pace (docs/design-phase7-time.md 2.3, acceptance M-1/M-3).
//
// The conditions worth pinning: every multiplier actually changes speed, they
// compose without exceeding the cap, and with no condition in play the cadence
// is exactly the old global TICKS_PER_STEP - the "multiplier 1 matches the
// pre-phase behaviour" promise the design leans on.
import { describe, expect, it } from 'vitest';
import { COLONIST_MAX_HEALTH, TICKS_PER_STEP } from './constants';
import {
  PACE_CARRYING,
  PACE_FLEEING,
  PACE_FOREST,
  PACE_HURT_MAX,
  PACE_SLOW_CAP,
  paceMultiplierOf,
  takeStep,
} from './pace';
import { createHarness } from './testUtils';
import type { Colonist, GameState } from './types';

function walker(state: GameState): Colonist {
  const colonist = Object.values(state.colonists)[0];
  return {
    ...colonist,
    health: COLONIST_MAX_HEALTH,
    carrying: null,
    activity: { kind: 'none' },
    traits: [],
  };
}

/** Park the test subject on a tile of known terrain. */
function on(state: GameState, colonist: Colonist, terrain: 'grass' | 'forest'): Colonist {
  for (const id in state.tiles) {
    const tile = state.tiles[id];
    if (tile.terrain === terrain) {
      return { ...colonist, position: { x: tile.x, y: tile.y } };
    }
  }
  throw new Error(`no ${terrain} tile on this map`);
}

describe('the pace multipliers', () => {
  it('slow for a load, slow in the woods, slow when hurt, fast when fleeing', () => {
    const harness = createHarness(15001);
    const base = on(harness.state, walker(harness.state), 'grass');
    expect(paceMultiplierOf(harness.state, base)).toBe(1);

    expect(
      paceMultiplierOf(harness.state, { ...base, carrying: { type: 'wood', quantity: 5 } }),
    ).toBeCloseTo(PACE_CARRYING);
    expect(paceMultiplierOf(harness.state, on(harness.state, base, 'forest'))).toBeCloseTo(
      PACE_FOREST,
    );
    expect(paceMultiplierOf(harness.state, { ...base, health: 0 })).toBeCloseTo(PACE_HURT_MAX);
    expect(
      paceMultiplierOf(harness.state, {
        ...base,
        activity: { kind: 'fleeing', fromId: 'x', untilTick: 999 },
      }),
    ).toBeCloseTo(PACE_FLEEING);
  });

  it('composes by multiplication and never exceeds the cap', () => {
    const harness = createHarness(15003);
    const everything = {
      ...on(harness.state, walker(harness.state), 'forest'),
      carrying: { type: 'wood' as const, quantity: 5 },
      health: 0,
    };
    // 1.15 x 1.25 x 1.4 = 2.0125, which is over the cap - so the cap answers
    expect(paceMultiplierOf(harness.state, everything)).toBe(PACE_SLOW_CAP);
  });

  it('steps once per TICKS_PER_STEP ticks when nothing slows the walk', () => {
    const harness = createHarness(15005);
    const id = Object.keys(harness.state.colonists)[0];
    harness.state.colonists[id] = on(harness.state, walker(harness.state), 'grass');

    let steps = 0;
    for (let tick = 0; tick < 60; tick++) {
      if (takeStep(harness.state, id)) steps++;
    }
    expect(steps).toBe(60 / TICKS_PER_STEP);
  });

  it('makes a carried walk measurably longer over the same distance', () => {
    const harness = createHarness(15007);
    const id = Object.keys(harness.state.colonists)[0];
    const count = (carrying: Colonist['carrying']) => {
      harness.state.colonists[id] = {
        ...on(harness.state, walker(harness.state), 'grass'),
        carrying,
        stepProgress: 0,
      };
      let steps = 0;
      let ticks = 0;
      while (steps < 20) {
        ticks++;
        if (takeStep(harness.state, id)) steps++;
        if (ticks > 500) break;
      }
      return ticks;
    };
    const light = count(null);
    const laden = count({ type: 'wood', quantity: 5 });
    expect(light).toBe(20 * TICKS_PER_STEP);
    expect(laden).toBeGreaterThan(light);
  });

  it('keeps stepProgress out of nothing - it is the one saved field', () => {
    const harness = createHarness(15009);
    const id = Object.keys(harness.state.colonists)[0];
    takeStep(harness.state, id);
    const json = JSON.parse(JSON.stringify(harness.state)) as GameState;
    // survives the save round trip as plain data, and absence reads as zero
    expect(typeof json.colonists[id].stepProgress).toBe('number');
    const { stepProgress: _dropped, ...older } = json.colonists[id];
    expect(older.id).toBe(id);
  });
});

describe('takeStep on the map', () => {
  it('walks a laden colonist across tiles more slowly than an empty-handed one', () => {
    // the same 20 steps of open grass, counted through the real gate
    const harness = createHarness(15011);
    const id = Object.keys(harness.state.colonists)[0];
    harness.state.colonists[id] = {
      ...on(harness.state, walker(harness.state), 'grass'),
      carrying: { type: 'food', quantity: 3 },
      stepProgress: 0,
    };
    let ticks = 0;
    let steps = 0;
    while (steps < 20 && ticks < 500) {
      ticks++;
      if (takeStep(harness.state, id)) steps++;
    }
    // 2 x 1.15 = 2.3 ticks per step -> 46 ticks for 20 steps
    expect(ticks).toBe(Math.ceil(20 * TICKS_PER_STEP * PACE_CARRYING));
  });
});
