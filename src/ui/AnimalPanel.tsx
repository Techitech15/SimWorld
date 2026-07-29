import { useShallow } from 'zustand/react/shallow';
import { ANIMAL_SPECIES, SPECIES } from '../core/constants';
import { herdSize, pastureCapacity } from '../core/animals';
import { useGameStore } from '../store/gameStore';

/**
 * The herd at a glance: what is out there, what is yours, and whether the
 * pasture is at capacity (docs/design-animals.md 4).
 *
 * Both selectors return flat records of numbers on purpose. `useShallow`
 * compares the returned value one property deep, so a selector that builds
 * fresh nested objects (a row array, say) never compares equal and re-renders
 * without end.
 */
export function AnimalPanel(): React.JSX.Element | null {
  const counts = useGameStore(
    useShallow((s) => {
      const flat: Record<string, number> = {};
      for (const id in s.state.animals) {
        const animal = s.state.animals[id];
        const bucket = animal.tame ? 'tame' : 'wild';
        flat[`${animal.species}.${bucket}`] = (flat[`${animal.species}.${bucket}`] ?? 0) + 1;
        if (animal.designation) {
          flat[`${animal.species}.marked`] = (flat[`${animal.species}.marked`] ?? 0) + 1;
        }
      }
      return flat;
    }),
  );

  const pasture = useGameStore(
    useShallow((s) => {
      const zoneId = Object.keys(s.state.zones).find((id) => s.state.zones[id].type === 'pasture');
      if (!zoneId) return {};
      return {
        herd: herdSize(s.state, zoneId),
        capacity: pastureCapacity(s.state, zoneId),
        tiles: s.state.zones[zoneId].tileIds.length,
      };
    }),
  );

  const species = ANIMAL_SPECIES.filter(
    (name) => (counts[`${name}.wild`] ?? 0) + (counts[`${name}.tame`] ?? 0) > 0,
  );
  if (species.length === 0) return null;

  return (
    <section className="panel">
      <h2>Animals</h2>
      <table className="work">
        <thead>
          <tr>
            <th />
            <th title="wild">Wild</th>
            <th title="tamed">Tame</th>
            <th title="marked for hunting, taming or slaughter">Marked</th>
          </tr>
        </thead>
        <tbody>
          {species.map((name) => (
            <tr key={name}>
              <th scope="row">{SPECIES[name].label}</th>
              <td>{counts[`${name}.wild`] ?? 0}</td>
              <td>{counts[`${name}.tame`] ?? 0}</td>
              <td>{counts[`${name}.marked`] || '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {pasture.capacity !== undefined ? (
        <p className="muted small">
          Pasture: {pasture.herd}/{pasture.capacity} animals on {pasture.tiles} tiles
          {pasture.herd! >= pasture.capacity ? ' — full, no new births' : ''}
        </p>
      ) : (
        <p className="muted small">No pasture yet: tamed animals need one to settle and breed.</p>
      )}
    </section>
  );
}
