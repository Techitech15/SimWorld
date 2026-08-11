// The clock's pull on sleep (docs/design-phase7-time.md 3.4).
//
// The day/night *look* lives in src/render/daylight.ts; this is the one place
// the phase deliberately reaches into the simulation. No new rule - the
// existing SLEEP_THRESHOLD is multiplied by a time-of-day factor, the same
// shape the traits and mood take. At a multiplier of 1 the behaviour is
// exactly what it was before the phase.
//
// Sleep is never forced: a colonist below the (lowered) night threshold keeps
// working, and one past the (raised) day threshold still goes to bed - the
// night shift stays possible, it just stops being the default.
import { TICKS_PER_DAY, TICKS_PER_HOUR } from './constants';

/** Night makes a bed easier to justify... */
export const SLEEP_NIGHT_FACTOR = 0.7;
/** ...and broad daylight makes it harder. */
export const SLEEP_DAY_FACTOR = 1.3;

/** The in-game hour as a fraction, 0..24. */
export function hourOf(tick: number): number {
  return (tick % TICKS_PER_DAY) / TICKS_PER_HOUR;
}

/**
 * What SLEEP_THRESHOLD is multiplied by at this tick. Night (22:00-05:00)
 * sits at SLEEP_NIGHT_FACTOR, day (07:00-20:00) at SLEEP_DAY_FACTOR, with
 * linear ramps between - no boundary the threshold jumps at.
 *
 * The evening ramp deliberately runs *later* than the screen's dusk
 * (17:00-19:00): measured with the ramps mirroring the overlay, the gauge a
 * colonist carries by 17:00 crossed the falling threshold at ~17:40 and the
 * hold-to-dawn then kept them in bed for 11+ hours - a third of the colony's
 * labour gone, and the stocked-for-winter season test starved. With the ramp
 * at 20:00-22:00 the same crossing lands around 20:40 and the night's sleep
 * is a bed-shaped eight hours (実装メモ).
 */
export function sleepThresholdMultiplier(tick: number): number {
  const hour = hourOf(tick);
  if (hour < 5 || hour >= 22) return SLEEP_NIGHT_FACTOR;
  if (hour >= 7 && hour < 20) return SLEEP_DAY_FACTOR;
  if (hour < 7) {
    // 05:00 -> 07:00: night gives way to day
    const t = (hour - 5) / 2;
    return SLEEP_NIGHT_FACTOR + (SLEEP_DAY_FACTOR - SLEEP_NIGHT_FACTOR) * t;
  }
  // 20:00 -> 22:00: day gives way to night
  const t = (hour - 20) / 2;
  return SLEEP_DAY_FACTOR + (SLEEP_NIGHT_FACTOR - SLEEP_DAY_FACTOR) * t;
}

/** Is this tick inside the hours the overlay calls night (dusk through dawn)? */
export function isNight(tick: number): boolean {
  const hour = hourOf(tick);
  return hour >= 19 || hour < 5;
}

/**
 * Hunger past this wakes a sleeper even at night. Ordinary evening hunger must
 * not break the hold-to-dawn (a bar in the 60s at bedtime plus a night's decay
 * stays below this), while anyone genuinely running empty still gets up and
 * eats long before starvation damage starts at 100.
 */
export const NIGHT_WAKE_HUNGER = 85;
