// A trait is only worth having if it shows up in play, so these tests take two
// colonies identical in every respect but one trait and measure the difference.
import { describe, expect, it } from 'vitest';
import { COLONIST_MAX_HEALTH, HUNGER_PER_TICK, TICKS_PER_DAY } from './constants';
import { setDesignation } from './actions';
import { levelOf } from './skills';
import { TRAITS, TRAIT_NAMES, rollTraits, traitMultiplier } from './traits';
import { createHarness, idleColony, nearestTilesWithTerrain } from './testUtils';
import { generateWorld } from './worldgen';
import type { GameState, TraitName } from './types';

function everyoneHas(state: GameState, ...traits: TraitName[]): void {
  for (const id in state.colonists) {
    state.colonists[id] = { ...state.colonists[id], traits };
  }
}

describe('traits', () => {
  it('multiply out to the pre-trait colonist when there are none', () => {
    const plain = { traits: [] };
    expect(traitMultiplier(plain, 'work')).toBe(1);
    expect(traitMultiplier(plain, 'hunger')).toBe(1);
    expect(traitMultiplier(plain, 'experience')).toBe(1);
    expect(traitMultiplier(plain, 'healing')).toBe(1);
    // and an unknown or missing list is not a crash
    expect(traitMultiplier(undefined, 'work')).toBe(1);
    expect(traitMultiplier({ traits: ['nonsense' as TraitName] }, 'work')).toBe(1);
  });

  it('compound rather than override each other', () => {
    const both = { traits: ['industrious', 'restless'] as TraitName[] };
    expect(traitMultiplier(both, 'work')).toBeCloseTo(TRAITS.industrious.effects.work!);
    expect(traitMultiplier(both, 'sleep')).toBeCloseTo(TRAITS.restless.effects.sleep!);
  });

  it('make a big eater hungry sooner than a frugal one', () => {
    const hungerAfter = (traits: TraitName[]) => {
      const harness = createHarness(6101);
      idleColony(harness.state);
      everyoneHas(harness.state, ...traits);
      // hunger must be the only thing moving: no eating, no work
      for (const id in harness.state.items) delete harness.state.items[id];
      harness.run(500);
      return Object.values(harness.state.colonists)[0].needs.hunger;
    };
    const big = hungerAfter(['bigEater']);
    const frugal = hungerAfter(['frugal']);
    const plain = hungerAfter([]);
    expect(big).toBeGreaterThan(plain);
    expect(frugal).toBeLessThan(plain);
    // and the size of the gap is the multiplier, not something invented
    expect(big - plain).toBeCloseTo(500 * HUNGER_PER_TICK * (TRAITS.bigEater.effects.hunger! - 1), 1);
  });

  it('make a quick learner outpace a slow one at the same work', () => {
    const chopXpAfter = (traits: TraitName[]) => {
      const harness = createHarness(6113);
      idleColony(harness.state);
      everyoneHas(harness.state, ...traits);
      for (const id in harness.state.colonists) {
        const colonist = harness.state.colonists[id];
        harness.state.colonists[id] = {
          ...colonist,
          workPriorities: { ...colonist.workPriorities, chop: 1 },
        };
      }
      const at = Object.values(harness.state.colonists)[0].position;
      harness.state = setDesignation(
        harness.state,
        nearestTilesWithTerrain(harness.state, 'forest', at, 10),
        'chop',
      );
      harness.run(900);
      return Object.values(harness.state.colonists).reduce((sum, c) => sum + c.skills.chop, 0);
    };
    const quick = chopXpAfter(['quickLearner']);
    const slow = chopXpAfter(['slowLearner']);
    expect(quick).toBeGreaterThan(slow);
    expect(levelOf(quick)).toBeGreaterThanOrEqual(levelOf(slow));
  });

  it('let the tough mend faster than the frail from the same wound', () => {
    const healedAfter = (traits: TraitName[]) => {
      const harness = createHarness(6119);
      idleColony(harness.state);
      harness.state.animals = {}; // nothing to be mauled by while we measure
      everyoneHas(harness.state, ...traits);
      for (const id in harness.state.colonists) {
        harness.state.colonists[id] = {
          ...harness.state.colonists[id],
          health: 40,
          needs: { hunger: 0, sleep: 100 }, // straight to bed, which is where healing happens
        };
      }
      harness.run(TICKS_PER_DAY, (state) => {
        for (const id in state.animals) delete state.animals[id];
      });
      return Object.values(harness.state.colonists)[0].health;
    };
    const tough = healedAfter(['tough']);
    const frail = healedAfter(['frail']);
    expect(tough).toBeGreaterThan(frail);
    expect(tough).toBeLessThanOrEqual(COLONIST_MAX_HEALTH);
  });

  it('make an industrious colonist finish sooner than an unhurried one', () => {
    const ticksToChop = (traits: TraitName[]) => {
      const harness = createHarness(6121);
      idleColony(harness.state);
      const ids = Object.keys(harness.state.colonists);
      for (const id of ids.slice(1)) delete harness.state.colonists[id];
      const only = ids[0];
      harness.state.colonists[only] = {
        ...harness.state.colonists[only],
        traits,
        skills: { chop: 0, mine: 0, farm: 0, build: 0, haul: 0, hunt: 0, handle: 0 },
        workPriorities: { ...harness.state.colonists[only].workPriorities, chop: 1 },
      };
      const at = harness.state.colonists[only].position;
      const [tileId] = nearestTilesWithTerrain(harness.state, 'forest', at, 1);
      harness.state = setDesignation(harness.state, [tileId], 'chop');
      let spent = 0;
      harness.run(2000, (state) => {
        if (state.tiles[tileId].terrain === 'forest') spent = state.tick;
      });
      return spent;
    };
    expect(ticksToChop(['industrious'])).toBeLessThan(ticksToChop(['unhurried']));
  });

  it('never deal a colonist two traits that contradict each other', () => {
    for (let seed = 0; seed < 400; seed++) {
      const traits = rollTraits(seed);
      expect(traits.length).toBeLessThanOrEqual(2);
      const families = traits.map((name) => TRAITS[name].family);
      expect(new Set(families).size).toBe(families.length);
      for (const name of traits) expect(TRAIT_NAMES).toContain(name);
      expect(new Set(traits).size).toBe(traits.length);
    }
  });

  it('deal the founders traits from the world seed, and mostly not the same ones', () => {
    const founders = (seed: number) =>
      Object.values(generateWorld({ seed }).colonists).map((c) => c.traits.join('+'));
    expect(founders(6131)).toEqual(founders(6131)); // deterministic
    const across = new Set([...founders(6131), ...founders(6137), ...founders(6143)]);
    expect(across.size).toBeGreaterThan(2);
  });

  it('survive a save round trip as plain strings', () => {
    const harness = createHarness(6149);
    harness.run(200);
    const reloaded = JSON.parse(JSON.stringify(harness.state)) as GameState;
    for (const id in reloaded.colonists) {
      expect(reloaded.colonists[id].traits).toEqual(harness.state.colonists[id].traits);
      for (const name of reloaded.colonists[id].traits) expect(typeof name).toBe('string');
    }
  });
});
