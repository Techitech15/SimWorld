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
    const dt = Math.min(now - last, 1000);
    last = now;

    const { state, advance } = useGameStore.getState();
    const speed = state.speed;
    if (speed > 0) {
      accumulator += dt;
      let ticks = 0;
      while (accumulator >= TICK_MS && ticks < MAX_CATCHUP_TICKS) {
        accumulator -= TICK_MS;
        ticks += speed;
      }
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
