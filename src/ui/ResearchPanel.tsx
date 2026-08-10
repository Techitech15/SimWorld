// The research tree (11章 フェーズ12, docs/design-phase12-research.md).
//
// One tech at a time, no queue (2.3): a progress bar for whatever the desk is
// working on, a list of what could be picked next, and what has already
// cleared. Selecting a tech is the only write this panel makes; everything
// else here is read straight off `state.research`.
import { useShallow } from 'zustand/react/shallow';
import { TECHS } from '../core/constants';
import { availableTechs } from '../core/research';
import type { TechName } from '../core/types';
import { useGameStore } from '../store/gameStore';
import { useStrings } from './language';
import type { Strings } from './strings';

/** Nothing a tech name or a resource id contains this. */
const FIELD = ' :: ';

function unlocksText(strings: Strings, tech: TechName): string {
  const unlocks = TECHS[tech].unlocks;
  if (unlocks.length === 0) return strings.researchNoUnlocks;
  return strings.researchUnlocksLine(unlocks.map((b) => strings.buildingLabels[b]).join(', '));
}

export function ResearchPanel(): React.JSX.Element {
  const strings = useStrings();
  const current = useGameStore((s) => s.state.research.current);
  const progress = useGameStore((s) => (current ? (s.state.research.progress[current] ?? 0) : 0));
  const setResearchCurrent = useGameStore((s) => s.setResearchCurrent);
  const hasDesk = useGameStore((s) =>
    Object.values(s.state.buildings).some((b) => b.type === 'researchDesk' && !b.isBlueprint),
  );
  // a flat, joined string rather than an array: this selector runs every
  // tick, and a fresh array reference each time would never compare equal
  // and re-render without end (the same reason GoalPanel joins its rows)
  const availableJoined = useGameStore((s) => availableTechs(s.state).join(FIELD));
  const available = (availableJoined ? availableJoined.split(FIELD) : []) as TechName[];
  const unlocked = useGameStore(useShallow((s) => [...s.state.research.unlocked]));

  const cost = current ? TECHS[current].cost : 0;
  const resourceCost = current ? (TECHS[current].resourceCost ?? []) : [];
  // progress cannot start until the full resource cost has been delivered
  // (src/core/research.ts deskReadyToResearch), so "still at zero" is exactly
  // the signal that a delivery is outstanding
  const awaitingDelivery = resourceCost.length > 0 && progress === 0;

  return (
    <>
      {!hasDesk && <p className="muted small">{strings.researchNeedsDesk}</p>}

      <div className="research__block">
        <strong>{strings.researchCurrentLabel}</strong>
        {current ? (
          <>
            <div className="inspect__row">
              <dt>{strings.techLabels[current]}</dt>
              <dd>
                {awaitingDelivery
                  ? strings.researchAwaitingDelivery(
                      resourceCost
                        .map((r) => `${r.quantity} ${strings.resourceLabels[r.type]}`)
                        .join(', '),
                    )
                  : strings.researchProgressLine(Math.floor(progress), cost)}
              </dd>
            </div>
            {!awaitingDelivery && (
              <span className="goal__bar">
                <span
                  className="goal__fill"
                  style={{ width: `${Math.min(100, (progress / cost) * 100)}%` }}
                />
              </span>
            )}
          </>
        ) : (
          <p className="muted small">{strings.researchNoneSelected}</p>
        )}
      </div>

      <div className="research__block">
        <strong>{strings.researchAvailableLabel}</strong>
        <ul className="goals">
          {available.map((tech) => (
            <li key={tech} className="goal">
              <button
                type="button"
                className="animals__find"
                title={strings.researchSelectTitle(strings.techLabels[tech])}
                onClick={() => setResearchCurrent(tech)}
              >
                {strings.techLabels[tech]}
              </button>
              <span className="muted small">
                {' '}
                — {strings.researchCostLine(TECHS[tech].cost)} — {unlocksText(strings, tech)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="research__block">
        <strong>{strings.researchUnlockedLabel}</strong>
        <p className="muted small">
          {unlocked.length === 0
            ? strings.researchNoneUnlocked
            : unlocked.map((t) => strings.techLabels[t]).join(', ')}
        </p>
      </div>
    </>
  );
}
