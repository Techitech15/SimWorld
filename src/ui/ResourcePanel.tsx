import { countStoredResource } from '../core/storage';
import { RESOURCE_TYPES } from '../core/constants';
import type { ResourceType } from '../core/types';
import { useGameStore } from '../store/gameStore';
import { useResourceTotal } from './hooks';
import { icons } from './icons';

const RESOURCE_ICON: Record<ResourceType, string> = {
  wood: icons.wood,
  stone: icons.stone,
  food: icons.food,
};

function ResourceRow({ type }: { type: ResourceType }): React.JSX.Element {
  const total = useResourceTotal(type);
  const stored = useGameStore((s) => countStoredResource(s.state, type));
  return (
    <li className="resource">
      <img src={RESOURCE_ICON[type]} alt={type} width={24} height={24} />
      <span className="resource__name">{type}</span>
      <strong>{stored}</strong>
      <span className="muted small">/ {total} total</span>
    </li>
  );
}

export function ResourcePanel(): React.JSX.Element {
  return (
    <section className="panel">
      <h2>Resources</h2>
      <ul className="resources">
        {RESOURCE_TYPES.map((type) => (
          <ResourceRow key={type} type={type} />
        ))}
      </ul>
      <p className="muted small">Bold = in a storage zone, total includes loose stacks.</p>
    </section>
  );
}
