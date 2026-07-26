import { HUNGER_THRESHOLD, SLEEP_THRESHOLD } from '../core/constants';
import type { Colonist, GameState } from '../core/types';
import { useGameStore } from '../store/gameStore';
import { useColonist, useColonistIds } from './hooks';
import { icons } from './icons';

function activityLabel(colonist: Colonist, state: GameState): string {
  switch (colonist.activity.kind) {
    case 'eating':
      return 'eating';
    case 'sleeping':
      return 'sleeping';
    case 'moving':
      return 'walking';
    default:
      break;
  }
  if (!colonist.currentJobId) return 'idle';
  const job = state.jobs[colonist.currentJobId];
  if (!job) return 'idle';
  return colonist.carrying ? `${job.type} (carrying ${colonist.carrying.type})` : job.type;
}

function NeedBar({
  icon,
  label,
  value,
  threshold,
}: {
  icon: string;
  label: string;
  value: number;
  threshold: number;
}): React.JSX.Element {
  const pct = Math.round(value);
  const state = pct >= 95 ? 'critical' : pct >= threshold ? 'warning' : 'ok';
  return (
    <div className="need">
      <img src={icon} alt={label} title={label} width={18} height={18} />
      <div className="need__track">
        <div className={`need__fill need__fill--${state}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="need__value">{pct}</span>
    </div>
  );
}

function ColonistRow({ id }: { id: string }): React.JSX.Element | null {
  const colonist = useColonist(id);
  const selectedId = useGameStore((s) => s.selectedColonistId);
  const select = useGameStore((s) => s.selectColonist);
  const state = useGameStore((s) => s.state);
  if (!colonist) return null;

  return (
    <button
      type="button"
      className={`colonist ${selectedId === id ? 'colonist--selected' : ''}`}
      onClick={() => select(id)}
    >
      <div className="colonist__head">
        <span
          className="colonist__swatch"
          style={{
            background: `#${colonist.color.toString(16).padStart(6, '0')}`,
          }}
        />
        <strong>{colonist.name}</strong>
        <span className="muted">{activityLabel(colonist, state)}</span>
      </div>
      <NeedBar
        icon={icons.hunger}
        label="Hunger"
        value={colonist.needs.hunger}
        threshold={HUNGER_THRESHOLD}
      />
      <NeedBar
        icon={icons.sleep}
        label="Rest"
        value={colonist.needs.sleep}
        threshold={SLEEP_THRESHOLD}
      />
    </button>
  );
}

export function ColonistPanel(): React.JSX.Element {
  const ids = useColonistIds();
  return (
    <section className="panel">
      <h2>Colonists</h2>
      <div className="colonists">
        {ids.map((id) => (
          <ColonistRow key={id} id={id} />
        ))}
      </div>
    </section>
  );
}
