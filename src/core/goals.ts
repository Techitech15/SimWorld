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
import type { GameState } from './types';

export interface Goal {
  id: string;
  label: string;
  /** what to do about it, named after the tool that does it */
  hint: string;
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
      label: `A bed for everyone (${Math.min(beds, colonists)}/${colonists})`,
      hint: 'Build > Bed. Sleeping on the ground recovers rest at little more than half the rate.',
      done: beds >= colonists,
      progress: ratio(beds, colonists),
    },
    {
      id: 'winter',
      label: `Stores for the winter (${Math.min(food, winterStore)}/${winterStore} food)`,
      hint: 'Nothing grows in winter, so the buffer has to be earned in the other three seasons.',
      done: food >= winterStore,
      progress: ratio(food, winterStore),
    },
    {
      id: 'farm',
      label: `Ground under the plough (${plots} plots)`,
      hint: 'Build > Farm. One plot per colonist is a working colony; fewer is a shrinking one.',
      done: plots >= colonists,
      progress: ratio(plots, colonists),
    },
    {
      id: 'stone',
      label: 'Quarry some stone',
      hint: 'Orders > Mine a rock face. Stone walls take longer to build and twice as much to break.',
      done: (stock.stone ?? 0) > 0,
      progress: (stock.stone ?? 0) > 0 ? 1 : 0,
    },
    {
      id: 'wall',
      label: 'Something worth fencing',
      hint: 'Build > Wall, with a Door in it. Animals cannot work a handle, so walls and a door make a pen.',
      done: walls > 0,
      progress: walls > 0 ? 1 : 0,
    },
    {
      id: 'pasture',
      label: 'A pasture to keep them in',
      hint: 'Build > Pasture on grass. Its area is what caps the herd, and the grass is what feeds them.',
      done: pastures > 0,
      progress: pastures > 0 ? 1 : 0,
    },
    {
      id: 'tame',
      label: `Livestock of your own (${tame})`,
      hint: 'Animals > Tame, on a deer, boar, rabbit or chicken. Wolves cannot be tamed.',
      done: tame > 0,
      progress: tame > 0 ? 1 : 0,
    },
    {
      id: 'filter',
      label: 'Tell a store what it takes',
      hint: 'Click a storage tile and use the Accepts chips - a wood yard by the wall, a larder by the beds.',
      done: filtered,
      progress: filtered ? 1 : 0,
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
 * how much of the list is behind it.
 */
export function goalSummary(state: GameState): string {
  const goals = colonyGoals(state);
  if (goals.length === 0) return 'The colony has died out.';
  const done = goals.filter((goal) => goal.done).length;
  return `${done}/${goals.length} — ${seasonOf(state.tick)}`;
}
