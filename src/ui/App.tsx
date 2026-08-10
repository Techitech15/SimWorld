import { useEffect } from 'react';
import { startGameLoop } from '../game/loop';
import { AlertPanel } from './AlertPanel';
import { AnimalPanel } from './AnimalPanel';
import { ColonistPanel } from './ColonistPanel';
import { EventLog } from './EventLog';
import { Fold } from './Fold';
import { GameCanvas } from './GameCanvas';
import { GoalPanel } from './GoalPanel';
import { Minimap } from './Minimap';
import { TradePanel } from './TradePanel';
import { ResourcePanel } from './ResourcePanel';
import { SelectionFrame } from './SelectionFrame';
import { Toolbar } from './Toolbar';
import { TopBar } from './TopBar';
import { WorkPriorityTable } from './WorkPriorityTable';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useStrings } from './language';

/**
 * Three places for a panel to be (docs/design-phase6-space.md 4.2).
 *
 * The rule: what you want to see *all the time but only glance at* goes into a
 * corner of the map; what you *open and read* stays in the sidebar and can be
 * folded away. Eleven panels in one 300px column was neither.
 *
 * - **top-left overlay** — resources and alerts. Numbers and warnings are read
 *   out of the corner of the eye
 * - **top-right overlay** — the minimap. A map of the map, in a fixed place the
 *   eye learns
 * - **sidebar** — everything you open deliberately, each one foldable
 */
export function App(): React.JSX.Element {
  useEffect(() => startGameLoop(), []);
  useKeyboardShortcuts();
  const strings = useStrings();

  return (
    <div className="app">
      <TopBar />
      <div className="app__body">
        <aside className="sidebar sidebar--left">
          <Toolbar />
        </aside>
        <main className="app__viewport">
          <GameCanvas />
          <div className="overlay overlay--tl">
            <ResourcePanel />
            {/* renders nothing at all when there is no crisis, so the corner of
                the map is only spent while something is wrong */}
            <AlertPanel />
          </div>
          <div className="overlay overlay--tr">
            <Minimap />
          </div>
        </main>
        <aside className="sidebar sidebar--right">
          <SelectionFrame />
          <TradePanel />
          <GoalPanel />
          <Fold id="colonists" title={strings.panelColonists}>
            <ColonistPanel />
          </Fold>
          <Fold id="work" title={strings.panelWork}>
            <WorkPriorityTable />
          </Fold>
          <Fold id="animals" title={strings.panelAnimals}>
            <AnimalPanel />
          </Fold>
          <Fold id="log" title={strings.panelLog}>
            <EventLog />
          </Fold>
        </aside>
      </div>
    </div>
  );
}
