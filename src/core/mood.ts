// How a colonist feels about the life the player has given them.
//
// Until now a colonist was a machine with two gauges: fill them and the work
// got done, at exactly the rate their skills said. Nothing the player built
// mattered to the person using it - a colony of six sleeping on bare earth in
// a wolf winter worked as briskly as one with beds, floors and a full larder.
//
// Mood is the number that notices. It is *derived*, never stored: every thought
// below is read out of the state as it is now, so mood cannot drift out of step
// with the colony, needs no migration, and always explains itself - the panel
// shows the same list of thoughts this function added up.
//
// The one thing mood stores is its consequence: a colonist who has been
// miserable long enough downs tools and broods (`ColonistActivity` gains a
// variant), which is the only way a mood system can matter to a player who
// never opens a panel.
import { FOOD_PER_MEAL, RECREATION_THRESHOLD } from './constants';
import { LAMP_RADIUS, isPowered } from './mana';
import { friendNearby, griefOf, knowsAnyone } from './relationships';
import type { ManaNetworks } from './mana';
import { seasonOf } from './season';
import { traitMultiplier } from './traits';
import type { Colonist, GameState } from './types';

/** A colonist with nothing good or bad in their life sits here. */
export const MOOD_BASE = 50;
/** Below this, work suffers. */
export const MOOD_LOW = 40;
/** Below this, they stop working altogether. */
export const MOOD_BREAK = 20;
/** A break lasts this long, then they go back to it. */
export const MOOD_BREAK_TICKS = 400;
/** The most a foul mood can slow work: three fifths of a contented colonist. */
export const MOOD_WORST_WORK = 0.6;
/** The most a good one can speed it up. */
export const MOOD_BEST_WORK = 1.1;

export interface Thought {
  /** what the colonist would say, in their own terms */
  label: string;
  /** mood points, before traits */
  amount: number;
}

/**
 * The word changes exactly where the behaviour does: "content" covers the whole
 * band where mood costs nothing, and a colonist is only "unsettled" once it is
 * actually slowing their work. A label that shifted somewhere else would be
 * telling the player about a change that had not happened.
 */
const MOOD_LABELS: [number, string][] = [
  [80, 'happy'],
  [MOOD_LOW, 'content'],
  [MOOD_BREAK, 'unsettled'],
  [0, 'miserable'],
];

export function moodLabel(mood: number): string {
  for (const [floor, label] of MOOD_LABELS) if (mood >= floor) return label;
  return 'miserable';
}

/**
 * The colony-wide half of a mood: how many beds there are, how full the larder
 * is, and whether this colonist is standing on a floor. One pass over the
 * buildings answers all three questions that need them.
 *
 * Deliberately *not* cached. A cache would have to be keyed on the state
 * object, and both the tick and the tests mutate a state in place - so the
 * entry would go stale exactly where it was hardest to notice, in exchange for
 * an optimisation nothing has yet shown a need for. The tick budget in
 * longrun.test.ts is the measurement that would justify one.
 */
interface ColonyFacts {
  beds: number;
  mouths: number;
  foodDays: number;
  onFloor: boolean;
  /** standing inside the light of a lamp that is actually lit */
  inLight: boolean;
}

function factsFor(state: GameState, colonist: Colonist, networks?: ManaNetworks): ColonyFacts {
  const here = `${colonist.position.x},${colonist.position.y}`;
  let beds = 0;
  let onFloor = false;
  let inLight = false;
  for (const id in state.buildings) {
    const building = state.buildings[id];
    if (building.isBlueprint) continue;
    if (building.type === 'bed') beds++;
    else if (building.type === 'floor' || building.type === 'stoneFloor') {
      if (building.tileId === here) onFloor = true;
    } else if (building.type === 'manaLamp' && networks && isPowered(networks, id)) {
      const tile = state.tiles[building.tileId];
      if (
        tile &&
        Math.abs(tile.x - colonist.position.x) + Math.abs(tile.y - colonist.position.y) <=
          LAMP_RADIUS
      ) {
        inLight = true;
      }
    }
  }

  let food = 0;
  for (const id in state.items) {
    const item = state.items[id];
    if (item.type === 'food') food += item.quantity;
  }
  const mouths = Object.keys(state.colonists).length || 1;
  return {
    beds,
    mouths,
    // two meals a day is what the hunger rate works out at
    foodDays: food / (mouths * FOOD_PER_MEAL * 2),
    onFloor,
    inLight,
  };
}

/**
 * Everything on this colonist's mind, worst first. The panel prints this list
 * unchanged, so a player who disagrees with their mood can see exactly which
 * line to argue with - and, more usefully, which one to fix.
 */
export function thoughtsOf(
  state: GameState,
  colonist: Colonist,
  networks?: ManaNetworks,
): Thought[] {
  const thoughts: Thought[] = [];
  const facts = factsFor(state, colonist, networks);
  const { hunger, sleep } = colonist.needs;

  if (hunger >= 90) thoughts.push({ label: 'Starving', amount: -30 });
  else if (hunger >= 60) thoughts.push({ label: 'Hungry', amount: -10 });
  else if (hunger <= 25) thoughts.push({ label: 'Well fed', amount: 6 });

  if (sleep >= 90) thoughts.push({ label: 'Dead on their feet', amount: -18 });
  else if (sleep >= 65) thoughts.push({ label: 'Tired', amount: -8 });
  else if (sleep <= 25) thoughts.push({ label: 'Well rested', amount: 6 });

  if (colonist.health < 100) {
    // a scratch is a grumble, a mauling is all they can think about
    thoughts.push({
      label: colonist.health < 50 ? 'Badly hurt' : 'In pain',
      amount: -Math.round((100 - colonist.health) * 0.25),
    });
  }

  const recreation = colonist.needs.recreation ?? 0;
  if (recreation >= 90) thoughts.push({ label: 'Sick of the sight of this place', amount: -12 });
  else if (recreation >= RECREATION_THRESHOLD) thoughts.push({ label: 'Bored', amount: -6 });
  else if (recreation <= 20) thoughts.push({ label: 'Had some time off', amount: 5 });

  if (colonist.activity.kind === 'fleeing') {
    thoughts.push({ label: 'Being hunted', amount: -20 });
  }

  if (colonist.activity.kind === 'sleeping' && colonist.activity.bedId === null) {
    thoughts.push({ label: 'Sleeping on the ground', amount: -8 });
  } else if (facts.beds < facts.mouths) {
    thoughts.push({ label: 'No bed of their own', amount: -5 });
  }

  if (facts.foodDays < 1) thoughts.push({ label: 'The larder is empty', amount: -12 });
  else if (facts.foodDays >= 5) thoughts.push({ label: 'The larder is full', amount: 8 });

  if (facts.onFloor) {
    thoughts.push({ label: 'A proper floor underfoot', amount: 4 });
  }

  if (facts.inLight) {
    thoughts.push({ label: 'Mana light to work by', amount: 5 });
  }

  // company, and its absence. A colony of strangers is a worse place to live
  // than one where somebody is glad you are there.
  if (friendNearby(state, colonist)) {
    thoughts.push({ label: 'A friend close by', amount: 5 });
  } else if (facts.mouths > 1 && !knowsAnyone(state, colonist.id)) {
    thoughts.push({ label: 'Nobody here they are close to', amount: -4 });
  }

  // The heaviest grief only. Losing three people is worse than losing one, but
  // stacking every loss would put a colonist under the break line for a week
  // over something they cannot act on.
  const grief = griefOf(state, colonist.id)[0];
  if (grief) {
    thoughts.push({
      label: `Grieving for ${grief.name}`,
      amount: -Math.max(1, Math.round(18 * grief.weight)),
    });
  }

  if (seasonOf(state.tick) === 'winter') {
    thoughts.push({ label: 'Winter drags on', amount: -6 });
  }

  return thoughts.sort((a, b) => a.amount - b.amount);
}

/**
 * Mood, 0..100.
 *
 * Traits scale the good and the bad in opposite directions rather than the
 * total: multiplying a negative sum by 1.2 would make a cheerful colonist the
 * unhappiest person in the colony. A cheerful one gets more out of what is good
 * and less out of what is not, which is what the word means.
 */
export function moodOf(state: GameState, colonist: Colonist, networks?: ManaNetworks): number {
  const multiplier = traitMultiplier(colonist, 'mood');
  let total = MOOD_BASE;
  for (const thought of thoughtsOf(state, colonist, networks)) {
    total += thought.amount > 0 ? thought.amount * multiplier : thought.amount / multiplier;
  }
  return Math.max(0, Math.min(100, Math.round(total)));
}

/**
 * What mood does to the pace of work. Flat between MOOD_LOW and 70, so an
 * ordinary colony feels exactly as it did before mood existed; the curve only
 * bites when the player has let things slide or has genuinely looked after
 * someone.
 */
export function moodWorkFactor(mood: number): number {
  if (mood >= 70) return 1 + ((mood - 70) / 30) * (MOOD_BEST_WORK - 1);
  if (mood >= MOOD_LOW) return 1;
  return MOOD_WORST_WORK + (mood / MOOD_LOW) * (1 - MOOD_WORST_WORK);
}

/** The colony's average mood, which is what the player actually steers. */
export function colonyMood(state: GameState, networks?: ManaNetworks): number {
  const colonists = Object.values(state.colonists);
  if (colonists.length === 0) return MOOD_BASE;
  let total = 0;
  for (const colonist of colonists) total += moodOf(state, colonist, networks);
  return Math.round(total / colonists.length);
}
