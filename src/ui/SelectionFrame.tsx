// One frame for whatever is selected (docs/design-phase6-space.md 4.1).
//
// The tile, colonist and animal details were three independent panels stacked
// in the sidebar, and the store already guarantees they are mutually exclusive:
// `selectColonist` clears the selected animal and `selectAnimal` clears the
// selected colonist. Three boxes that can never be filled at the same time is
// three boxes' worth of vertical space spent on one.
import { AnimalDetail } from './AnimalDetail';
import { ColonistDetail } from './ColonistDetail';
import { SelectionPanel } from './SelectionPanel';

export function SelectionFrame(): React.JSX.Element {
  // Each of the three renders null when it has nothing to say, so this is a
  // frame rather than a switch: whichever one has something in it is the one
  // that appears, and the exclusivity is enforced where selection happens
  // rather than re-stated here.
  return (
    <div className="selection-frame">
      <ColonistDetail />
      <AnimalDetail />
      <SelectionPanel />
    </div>
  );
}
