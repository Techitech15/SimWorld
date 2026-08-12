// Bonds between colonists (11章 フェーズ3).
//
// The claim being tested is not "there is a number per pair" but the two things
// the number buys: company, and grief. Both land in the mood system, so both
// are checked there rather than in a mechanic of their own.
import { describe, expect, it } from 'vitest';
import {
  AFFINITY_MAX,
  FRIEND_AT,
  GRIEF_TICKS,
  AFFINITY_PER_INTERVAL,
  SOCIAL_INTERVAL_TICKS,
  SOCIAL_RANGE,
  affinityOf,
  closestTo,
  friendsOf,
  griefOf,
  pairKey,
  recordDeath,
} from './relationships';
import { COLONIST_MAX_HEALTH } from './constants';
import { killColonist } from './death';
import { moodOf, thoughtsOf } from './mood';
import { createHarness, idleColony } from './testUtils';
import type { GameState } from './types';

/** Two colonists, standing where the test wants them. */
function pair(seed: number, apart: number) {
  const harness = createHarness(seed);
  idleColony(harness.state);
  const ids = Object.keys(harness.state.colonists);
  const [a, b] = ids;
  for (const id of ids.slice(2)) delete harness.state.colonists[id];

  const at = { x: 20, y: 20 };
  harness.state.colonists[a] = { ...harness.state.colonists[a], position: { ...at } };
  harness.state.colonists[b] = {
    ...harness.state.colonists[b],
    position: { x: at.x + apart, y: at.y },
  };
  // traits would make the rate depend on who was dealt what
  harness.state.colonists[a] = { ...harness.state.colonists[a], traits: [] };
  harness.state.colonists[b] = { ...harness.state.colonists[b], traits: [] };
  return { harness, a, b };
}

/**
 * Hold two colonists still, since needs would otherwise send them wandering.
 *
 * Also pins `health` at max. This is the same idiom several other tests use
 * (mood.test.ts, recreation.test.ts, craft.test.ts, research.test.ts,
 * raid.test.ts) to keep an unrelated hazard from confounding the measurement.
 * It matters more here than most: `position` is forced back to the same spot
 * every tick, which means a colonist under this pin can never actually flee a
 * predator (`runFleeing`'s step only ever gets overwritten), so without a
 * health pin they are a stationary target for however long the run lasts. A
 * real colonist would run; this fixture holds two of them still on purpose to
 * isolate the bond math, so it has to supply the safety a real colonist's own
 * flee response would have provided instead.
 */
function pin(state: GameState, a: string, b: string, apart: number): void {
  const at = { x: 20, y: 20 };
  if (state.colonists[a]) {
    state.colonists[a] = {
      ...state.colonists[a],
      position: { ...at },
      needs: { hunger: 10, sleep: 10 , recreation: 0 },
      activity: { kind: 'none' },
      health: COLONIST_MAX_HEALTH,
    };
  }
  if (state.colonists[b]) {
    state.colonists[b] = {
      ...state.colonists[b],
      position: { x: at.x + apart, y: at.y },
      needs: { hunger: 10, sleep: 10 , recreation: 0 },
      activity: { kind: 'none' },
      health: COLONIST_MAX_HEALTH,
    };
  }
}

describe('one bond per pair', () => {
  it('has the same key whichever way round it is asked', () => {
    expect(pairKey('c1', 'c2')).toBe(pairKey('c2', 'c1'));
    expect(affinityOf(createHarness(1).state, 'c1', 'c1')).toBe(0);
  });

  it('starts everyone as strangers', () => {
    const { harness, a, b } = pair(5001, 2);
    expect(affinityOf(harness.state, a, b)).toBe(0);
    expect(friendsOf(harness.state, a)).toEqual([]);
    expect(closestTo(harness.state, a)).toBe(null);
  });
});

describe('bonds grow from time spent together', () => {
  it('rises while they are near each other', () => {
    const { harness, a, b } = pair(5003, 2);
    harness.run(SOCIAL_INTERVAL_TICKS * 10, (state) => pin(state, a, b, 2));
    expect(affinityOf(harness.state, a, b)).toBeGreaterThan(0);
  });

  it('does not rise across the map', () => {
    const { harness, a, b } = pair(5007, SOCIAL_RANGE + 6);
    harness.run(SOCIAL_INTERVAL_TICKS * 10, (state) =>
      pin(state, a, b, SOCIAL_RANGE + 6),
    );
    expect(affinityOf(harness.state, a, b)).toBe(0);
  });

  it('does not rise while they are asleep', () => {
    // sharing a room is not the same as spending time with someone
    const { harness, a, b } = pair(5011, 2);
    harness.run(SOCIAL_INTERVAL_TICKS * 10, (state) => {
      pin(state, a, b, 2);
      for (const id of [a, b]) {
        if (state.colonists[id]) {
          state.colonists[id] = {
            ...state.colonists[id],
            activity: { kind: 'sleeping', bedId: null },
          };
        }
      }
    });
    expect(affinityOf(harness.state, a, b)).toBe(0);
  });

  it('reaches friendship in a plausible stretch of play, and stops at the cap', () => {
    const { harness, a, b } = pair(5013, 1);
    // derived from the rate rather than a fixed number, so retuning the rate
    // moves the test with it instead of breaking it
    const toFriendship = Math.ceil(FRIEND_AT / AFFINITY_PER_INTERVAL) + 2;
    harness.run(SOCIAL_INTERVAL_TICKS * toFriendship, (state) => pin(state, a, b, 1));
    expect(affinityOf(harness.state, a, b)).toBeGreaterThanOrEqual(FRIEND_AT);
    expect(friendsOf(harness.state, a)).toContain(b);

    // The cap is checked from just below it rather than by running all the way
    // there. Reaching a hundred at this rate takes eleven in-game days, which
    // is long enough for a raid to arrive and kill one of the two - the test
    // was measuring whether the colony survived, not whether the number stops.
    harness.state.relationships = { [pairKey(a, b)]: AFFINITY_MAX - AFFINITY_PER_INTERVAL / 2 };
    harness.run(SOCIAL_INTERVAL_TICKS * 4, (state) => pin(state, a, b, 1));
    expect(affinityOf(harness.state, a, b)).toBe(AFFINITY_MAX);
  });

  it('drifts apart when the colony sends them to opposite ends of the map', () => {
    // the bond describes who they work beside now, not who they once stood near
    const { harness, a, b } = pair(5021, 1);
    harness.state.relationships = { [pairKey(a, b)]: 60 };
    harness.run(SOCIAL_INTERVAL_TICKS * 40, (state) => pin(state, a, b, SOCIAL_RANGE + 8));
    expect(affinityOf(harness.state, a, b)).toBeLessThan(60);
    expect(affinityOf(harness.state, a, b)).toBeGreaterThan(0); // slowly, not forgotten
  });

  it('runs on an interval, not every tick', () => {
    const { harness, a, b } = pair(5017, 1);
    harness.run(SOCIAL_INTERVAL_TICKS - 2, (state) => pin(state, a, b, 1));
    expect(affinityOf(harness.state, a, b)).toBe(0);
  });

  it('lets a sociable colonist warm faster than a private one', () => {
    const measure = (traits: 'sociable' | 'private' | null) => {
      const { harness, a, b } = pair(5019, 1);
      if (traits) {
        harness.state.colonists[a] = { ...harness.state.colonists[a], traits: [traits] };
      }
      harness.run(SOCIAL_INTERVAL_TICKS * 20, (state) => pin(state, a, b, 1));
      return affinityOf(harness.state, a, b);
    };
    const plain = measure(null);
    expect(measure('sociable')).toBeGreaterThan(plain);
    expect(measure('private')).toBeLessThan(plain);
  });
});

describe('what a bond is worth', () => {
  it('a friend nearby lifts the mood; a colony of strangers weighs on it', () => {
    const { harness, a, b } = pair(5023, 1);
    const strangers = thoughtsOf(harness.state, harness.state.colonists[a]);
    expect(strangers.some((t) => t.key === 'knowsNobody')).toBe(true);

    harness.state.relationships = { [pairKey(a, b)]: AFFINITY_MAX };
    const known = thoughtsOf(harness.state, harness.state.colonists[a]);
    expect(known.some((t) => t.key === 'friendNearby')).toBe(true);
    expect(moodOf(harness.state, harness.state.colonists[a])).toBeGreaterThan(
      moodOf({ ...harness.state, relationships: {} }, harness.state.colonists[a]),
    );
  });

  it('says nothing about company when there is nobody else alive', () => {
    const { harness, a, b } = pair(5029, 1);
    delete harness.state.colonists[b];
    const alone = thoughtsOf(harness.state, harness.state.colonists[a]);
    expect(alone.some((t) => t.key === 'knowsNobody')).toBe(false);
  });
});

describe('grief', () => {
  it('weighs on the people who knew them, and not on those who did not', () => {
    const { harness, a, b } = pair(5031, 1);
    harness.state.relationships = { [pairKey(a, b)]: AFFINITY_MAX };
    const name = harness.state.colonists[b].name;
    killColonist(harness.state, b, { key: 'colonistKilledByAnimal', params: { species: 'wolf' } });

    expect(harness.state.deaths.length).toBe(1);
    const griefs = griefOf(harness.state, a);
    expect(griefs[0].name).toBe(name);
    expect(
      thoughtsOf(harness.state, harness.state.colonists[a]).some((t) => t.key === 'grieving'),
    ).toBe(true);

    // a stranger feels nothing: the loss is measured against the bond
    const { harness: other, a: stranger } = pair(5037, 1);
    other.state.deaths = [...harness.state.deaths];
    expect(griefOf(other.state, stranger)).toEqual([]);
  });

  it('fades to nothing over three days', () => {
    const { harness, a, b } = pair(5041, 1);
    harness.state.relationships = { [pairKey(a, b)]: AFFINITY_MAX };
    recordDeath(harness.state, harness.state.colonists[b]);
    const atDeath = griefOf(harness.state, a)[0].weight;

    harness.state.tick += GRIEF_TICKS / 2;
    const halfway = griefOf(harness.state, a)[0].weight;
    expect(halfway).toBeLessThan(atDeath);
    expect(halfway).toBeGreaterThan(0);

    harness.state.tick += GRIEF_TICKS;
    expect(griefOf(harness.state, a)).toEqual([]);
  });

  it('counts the heaviest loss only', () => {
    // three deaths in a week should not hold somebody under the break line for
    // a week over something they cannot act on
    const { harness, a } = pair(5043, 1);
    const others = ['x1', 'x2', 'x3'];
    harness.state.relationships = {};
    for (const id of others) {
      harness.state.relationships[pairKey(a, id)] = AFFINITY_MAX;
      harness.state.deaths = [
        ...harness.state.deaths,
        { colonistId: id, name: id, tick: harness.state.tick },
      ];
    }
    const grieving = thoughtsOf(harness.state, harness.state.colonists[a]).filter(
      (t) => t.key === 'grieving',
    );
    expect(grieving.length).toBe(1);
  });

  it('remembers only the last few deaths', () => {
    const { harness, b } = pair(5047, 1);
    for (let i = 0; i < 20; i++) {
      recordDeath(harness.state, { ...harness.state.colonists[b], id: `d${i}`, name: `D${i}` });
    }
    expect(harness.state.deaths.length).toBeLessThanOrEqual(10);
    expect(harness.state.deaths[harness.state.deaths.length - 1].name).toBe('D19');
  });
});
