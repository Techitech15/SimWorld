// What to do next.
//
// The colony has grown a lot of systems - pens, taming, storage filters,
// repairs, skills - and nothing in the game mentions that any of them exist.
// The toolbar lists the buttons; it does not say why you would press one.
//
// These are the things a colony wants, in roughly the order it wants them,
// each derived from the present state rather than from a record of what the
// player has done. That matters: a goal that was ticked off by history would
// stay ticked after the bed burned down, whereas one derived from the state
// goes back to undone and says so - which is the more useful thing for a panel
// that is answering "what now".
import { RESOURCE_TYPES } from './constants';
import { seasonOf } from './season';
import type { Season } from './season';
import type { GameState, LogParams } from './types';

/**
 * The fixed list of goals. The id is the key the UI dictionary renders a label
 * and a hint from, in the player's language (11章 フェーズ9); the numbers a
 * label needs travel in `params`.
 */
export type GoalId =
  | 'beds'
  | 'winter'
  | 'farm'
  | 'stone'
  | 'wall'
  | 'pasture'
  | 'tame'
  | 'filter'
  | 'research';

export interface Goal {
  id: GoalId;
  /** what the label interpolates: counts and targets, derived like `done` */
  params: LogParams;
  done: boolean;
  /** how far along, 0..1, for the ones that are a count rather than a yes/no */
  progress: number;
}

/** Food per colonist that counts as ready for winter, roughly three days each. */
export const WINTER_STORE_PER_COLONIST = 40;

function ratio(have: number, want: number): number {
  if (want <= 0) return 1;
  return Math.max(0, Math.min(1, have / want));
}

export function colonyGoals(state: GameState): Goal[] {
  const colonists = Object.keys(state.colonists).length;
  if (colonists === 0) return [];

  let beds = 0;
  let plots = 0;
  let walls = 0;
  for (const id in state.buildings) {
    const building = state.buildings[id];
    if (building.isBlueprint) continue;
    if (building.type === 'bed') beds++;
    else if (building.type === 'farmPlot') plots++;
    else if (building.type === 'wall' || building.type === 'stoneWall') walls++;
  }

  const stock: Partial<Record<string, number>> = {};
  for (const id in state.items) {
    const item = state.items[id];
    stock[item.type] = (stock[item.type] ?? 0) + item.quantity;
  }

  let pastures = 0;
  let filtered = false;
  for (const zoneId in state.zones) {
    const zone = state.zones[zoneId];
    if (zone.type === 'pasture') pastures++;
    else if (zone.accepts.length < RESOURCE_TYPES.length) filtered = true;
  }

  let tame = 0;
  for (const id in state.animals) if (state.animals[id].tame) tame++;

  const winterStore = colonists * WINTER_STORE_PER_COLONIST;
  const food = stock.food ?? 0;

  const goals: Goal[] = [
    {
      id: 'beds',
      params: { have: Math.min(beds, colonists), want: colonists },
      done: beds >= colonists,
      progress: ratio(beds, colonists),
    },
    {
      id: 'winter',
      params: { have: Math.min(food, winterStore), want: winterStore },
      done: food >= winterStore,
      progress: ratio(food, winterStore),
    },
    {
      id: 'farm',
      params: { plots },
      done: plots >= colonists,
      progress: ratio(plots, colonists),
    },
    {
      id: 'stone',
      params: {},
      done: (stock.stone ?? 0) > 0,
      progress: (stock.stone ?? 0) > 0 ? 1 : 0,
    },
    {
      id: 'wall',
      params: {},
      done: walls > 0,
      progress: walls > 0 ? 1 : 0,
    },
    {
      id: 'pasture',
      params: {},
      done: pastures > 0,
      progress: pastures > 0 ? 1 : 0,
    },
    {
      id: 'tame',
      params: { tame },
      done: tame > 0,
      progress: tame > 0 ? 1 : 0,
    },
    {
      id: 'filter',
      params: {},
      done: filtered,
      progress: filtered ? 1 : 0,
    },
    {
      // "the first research" (design-phase12-research.md 3.3): derived from
      // `unlocked`, so it drops off the moment a colony's first tech clears,
      // whatever built the desk or picked the tech in between.
      id: 'research',
      params: {},
      done: state.research.unlocked.length > 0,
      progress: state.research.unlocked.length > 0 ? 1 : 0,
    },
  ];

  return goals;
}

/** The next thing worth doing, or null once they are all done. */
export function nextGoal(state: GameState): Goal | null {
  return colonyGoals(state).find((goal) => !goal.done) ?? null;
}

/**
 * A line of context for the panel header: where in the year the colony is, and
 * how much of the list is behind it. `null` means the colony has died out; the
 * sentence for either case is the display layer's to compose.
 */
export function goalSummary(
  state: GameState,
): { done: number; total: number; season: Season } | null {
  const goals = colonyGoals(state);
  if (goals.length === 0) return null;
  const done = goals.filter((goal) => goal.done).length;
  return { done, total: goals.length, season: seasonOf(state.tick) };
}
