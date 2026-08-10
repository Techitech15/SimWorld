// Scenarios.
//
// Every map so far has been the same map with different noise: three colonists,
// the same larder, the same two wolves. The seed changes where the trees are,
// which is variety of scenery rather than variety of game.
//
// A scenario is three numbers, chosen because they are the three the first week
// actually turns on: what you start with, how much game there is to hunt, and
// how many predators the map keeps alive. Everything else - seasons, skills,
// arrivals, regrowth - is the same game underneath, so a scenario changes the
// opening rather than the rules.
import type { GameState, ResourceType } from './types';

export type ScenarioName = 'gentle' | 'standard' | 'harsh';

export interface Scenario {
  // what a scenario is called, and its one-line pitch, live in the UI
  // dictionary (src/ui/strings.ts) per language; the scenario is numbers only
  /** what is waiting in the store on day one */
  startingResources: Partial<Record<ResourceType, number>>;
  /**
   * Ground already broken, and hands to work it. These two are the scenario's
   * real levers: a larder is spent in two days and then the farm decides
   * everything, so a scenario that only moved the starting stock was cosmetic -
   * measured over a year, gentle and harsh both finished at six colonists with
   * fourteen hundred food.
   */
  farmPlots: number;
  colonists: number;
  /** multiplier on each species' starting head count */
  wildlife: number;
  /** how many predators the map sustains at once */
  predators: number;
}

export const SCENARIOS: Record<ScenarioName, Scenario> = {
  gentle: {
    startingResources: { food: 240, wood: 120, stone: 30 },
    farmPlots: 8,
    colonists: 4,
    wildlife: 1.5,
    predators: 1,
  },
  standard: {
    startingResources: { food: 120, wood: 60, stone: 0 },
    farmPlots: 5,
    colonists: 3,
    wildlife: 1,
    predators: 2,
  },
  harsh: {
    startingResources: { food: 60, wood: 40, stone: 0 },
    farmPlots: 2,
    colonists: 2,
    wildlife: 0.6,
    predators: 4,
  },
};

export const SCENARIO_NAMES: ScenarioName[] = ['gentle', 'standard', 'harsh'];

export const DEFAULT_SCENARIO: ScenarioName = 'standard';

/**
 * The scenario a state was generated under. Reading it through here rather than
 * off the field directly means a save from before scenarios existed, or a state
 * assembled by hand in a test, behaves as the standard game rather than
 * crashing on an undefined.
 */
export function scenarioOf(state: GameState): Scenario {
  return SCENARIOS[state.scenario] ?? SCENARIOS[DEFAULT_SCENARIO];
}

/** Head count for a species under this scenario, never rounded down to nothing. */
export function scaledCount(base: number, multiplier: number): number {
  return Math.max(1, Math.round(base * multiplier));
}
