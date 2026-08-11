// The clock's pull on sleep (docs/design-phase7-time.md 3.4, acceptance N-3).
//
// Sleep must *lean* to the night without being chained to it: the threshold
// multiplier is continuous over the day, most sleep starts after dusk, and a
// colonist at their limit still lies down at noon.
import { describe, expect, it } from 'vitest';
import { SLEEP_THRESHOLD, TICKS_PER_DAY, TICKS_PER_HOUR } from './constants';
import {
  NIGHT_WAKE_HUNGER,
  SLEEP_DAY_FACTOR,
  SLEEP_NIGHT_FACTOR,
  isNight,
  sleepThresholdMultiplier,
} from './daynight';
import { createHarness } from './testUtils';

describe('the sleep threshold over the clock', () => {
  it('is low at midnight, high at noon, and exactly the published factors', () => {
    expect(sleepThresholdMultiplier(0)).toBe(SLEEP_NIGHT_FACTOR); // 00:00
    expect(sleepThresholdMultiplier(12 * TICKS_PER_HOUR)).toBe(SLEEP_DAY_FACTOR); // 12:00
    expect(sleepThresholdMultiplier(22 * TICKS_PER_HOUR)).toBe(SLEEP_NIGHT_FACTOR); // 22:00
  });

  it('never jumps: one minute never moves the threshold by more than a step', () => {
    const minute = TICKS_PER_HOUR / 60;
    let previous = sleepThresholdMultiplier(0);
    for (let tick = minute; tick <= TICKS_PER_DAY; tick += minute) {
      const next = sleepThresholdMultiplier(Math.round(tick));
      expect(Math.abs(next - previous)).toBeLessThan(0.02);
      previous = next;
    }
  });

  it('still lets a colonist at their limit sleep at noon', () => {
    // the raised day threshold stays below the gauge's ceiling: sleep at 100
    // clears SLEEP_THRESHOLD x SLEEP_DAY_FACTOR, so exhaustion wins at any hour
    expect(SLEEP_THRESHOLD * SLEEP_DAY_FACTOR).toBeLessThan(100);
  });
});

describe('where sleep actually falls', () => {
  it('leans to the night once the colony settles into the clock', () => {
    // Measured on the sleep itself, not just its start: the acceptance line is
    // "most sleep lies in the night", and a 17:40 bedtime that runs to dawn is
    // night sleep whatever the clock said when the eyes closed. Night hours
    // (19:00-05:00) are 41.7% of the day, so an unbiased sleeper scores ~0.42;
    // measured 0.648 over five settled days (seed 15101, 3 colonists, first 3
    // days discarded as transient) - asserted with margin below.
    const harness = createHarness(15101);
    let sleepTicks = 0;
    let nightSleepTicks = 0;
    harness.run(TICKS_PER_DAY * 8, (state) => {
      if (state.tick < TICKS_PER_DAY * 3) return;
      for (const id in state.colonists) {
        if (state.colonists[id].activity.kind !== 'sleeping') continue;
        sleepTicks++;
        if (isNight(state.tick)) nightSleepTicks++;
      }
    });
    expect(sleepTicks).toBeGreaterThan(TICKS_PER_DAY); // they do sleep
    expect(nightSleepTicks / sleepTicks).toBeGreaterThan(0.55);
  });

  it('still wakes a genuinely hungry sleeper before dawn', () => {
    // the hold-to-dawn must lose to an empty stomach: hunger past the night
    // bar ends the night early, well before starvation damage starts at 100
    expect(NIGHT_WAKE_HUNGER).toBeLessThan(100);
    expect(NIGHT_WAKE_HUNGER).toBeGreaterThan(SLEEP_THRESHOLD);
  });
});
