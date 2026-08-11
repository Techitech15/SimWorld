// The tick driver (section 5).
//
// tick length is fixed at 200ms; the speed multiplier changes how many ticks are
// processed per real 200ms, never the tick length itself, so cooldowns and
// growth rates stay comparable between 1x and 3x.
import { collectAlerts } from '../core/alerts';
import { TICK_MS, TICKS_PER_DAY } from '../core/constants';
import { useGameStore } from '../store/gameStore';

/** Never simulate more than this many ticks in one frame after a stall. */
const MAX_CATCHUP_TICKS = 30;

/** A stalled tab (backgrounded, debugger paused) reports one huge `dt` on
 *  return; capping it keeps that single frame from itself becoming a catch-up
 *  storm on top of the accumulator's own cap. */
const MAX_FRAME_MS = 1000;

/**
 * How many ticks a frame should advance, and what accumulator carries into the
 * next one - pulled out of the RAF callback so it can be tested without a
 * fake clock or a store. `dt` is real elapsed milliseconds since the last
 * frame (already capped by the caller); `speed` is the game-speed multiplier
 * (0 means paused, handled by the caller, not here).
 *
 * `ticks` advances by `speed` per tick boundary crossed rather than by 1, so
 * "3x" means three times the ticks in the same wall-clock time rather than
 * ticks that each cover three times the game time - the distinction that
 * keeps cooldowns and growth rates comparable across speeds (see the header
 * comment above).
 *
 * The guard on the loop is `ticks < maxCatchupTicks`, not a count of loop
 * iterations - at speed 10 a single crossing already adds 10 ticks, so the
 * cap bites after 3 crossings, not 30. Counting iterations instead would let
 * a high speed simulate proportionally more real tick-equivalents per frame
 * than a low one, which is exactly the amount of catch-up the cap exists to
 * bound (see `MAX_CATCHUP_TICKS`'s comment: ticks per frame, not crossings).
 *
 * Hitting the cap means real time was already sitting in the accumulator
 * that this call chose *not* to simulate - a decision, not a debt. Carrying
 * that leftover into next frame's accumulator would make next frame just as
 * backlogged, so it would hit the cap again, and again, for as long as the
 * backlog exceeds what one capped frame can burn off (600ms at speed 10) -
 * a multi-second run at the tick cap once ordinary frame pacing resumes,
 * which is issue #8's "briefly far too fast, then settles" symptom, just
 * happening in the logical clock instead of in the renderer this time. So a
 * frame that hits the cap discards whatever backlog remains above one tick
 * length, same as if that unsimulated time had never been reported. A frame
 * that does *not* hit the cap keeps its exact fractional remainder, as
 * before - only the capped case forgives anything.
 */
export function advanceTicks(
  accumulator: number,
  dt: number,
  speed: number,
  maxCatchupTicks = MAX_CATCHUP_TICKS,
): { ticks: number; accumulator: number } {
  let nextAccumulator = accumulator + dt;
  let ticks = 0;
  while (nextAccumulator >= TICK_MS && ticks < maxCatchupTicks) {
    nextAccumulator -= TICK_MS;
    ticks += speed;
  }
  if (ticks >= maxCatchupTicks) nextAccumulator %= TICK_MS;
  return { ticks, accumulator: nextAccumulator };
}

/**
 * Stop the clock the first time something critical appears - an empty larder,
 * a colonist starving, the colony gone. At 3x an unattended minute is twenty
 * in-game minutes, which is long enough to lose people while looking away, and
 * a warning nobody is there to read is not a warning.
 *
 * Only *new* messages pause: a condition that is still true from last time has
 * already had its interruption and would otherwise make the game unplayable.
 */
export function criticalAlerts(
  state: Parameters<typeof collectAlerts>[0],
): Map<string, { key: string; params?: Record<string, string | number> }> {
  const alerts = new Map<string, { key: string; params?: Record<string, string | number> }>();
  for (const alert of collectAlerts(state)) {
    if (alert.level !== 'critical') continue;
    // identity is the event, not the sentence: the wording is per-language now
    alerts.set(`${alert.key}|${JSON.stringify(alert.params ?? {})}`, {
      key: alert.key,
      params: alert.params,
    });
  }
  return alerts;
}

/** Alerts that were not there last time we looked. */
export function newlyCritical<T>(before: Map<string, T>, now: Map<string, T>): T[] {
  return [...now.entries()].filter(([id]) => !before.has(id)).map(([, alert]) => alert);
}

export function startGameLoop(): () => void {
  let last = performance.now();
  let accumulator = 0;
  let running = true;
  let knownCritical = criticalAlerts(useGameStore.getState().state);
  let lastAutosaveDay = Math.floor(useGameStore.getState().state.tick / TICKS_PER_DAY);
  void useGameStore.getState().refreshAutosave();

  const frame = (now: number) => {
    if (!running) return;
    const dt = Math.min(now - last, MAX_FRAME_MS);
    last = now;

    const { state, advance } = useGameStore.getState();
    const speed = state.speed;
    if (speed > 0) {
      const result = advanceTicks(accumulator, dt, speed);
      accumulator = result.accumulator;
      const ticks = result.ticks;
      if (ticks > 0) {
        advance(ticks);
        const store = useGameStore.getState();
        const critical = criticalAlerts(store.state);
        const fresh = newlyCritical(knownCritical, critical);
        knownCritical = critical;
        if (fresh.length > 0) {
          store.setSpeed(0);
          // the alert's key and params travel in the status, so the pause line
          // is retranslated live like everything else derived
          store.setStatus({
            key: 'pausedAlert',
            params: { alert: fresh[0].key, ...fresh[0].params },
          });
        }

        // one autosave per in-game day, into its own slot
        const day = Math.floor(store.state.tick / TICKS_PER_DAY);
        if (day !== lastAutosaveDay) {
          lastAutosaveDay = day;
          void store.autosave();
        }
      }
    } else {
      // paused: no writes to GameState at all, but the RAF renderer keeps going
      accumulator = 0;
    }
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
  return () => {
    running = false;
  };
}
