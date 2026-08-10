import { useShallow } from 'zustand/react/shallow';
import { ANIMAL_SPECIES } from '../core/constants';
import { herdSize, nearestOfSpecies, pastureCapacity } from '../core/animals';
import type { AnimalSpecies } from '../core/types';
import { useGameStore } from '../store/gameStore';
import { useStrings } from './language';

/**
 * The herd at a glance: what is out there, what is yours, and whether the
 * pasture is at capacity (docs/design-phase2.5-animals.md 4).
 *
 * Both selectors return flat records of numbers on purpose. `useShallow`
 * compares the returned value one property deep, so a selector that builds
 * fresh nested objects (a row array, say) never compares equal and re-renders
 * without end.
 */
export function AnimalPanel(): React.JSX.Element | null {
  const strings = useStrings();
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

  const focusOnTile = useGameStore((s) => s.focusOnTile);
  const selectTile = useGameStore((s) => s.selectTile);
  const selectAnimal = useGameStore((s) => s.selectAnimal);
  const setStatus = useGameStore((s) => s.setStatus);
  /**
   * Take the camera to one of them. Reads the state at click time rather than
   * subscribing to it: the panel must not re-render every tick because an
   * animal moved.
   */
  const findOne = (name: AnimalSpecies) => {
    const state = useGameStore.getState().state;
    const centre = Object.values(state.colonists)[0]?.position ?? { x: 30, y: 30 };
    const animal = nearestOfSpecies(state, name, centre);
    if (!animal) {
      setStatus({ key: 'speciesNone', params: { species: name } });
      return;
    }
    focusOnTile({ ...animal.position });
    selectAnimal(animal.id);
    selectTile(null);
    // Naming it matters because the target walks. Selecting the tile it stood
    // on at click time is right for about half of them and stale for the rest -
    // measured, three of five species landed on the animal and two on an empty
    // tile it had already left. The camera is in the right place either way, so
    // saying which creature to look for is what closes the gap.
    setStatus({
      key: 'speciesFound',
      params: { name: animal.name, species: name, x: animal.position.x, y: animal.position.y },
    });
  };

  const species = ANIMAL_SPECIES.filter(
    (name) => (counts[`${name}.wild`] ?? 0) + (counts[`${name}.tame`] ?? 0) > 0,
  );
  if (species.length === 0) return null;

  return (
    <section className="panel">
      <h2>{strings.panelAnimals}</h2>
      <table className="work">
        <thead>
          <tr>
            <th />
            <th title={strings.colWildTitle}>{strings.colWild}</th>
            <th title={strings.colTameTitle}>{strings.colTame}</th>
            <th title={strings.colMarkedTitle}>{strings.colMarked}</th>
          </tr>
        </thead>
        <tbody>
          {species.map((name) => (
            <tr key={name}>
              <th scope="row">
                <button
                  type="button"
                  className="animals__find"
                  title={strings.findTitle(name)}
                  onClick={() => findOne(name)}
                >
                  {strings.speciesLabels[name]}
                </button>
              </th>
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
              {strings.pastureLine(index + 1, herd, capacity, tiles)}
              {herd >= capacity ? strings.pastureFullSuffix : ''}
            </p>
          );
        })
      ) : (
        <p className="muted small">{strings.noPasture}</p>
      )}
    </section>
  );
}
