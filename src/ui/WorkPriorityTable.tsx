import { JOB_TYPES } from '../core/types';
import type { JobType } from '../core/types';
import { useGameStore } from '../store/gameStore';
import { useColonist, useColonistIds } from './hooks';
import { icons } from './icons';

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
};

/**
 * Work tab (section 9). Clicking a cell cycles 1 -> 2 -> 3 -> off, matching the
 * three-step priority scale of section 6; "off" is the "priority not enabled"
 * case the candidate filter checks.
 */
function PriorityCell({ colonistId, jobType }: { colonistId: string; jobType: JobType }) {
  const colonist = useColonist(colonistId);
  const setJobPriority = useGameStore((s) => s.setJobPriority);
  if (!colonist) return null;
  const value = colonist.workPriorities[jobType] ?? 0;

  return (
    <td>
      <button
        type="button"
        className={`priority priority--${value}`}
        title={value === 0 ? 'disabled' : `priority ${value}`}
        onClick={() => setJobPriority(colonistId, jobType, value >= 3 ? 0 : value + 1)}
      >
        {value === 0 ? '–' : value}
      </button>
    </td>
  );
}

export function WorkPriorityTable(): React.JSX.Element {
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
    <section className="panel">
      <h2>Work</h2>
      <table className="work">
        <thead>
          <tr>
            <th />
            {JOB_TYPES.map((jobType) => (
              <th key={jobType}>
                <button
                  type="button"
                  className="work__column"
                  title={`${jobType} — click to set this column for everyone`}
                  onClick={() => cycleColumn(jobType)}
                >
                  <img src={JOB_ICON[jobType]} alt={jobType} width={20} height={20} />
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
      <p className="muted small">
        1 = highest, 3 = lowest, – = will not do this work. Click an icon to set the whole column.
      </p>
      <button type="button" className="work__auto" onClick={() => assignWorkBySkill()}>
        Assign by skill
      </button>
      <p className="muted small">
        Puts each colonist first in line for the two things they are best at, so specialists do
        their speciality. The cost is that everything else drops behind it, including work you have
        just ordered. Nothing is switched off, and columns you have disabled stay disabled.
      </p>
    </section>
  );
}
