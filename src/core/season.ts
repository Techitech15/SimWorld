// Seasons.
//
// The whole season is derived from `state.tick` - there is no new saved field
// and therefore no migration. That is deliberate: a season is a pure function of
// the calendar, and storing it would only create a second source of truth that
// could drift from the clock.
//
// What it changes is the two systems that grow things. Crops stop entirely in
// winter and grass barely regrows, which turns the food chain from a background
// detail into the thing the year is planned around: the colony has to put a
// winter's worth of food away, or hunt through it.
import { TICKS_PER_DAY } from './constants';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const DAYS_PER_SEASON = 5;
export const TICKS_PER_SEASON = TICKS_PER_DAY * DAYS_PER_SEASON;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS.length;

/** Multiplier on farm plot growth. Winter is a hard stop, not a slowdown. */
export const CROP_GROWTH_BY_SEASON: Record<Season, number> = {
  spring: 1,
  summer: 1.25,
  autumn: 0.7,
  winter: 0,
};

/**
 * Frostbloom (11章 フェーズ5) reads the crop table upside down. It is written
 * out rather than computed from `CROP_GROWTH_BY_SEASON` because the inverse of
 * "1.25 in summer" is not a number anybody wants to defend, and the whole point
 * of the plant is the one value that is non-zero.
 */
export const FROSTBLOOM_GROWTH_BY_SEASON: Record<Season, number> = {
  spring: 0,
  summer: 0,
  autumn: 0,
  winter: 1,
};

/** Multiplier on how fast grazed grass comes back. */
export const FORAGE_REGROW_BY_SEASON: Record<Season, number> = {
  spring: 1.2,
  summer: 1,
  autumn: 0.6,
  winter: 0.15, // enough that a small herd survives, not enough for a large one
};

/** Livestock do not breed in the cold. */
export const BREEDING_BY_SEASON: Record<Season, number> = {
  spring: 1.5,
  summer: 1,
  autumn: 0.5,
  winter: 0,
};

export function seasonOf(tick: number): Season {
  const index = Math.floor(tick / TICKS_PER_SEASON) % SEASONS.length;
  return SEASONS[index];
}

/** 1-based day within the current season, for the clock in the top bar. */
export function dayOfSeason(tick: number): number {
  return Math.floor((tick % TICKS_PER_SEASON) / TICKS_PER_DAY) + 1;
}

export function yearOf(tick: number): number {
  return Math.floor(tick / (TICKS_PER_SEASON * SEASONS.length)) + 1;
}

/** True on the exact tick a new season starts (used for the log entry). */
export function isSeasonBoundary(tick: number): boolean {
  return tick > 0 && tick % TICKS_PER_SEASON === 0;
}
