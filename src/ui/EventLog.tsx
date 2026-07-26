import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../store/gameStore';

/** Failed jobs and other notable events (section 6: failures are logged). */
export function EventLog(): React.JSX.Element | null {
  const entries = useGameStore(useShallow((s) => s.state.log.slice(-6).reverse()));
  if (entries.length === 0) return null;
  return (
    <section className="panel">
      <h2>Log</h2>
      <ul className="log">
        {entries.map((entry, index) => (
          <li key={`${entry.tick}-${index}`}>
            <span className="muted small">{entry.tick}</span> {entry.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
