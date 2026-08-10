import { HUNGER_THRESHOLD, SLEEP_THRESHOLD } from '../core/constants';
import { MOOD_LOW, moodLabel, moodOf, thoughtsOf } from '../core/mood';
import { AFFINITY_MAX, FRIEND_AT, closestTo } from '../core/relationships';
import { SKILL_NAMES, levelOf } from '../core/skills';
import type { Colonist, GameState } from '../core/types';
import { getNetworks, useGameStore } from '../store/gameStore';
import { useColonist, useColonistIds } from './hooks';
import { icons } from './icons';
import { useStrings } from './language';
import type { Strings } from './strings';

function activityLabel(strings: Strings, colonist: Colonist, state: GameState): string {
  switch (colonist.activity.kind) {
    case 'eating':
      return strings.activityLabels.eating;
    case 'sleeping':
      return strings.activityLabels.sleeping;
    case 'moving':
      return strings.activityLabels.walking;
    case 'fleeing':
      return strings.activityLabels.fleeing;
    case 'brooding':
      return strings.activityLabels.brooding;
    case 'fighting':
      return strings.activityLabels.fighting;
    case 'wandering':
      return strings.activityLabels.wandering;
    case 'binge':
      return strings.activityLabels.binge;
    case 'relaxing':
      return colonist.activity.hearthId
        ? strings.activityLabels.relaxingHearth
        : strings.activityLabels.relaxingAlone;
    default:
      break;
  }
  if (!colonist.currentJobId) return strings.activityLabels.idle;
  const job = state.jobs[colonist.currentJobId];
  if (!job) return strings.activityLabels.idle;
  return colonist.carrying
    ? `${strings.jobTypeLabels[job.type]} (${strings.carrying(colonist.carrying.quantity, colonist.carrying.type)})`
    : strings.jobTypeLabels[job.type];
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
  const strings = useStrings();
  const networks = getNetworks(state);
  const mood = moodOf(state, colonist, networks);
  const thoughts = thoughtsOf(state, colonist, networks);
  const thoughtText = (t: (typeof thoughts)[number]) =>
    strings.thoughts[t.key]({ name: t.name ?? '' });
  const title = [
    strings.moodBarTitle(mood, moodLabel(mood)),
    ...thoughts.map((t) => `${t.amount > 0 ? '+' : ''}${t.amount} ${thoughtText(t)}`),
  ].join('\n');
  const worst = thoughts[0];
  return (
    <>
      <NeedBar icon={icons.mood} label={title} value={mood} threshold={100 - MOOD_LOW} invert />
      {worst && worst.amount < 0 && (
        <div className="colonist__thought" title={title}>
          {thoughtText(worst)}
        </div>
      )}
    </>
  );
}

/** Who they are closest to. Silent until there is somebody to name. */
function Bond({ colonist, state }: { colonist: Colonist; state: GameState }): React.JSX.Element | null {
  const strings = useStrings();
  const closest = closestTo(state, colonist.id);
  if (!closest) return null;
  const them = state.colonists[closest.id];
  if (!them) return null;
  const friend = closest.affinity >= FRIEND_AT;
  return (
    <div
      className="colonist__bond"
      title={strings.affinityTitle(Math.round(closest.affinity), AFFINITY_MAX)}
    >
      {friend ? strings.friendOf(them.name) : strings.knowsName(them.name)}
    </div>
  );
}

/**
 * What this colonist is good at. Only levels above zero, best first, capped at
 * three: the point is "this is the hunter", not a character sheet.
 */
function SkillTags({ colonist }: { colonist: Colonist }): React.JSX.Element | null {
  const strings = useStrings();
  const shown = SKILL_NAMES.map((name) => ({ name, level: levelOf(colonist.skills?.[name] ?? 0) }))
    .filter((skill) => skill.level > 0)
    .sort((a, b) => b.level - a.level || (a.name < b.name ? -1 : 1))
    .slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <div className="skills">
      {shown.map((skill) => (
        <span
          className="skill"
          key={skill.name}
          title={strings.skillTagTitle(skill.name, skill.level)}
        >
          {strings.skillLabels[skill.name]}
          <b>{skill.level}</b>
        </span>
      ))}
    </div>
  );
}

function ColonistRow({ id }: { id: string }): React.JSX.Element | null {
  const strings = useStrings();
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
        <span className="muted">{activityLabel(strings, colonist, state)}</span>
      </div>
      <NeedBar
        icon={icons.hunger}
        label={strings.rowHunger}
        value={colonist.needs.hunger}
        threshold={HUNGER_THRESHOLD}
      />
      <NeedBar
        icon={icons.health}
        label={strings.rowHealth}
        value={colonist.health}
        threshold={40}
        invert
      />
      <NeedBar
        icon={icons.sleep}
        label={strings.rowRest}
        value={colonist.needs.sleep}
        threshold={SLEEP_THRESHOLD}
      />
      <MoodBar colonist={colonist} state={state} />
      <Bond colonist={colonist} state={state} />
      <SkillTags colonist={colonist} />
      {colonist.traits?.length > 0 && (
        <div className="skills">
          {colonist.traits.map((name) => (
            <span className="skill skill--trait" key={name} title={strings.traitDescriptions[name]}>
              {strings.traitLabels[name]}
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
    <div className="colonists">
      {ids.map((id) => (
        <ColonistRow key={id} id={id} />
      ))}
    </div>
  );
}
