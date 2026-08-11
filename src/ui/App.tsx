import { useEffect } from 'react';
import { startGameLoop } from '../game/loop';
import { useGameStore } from '../store/gameStore';
import { wireSfx } from './soundPlayer';
import { AlertPanel } from './AlertPanel';
import { AnimalPanel } from './AnimalPanel';
import { ColonistPanel } from './ColonistPanel';
import { EventLog } from './EventLog';
import { Fold } from './Fold';
import { GameCanvas } from './GameCanvas';
import { GoalPanel } from './GoalPanel';
import { Minimap } from './Minimap';
import { ResearchPanel } from './ResearchPanel';
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
 * - **bottom-left overlay** — whatever is selected, near where it was selected
 *   (13章 段階B: フェーズ6の「目は地図、答えは右端」の完了形)
 * - **sidebar** — the whole-colony views, each one foldable
 *
 * The corner overlays fold too (13章 段階B), with one deliberate exception:
 * alerts never fold, so a crisis cannot be hidden behind a closed chip.
 */
export function App(): React.JSX.Element {
  useEffect(() => startGameLoop(), []);
  // sound is wired here rather than inside the loop: the player can place
  // blueprints while paused, and those clicks come from store changes, not ticks
  useEffect(() => wireSfx(), []);
  useKeyboardShortcuts();
  const strings = useStrings();
  const hasSelection = useGameStore(
    (s) => s.selectedColonistId !== null || s.selectedAnimalId !== null || s.selectedTileId !== null,
  );

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
            <Fold id="resources" title={strings.panelResources}>
              <ResourcePanel />
            </Fold>
            {/* renders nothing at all when there is no crisis, so the corner of
                the map is only spent while something is wrong - and it is never
                inside a Fold, so a crisis cannot be folded out of sight */}
            <AlertPanel />
          </div>
          <div className="overlay overlay--tr">
            <Fold id="map" title={strings.panelMap}>
              <Minimap />
            </Fold>
          </div>
          {/* nothing selected, nothing rendered: an empty frame would spend the
              corner on a chip that says "selection: none" */}
          {hasSelection ? (
            <div className="overlay overlay--bl">
              <Fold id="selection" title={strings.panelSelection}>
                <SelectionFrame />
              </Fold>
            </div>
          ) : null}
        </main>
        <aside className="sidebar sidebar--right">
          <TradePanel />
          <GoalPanel />
          <Fold id="colonists" title={strings.panelColonists}>
            <ColonistPanel />
          </Fold>
          <Fold id="work" title={strings.panelWork}>
            <WorkPriorityTable />
          </Fold>
          <Fold id="research" title={strings.panelResearch}>
            <ResearchPanel />
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
