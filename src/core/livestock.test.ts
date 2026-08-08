// The livestock loop, driven the way a player drives it.
//
// Every piece of this is already tested and every one of those tests starts
// from a tame animal placed by hand: the pasture holds a herd, a herd breeds,
// chickens lay. What none of them covers is the connective tissue - the player
// paints a pasture, marks a wild animal, and the colony does the rest. That is
// the part that has to work for any of the others to be reachable, and it is
// the newest content path in the game.
//
// Played in the built game first: a pasture east of camp, a sweep of the tame
// tool over the whole map, and by day four five animals were tame including a
// goat. This is that session, headless.
import { describe, expect, it } from 'vitest';
import { designateAnimals } from './actions';
import { SPECIES, TICKS_PER_DAY } from './constants';
import { herdSize, pastureCapacity } from './animals';
import { tileIdOf } from './state';
import { createHarness, placePastureNear, recordLog } from './testUtils';
import type { GameState } from './types';

/** Mark everything on the map, which is what a full-map drag amounts to. */
function markEverythingTame(state: GameState): GameState {
  const tiles: string[] = [];
  for (const id in state.animals) {
    const at = state.animals[id].position;
    tiles.push(tileIdOf(at.x, at.y));
  }
  return designateAnimals(state, tiles, 'tame');
}

const tameCount = (state: GameState) =>
  Object.values(state.animals).filter((animal) => animal.tame).length;

describe('taming, penning and keeping', () => {
  it('turns a marked wild animal into livestock that settles in the pen', () => {
    const harness = createHarness(1101);
    const zoneId = placePastureNear(harness, 5);
    expect(pastureCapacity(harness.state, zoneId)).toBeGreaterThan(0);
    harness.state = markEverythingTame(harness.state);
    expect(tameCount(harness.state)).toBe(0);

    const lines = recordLog(harness, TICKS_PER_DAY * 3);

    // somebody was tamed, and the log says so
    expect(tameCount(harness.state)).toBeGreaterThan(0);
    expect(lines.some((line) => line.includes('was tamed'))).toBe(true);

    // and the ones that were tamed belong to the pen rather than wandering off
    for (const animal of Object.values(harness.state.animals)) {
      if (!animal.tame) continue;
      expect(animal.pastureZoneId).toBe(zoneId);
      expect(animal.designation).toBeNull();
    }
    expect(herdSize(harness.state, zoneId)).toBe(tameCount(harness.state));
  });

  it('never marks something that cannot be tamed', async () => {
    const harness = createHarness(1103);
    placePastureNear(harness, 4);
    harness.state.animals = {};
    const at = Object.values(harness.state.colonists)[0].position;
    const { createAnimal } = await import('./worldgen');
    const wolf = createAnimal(harness.state, 'wolf', at.x + 5, at.y);
    harness.state = designateAnimals(harness.state, [tileIdOf(at.x + 5, at.y)], 'tame');
    expect(harness.state.animals[wolf.id].designation).toBeNull();
    expect(SPECIES.wolf.tameChance).toBe(0);
  });

  it('feeds the colony from the herd it has kept', () => {
    // the payoff: a pen full of animals is food arriving without a job order
    const harness = createHarness(1107);
    const zoneId = placePastureNear(harness, 5);
    harness.state = markEverythingTame(harness.state);
    harness.run(TICKS_PER_DAY * 3);
    const kept = tameCount(harness.state);
    expect(kept).toBeGreaterThan(0);

    // stop the colony working and eating so the only source left is the herd
    harness.state.colonists = {};
    const food = (state: GameState) =>
      Object.values(state.items)
        .filter((item) => item.type === 'food')
        .reduce((sum, item) => sum + item.quantity, 0);
    const before = food(harness.state);
    harness.run(TICKS_PER_DAY * 2);

    expect(food(harness.state)).toBeGreaterThan(before);
    expect(herdSize(harness.state, zoneId)).toBeGreaterThan(0);
  });
});
