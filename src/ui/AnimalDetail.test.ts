// Selecting a creature rather than the ground it was standing on.
//
// The animal panel's "show me one" first selected the tile the animal occupied
// at click time. Measured in the built game across all five species on the map,
// every one of them had walked off that tile before the panel rendered - the
// selection panel said "no animal here" while the status bar named the animal
// it had just sent the camera to. A moving target needs a selection that moves
// with it.
import { describe, expect, it } from 'vitest';
import { SPECIES } from '../core/constants';
import { designateAnimals } from '../core/actions';
import { tileIdOf } from '../core/state';
import { createHarness, idleColony } from '../core/testUtils';
import { createAnimal } from '../core/worldgen';
import { describeAnimal } from './AnimalDetail';

function value(rows: string[], label: string): string | undefined {
  return rows.find((row) => row.startsWith(`${label}: `))?.slice(label.length + 2);
}

describe('the animal sheet', () => {
  it('says nothing when nothing is selected', () => {
    const harness = createHarness(1501);
    expect(describeAnimal(harness.state, null)).toEqual([]);
    expect(describeAnimal(harness.state, 'a999')).toEqual([]);
  });

  it('keeps up with an animal as it walks', () => {
    // the whole point: the tile goes stale, the creature does not
    const harness = createHarness(1503);
    idleColony(harness.state);
    harness.state.animals = {};
    const at = Object.values(harness.state.colonists)[0].position;
    const deer = createAnimal(harness.state, 'deer', at.x + 6, at.y);
    const startedAt = value(describeAnimal(harness.state, deer.id), 'Where');

    let moved = false;
    harness.run(900, (state) => {
      const rows = describeAnimal(state, deer.id);
      if (rows.length === 0) return; // eaten by something; not this test's subject
      const where = value(rows, 'Where');
      expect(where).toBe(
        `${state.animals[deer.id].position.x}, ${state.animals[deer.id].position.y}`,
      );
      if (where !== startedAt) moved = true;
    });
    expect(moved).toBe(true);
  });

  it('tells the player what the creature is worth and what it is doing', () => {
    const harness = createHarness(1507);
    harness.state.animals = {};
    const at = Object.values(harness.state.colonists)[0].position;
    const goat = createAnimal(harness.state, 'goat', at.x + 4, at.y, { tame: true });

    const rows = describeAnimal(harness.state, goat.id);
    expect(value(rows, 'Name')).toBe(`${goat.name} the goat`);
    expect(value(rows, 'Kind')).toBe('tame');
    expect(value(rows, 'Butchers for')).toBe(`${SPECIES.goat.foodYield} food`);
    expect(value(rows, 'Gives')).toContain(String(SPECIES.goat.produceAmount));
    expect(value(rows, 'Doing')).toBeTruthy();
  });

  it('calls a wolf a predator and a wild deer wild', () => {
    const harness = createHarness(1511);
    harness.state.animals = {};
    const at = Object.values(harness.state.colonists)[0].position;
    const wolf = createAnimal(harness.state, 'wolf', at.x + 8, at.y);
    const deer = createAnimal(harness.state, 'deer', at.x + 9, at.y);
    expect(value(describeAnimal(harness.state, wolf.id), 'Kind')).toBe('predator');
    expect(value(describeAnimal(harness.state, deer.id), 'Kind')).toBe('wild');
    // a wolf gives nothing while it lives, so it says nothing about giving
    expect(value(describeAnimal(harness.state, wolf.id), 'Gives')).toBeUndefined();
  });

  it('shows an order the player has given it', () => {
    const harness = createHarness(1513);
    harness.state.animals = {};
    const at = Object.values(harness.state.colonists)[0].position;
    const boar = createAnimal(harness.state, 'boar', at.x + 5, at.y);
    expect(value(describeAnimal(harness.state, boar.id), 'Order')).toBeUndefined();

    harness.state = designateAnimals(harness.state, [tileIdOf(at.x + 5, at.y)], 'hunt');
    expect(value(describeAnimal(harness.state, boar.id), 'Order')).toBe('marked for hunt');
  });

  it('returns flat strings, so the selector stays shallow-comparable', () => {
    const harness = createHarness(1517);
    const id = Object.keys(harness.state.animals)[0];
    const rows = describeAnimal(harness.state, id);
    for (const row of rows) expect(typeof row).toBe('string');
    expect(describeAnimal(harness.state, id)).toEqual(rows);
  });
});
