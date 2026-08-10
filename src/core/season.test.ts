// Seasons are derived from the tick, never stored, so the calendar and the
// simulation cannot disagree. What they change is growth: crops, grass and
// livestock all slow down or stop as the year turns.
import { describe, expect, it } from 'vitest';
import { CROP_GROWTH_PER_TICK, TICKS_PER_DAY } from './constants';
import { createSimContext } from './derived';
import {
  CROP_GROWTH_BY_SEASON,
  DAYS_PER_SEASON,
  SEASONS,
  TICKS_PER_SEASON,
  dayOfSeason,
  isSeasonBoundary,
  seasonOf,
  yearOf,
} from './season';
import { tickMany } from './simulation';
import { createHarness } from './testUtils';
import { generateWorld } from './worldgen';
import type { GameState } from './types';

function sowEverything(state: GameState): void {
  for (const id in state.buildings) {
    const building = state.buildings[id];
    if (building.type !== 'farmPlot' || building.isBlueprint) continue;
    state.buildings[id] = { ...building, sown: true, growth: 0 };
  }
}

function totalGrowth(state: GameState): number {
  let sum = 0;
  for (const id in state.buildings) {
    if (state.buildings[id].type === 'farmPlot') sum += state.buildings[id].growth;
  }
  return sum;
}

describe('the calendar', () => {
  it('runs through the four seasons and rolls over into a new year', () => {
    expect(seasonOf(0)).toBe('spring');
    expect(seasonOf(TICKS_PER_SEASON)).toBe('summer');
    expect(seasonOf(TICKS_PER_SEASON * 2)).toBe('autumn');
    expect(seasonOf(TICKS_PER_SEASON * 3)).toBe('winter');
    expect(seasonOf(TICKS_PER_SEASON * 4)).toBe('spring');
    expect(yearOf(0)).toBe(1);
    expect(yearOf(TICKS_PER_SEASON * SEASONS.length)).toBe(2);
  });

  it('numbers the days inside a season', () => {
    expect(dayOfSeason(0)).toBe(1);
    expect(dayOfSeason(TICKS_PER_DAY)).toBe(2);
    expect(dayOfSeason(TICKS_PER_SEASON - 1)).toBe(DAYS_PER_SEASON);
    expect(dayOfSeason(TICKS_PER_SEASON)).toBe(1);
  });

  it('marks the turn of the season exactly once', () => {
    expect(isSeasonBoundary(0)).toBe(false); // the first tick is not a change
    expect(isSeasonBoundary(TICKS_PER_SEASON)).toBe(true);
    expect(isSeasonBoundary(TICKS_PER_SEASON + 1)).toBe(false);
  });
});

describe('growth follows the season', () => {
  it('stops crops dead in winter and resumes them in spring', () => {
    // start the world at the beginning of winter rather than simulating a year
    const winter = generateWorld({ seed: 701 });
    winter.tick = TICKS_PER_SEASON * 3;
    sowEverything(winter);
    const ctx = createSimContext(winter);
    const before = totalGrowth(winter);
    const after = tickMany(winter, ctx, 500);
    expect(totalGrowth(after)).toBe(before); // nothing grew

    // roll into spring and the same plots start moving again
    after.tick = TICKS_PER_SEASON * 4;
    const spring = tickMany(after, createSimContext(after), 500);
    expect(totalGrowth(spring)).toBeGreaterThan(before);
  });

  it('grows crops faster in summer than in autumn', () => {
    const run = (startTick: number): number => {
      const state = generateWorld({ seed: 709 });
      state.tick = startTick;
      sowEverything(state);
      const ctx = createSimContext(state);
      return totalGrowth(tickMany(state, ctx, 400));
    };
    const summer = run(TICKS_PER_SEASON);
    const autumn = run(TICKS_PER_SEASON * 2);
    expect(summer).toBeGreaterThan(autumn);
    expect(CROP_GROWTH_BY_SEASON.summer * CROP_GROWTH_PER_TICK).toBeGreaterThan(0);
  });

  it('announces the new season in the log', () => {
    const harness = createHarness(719);
    harness.state.tick = TICKS_PER_SEASON - 2;
    harness.run(4);
    expect(
      harness.state.log.some(
        (entry) => entry.key === 'seasonArrived' && entry.params?.season === 'summer',
      ),
    ).toBe(true);
  });

  it('carries the colony through a winter it stocked up for', () => {
    // a full year, unattended: the stores have to peak before winter and the
    // colony has to come out the other side
    const harness = createHarness(727);
    const founders = Object.keys(harness.state.colonists);
    let autumnPeak = 0;
    let springLow = Infinity;
    const foodNow = (state: GameState): number =>
      Object.values(state.items)
        .filter((item) => item.type === 'food')
        .reduce((sum, item) => sum + item.quantity, 0);

    harness.run(TICKS_PER_SEASON * 4, (state) => {
      if (seasonOf(state.tick) === 'autumn') autumnPeak = Math.max(autumnPeak, foodNow(state));
      if (seasonOf(state.tick) === 'winter') springLow = Math.min(springLow, foodNow(state));
    });

    // wanderers may have joined; what must hold is that nobody starved
    for (const id of founders) expect(harness.state.colonists[id]).toBeDefined();
    expect(autumnPeak).toBeGreaterThan(200);
    // winter really does eat into the stores rather than being cosmetic
    expect(foodNow(harness.state)).toBeLessThan(autumnPeak);
  }, 60000);
});
