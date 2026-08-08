// A raw tick number tells a player nothing; the clock in the top bar is what
// they are watching, so the log stamps match it.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../core/constants';
import { stampOf } from './EventLog';

describe('log timestamps', () => {
  it('reads as the day and time the event happened', () => {
    expect(stampOf(0)).toBe('D1 00:00');
    expect(stampOf(TICKS_PER_HOUR * 6)).toBe('D1 06:00');
    expect(stampOf(TICKS_PER_DAY)).toBe('D2 00:00');
    expect(stampOf(TICKS_PER_DAY * 3 + TICKS_PER_HOUR * 13)).toBe('D4 13:00');
  });

  it('pads the hours and minutes so the column lines up', () => {
    for (const tick of [0, 137, 4001, 99999]) {
      expect(stampOf(tick)).toMatch(/^D\d+ \d{2}:\d{2}$/);
    }
  });
});
