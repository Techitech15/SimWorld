import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../core/constants';
import { useGameStore } from '../store/gameStore';
import { useJobCounts, useSpeed, useTick } from './hooks';

const SPEEDS: { value: 0 | 1 | 3; label: string; hint: string }[] = [
  { value: 0, label: '⏸', hint: 'Pause' },
  { value: 1, label: '▶', hint: '1x' },
  { value: 3, label: '▶▶▶', hint: '3x' },
];

export function TopBar(): React.JSX.Element {
  const tick = useTick();
  const speed = useSpeed();
  const setSpeed = useGameStore((s) => s.setSpeed);
  const save = useGameStore((s) => s.save);
  const load = useGameStore((s) => s.load);
  const newGame = useGameStore((s) => s.newGame);
  const statusMessage = useGameStore((s) => s.statusMessage);
  const jobs = useJobCounts();

  const day = Math.floor(tick / TICKS_PER_DAY) + 1;
  const hour = Math.floor((tick % TICKS_PER_DAY) / TICKS_PER_HOUR);
  const minute = Math.floor(((tick % TICKS_PER_DAY) % TICKS_PER_HOUR) * (60 / TICKS_PER_HOUR));

  return (
    <header className="topbar">
      <div className="topbar__clock">
        <strong>Day {day}</strong>
        <span>
          {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')}
        </span>
        <span className="muted">tick {tick}</span>
      </div>

      <div className="topbar__speed">
        {SPEEDS.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.hint}
            className={speed === option.value ? 'active' : ''}
            onClick={() => setSpeed(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="topbar__jobs muted">
        jobs: {jobs.active} active / {jobs.pending} queued
        {jobs.failed > 0 ? ` / ${jobs.failed} failed` : ''}
      </div>

      <div className="topbar__actions">
        <button type="button" onClick={() => void save()}>
          Save
        </button>
        <button type="button" onClick={() => void load()}>
          Load
        </button>
        <button type="button" onClick={() => newGame(Math.floor(Math.random() * 1e9))}>
          New map
        </button>
      </div>

      {statusMessage ? <div className="topbar__status">{statusMessage}</div> : null}
    </header>
  );
}
