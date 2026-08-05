import { useShallow } from 'zustand/react/shallow';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../core/constants';
import { useGameStore } from '../store/gameStore';

/** Raw tick numbers mean nothing to a player; the clock they are watching does. */
export function stampOf(tick: number): string {
  const day = Math.floor(tick / TICKS_PER_DAY) + 1;
  const hour = Math.floor((tick % TICKS_PER_DAY) / TICKS_PER_HOUR);
  const minute = Math.floor(((tick % TICKS_PER_DAY) % TICKS_PER_HOUR) * (60 / TICKS_PER_HOUR));
  return `D${day} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * What has happened, newest first. Six lines was enough when the only events
 * were failed jobs; a colony now reports seasons turning, wanderers arriving,
 * animals born, hunted and lost, and buildings coming down, so the panel keeps
 * a scrollable run of them.
 */
export function EventLog(): React.JSX.Element | null {
  const entries = useGameStore(useShallow((s) => s.state.log.slice(-40).reverse()));
  if (entries.length === 0) return null;
  return (
    <section className="panel">
      <h2>Log</h2>
      <ul className="log log--scroll">
        {entries.map((entry, index) => (
          <li
            key={`${entry.tick}-${index}`}
            className={entry.kind === 'incident' ? 'log__incident' : undefined}
          >
            <span className="muted small">{stampOf(entry.tick)}</span> {entry.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
