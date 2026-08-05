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

  // one line per pen: a colony may keep several, each with its own capacity
  const pens = useGameStore(
    useShallow((s) =>
      Object.keys(s.state.zones)
        .filter((id) => s.state.zones[id].type === 'pasture')
        .sort()
        .map(
          (id) =>
            `${herdSize(s.state, id)}/${pastureCapacity(s.state, id)}/${
              s.state.zones[id].tileIds.length
            }`,
        ),
    ),
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
      {pens.length > 0 ? (
        pens.map((pen, index) => {
          const [herd, capacity, tiles] = pen.split('/').map(Number);
          return (
            <p className="muted small" key={`${pen}-${index}`}>
              Pasture {index + 1}: {herd}/{capacity} animals on {tiles} tiles
              {herd >= capacity ? ' — full, no new births' : ''}
            </p>
          );
        })
      ) : (
        <p className="muted small">No pasture yet: tamed animals need one to settle and breed.</p>
      )}
    </section>
  );
}
