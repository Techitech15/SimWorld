// The goat exists to make a pen worth its walls.
//
// A pasture tile holds one animal whatever species it is, so what a pen is
// worth is entirely what its occupants give per head - and every tameable
// animal was small. These tests are about that claim rather than about the
// goat as such: it has to be the best thing to keep, and harder to get, or it
// is just a sixth sprite.
import { describe, expect, it } from 'vitest';
import { ANIMAL_SPECIES, PASTURE_TILES_PER_ANIMAL, SPECIES, TICKS_PER_DAY } from './constants';

import { isPredator } from './animals';
import { tileIdOf } from './state';
import { createHarness, idleColony, placePastureNear } from './testUtils';
import { createAnimal, generateWorld } from './worldgen';
import type { AnimalSpecies, GameState } from './types';

const tameable = ANIMAL_SPECIES.filter(
  (species) => SPECIES[species].tameChance > 0,
) as AnimalSpecies[];

describe('the goat', () => {
  it('is the best thing a pen can hold, per head', () => {
    // a pen's worth is per head, because its capacity does not care what the
    // heads are
    expect(PASTURE_TILES_PER_ANIMAL).toBeGreaterThan(0);
    // only the ones that produce at all have a rate: an interval of zero is
    // not a slow animal, it is an animal that gives nothing
    const perTick = (species: AnimalSpecies) => {
      const profile = SPECIES[species];
      if (profile.produceAmount <= 0 || profile.produceIntervalTicks <= 0) return 0;
      return profile.produceAmount / profile.produceIntervalTicks;
    };
    expect(perTick('goat')).toBeGreaterThan(0);

    for (const species of tameable) {
      if (species === 'goat') continue;
      expect(perTick('goat')).toBeGreaterThan(perTick(species));
    }

    // It is not best at everything, and should not be: a boar is a bigger
    // carcass and gives nothing at all while it lives. The goat beats what it
    // is actually competing with - the other animal you would keep rather than
    // kill.
    expect(SPECIES.goat.foodYield).toBeGreaterThan(SPECIES.chicken.foodYield);
    expect(SPECIES.boar.foodYield).toBeGreaterThan(SPECIES.goat.foodYield);
    expect(SPECIES.boar.produceAmount).toBe(0);
  });

  it('is harder to tame than what it replaces, or it is a free upgrade', () => {
    for (const species of tameable) {
      if (species === 'goat') continue;
      // the trade: better to keep, harder to get
      if (SPECIES[species].produceAmount > 0) {
        expect(SPECIES.goat.tameChance).toBeLessThan(SPECIES[species].tameChance);
      }
    }
    expect(SPECIES.goat.tameChance).toBeGreaterThan(0);
  });

  it('is a herbivore that walks the map like the others', () => {
    expect(isPredator({ species: 'goat' } as never)).toBe(false);
    const harness = createHarness(9931);
    idleColony(harness.state);
    harness.state.animals = {};
    const at = Object.values(harness.state.colonists)[0].position;
    const goat = createAnimal(harness.state, 'goat', at.x + 5, at.y + 5);

    harness.run(900, (state) => {
      const beast = state.animals[goat.id];
      if (!beast) return;
      const tile = state.tiles[tileIdOf(beast.position.x, beast.position.y)];
      expect(tile).toBeDefined();
      expect(tile.walkable).toBe(true);
    });
    expect(harness.state.animals[goat.id]).toBeDefined();
  });

  it('turns up on a new map without crowding the others out', () => {
    const state = generateWorld({ seed: 9937 });
    const counts: Partial<Record<AnimalSpecies, number>> = {};
    for (const id in state.animals) {
      const species = state.animals[id].species;
      counts[species] = (counts[species] ?? 0) + 1;
    }
    expect(counts.goat).toBeGreaterThan(0);
    for (const species of tameable) expect(counts[species]).toBeGreaterThan(0);
    // wolves still arrive later, not at generation
    expect(counts.wolf ?? 0).toBe(0);
  });

  it('gives milk once it is settled in a pasture', () => {
    const harness = createHarness(9941);
    harness.state.animals = {};
    const zoneId = placePastureNear(harness, 4);
    const tile = harness.state.tiles[harness.state.zones[zoneId].tileIds[0]];
    createAnimal(harness.state, 'goat', tile.x, tile.y, { tame: true, pastureZoneId: zoneId });
    // nobody to eat it: three colonists get through more in a day than one
    // goat gives, so leaving them in measures their appetite instead
    harness.state.colonists = {};

    const food = (state: GameState) =>
      Object.values(state.items)
        .filter((item) => item.type === 'food')
        .reduce((sum, item) => sum + item.quantity, 0);
    const before = food(harness.state);
    harness.run(TICKS_PER_DAY);
    const gained = food(harness.state) - before;
    expect(gained).toBeGreaterThan(0);
    // and it is milk, in whole yields, not something else drifting in
    expect(gained % SPECIES.goat.produceAmount).toBe(0);
  });

  it('has a sprite of its own, like every other species', async () => {
    const { sprites } = await import('../assets/sprites');
    for (const species of ANIMAL_SPECIES) {
      expect(sprites[species as keyof typeof sprites]).toBeTruthy();
    }
  });
});
