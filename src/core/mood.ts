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
import {
  FOOD_PER_MEAL,
  RECREATION_THRESHOLD,
  STATUE_RADIUS,
  STATUE_THOUGHT_BONUS,
  TABLE_RADIUS,
  TABLE_THOUGHT_BONUS,
  TABLE_WITH_STOOL_THOUGHT_BONUS,
} from './constants';
import { biomeOf } from './biome';
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

/**
 * What is on a colonist's mind, as a key. The sentence is derived at display
 * time in the player's language (11章 フェーズ9); the key is also what the
 * break logic switches on, so a rewording can never change behaviour.
 */
export type ThoughtKey =
  | 'starving'
  | 'hungry'
  | 'wellFed'
  | 'exhausted'
  | 'tired'
  | 'wellRested'
  | 'badlyHurt'
  | 'inPain'
  | 'sickOfPlace'
  | 'bored'
  | 'hadTimeOff'
  | 'beingHunted'
  | 'sleepingOnGround'
  | 'noBed'
  | 'larderEmpty'
  | 'larderFull'
  | 'properFloor'
  | 'manaLight'
  | 'ateAtTable'
  | 'fineStatue'
  | 'friendNearby'
  | 'knowsNobody'
  | 'grieving'
  | 'winterDrags';

export interface Thought {
  /** what the colonist would say, rendered per language by the UI dictionary */
  key: ThoughtKey;
  /** mood points, before traits */
  amount: number;
  /** `grieving` only: the name of the dead (proper nouns are never translated) */
  name?: string;
}

/**
 * The word changes exactly where the behaviour does: "content" covers the whole
 * band where mood costs nothing, and a colonist is only "unsettled" once it is
 * actually slowing their work. A label that shifted somewhere else would be
 * telling the player about a change that had not happened.
 */
export type MoodWord = 'happy' | 'content' | 'unsettled' | 'miserable';

const MOOD_LABELS: [number, MoodWord][] = [
  [80, 'happy'],
  [MOOD_LOW, 'content'],
  [MOOD_BREAK, 'unsettled'],
  [0, 'miserable'],
];

export function moodLabel(mood: number): MoodWord {
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
  /** a finished statue within STATUE_RADIUS of where they stand */
  nearStatue: boolean;
  /** eating within TABLE_RADIUS of a finished table: the thought's strength, 0 = none */
  tableBonus: number;
}

/** Furniture radii are squares (see constants.ts): the board-game distance. */
function within(a: { x: number; y: number }, b: { x: number; y: number }, radius: number): boolean {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= radius;
}

function factsFor(state: GameState, colonist: Colonist, networks?: ManaNetworks): ColonyFacts {
  const here = `${colonist.position.x},${colonist.position.y}`;
  let beds = 0;
  let onFloor = false;
  let inLight = false;
  let nearStatue = false;
  // The furniture thoughts ride this same single pass over the buildings (the
  // phase-10 performance rule: no second radius loop). Tables and stools are
  // only collected while this colonist is actually eating - for everyone else
  // the branch costs a type check and nothing more.
  const eating = colonist.activity.kind === 'eating';
  const tablesInReach: { x: number; y: number }[] = [];
  const stools: { x: number; y: number }[] = [];
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
    } else if (building.type === 'statue') {
      const tile = state.tiles[building.tileId];
      if (tile && within(tile, colonist.position, STATUE_RADIUS)) nearStatue = true;
    } else if (eating && building.type === 'table') {
      const tile = state.tiles[building.tileId];
      if (tile && within(tile, colonist.position, TABLE_RADIUS)) tablesInReach.push(tile);
    } else if (eating && building.type === 'stool') {
      const tile = state.tiles[building.tileId];
      if (tile) stools.push(tile);
    }
  }

  // Eating near a table is worth something; a stool drawn up to that table is
  // worth a little more. Positive only - no table is simply no thought
  // (design-phase10-ores.md 4.3).
  let tableBonus = 0;
  if (tablesInReach.length > 0) {
    const seated = tablesInReach.some((table) => stools.some((stool) => within(table, stool, 1)));
    tableBonus = seated ? TABLE_WITH_STOOL_THOUGHT_BONUS : TABLE_THOUGHT_BONUS;
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
    nearStatue,
    tableBonus,
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

  if (hunger >= 90) thoughts.push({ key: 'starving', amount: -30 });
  else if (hunger >= 60) thoughts.push({ key: 'hungry', amount: -10 });
  else if (hunger <= 25) thoughts.push({ key: 'wellFed', amount: 6 });

  if (sleep >= 90) thoughts.push({ key: 'exhausted', amount: -18 });
  else if (sleep >= 65) thoughts.push({ key: 'tired', amount: -8 });
  else if (sleep <= 25) thoughts.push({ key: 'wellRested', amount: 6 });

  if (colonist.health < 100) {
    // a scratch is a grumble, a mauling is all they can think about
    thoughts.push({
      key: colonist.health < 50 ? 'badlyHurt' : 'inPain',
      amount: -Math.round((100 - colonist.health) * 0.25),
    });
  }

  const recreation = colonist.needs.recreation ?? 0;
  if (recreation >= 90) thoughts.push({ key: 'sickOfPlace', amount: -12 });
  else if (recreation >= RECREATION_THRESHOLD) thoughts.push({ key: 'bored', amount: -6 });
  else if (recreation <= 20) thoughts.push({ key: 'hadTimeOff', amount: 5 });

  if (colonist.activity.kind === 'fleeing') {
    thoughts.push({ key: 'beingHunted', amount: -20 });
  }

  if (colonist.activity.kind === 'sleeping' && colonist.activity.bedId === null) {
    thoughts.push({ key: 'sleepingOnGround', amount: -8 });
  } else if (facts.beds < facts.mouths) {
    thoughts.push({ key: 'noBed', amount: -5 });
  }

  if (facts.foodDays < 1) thoughts.push({ key: 'larderEmpty', amount: -12 });
  else if (facts.foodDays >= 5) thoughts.push({ key: 'larderFull', amount: 8 });

  if (facts.onFloor) {
    thoughts.push({ key: 'properFloor', amount: 4 });
  }

  if (facts.inLight) {
    // manaheath's ground is soaked in mana, so its lamps carry a stronger
    // thought (11章 フェーズ11 段階A, biome.ts: base 5, manaheath 6). Every
    // other biome keeps the original value.
    thoughts.push({ key: 'manaLight', amount: biomeOf(state).lampMoodBonus });
  }

  // Furniture (フェーズ10): a meal taken at a table, and a statue worth
  // looking at. Both derived like everything else, so tearing the furniture
  // down makes the thought vanish on the next read with nothing to clean up.
  if (facts.tableBonus > 0) {
    thoughts.push({ key: 'ateAtTable', amount: facts.tableBonus });
  }
  if (facts.nearStatue) {
    thoughts.push({ key: 'fineStatue', amount: STATUE_THOUGHT_BONUS });
  }

  // company, and its absence. A colony of strangers is a worse place to live
  // than one where somebody is glad you are there.
  if (friendNearby(state, colonist)) {
    thoughts.push({ key: 'friendNearby', amount: 5 });
  } else if (facts.mouths > 1 && !knowsAnyone(state, colonist.id)) {
    thoughts.push({ key: 'knowsNobody', amount: -4 });
  }

  // The heaviest grief only. Losing three people is worse than losing one, but
  // stacking every loss would put a colonist under the break line for a week
  // over something they cannot act on.
  const grief = griefOf(state, colonist.id)[0];
  if (grief) {
    thoughts.push({
      key: 'grieving',
      name: grief.name,
      amount: -Math.max(1, Math.round(18 * grief.weight)),
    });
  }

  if (seasonOf(state.tick) === 'winter') {
    thoughts.push({ key: 'winterDrags', amount: -6 });
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
