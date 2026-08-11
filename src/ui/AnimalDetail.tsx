// The sheet for one animal, which keeps up with it.
//
// A creature walks. Selecting the tile it stood on when you clicked is stale
// within a second - measured across all six species, every one of them had left
// the tile before the panel rendered - so a moving target needs the same thing
// colonists already had: a selection that names the creature rather than the
// ground it was on.
import { useShallow } from 'zustand/react/shallow';
import { SPECIES } from '../core/constants';
import { isAdult, isPredator } from '../core/animals';
import type { AnimalId, GameState } from '../core/types';
import { useGameStore } from '../store/gameStore';
import { useStrings } from './language';
import type { Strings } from './strings';

export function describeAnimal(state: GameState, id: AnimalId | null, strings: Strings): string[] {
  if (!id) return [];
  const animal = state.animals[id];
  if (!animal) return [];
  const profile = SPECIES[animal.species];
  const rows: string[] = [];
  const add = (label: string, value: string) => rows.push(`${label}: ${value}`);

  add(strings.rowName, strings.animalName(animal.name, animal.species));
  add(
    strings.rowKind,
    strings.animalKinds[animal.tame ? 'tame' : isPredator(animal) ? 'predator' : 'wild'],
  );
  add(strings.rowWhere, `${animal.position.x}, ${animal.position.y}`);
  add(strings.rowDoing, strings.animalActivityLabels[animal.activity.kind]);
  add(strings.rowHealth, `${Math.round(animal.health)} / ${profile.maxHealth}`);
  add(strings.rowHunger, `${Math.round(animal.hunger)} / 100`);
  if (!isAdult(state, animal)) add(strings.rowAge, strings.ageYoung);
  if (animal.gestationUntilTick !== null) add(strings.rowAge, strings.agePregnant);
  if (animal.designation) add(strings.rowOrder, strings.designationLabels[animal.designation]);
  if (animal.tame && profile.produceAmount > 0) {
    add(strings.rowGives, strings.givesLine(profile.produceAmount, profile.produceIntervalTicks));
  }
  add(strings.rowButchers, strings.butchersLine(profile.foodYield));
  return rows;
}

export function AnimalDetail(): React.JSX.Element | null {
  const strings = useStrings();
  const rows = useGameStore(
    useShallow((s) => describeAnimal(s.state, s.selectedAnimalId, strings)),
  );
  const select = useGameStore((s) => s.selectAnimal);
  if (rows.length === 0) return null;

  return (
    <section className="panel">
      <h2>
        {strings.panelAnimal}
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
