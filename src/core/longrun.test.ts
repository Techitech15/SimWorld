// A whole year, unattended.
//
// Every feature so far has been tested on its own over a few hundred ticks.
// This is the other question: with skills making work faster, traits pulling
// colonists apart, arrivals adding mouths, wolves eating the wildlife and the
// seasons stopping the crops, does the colony that results still hold together
// when nobody touches it for twenty days?
//
// It is one long test rather than several because the whole point is that
// nothing here is isolated.
import { describe, expect, it } from 'vitest';
import { collectAlerts } from './alerts';
import { createSimContext } from './derived';
import { ARRIVAL_MAX_COLONISTS, TICK_MS } from './constants';
import { SKILL_NAMES, levelOf } from './skills';
import { TICKS_PER_SEASON } from './season';
import { countResource } from './storage';
import { createHarness } from './testUtils';
import type { GameState } from './types';

const YEAR = TICKS_PER_SEASON * 4;

function lowest(values: number[]): number {
  return values.reduce((least, value) => Math.min(least, value), Infinity);
}

describe('a year unattended', () => {
  it('leaves a living colony, not a ruin and not a runaway', () => {
    const harness = createHarness(8101);
    const founders = Object.keys(harness.state.colonists).length;

    let lowestFood = Infinity;
    let lowestPopulation = founders;
    let lowestWildlife = Infinity;
    let worstHealth = 100;
    harness.run(YEAR, (state) => {
      // population every tick: sampling it would hide a death that an arrival
      // filled in before the next sample
      lowestPopulation = Math.min(lowestPopulation, Object.keys(state.colonists).length);
      if (state.tick % 200 !== 0) return; // the rest is sampling, not a second simulation
      lowestFood = Math.min(lowestFood, countResource(state, 'food'));
      lowestWildlife = Math.min(lowestWildlife, Object.keys(state.animals).length);
      worstHealth = Math.min(
        worstHealth,
        lowest(Object.values(state.colonists).map((c) => c.health)),
      );
    });

    const state = harness.state;
    const population = Object.keys(state.colonists).length;

    // nobody starved, and nobody was eaten
    expect(lowestPopulation).toBe(founders);
    expect(population).toBeGreaterThanOrEqual(founders);
    expect(population).toBeLessThanOrEqual(ARRIVAL_MAX_COLONISTS);
    // the key already says who starved: colonists and animals log different
    // events now, so no name matching is needed to tell them apart
    const humanDeaths = state.log.filter((e) => e.key === 'colonistStarvedToDeath');
    expect(humanDeaths).toEqual([]);
    expect(worstHealth).toBeGreaterThan(0);

    // the larder dips through winter without ever emptying
    expect(lowestFood).toBeGreaterThan(0);
    expect(countResource(state, 'food')).toBeGreaterThan(0);

    // the ecology neither dies out nor overruns the map
    expect(lowestWildlife).toBeGreaterThan(5);
    expect(Object.keys(state.animals).length).toBeLessThan(80);

    // people got better at what they spent the year doing
    const best = Math.max(
      ...Object.values(state.colonists).flatMap((c) => SKILL_NAMES.map((n) => levelOf(c.skills[n]))),
    );
    expect(best).toBeGreaterThanOrEqual(5);

    // and the job system is not quietly choking: no pile of dead work
    const failed = Object.values(state.jobs).filter((j) => j.state === 'failed');
    expect(failed.length).toBeLessThan(10);
    expect(Object.keys(state.jobs).length).toBeLessThan(200);

    // nothing is on fire at the end of it
    const critical = collectAlerts(state).filter((a) => a.level === 'critical');
    expect(critical).toEqual([]);
  }, 180000);

  it('stays inside the tick budget with a year of accumulated state', () => {
    // The simulation gets one 200ms tick. A year in, with more colonists, more
    // items and a bigger log than day one, it must still be nowhere near that -
    // this is the number that quietly rots as features are added.
    const harness = createHarness(8111);
    harness.run(YEAR);

    const started = performance.now();
    harness.run(2000);
    const perTick = (performance.now() - started) / 2000;

    expect(perTick).toBeLessThan(TICK_MS / 20); // an order of magnitude of headroom
  }, 180000);

  it('survives being saved and reloaded at any point in the year', () => {
    const harness = createHarness(8117);
    for (let quarter = 0; quarter < 4; quarter++) {
      harness.run(YEAR / 4);
      const reloaded = JSON.parse(JSON.stringify(harness.state)) as GameState;
      expect(reloaded.colonists).toEqual(harness.state.colonists);
      harness.state = reloaded;
      // the derived caches are rebuilt from the reloaded state, never saved
      harness.ctx = createSimContext(reloaded);
    }
    expect(Object.keys(harness.state.colonists).length).toBeGreaterThan(0);
  }, 180000);
});
