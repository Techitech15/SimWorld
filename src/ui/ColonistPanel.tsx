import { HUNGER_THRESHOLD, SLEEP_THRESHOLD } from '../core/constants';
import { MOOD_LOW, moodLabel, moodOf, thoughtsOf } from '../core/mood';
import { SKILL_LABELS, SKILL_NAMES, levelOf } from '../core/skills';
import { TRAITS } from '../core/traits';
import type { Colonist, GameState } from '../core/types';
import { getNetworks, useGameStore } from '../store/gameStore';
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
    case 'fleeing':
      return 'fleeing!';
    case 'brooding':
      return 'refusing to work';
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
  invert = false,
}: {
  icon: string;
  label: string;
  value: number;
  threshold: number;
  /** needs fill up as they get worse; health empties instead */
  invert?: boolean;
}): React.JSX.Element {
  const pct = Math.round(value);
  const severity = invert ? 100 - pct : pct;
  const state = severity >= 95 ? 'critical' : severity >= threshold ? 'warning' : 'ok';
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

/**
 * Mood, and the reason for it. The bar alone would only tell the player that
 * somebody is unhappy; the hover text names the thought that is costing the
 * most, which is the thing they can actually go and fix.
 */
function MoodBar({ colonist, state }: { colonist: Colonist; state: GameState }): React.JSX.Element {
  const networks = getNetworks(state);
  const mood = moodOf(state, colonist, networks);
  const thoughts = thoughtsOf(state, colonist, networks);
  const title = [
    `Mood ${mood} — ${moodLabel(mood)}`,
    ...thoughts.map((t) => `${t.amount > 0 ? '+' : ''}${t.amount} ${t.label}`),
  ].join('\n');
  const worst = thoughts[0];
  return (
    <>
      <NeedBar icon={icons.mood} label={title} value={mood} threshold={100 - MOOD_LOW} invert />
      {worst && worst.amount < 0 && (
        <div className="colonist__thought" title={title}>
          {worst.label}
        </div>
      )}
    </>
  );
}

/**
 * What this colonist is good at. Only levels above zero, best first, capped at
 * three: the point is "this is the hunter", not a character sheet.
 */
function SkillTags({ colonist }: { colonist: Colonist }): React.JSX.Element | null {
  const shown = SKILL_NAMES.map((name) => ({ name, level: levelOf(colonist.skills?.[name] ?? 0) }))
    .filter((skill) => skill.level > 0)
    .sort((a, b) => b.level - a.level || (a.name < b.name ? -1 : 1))
    .slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <div className="skills">
      {shown.map((skill) => (
        <span className="skill" key={skill.name} title={`${SKILL_LABELS[skill.name]} level ${skill.level}`}>
          {SKILL_LABELS[skill.name]}
          <b>{skill.level}</b>
        </span>
      ))}
    </div>
  );
}

function ColonistRow({ id }: { id: string }): React.JSX.Element | null {
  const colonist = useColonist(id);
  const selectedId = useGameStore((s) => s.selectedColonistId);
  const select = useGameStore((s) => s.selectColonist);
  const focusOnTile = useGameStore((s) => s.focusOnTile);
  const selectTile = useGameStore((s) => s.selectTile);
  const state = useGameStore((s) => s.state);
  if (!colonist) return null;

  return (
    <button
      type="button"
      className={`colonist ${selectedId === id ? 'colonist--selected' : ''}`}
      onClick={() => {
        // clicking a name in a list of eight means "show me this one" - on a
        // 60x60 map, selecting without moving the camera answers nothing
        select(id);
        focusOnTile({ ...colonist.position });
        selectTile(`${colonist.position.x},${colonist.position.y}`);
      }}
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
        icon={icons.health}
        label="Health"
        value={colonist.health}
        threshold={40}
        invert
      />
      <NeedBar
        icon={icons.sleep}
        label="Rest"
        value={colonist.needs.sleep}
        threshold={SLEEP_THRESHOLD}
      />
      <MoodBar colonist={colonist} state={state} />
      <SkillTags colonist={colonist} />
      {colonist.traits?.length > 0 && (
        <div className="skills">
          {colonist.traits.map((name) => (
            <span className="skill skill--trait" key={name} title={TRAITS[name]?.description}>
              {TRAITS[name]?.label ?? name}
            </span>
          ))}
        </div>
      )}
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
