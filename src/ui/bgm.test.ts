// Acceptance tests for the BGM decision layer (docs/design-phase15-audio.md
// 8章 段階 S-3, GitHub issue #22). Mirrors sfx.test.ts's style: pure
// functions, plain node, no AudioContext anywhere near this file.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../core/constants';
import { createHarness } from '../core/testUtils';
import { bgmGains, bgmMixAt } from './bgm';

/** The in-game tick nearest to a given hour of the 24h clock. */
function tickAtHour(hour: number): number {
  return Math.round(hour * TICKS_PER_HOUR);
}

describe('bgmMixAt', () => {
  it('is all-night through the small hours and late evening (daylight.ts KEYFRAMES 0-5, 20-24)', () => {
    for (const hour of [0, 2, 4.9, 20.5, 23]) {
      const mix = bgmMixAt(tickAtHour(hour));
      expect(mix.night).toBeCloseTo(1, 5);
      expect(mix.day).toBeCloseTo(0, 5);
    }
  });

  it('is all-day from 07:00 to 17:00 (daylight.ts KEYFRAMES)', () => {
    for (const hour of [7, 10, 12, 16, 17]) {
      const mix = bgmMixAt(tickAtHour(hour));
      expect(mix.day).toBeCloseTo(1, 5);
      expect(mix.night).toBeCloseTo(0, 5);
    }
  });

  it('always sums day + night to 1, at samples across the whole 24h cycle', () => {
    for (let hour = 0; hour < 24; hour += 0.5) {
      const mix = bgmMixAt(tickAtHour(hour));
      expect(mix.day + mix.night).toBeCloseTo(1, 6);
      expect(mix.day).toBeGreaterThanOrEqual(0);
      expect(mix.night).toBeGreaterThanOrEqual(0);
    }
    // and the clock wraps into a second day exactly like daylight.ts does
    const wrapped = bgmMixAt(TICKS_PER_DAY + tickAtHour(3));
    expect(wrapped.night).toBeCloseTo(1, 5);
  });

  it('changes continuously across the dawn transition (06:00-07:00) - no jump', () => {
    const a = bgmMixAt(tickAtHour(6));
    // a few minutes later, well inside the same dawn ramp (125 ticks/hour)
    const b = bgmMixAt(tickAtHour(6) + 5);
    const delta = Math.abs(a.night - b.night);
    expect(delta).toBeGreaterThan(0); // still moving, not a flat plateau
    expect(delta).toBeLessThan(0.05); // and moving smoothly, not an all-or-nothing flip
  });

  it('changes continuously across the dusk transition (17:00-20:00) - no jump', () => {
    const a = bgmMixAt(tickAtHour(18));
    const b = bgmMixAt(tickAtHour(18) + 5);
    const delta = Math.abs(a.night - b.night);
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThan(0.05);
  });
});

describe('bgmGains', () => {
  it('is silent on both tracks while paused, whatever muted/volume/tick say', () => {
    const harness = createHarness(15001);
    const dayPaused = { ...harness.state, speed: 0 as const, tick: tickAtHour(12) };
    expect(bgmGains(dayPaused, false, 1)).toEqual({ day: 0, night: 0 });
    const nightPausedMutedZero = { ...harness.state, speed: 0 as const, tick: tickAtHour(2) };
    expect(bgmGains(nightPausedMutedZero, true, 0)).toEqual({ day: 0, night: 0 });
  });

  it('is silent while muted, even unpaused', () => {
    const harness = createHarness(15002);
    const state = { ...harness.state, speed: 1 as const, tick: tickAtHour(12) };
    expect(bgmGains(state, true, 1)).toEqual({ day: 0, night: 0 });
  });

  it('is silent at zero volume, even unpaused and unmuted', () => {
    const harness = createHarness(15003);
    const state = { ...harness.state, speed: 1 as const, tick: tickAtHour(12) };
    expect(bgmGains(state, false, 0)).toEqual({ day: 0, night: 0 });
  });

  it('is full day gain at full volume, at a day tick', () => {
    const harness = createHarness(15004);
    const state = { ...harness.state, speed: 1 as const, tick: tickAtHour(12) };
    const gains = bgmGains(state, false, 1);
    expect(gains.day).toBeCloseTo(1, 5);
    expect(gains.night).toBeCloseTo(0, 5);
  });

  it('scales both weights linearly by a mid volume', () => {
    const harness = createHarness(15005);
    const state = { ...harness.state, speed: 1 as const, tick: tickAtHour(12) };
    const full = bgmGains(state, false, 1);
    const mid = bgmGains(state, false, 0.4);
    expect(mid.day).toBeCloseTo(full.day * 0.4, 5);
    expect(mid.night).toBeCloseTo(full.night * 0.4, 5);
  });
});
