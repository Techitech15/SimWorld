// The tick driver (section 5).
//
// tick length is fixed at 200ms; the speed multiplier changes how many ticks are
// processed per real 200ms, never the tick length itself, so cooldowns and
// growth rates stay comparable between 1x and 3x.
import { TICK_MS } from '../core/constants';
import { useGameStore } from '../store/gameStore';

/** Never simulate more than this many ticks in one frame after a stall. */
const MAX_CATCHUP_TICKS = 30;

export function startGameLoop(): () => void {
  let last = performance.now();
  let accumulator = 0;
  let running = true;

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
      if (ticks > 0) advance(ticks);
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
