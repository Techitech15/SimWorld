// The "what now" panel.
//
// Collapsed to a single line once the colony has its feet under it, because a
// checklist that stays open after everything on it is done is just furniture.
import { useShallow } from 'zustand/react/shallow';
import { colonyGoals, goalSummary } from '../core/goals';
import { useGameStore } from '../store/gameStore';
import { usePanelFold } from './panelState';

/** Nothing in a label or hint contains this, and it is visible if it leaks. */
const FIELD = ' :: ';

export function GoalPanel(): React.JSX.Element | null {
  // flat strings again: this runs every tick, and useShallow only compares one
  // level deep, so a selector rebuilding objects would re-render for ever
  const rows = useGameStore(
    useShallow((s) =>
      colonyGoals(s.state).map(
        (goal) =>
          [goal.done ? 'done' : 'todo', Math.round(goal.progress * 100), goal.label, goal.hint].join(
            FIELD,
          ),
      ),
    ),
  );
  const summary = useGameStore((s) => goalSummary(s.state));
  // the fold survives a reload, and it is not part of the save (4.3)
  const { open, toggle } = usePanelFold('goals', true);
  if (rows.length === 0) return null;

  const goals = rows.map((row) => {
    const [done, progress, label, hint] = row.split(FIELD);
    return { done: done === 'done', progress: Number(progress) / 100, label, hint };
  });
  const pending = goals.filter((goal) => !goal.done);

  return (
    <section className="panel">
      <h2>
        Next steps
        <button
          type="button"
          className="panel__clear"
          onClick={toggle}
          title={open ? 'collapse' : 'expand'}
        >
          {open ? '−' : '+'}
        </button>
      </h2>
      {!open ? (
        <div className="muted small">
          {summary}
          {pending.length > 0 ? ` · next: ${pending[0].label}` : ' · all done'}
        </div>
      ) : (
        <ul className="goals">
          {goals.map((goal) => (
            <li
              key={goal.label}
              className={`goal ${goal.done ? 'goal--done' : ''}`}
              title={goal.hint}
            >
              <span className="goal__mark">{goal.done ? '✓' : '·'}</span>
              <span className="goal__label">{goal.label}</span>
              {!goal.done && goal.progress > 0 ? (
                <span className="goal__bar">
                  <span className="goal__fill" style={{ width: `${goal.progress * 100}%` }} />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
