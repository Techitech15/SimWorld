import { useShallow } from 'zustand/react/shallow';
import { collectAlerts } from '../core/alerts';
import { useGameStore } from '../store/gameStore';

/**
 * What is wrong right now, at the top of the sidebar where it cannot be missed.
 *
 * Like the other derived panels the selector returns flat strings (`level|text`)
 * so `useShallow` can actually compare them; rebuilding alert objects every tick
 * would re-render forever.
 */
export function AlertPanel(): React.JSX.Element | null {
  const rows = useGameStore(
    useShallow((s) => collectAlerts(s.state).map((a) => `${a.level}|${a.message}`)),
  );
  if (rows.length === 0) return null;

  return (
    <section className="panel panel--alerts">
      <ul className="alerts">
        {rows.map((row) => {
          const at = row.indexOf('|');
          const level = row.slice(0, at);
          const message = row.slice(at + 1);
          return (
            <li key={row} className={`alert alert--${level}`}>
              {message}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
