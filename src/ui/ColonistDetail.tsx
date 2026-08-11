// The full sheet for one colonist.
//
// The colonist list has to stay short enough to scan at a glance, so it shows
// three skills and no numbers behind them. Once skills and traits exist there
// is a second question - "why is this one slow, and what is she actually good
// at" - and that needs the whole picture in one place.
//
// Like describeTile, the content is a pure function returning flat strings: the
// selector runs on every tick and `useShallow` only compares one level deep, so
// a selector that rebuilt nested objects would re-render without end. The
// dictionary is passed in, so the same state renders in whichever language is
// active - and a language switch re-renders through useStrings().
import { useShallow } from 'zustand/react/shallow';
import { HUNGER_THRESHOLD, SLEEP_THRESHOLD } from '../core/constants';
import {
  SKILL_MAX_LEVEL,
  SKILL_NAMES,
  levelOf,
  skillLevel,
  titleSkillOf,
  workRate,
  xpForLevel,
} from '../core/skills';
import type { Colonist, ColonistId, GameState } from '../core/types';
import { wornBy } from '../core/equipment';
import { useGameStore } from '../store/gameStore';
import { useStrings } from './language';
import type { NeedWord, Strings } from './strings';

function needWord(value: number, threshold: number): NeedWord {
  if (value >= 100) return 'critical';
  if (value >= threshold) return 'wanting';
  return 'fine';
}

function doingLabel(strings: Strings, state: GameState, colonist: Colonist): string {
  const activity = colonist.activity;
  switch (activity.kind) {
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
    case 'wandering':
      return strings.activityLabels.wandering;
    case 'binge':
      return strings.activityLabels.binge;
    case 'fighting':
      return strings.activityLabels.fighting;
    case 'relaxing': {
      // the field holds a hearth or an armchair (フェーズ10); say which
      const seat = activity.hearthId ? state.buildings[activity.hearthId] : undefined;
      if (!seat) return strings.activityLabels.relaxingAlone;
      return seat.type === 'armchair'
        ? strings.activityLabels.relaxingArmchair
        : strings.activityLabels.relaxingHearth;
    }
    default:
      break;
  }
  const job = colonist.currentJobId ? state.jobs[colonist.currentJobId] : undefined;
  if (!job) return strings.activityLabels.idle;
  return colonist.carrying
    ? `${strings.jobTypeLabels[job.type]} (${strings.carrying(colonist.carrying.quantity, colonist.carrying.type)})`
    : strings.jobTypeLabels[job.type];
}

/**
 * Everything about one colonist, as `label: value` rows. Returns an empty list
 * when nobody is selected, which is how the panel knows to stay out of the way.
 */
export function describeColonist(
  state: GameState,
  id: ColonistId | null,
  strings: Strings,
): string[] {
  if (!id) return [];
  const colonist = state.colonists[id];
  if (!colonist) return [];
  const rows: string[] = [];
  const add = (label: string, value: string) => rows.push(`${label}: ${value}`);

  add(strings.rowName, colonist.name);
  const titleSkill = titleSkillOf(colonist);
  add(strings.rowTitle, titleSkill ? strings.titleLabels[titleSkill] : strings.titleColonist);
  add(strings.rowDoing, doingLabel(strings, state, colonist));
  add(strings.rowWhere, `${colonist.position.x}, ${colonist.position.y}`);
  add(strings.rowHealth, `${Math.round(colonist.health)} / 100`);
  // shown only while sick (フェーズ14 段階 M-1): a healthy colonist has
  // nothing to say here, the same way rowPace stays quiet at 1.00x
  if ((colonist.illnessTicks ?? 0) > 0) {
    add(strings.rowIllness, strings.illnessSick);
  }
  // what they hold and wear (フェーズ8): derived from wornBy, never stored here
  const worn = wornBy(state, colonist.id);
  for (const slot of ['hand', 'body'] as const) {
    const piece = worn[slot];
    if (!piece) continue;
    add(
      strings.rowEquipment,
      `${strings.equipmentLabels[piece.kind]} (${Math.round(piece.condition * 100)}%)`,
    );
  }
  add(
    strings.rowHunger,
    strings.needLine(
      Math.round(colonist.needs.hunger),
      needWord(colonist.needs.hunger, HUNGER_THRESHOLD),
    ),
  );
  add(
    strings.rowRest,
    strings.needLine(
      Math.round(colonist.needs.sleep),
      needWord(colonist.needs.sleep, SLEEP_THRESHOLD),
    ),
  );

  for (const name of SKILL_NAMES) {
    const xp = colonist.skills?.[name] ?? 0;
    const level = levelOf(xp);
    if (level >= SKILL_MAX_LEVEL) {
      add(strings.skillLabels[name], strings.skillMastered(level));
      continue;
    }
    // how far into this level, which is the only thing the bare number hides
    const floor = xpForLevel(level);
    const next = xpForLevel(level + 1);
    const progress = Math.round(((xp - floor) / (next - floor)) * 100);
    add(strings.skillLabels[name], strings.skillProgress(level, progress));
  }

  for (const name of colonist.traits ?? []) {
    add(strings.rowTrait, strings.traitLine(name));
  }

  // one number that folds skill and traits together, because that is what the
  // player actually feels: is this colonist quick or slow at this work
  const rate = workRate(colonist, 'build');
  if (Math.abs(rate - 1) > 0.001) {
    add(strings.rowPace, strings.paceLine(rate.toFixed(2), skillLevel(colonist, 'build')));
  }

  return rows;
}

export function ColonistDetail(): React.JSX.Element | null {
  const strings = useStrings();
  const rows = useGameStore(
    useShallow((s) => describeColonist(s.state, s.selectedColonistId, strings)),
  );
  const select = useGameStore((s) => s.selectColonist);
  if (rows.length === 0) return null;

  return (
    <section className="panel">
      <h2>
        {strings.panelColonist}
        <button
          type="button"
          className="panel__clear"
          onClick={() => select(null)}
          title={strings.clearTitle}
        >
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
