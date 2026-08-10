import { useShallow } from 'zustand/react/shallow';
import { collectAlerts } from '../core/alerts';
import type { AlertLevel } from '../core/alerts';
import { useGameStore } from '../store/gameStore';
import { useStrings } from './language';

/**
 * What is wrong right now, at the top of the sidebar where it cannot be missed.
 *
 * Like the other derived panels the selector returns flat strings (`level|text`)
 * so `useShallow` can actually compare them; rebuilding alert objects every tick
 * would re-render forever. Alerts are derived per render, so the sentence is
 * composed here in the active language - an alert already on screen switches
 * language with the rest of the page.
 */
const RANK: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2 };
const MAX_SHOWN = 6;

export function AlertPanel(): React.JSX.Element | null {
  const strings = useStrings();
  const rows = useGameStore(
    useShallow((s) =>
      collectAlerts(s.state)
        // worst first: a starving colony must not be pushed off the strip by a
        // note about the season
        .sort((a, b) => RANK[a.level] - RANK[b.level])
        .map(
          (a) =>
            `${a.level}|${a.at ? `${a.at.x},${a.at.y}` : ''}|${strings.alerts[a.key](a.params ?? {})}`,
        ),
    ),
  );
  const focusOnTile = useGameStore((s) => s.focusOnTile);
  const selectTile = useGameStore((s) => s.selectTile);
  if (rows.length === 0) return null;
  // enough lines to see a crisis, few enough to stay a strip rather than a wall
  const shown = rows.slice(0, MAX_SHOWN);
  const hidden = rows.length - shown.length;

  return (
    <section className="panel panel--alerts">
      <ul className="alerts">
        {shown.map((row) => {
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
                title={strings.alertJumpTitle}
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
        {hidden > 0 ? <li className="alert muted small">{strings.alertsMore(hidden)}</li> : null}
      </ul>
    </section>
  );
}
