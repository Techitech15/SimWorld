// One frame for whatever creature is selected (docs/design-phase6-space.md
// 4.1, split further in 段階 U-1).
//
// This used to hold the tile panel too, but `selectedTileId` is not exclusive
// with the colonist/animal selection - clicking a colonist also selects the
// tile under it (handleSelectClick, src/render/renderer.ts) - so a colonist
// and its tile can be selected at the same time. Stacking all three in one
// box meant a selected colonist standing on notable ground pushed its own
// sheet off screen. `App.tsx` now renders this frame bottom-right and the
// tile panel bottom-left, so the two can show at once instead of fighting for
// the same corner. `ColonistDetail` and `AnimalDetail` stay together here
// because the store already keeps those two mutually exclusive.
import { AnimalDetail } from './AnimalDetail';
import { ColonistDetail } from './ColonistDetail';

export function SelectionFrame(): React.JSX.Element {
  // Each of the two renders null when it has nothing to say, so this is a
  // frame rather than a switch: whichever one has something in it is the one
  // that appears, and the exclusivity is enforced where selection happens
  // rather than re-stated here.
  return (
    <div className="selection-frame">
      <ColonistDetail />
      <AnimalDetail />
    </div>
  );
}
