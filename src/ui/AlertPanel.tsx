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
    useShallow((s) =>
      collectAlerts(s.state).map(
        (a) => `${a.level}|${a.at ? `${a.at.x},${a.at.y}` : ''}|${a.message}`,
      ),
    ),
  );
  const focusOnTile = useGameStore((s) => s.focusOnTile);
  const selectTile = useGameStore((s) => s.selectTile);
  if (rows.length === 0) return null;

  return (
    <section className="panel panel--alerts">
      <ul className="alerts">
        {rows.map((row) => {
          const [level, where, ...rest] = row.split('|');
          const message = rest.join('|');
          if (!where) {
            return (
              <li key={row} className={`alert alert--${level}`}>
                {message}
              </li>
            );
          }
          const [x, y] = where.split(',').map(Number);
          return (
            <li key={row} className={`alert alert--${level}`}>
              <button
                type="button"
                className="alert__jump"
                title="show me"
                onClick={() => {
                  focusOnTile({ x, y });
                  selectTile(`${x},${y}`);
                }}
              >
                {message}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
