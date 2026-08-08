// Who knows whom (design document 11章 フェーズ3).
//
// Until now a colony of six was six independent survival machines. Losing one
// cost the player a pair of hands and nothing else, and a colonist who had
// worked beside the same person for a year felt exactly the same about them as
// about the stranger who walked in yesterday.
//
// A bond is one number per pair, grown by being near each other. It buys two
// things the game did not have: company, and grief. Both land in the mood
// system rather than in a mechanic of their own - which is the same rule the
// traits followed, and the reason a dozen of these do not become a dozen
// special cases.
import { traitMultiplier } from './traits';
import type { Colonist, ColonistId, GameState } from './types';

/** Affinity runs 0 (strangers) to this. */
export const AFFINITY_MAX = 100;
/** At or above this, they are friends: the mood system starts to care. */
export const FRIEND_AT = 40;
/**
 * At or above this they have at least started to know each other.
 *
 * Separate from FRIEND_AT because "nobody here they are close to" should mean
 * genuinely alone among strangers, not "has not reached forty yet". With the
 * measured growth rate, forty takes most of a year, and reading that as
 * loneliness would have put a flat penalty on every colony for its whole first
 * year - including one whose three founders are together every day.
 */
export const ACQUAINTED_AT = 12;
/** How often bonds are looked at. Not every tick - nothing here changes fast. */
export const SOCIAL_INTERVAL_TICKS = 50;
/** How close counts as together. */
export const SOCIAL_RANGE = 4;
/**
 * Affinity gained per interval spent near each other, and lost per interval
 * apart.
 *
 * Both numbers come from a measurement rather than a guess. At the first rate
 * tried (a whole point per interval, no drift) a year of play ended with every
 * pair in the colony pinned at the cap by about day ten - measured across
 * twenty days: day 1 spread 16-31, day 5 already 47-100, day 18 onwards every
 * one of fifteen pairs at 100. A number that saturates is a number that has
 * stopped saying anything, and it took grief down with it: every death hit
 * everybody equally hard.
 *
 * Slower growth stretches that arc across the year, and drift makes the bond
 * describe who a colonist actually works beside now rather than who they once
 * stood near. A pair kept together most of the time still gets there; a pair
 * the player sends to opposite ends of the map does not.
 */
export const AFFINITY_PER_INTERVAL = 0.15;
export const AFFINITY_DRIFT_PER_INTERVAL = 0.05;
/** How long a death weighs on the people who knew them. */
export const GRIEF_TICKS = 3000 * 3;
/** The most recent deaths worth remembering. */
export const DEATHS_REMEMBERED = 10;

/**
 * The key for a pair, order-independent. Two colonists have one bond, not two:
 * storing it twice is storing a chance for the halves to disagree.
 */
export function pairKey(a: ColonistId, b: ColonistId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function affinityOf(state: GameState, a: ColonistId, b: ColonistId): number {
  if (a === b) return 0;
  return state.relationships?.[pairKey(a, b)] ?? 0;
}

/** Has this colonist started to know anybody at all? */
export function knowsAnyone(state: GameState, colonistId: ColonistId): boolean {
  const closest = closestTo(state, colonistId);
  return !!closest && closest.affinity >= ACQUAINTED_AT;
}

/** Everyone this colonist counts as a friend, closest first. */
export function friendsOf(state: GameState, colonistId: ColonistId): ColonistId[] {
  const friends: { id: ColonistId; affinity: number }[] = [];
  for (const other in state.colonists) {
    if (other === colonistId) continue;
    const affinity = affinityOf(state, colonistId, other);
    if (affinity >= FRIEND_AT) friends.push({ id: other, affinity });
  }
  return friends.sort((a, b) => b.affinity - a.affinity).map((f) => f.id);
}

/** The person they are closest to, friend or not, for the colonist sheet. */
export function closestTo(
  state: GameState,
  colonistId: ColonistId,
): { id: ColonistId; affinity: number } | null {
  let best: { id: ColonistId; affinity: number } | null = null;
  for (const other in state.colonists) {
    if (other === colonistId) continue;
    const affinity = affinityOf(state, colonistId, other);
    if (affinity > 0 && (!best || affinity > best.affinity)) best = { id: other, affinity };
  }
  return best;
}

function awake(colonist: Colonist): boolean {
  return colonist.activity.kind !== 'sleeping';
}

/**
 * One pass of "who spent this stretch near whom".
 *
 * Runs on an interval rather than every tick because a bond is a thing that
 * grows over days, and because this is O(colonists squared) - fine at eight
 * people every fiftieth tick, wasteful sixty times a second.
 */
export function runRelationships(state: GameState): void {
  if (state.tick % SOCIAL_INTERVAL_TICKS !== 0) return;
  const ids = Object.keys(state.colonists);
  if (ids.length < 2) return;

  let relationships = state.relationships;
  let copied = false;
  const write = (key: string, value: number) => {
    if (!copied) {
      relationships = { ...relationships };
      copied = true;
    }
    relationships[key] = value;
  };

  for (let i = 0; i < ids.length; i++) {
    const a = state.colonists[ids[i]];
    for (let j = i + 1; j < ids.length; j++) {
      const b = state.colonists[ids[j]];
      const key = pairKey(a.id, b.id);
      const before = relationships[key] ?? 0;

      const distance =
        Math.abs(a.position.x - b.position.x) + Math.abs(a.position.y - b.position.y);
      const together = awake(a) && awake(b) && distance <= SOCIAL_RANGE;

      if (together) {
        if (before >= AFFINITY_MAX) continue;
        // a sociable colonist warms to people faster; the pair moves at the
        // average of what the two of them bring to it
        const rate = (traitMultiplier(a, 'social') + traitMultiplier(b, 'social')) / 2;
        write(key, Math.min(AFFINITY_MAX, before + AFFINITY_PER_INTERVAL * rate));
      } else if (before > 0) {
        // Drift, not forgetting: it falls slowly and only while they are apart.
        // Being asleep in the same room does not count as company, but it does
        // not count against them either - the drift is what happens when the
        // colony's work pulls two people to opposite ends of the map.
        const asleep = !awake(a) || !awake(b);
        if (asleep) continue;
        write(key, Math.max(0, before - AFFINITY_DRIFT_PER_INTERVAL));
      }
    }
  }
  if (copied) state.relationships = relationships;
}

/**
 * Remember someone who died, so the people who knew them can grieve.
 *
 * The bond itself is left in place. It costs nothing, it is what the grief is
 * measured against, and a colony that forgets a name the instant the person
 * stops needing food is not the colony this is trying to be.
 */
export function recordDeath(state: GameState, colonist: Colonist): void {
  const deaths = [
    ...(state.deaths ?? []),
    { colonistId: colonist.id, name: colonist.name, tick: state.tick },
  ];
  state.deaths = deaths.slice(-DEATHS_REMEMBERED);
}

export interface Grief {
  name: string;
  /** 0..1, how heavily it still weighs */
  weight: number;
}

/**
 * Who this colonist is still grieving for, heaviest first. Weight falls to
 * nothing over three days: the game should not carry a mood penalty for ever,
 * and a loss the player cannot do anything about is not a puzzle.
 */
export function griefOf(state: GameState, colonistId: ColonistId): Grief[] {
  const griefs: Grief[] = [];
  for (const death of state.deaths ?? []) {
    const elapsed = state.tick - death.tick;
    if (elapsed < 0 || elapsed >= GRIEF_TICKS) continue;
    const affinity = affinityOf(state, colonistId, death.colonistId);
    if (affinity <= 0) continue;
    griefs.push({
      name: death.name,
      weight: (affinity / AFFINITY_MAX) * (1 - elapsed / GRIEF_TICKS),
    });
  }
  return griefs.sort((a, b) => b.weight - a.weight);
}

/** Is there a friend within sight of this colonist right now? */
export function friendNearby(state: GameState, colonist: Colonist): boolean {
  for (const other in state.colonists) {
    if (other === colonist.id) continue;
    if (affinityOf(state, colonist.id, other) < FRIEND_AT) continue;
    const them = state.colonists[other];
    const distance =
      Math.abs(them.position.x - colonist.position.x) +
      Math.abs(them.position.y - colonist.position.y);
    if (distance <= SOCIAL_RANGE + 2) return true;
  }
  return false;
}
