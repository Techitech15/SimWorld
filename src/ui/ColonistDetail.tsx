// The full sheet for one colonist.
//
// The colonist list has to stay short enough to scan at a glance, so it shows
// three skills and no numbers behind them. Once skills and traits exist there
// is a second question - "why is this one slow, and what is she actually good
// at" - and that needs the whole picture in one place.
//
// Like describeTile, the content is a pure function returning flat strings: the
// selector runs on every tick and `useShallow` only compares one level deep, so
// a selector that rebuilt nested objects would re-render without end.
import { useShallow } from 'zustand/react/shallow';
import { HUNGER_THRESHOLD, SLEEP_THRESHOLD } from '../core/constants';
import {
  SKILL_LABELS,
  SKILL_MAX_LEVEL,
  SKILL_NAMES,
  levelOf,
  skillLevel,
  workRate,
  xpForLevel,
} from '../core/skills';
import { TRAITS } from '../core/traits';
import type { ColonistId, GameState } from '../core/types';
import { useGameStore } from '../store/gameStore';

function needWord(value: number, threshold: number): string {
  if (value >= 100) return 'critical';
  if (value >= threshold) return 'wanting';
  return 'fine';
}

/**
 * Everything about one colonist, as `label: value` rows. Returns an empty list
 * when nobody is selected, which is how the panel knows to stay out of the way.
 */
export function describeColonist(state: GameState, id: ColonistId | null): string[] {
  if (!id) return [];
  const colonist = state.colonists[id];
  if (!colonist) return [];
  const rows: string[] = [];
  const add = (label: string, value: string) => rows.push(`${label}: ${value}`);

  const job = colonist.currentJobId ? state.jobs[colonist.currentJobId] : undefined;
  add('Name', colonist.name);
  add(
    'Doing',
    colonist.activity.kind !== 'none'
      ? colonist.activity.kind
      : job
        ? `${job.type}${colonist.carrying ? ` (carrying ${colonist.carrying.quantity} ${colonist.carrying.type})` : ''}`
        : 'idle',
  );
  add('Where', `${colonist.position.x}, ${colonist.position.y}`);
  add('Health', `${Math.round(colonist.health)} / 100`);
  add('Hunger', `${Math.round(colonist.needs.hunger)} — ${needWord(colonist.needs.hunger, HUNGER_THRESHOLD)}`);
  add('Rest', `${Math.round(colonist.needs.sleep)} — ${needWord(colonist.needs.sleep, SLEEP_THRESHOLD)}`);

  for (const name of SKILL_NAMES) {
    const xp = colonist.skills?.[name] ?? 0;
    const level = levelOf(xp);
    if (level >= SKILL_MAX_LEVEL) {
      add(SKILL_LABELS[name], `${level} — mastered`);
      continue;
    }
    // how far into this level, which is the only thing the bare number hides
    const floor = xpForLevel(level);
    const next = xpForLevel(level + 1);
    const progress = Math.round(((xp - floor) / (next - floor)) * 100);
    add(SKILL_LABELS[name], `${level} (${progress}% to ${level + 1})`);
  }

  for (const name of colonist.traits ?? []) {
    const trait = TRAITS[name];
    add('Trait', trait ? `${trait.label} — ${trait.description}` : name);
  }

  // one number that folds skill and traits together, because that is what the
  // player actually feels: is this colonist quick or slow at this work
  const rate = workRate(colonist, 'build');
  if (Math.abs(rate - 1) > 0.001) {
    add('Pace', `${rate.toFixed(2)}x at construction (level ${skillLevel(colonist, 'build')})`);
  }

  return rows;
}

export function ColonistDetail(): React.JSX.Element | null {
  const rows = useGameStore(
    useShallow((s) => describeColonist(s.state, s.selectedColonistId)),
  );
  const select = useGameStore((s) => s.selectColonist);
  if (rows.length === 0) return null;

  return (
    <section className="panel">
      <h2>
        Colonist
        <button type="button" className="panel__clear" onClick={() => select(null)} title="clear">
          ×
        </button>
      </h2>
      <dl className="inspect">
        {rows.map((row, index) => {
          const at = row.indexOf(': ');
          const label = row.slice(0, at);
          const value = row.slice(at + 2);
          return (
            <div className="inspect__row" key={`${label}-${index}`}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
