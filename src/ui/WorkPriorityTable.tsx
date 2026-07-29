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

  return (
    <section className="panel">
      <h2>Work</h2>
      <table className="work">
        <thead>
          <tr>
            <th />
            {JOB_TYPES.map((jobType) => (
              <th key={jobType} title={jobType}>
                <img src={JOB_ICON[jobType]} alt={jobType} width={20} height={20} />
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
      <p className="muted small">1 = highest, 3 = lowest, – = will not do this work.</p>
    </section>
  );
}
