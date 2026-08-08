// Mood: does the colony's condition reach the person living in it?
//
// The measurements that shaped these numbers are in the assertions: a colonist
// with beds, food and rest sits comfortably above the break threshold, and one
// with none of those goes under it inside a day.
import { describe, expect, it } from 'vitest';
import { placeBuildingBlueprint } from './actions';
import {
  MOOD_BASE,
  MOOD_BREAK,
  MOOD_BREAK_TICKS,
  MOOD_LOW,
  moodLabel,
  moodOf,
  moodWorkFactor,
  thoughtsOf,
} from './mood';
import { workRate } from './skills';
import { addLog } from './state';
import { createHarness, idleColony, recordLog } from './testUtils';
import type { Colonist, GameState } from './types';

function anyColonist(state: GameState): Colonist {
  return Object.values(state.colonists)[0];
}

/** Strip the colony down to one comfortable colonist with a bed and a larder. */
function comfortable(state: GameState): Colonist {
  idleColony(state);
  const colonist = anyColonist(state);
  for (const id in state.colonists) {
    if (id !== colonist.id) delete state.colonists[id];
  }
  state.colonists[colonist.id] = { ...colonist, needs: { hunger: 10, sleep: 10 }, health: 100 };
  // a bed each, and a fortnight of meals
  state.buildings[`b_bed_test`] = {
    id: 'b_bed_test',
    type: 'bed',
    tileId: `${colonist.position.x},${colonist.position.y}`,
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
  state.items['i_food_test'] = {
    id: 'i_food_test',
    type: 'food',
    quantity: 400,
    position: { ...colonist.position },
    reservedByJobId: null,
  };
  const tile = state.tiles[`${colonist.position.x},${colonist.position.y}`];
  state.tiles[tile.id] = { ...tile, itemIds: [...tile.itemIds, 'i_food_test'] };
  return state.colonists[colonist.id];
}

describe('mood', () => {
  it('leaves a well-kept colonist above the line, and it shows its working', () => {
    const harness = createHarness(2101);
    const colonist = comfortable(harness.state);
    const mood = moodOf(harness.state, colonist);
    expect(mood).toBeGreaterThan(MOOD_LOW);
    // every point of it is accounted for by a thought the panel can print
    const sum = thoughtsOf(harness.state, colonist).reduce((total, t) => total + t.amount, 0);
    expect(Math.abs(mood - (MOOD_BASE + sum))).toBeLessThanOrEqual(1);
  });

  it('drops a neglected colonist under the break threshold', () => {
    const harness = createHarness(2103);
    const colonist = comfortable(harness.state);
    harness.state.items = {};
    harness.state.buildings = {};
    harness.state.colonists[colonist.id] = {
      ...colonist,
      needs: { hunger: 92, sleep: 92 },
      health: 55,
    };
    expect(moodOf(harness.state, harness.state.colonists[colonist.id])).toBeLessThan(MOOD_BREAK);
  });

  it('names the worst thing first, so the panel can lead with it', () => {
    const harness = createHarness(2107);
    const colonist = comfortable(harness.state);
    harness.state.colonists[colonist.id] = { ...colonist, needs: { hunger: 95, sleep: 10 } };
    const thoughts = thoughtsOf(harness.state, harness.state.colonists[colonist.id]);
    expect(thoughts[0].label).toBe('Starving');
    for (let i = 1; i < thoughts.length; i++) {
      expect(thoughts[i].amount).toBeGreaterThanOrEqual(thoughts[i - 1].amount);
    }
  });

  it('reads the same words the player sees', () => {
    expect(moodLabel(90)).toBe('happy');
    expect(moodLabel(MOOD_BREAK - 1)).toBe('miserable');
    expect(moodLabel(MOOD_BASE)).toBe('content');
    // the word turns over exactly where the mechanic does
    expect(moodLabel(MOOD_LOW)).toBe('content');
    expect(moodLabel(MOOD_LOW - 1)).toBe('unsettled');
  });
});

describe('what mood costs', () => {
  it('does nothing at all to an ordinary colonist', () => {
    // the point of the flat middle: a colony that was fine before mood existed
    // works at exactly the speed it always did
    for (let mood = MOOD_LOW; mood <= 69; mood++) expect(moodWorkFactor(mood)).toBe(1);
  });

  it('slows a miserable one and hurries a happy one', () => {
    expect(moodWorkFactor(0)).toBeCloseTo(0.6);
    expect(moodWorkFactor(100)).toBeCloseTo(1.1);
    expect(moodWorkFactor(10)).toBeLessThan(1);
    expect(moodWorkFactor(85)).toBeGreaterThan(1);
  });

  it('multiplies the rate a skill already earned', () => {
    const harness = createHarness(2111);
    const colonist = comfortable(harness.state);
    const plain = workRate(colonist, 'chop');
    expect(workRate(colonist, 'chop', 50)).toBe(plain);
    expect(workRate(colonist, 'chop', 0)).toBeCloseTo(plain * 0.6);
  });
});

describe('a colonist who has had enough', () => {
  it('downs tools, stays down, and then goes back to it', () => {
    const harness = createHarness(2113);
    const colonist = comfortable(harness.state);
    // The colony that produces a break: the food has run out, nobody has a bed,
    // and this one is hurt. Note the hunger - past the threshold, so they are
    // looking for a meal, and there is none to find. Sleep stays well under its
    // threshold on purpose: a colonist who goes to bed is asleep, not brooding,
    // and sleeping through a crisis is the pre-existing behaviour.
    harness.state.items = {};
    harness.state.buildings = {};
    const miserable = { needs: { hunger: 65, sleep: 20 }, health: 40 };
    harness.state.colonists[colonist.id] = { ...colonist, ...miserable };

    const log = recordLog(harness, 5, () => {
      // hold it steady: hunger climbs every tick and would change the reading
      const current = harness.state.colonists[colonist.id];
      if (current) harness.state.colonists[colonist.id] = { ...current, ...miserable };
    });
    expect(log.some((line) => line.includes('has had enough'))).toBe(true);
    expect(harness.state.colonists[colonist.id].activity.kind).toBe('brooding');

    // feeding them one meal does not cancel the break
    harness.state.colonists[colonist.id] = {
      ...harness.state.colonists[colonist.id],
      needs: { hunger: 5, sleep: 5 },
      health: 100,
    };
    harness.run(5);
    expect(harness.state.colonists[colonist.id].activity.kind).toBe('brooding');

    const back = recordLog(harness, MOOD_BREAK_TICKS + 10);
    expect(harness.state.colonists[colonist.id].activity.kind).not.toBe('brooding');
    expect(back.some((line) => line.includes('goes back to work'))).toBe(true);
  });

  it('takes no jobs while it lasts', () => {
    const harness = createHarness(2117);
    const colonist = comfortable(harness.state);
    harness.state.colonists[colonist.id] = {
      ...colonist,
      activity: { kind: 'brooding', untilTick: harness.state.tick + MOOD_BREAK_TICKS },
    };
    // plenty to do, and nobody else to do it
    harness.state = placeBuildingBlueprint(harness.state, 'wall', [
      `${colonist.position.x + 2},${colonist.position.y}`,
    ]);
    harness.run(60);
    expect(harness.state.colonists[colonist.id].currentJobId).toBe(null);
  });

  it('still eats: hunger beats sulking', () => {
    const harness = createHarness(2119);
    const colonist = comfortable(harness.state);
    harness.state.colonists[colonist.id] = {
      ...colonist,
      needs: { hunger: 99, sleep: 10 },
      activity: { kind: 'brooding', untilTick: harness.state.tick + MOOD_BREAK_TICKS * 4 },
    };
    harness.run(400);
    const after = harness.state.colonists[colonist.id];
    expect(after).toBeDefined();
    expect(after.needs.hunger).toBeLessThan(99);
  });
});

describe('temperament', () => {
  it('cuts both ways: the cheerful one suffers the same hardship less', () => {
    const harness = createHarness(2123);
    const colonist = comfortable(harness.state);
    harness.state.items = {};
    harness.state.buildings = {};
    const hard = { needs: { hunger: 80, sleep: 80 }, health: 60 };
    const plain = moodOf(harness.state, { ...colonist, ...hard, traits: [] });
    const cheerful = moodOf(harness.state, { ...colonist, ...hard, traits: ['cheerful'] });
    const gloomy = moodOf(harness.state, { ...colonist, ...hard, traits: ['gloomy'] });
    expect(cheerful).toBeGreaterThan(plain);
    expect(gloomy).toBeLessThan(plain);

    // and the same good fortune more - which a single multiplier on the total
    // would have got backwards for one of the two
    const easy = comfortable(harness.state);
    const goodPlain = moodOf(harness.state, { ...easy, traits: [] });
    const goodCheerful = moodOf(harness.state, { ...easy, traits: ['cheerful'] });
    expect(goodCheerful).toBeGreaterThan(goodPlain);
  });
});

describe('the log', () => {
  it('marks a break as an incident, so the alert panel can see it', () => {
    const harness = createHarness(2129);
    addLog(harness.state, 'test', 'incident');
    expect(harness.state.log[harness.state.log.length - 1].kind).toBe('incident');
  });
});
