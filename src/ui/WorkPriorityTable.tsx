import { JOB_TYPES } from '../core/types';
import type { JobType, SkillName } from '../core/types';
import { useGameStore } from '../store/gameStore';
import { useColonist, useColonistIds } from './hooks';
import { icons } from './icons';
import { useStrings } from './language';

/**
 * Which bundles get a button (design-phase12-research.md 4.2). Six of the
 * eight columns, chosen for how often a player would actually reach for them;
 * the titles that label them are the same ones the colonist sheet derives
 * (`titleLabels`), so the button and the displayed title never disagree about
 * what a "Farmer" is.
 */
const PROFESSION_PRESETS: SkillName[] = ['farm', 'build', 'mine', 'chop', 'hunt', 'research'];

/**
 * One click sets every column of the selected colonist's row at once - a
 * declared bundle, not a nudge (unlike "assign by skill" below, which only
 * ever raises a column, never lowers one). Nothing about the preset itself is
 * saved; only the `workPriorities` it produces are.
 */
function ProfessionPresets(): React.JSX.Element {
  const strings = useStrings();
  const selectedColonistId = useGameStore((s) => s.selectedColonistId);
  const applyProfession = useGameStore((s) => s.applyProfession);
  return (
    <div className="professions">
      <span className="filters__label">{strings.professionsLabel}</span>
      {PROFESSION_PRESETS.map((primary) => (
        <button
          key={primary}
          type="button"
          disabled={!selectedColonistId}
          title={
            selectedColonistId
              ? strings.professionTitle(strings.titleLabels[primary])
              : strings.professionNoSelection
          }
          onClick={() => selectedColonistId && applyProfession(selectedColonistId, primary)}
        >
          {strings.titleLabels[primary]}
        </button>
      ))}
    </div>
  );
}

const JOB_ICON: Record<JobType, string> = {
  chop: icons.chop,
  mine: icons.mine,
  farm: icons.farm,
  build: icons.build,
  // neither of these is a column of its own: both are build work
  repair: icons.build,
  deconstruct: icons.deconstruct,
  haul: icons.haul,
  hunt: icons.hunt,
  handle: icons.handle,
  research: icons.research,
  craft: icons.craft,
};

/**
 * Work tab (section 9). Clicking a cell cycles 1 -> 2 -> 3 -> off, matching the
 * three-step priority scale of section 6; "off" is the "priority not enabled"
 * case the candidate filter checks.
 */
function PriorityCell({ colonistId, jobType }: { colonistId: string; jobType: JobType }) {
  const strings = useStrings();
  const colonist = useColonist(colonistId);
  const setJobPriority = useGameStore((s) => s.setJobPriority);
  if (!colonist) return null;
  const value = colonist.workPriorities[jobType] ?? 0;

  return (
    <td>
      <button
        type="button"
        className={`priority priority--${value}`}
        title={value === 0 ? strings.priorityDisabled : strings.priorityTitle(value)}
        onClick={() => setJobPriority(colonistId, jobType, value >= 3 ? 0 : value + 1)}
      >
        {value === 0 ? '–' : value}
      </button>
    </td>
  );
}

export function WorkPriorityTable(): React.JSX.Element {
  const strings = useStrings();
  const ids = useColonistIds();
  const colonists = useGameStore((s) => s.state.colonists);
  const setJobPriority = useGameStore((s) => s.setJobPriority);
  const assignWorkBySkill = useGameStore((s) => s.assignWorkBySkill);

  /**
   * Set a whole column at once. Turning hauling off for the colony is three
   * clicks with three colonists and thirty with thirty, which is the sort of
   * thing that quietly stops a player from tuning anything at all.
   *
   * The step follows the column's *lowest* current value, so a mixed column
   * moves together rather than each colonist cycling out of step.
   */
  const cycleColumn = (jobType: JobType) => {
    const values = ids.map((id) => colonists[id]?.workPriorities[jobType] ?? 0);
    const lowest = Math.min(...values);
    const next = lowest >= 3 ? 0 : lowest + 1;
    for (const id of ids) setJobPriority(id, jobType, next);
  };

  return (
    <>
      <ProfessionPresets />
      <table className="work">
        <thead>
          <tr>
            <th />
            {JOB_TYPES.map((jobType) => (
              <th key={jobType}>
                <button
                  type="button"
                  className="work__column"
                  title={strings.workColumnTitle(jobType)}
                  onClick={() => cycleColumn(jobType)}
                >
                  <img src={JOB_ICON[jobType]} alt={strings.jobTypeLabels[jobType]} width={20} height={20} />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => (
            <tr key={id}>
              <th scope="row">{colonists[id]?.name ?? id}</th>
              {JOB_TYPES.map((jobType) => (
                <PriorityCell key={jobType} colonistId={id} jobType={jobType} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">{strings.workFootnote}</p>
      <button type="button" className="work__auto" onClick={() => assignWorkBySkill()}>
        {strings.assignBySkill}
      </button>
      <p className="muted small">{strings.assignFootnote}</p>
    </>
  );
}
