import { countStoredResource } from '../core/storage';
import { RESOURCE_TYPES } from '../core/constants';
import type { ResourceType } from '../core/types';
import { manaSummary } from '../core/mana';
import { getNetworks, useGameStore } from '../store/gameStore';
import { useResourceTotal } from './hooks';
import { icons } from './icons';
import { useStrings } from './language';

const RESOURCE_ICON: Record<ResourceType, string> = {
  wood: icons.wood,
  stone: icons.stone,
  food: icons.food,
  manaCrystal: icons.manaCrystal,
};


/**
 * The mana grids, one line each. Supply against demand is the whole phase-2
 * decision, so it is a number the player can read without clicking anything -
 * and a short grid says so in the colour the alerts use.
 */
function ManaGrids(): React.JSX.Element | null {
  const strings = useStrings();
  const summary = useGameStore((s) => {
    const { grids, supply, demand, short } = manaSummary(getNetworks(s.state));
    // flat values only: a fresh object here would re-render every frame
    return `${grids}:${supply}:${demand}:${short}`;
  });
  const [grids, supply, demand, short] = summary.split(':').map(Number);
  if (grids === 0) return null;
  return (
    <div className={`mana ${short > 0 ? 'mana--short' : ''}`}>
      <span className="mana__label">{strings.manaLabel}</span>
      <span className="mana__value">
        {supply} / {demand}
      </span>
      <span className="muted">
        {strings.manaGrids(grids)}
        {short > 0 ? ` · ${strings.manaShort(short)}` : ''}
      </span>
    </div>
  );
}

function ResourceRow({ type }: { type: ResourceType }): React.JSX.Element {
  const strings = useStrings();
  const total = useResourceTotal(type);
  const stored = useGameStore((s) => countStoredResource(s.state, type));
  return (
    <li className="resource">
      <img src={RESOURCE_ICON[type]} alt={strings.resourceLabels[type]} width={24} height={24} />
      <span className="resource__name">{strings.resourceLabels[type]}</span>
      <strong>{stored}</strong>
      <span className="muted small">{strings.storedTotal(total)}</span>
    </li>
  );
}

export function ResourcePanel(): React.JSX.Element {
  const strings = useStrings();
  return (
    <section className="panel">
      <h2>{strings.panelResources}</h2>
      <ul className="resources">
        {RESOURCE_TYPES.map((type) => (
          <ResourceRow key={type} type={type} />
        ))}
      </ul>
      <ManaGrids />
      <p className="muted small">{strings.resourceFootnote}</p>
    </section>
  );
}
