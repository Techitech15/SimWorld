import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../core/constants';
import { DAYS_PER_SEASON, SEASON_LABEL, dayOfSeason, seasonOf, yearOf } from '../core/season';
import { AUTOSAVE_SLOT } from '../persistence/indexeddb';
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
  const hasAutosave = useGameStore((s) => s.hasAutosave);
  const newGame = useGameStore((s) => s.newGame);
  const statusMessage = useGameStore((s) => s.statusMessage);
  const jobs = useJobCounts();
  const population = useGameStore((s) => Object.keys(s.state.colonists).length);

  const day = Math.floor(tick / TICKS_PER_DAY) + 1;
  const hour = Math.floor((tick % TICKS_PER_DAY) / TICKS_PER_HOUR);
  const minute = Math.floor(((tick % TICKS_PER_DAY) % TICKS_PER_HOUR) * (60 / TICKS_PER_HOUR));

  return (
    <header className="topbar">
      <div className="topbar__clock">
        <strong>Day {day}</strong>
        <span title={`day ${dayOfSeason(tick)} of ${DAYS_PER_SEASON}`}>
          {SEASON_LABEL[seasonOf(tick)]} {dayOfSeason(tick)}/{DAYS_PER_SEASON}
        </span>
        <span className="muted">Year {yearOf(tick)}</span>
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
        {population} {population === 1 ? 'colonist' : 'colonists'} · jobs: {jobs.active} active /{' '}
        {jobs.pending} queued
        {jobs.failed > 0 ? ` / ${jobs.failed} failed` : ''}
      </div>

      <div className="topbar__actions">
        <button type="button" onClick={() => void save()}>
          Save
        </button>
        <button type="button" onClick={() => void load()}>
          Load
        </button>
        {hasAutosave ? (
          <button
            type="button"
            title="the game saves once per in-game day, into its own slot"
            onClick={() => void load(AUTOSAVE_SLOT)}
          >
            Load autosave
          </button>
        ) : null}
        <button type="button" onClick={() => newGame()}>
          New map
        </button>
      </div>

      {statusMessage ? <div className="topbar__status">{statusMessage}</div> : null}
    </header>
  );
}
