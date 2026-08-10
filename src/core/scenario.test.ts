// Every map was the same map with different noise: the seed moved the trees
// around, which is variety of scenery rather than variety of game. A scenario
// changes the three things the first week actually turns on - what you start
// with, how much game there is, and how many wolves the map keeps.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from './constants';
import { createSimContext } from './derived';
import {
  DEFAULT_SCENARIO,
  SCENARIOS,
  SCENARIO_NAMES,
  scaledCount,
  scenarioOf,
} from './scenario';
import { tickMany } from './simulation';
import { countResource } from './storage';
import { createEmptyState } from './state';

import type { GameState, ScenarioName } from './types';
import { testWorld } from './testUtils';

const wolves = (state: GameState) =>
  Object.values(state.animals).filter((a) => a.species === 'wolf').length;
const wildlife = (state: GameState) =>
  Object.values(state.animals).filter((a) => a.species !== 'wolf').length;

describe('scenarios', () => {
  it('start the colony with what they promise', () => {
    for (const name of SCENARIO_NAMES) {
      const state = testWorld({ seed: 9301, scenario: name });
      expect(state.scenario).toBe(name);
      for (const [type, quantity] of Object.entries(SCENARIOS[name].startingResources)) {
        expect(countResource(state, type as 'food')).toBe(quantity);
      }
      expect(Object.keys(state.colonists).length).toBe(SCENARIOS[name].colonists);
      expect(Object.values(state.buildings).filter((b) => b.type === 'farmPlot').length).toBe(
        SCENARIOS[name].farmPlots,
      );
      // every colonist has somewhere to stand and every plot is on real ground
      for (const colonist of Object.values(state.colonists)) {
        expect(state.tiles[`${colonist.position.x},${colonist.position.y}`]).toBeDefined();
      }
      for (const building of Object.values(state.buildings)) {
        expect(state.tiles[building.tileId]?.buildingId).toBe(building.id);
      }
    }
  });

  it('put more game on a gentle map than a hard one', () => {
    const gentle = testWorld({ seed: 9307, scenario: 'gentle' });
    const standard = testWorld({ seed: 9307, scenario: 'standard' });
    const harsh = testWorld({ seed: 9307, scenario: 'harsh' });
    expect(wildlife(gentle)).toBeGreaterThan(wildlife(standard));
    expect(wildlife(harsh)).toBeLessThan(wildlife(standard));
    // and the same seed still means the same map underneath
    expect(gentle.forestCapacity).toBe(harsh.forestCapacity);
  });

  it('never thin a species out of existence', () => {
    // 0.6 of a species with one head has to stay one head, not round to none
    expect(scaledCount(1, 0.6)).toBe(1);
    expect(scaledCount(2, 0.1)).toBe(1);
    expect(scaledCount(10, 1.5)).toBe(15);
  });

  it('keep the promised number of wolves alive, day after day', () => {
    // the predator cap is a rule that runs daily, not a decision made once at
    // generation, which is why the scenario has to be stored on the state
    for (const name of ['gentle', 'harsh'] as ScenarioName[]) {
      let state = testWorld({ seed: 9311, scenario: name });
      state = tickMany(state, createSimContext(state), TICKS_PER_DAY * 6);
      expect(wolves(state)).toBeLessThanOrEqual(SCENARIOS[name].predators);
    }

    const harsh = testWorld({ seed: 9313, scenario: 'harsh' });
    const grown = tickMany(harsh, createSimContext(harsh), TICKS_PER_DAY * 6);
    const gentle = testWorld({ seed: 9313, scenario: 'gentle' });
    const calm = tickMany(gentle, createSimContext(gentle), TICKS_PER_DAY * 6);
    expect(wolves(grown)).toBeGreaterThan(wolves(calm));
  });

  it('survive a state that never heard of scenarios', () => {
    // a save from before this existed, or a state built by hand in a test
    const bare = createEmptyState();
    delete (bare as Partial<GameState>).scenario;
    expect(scenarioOf(bare)).toBe(SCENARIOS[DEFAULT_SCENARIO]);
    expect(scenarioOf({ ...bare, scenario: 'nonsense' as ScenarioName })).toBe(
      SCENARIOS[DEFAULT_SCENARIO],
    );
  });

  it('leave the standard opening exactly as it was', () => {
    // the scenario layer must not quietly rebalance the game everything else
    // was measured against
    const state = testWorld({ seed: 9317 });
    expect(state.scenario).toBe('standard');
    expect(countResource(state, 'food')).toBe(120);
    expect(countResource(state, 'wood')).toBe(60);
    expect(countResource(state, 'stone')).toBe(0);
    expect(Object.keys(state.colonists).length).toBe(3);
    expect(Object.values(state.buildings).filter((b) => b.type === 'farmPlot').length).toBe(5);
  });

  it('differ in a way that outlasts the first two days', () => {
    // The first attempt at this moved only the starting stock, and measured
    // over a year gentle and harsh both finished at six colonists with fourteen
    // hundred food: a larder is spent in two days and then the farm decides
    // everything. So the test has to look past the opening, which is why it
    // runs ten days rather than five.
    const after = (name: ScenarioName) => {
      let state = testWorld({ seed: 9323, scenario: name });
      state = tickMany(state, createSimContext(state), TICKS_PER_DAY * 10);
      return {
        food: countResource(state, 'food'),
        population: Object.keys(state.colonists).length,
        starved: state.log.filter((e) => e.message.includes('starved to death')).length,
      };
    };
    const harsh = after('harsh');
    const standard = after('standard');
    const gentle = after('gentle');

    // the gap is not a transient: it is wider at day ten than at day one
    expect(harsh.food).toBeLessThan(standard.food * 0.8);
    expect(gentle.food).toBeGreaterThan(standard.food * 1.2);

    // harder, and still a game: the hard frontier is behind, not dead
    expect(harsh.starved).toBe(0);
    expect(harsh.population).toBeGreaterThanOrEqual(
      SCENARIOS.harsh.colonists,
    );
    expect(gentle.population).toBeGreaterThan(harsh.population);
  });
});
