// Colonist traits.
//
// Skills say what a colonist has done; a trait says what they are like, and it
// is fixed for life. The two are deliberately different levers: a skill is
// earned and applies to one column of the work table, a trait is dealt at birth
// and bends a system the work table has no opinion about - how fast someone
// gets hungry, how quickly they pick things up, how well they mend.
//
// Every trait is a multiplier on an existing number. Nothing here adds a new
// mechanic, which is what keeps a dozen combinations from becoming a dozen
// special cases: a colonist is a product of multipliers, and 1 is the colonist
// the game had before traits existed.
import { mulberry32 } from './rng';
import type { Colonist, TraitName } from './types';

/** The numbers a trait may bend. Everything defaults to 1. */
export interface TraitEffects {
  /** experience granted per tick of work */
  experience?: number;
  /** work done per tick, on top of skill */
  work?: number;
  /** how fast the hunger bar fills */
  hunger?: number;
  /** how fast the sleep bar fills */
  sleep?: number;
  /** how fast sleep is recovered while asleep */
  rest?: number;
  /** health regained per tick of rest */
  healing?: number;
  /**
   * How much a good thing lifts them and a bad thing weighs on them. Above 1
   * both directions ease off (src/core/mood.ts explains why one multiplier can
   * do both), below 1 both bite harder.
   */
  mood?: number;
  /** how quickly they warm to the people they work beside */
  social?: number;
}

export type TraitEffect = keyof TraitEffects;

export interface Trait {
  /** traits in the same family are mutually exclusive: nobody is both */
  family: string;
  effects: TraitEffects;
}

// What a trait is called, and what it does in the player's terms, lives in the
// UI dictionary (src/ui/strings.ts) with every other label - phase 9 absorbed
// the label tables so each string exists once per language.

export const TRAITS: Record<TraitName, Trait> = {
  quickLearner: {
    family: 'learning',
    effects: { experience: 1.6 },
  },
  slowLearner: {
    family: 'learning',
    effects: { experience: 0.5 },
  },
  industrious: {
    family: 'pace',
    effects: { work: 1.15 },
  },
  unhurried: {
    family: 'pace',
    effects: { work: 0.85 },
  },
  bigEater: {
    family: 'appetite',
    effects: { hunger: 1.3 },
  },
  frugal: {
    family: 'appetite',
    effects: { hunger: 0.75 },
  },
  heavySleeper: {
    family: 'sleep',
    effects: { rest: 1.35 },
  },
  restless: {
    family: 'sleep',
    effects: { sleep: 1.25, rest: 0.85 },
  },
  tough: {
    family: 'constitution',
    effects: { healing: 1.9 },
  },
  frail: {
    family: 'constitution',
    effects: { healing: 0.5 },
  },
  cheerful: {
    family: 'temperament',
    effects: { mood: 1.25 },
  },
  gloomy: {
    family: 'temperament',
    effects: { mood: 0.8 },
  },
  sociable: {
    family: 'company',
    effects: { social: 1.8 },
  },
  private: {
    family: 'company',
    effects: { social: 0.4 },
  },
};

export const TRAIT_NAMES: TraitName[] = Object.keys(TRAITS) as TraitName[];

/**
 * The combined multiplier a colonist applies to one number. Traits multiply, so
 * a colonist with none of them is exactly 1 - the pre-trait colonist - and the
 * call sites need no special case for "has no traits".
 */
export function traitMultiplier(
  colonist: Pick<Colonist, 'traits'> | undefined,
  effect: TraitEffect,
): number {
  let total = 1;
  for (const name of colonist?.traits ?? []) {
    const value = TRAITS[name]?.effects[effect];
    if (value !== undefined) total *= value;
  }
  return total;
}

/**
 * Deal a colonist their traits: usually two, never two from one family, so
 * nobody is both a quick and a slow learner. A quarter of people get one and a
 * few get none, because a colony where everybody is remarkable is a colony
 * where nobody is.
 */
export function rollTraits(seed: number): TraitName[] {
  const rnd = mulberry32(Math.abs(Math.floor(seed)) + 7717);
  const roll = rnd();
  const wanted = roll < 0.1 ? 0 : roll < 0.35 ? 1 : 2;
  const traits: TraitName[] = [];
  const families = new Set<string>();
  const pool = [...TRAIT_NAMES];
  while (traits.length < wanted && pool.length > 0) {
    const [pick] = pool.splice(Math.floor(rnd() * pool.length), 1);
    if (families.has(TRAITS[pick].family)) continue;
    families.add(TRAITS[pick].family);
    traits.push(pick);
  }
  return traits;
}
