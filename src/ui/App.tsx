import { useEffect } from 'react';
import { startGameLoop } from '../game/loop';
import { AlertPanel } from './AlertPanel';
import { AnimalDetail } from './AnimalDetail';
import { AnimalPanel } from './AnimalPanel';
import { ColonistDetail } from './ColonistDetail';
import { ColonistPanel } from './ColonistPanel';
import { EventLog } from './EventLog';
import { GameCanvas } from './GameCanvas';
import { GoalPanel } from './GoalPanel';
import { Minimap } from './Minimap';
import { ResourcePanel } from './ResourcePanel';
import { SelectionPanel } from './SelectionPanel';
import { Toolbar } from './Toolbar';
import { TopBar } from './TopBar';
import { WorkPriorityTable } from './WorkPriorityTable';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

export function App(): React.JSX.Element {
  useEffect(() => startGameLoop(), []);
  useKeyboardShortcuts();

  return (
    <div className="app">
      <TopBar />
      <div className="app__body">
        <aside className="sidebar sidebar--left">
          <Toolbar />
        </aside>
        <main className="app__viewport">
          <GameCanvas />
        </main>
        <aside className="sidebar sidebar--right">
          <Minimap />
          <AlertPanel />
          <GoalPanel />
          <SelectionPanel />
          <ColonistDetail />
          <AnimalDetail />
          <ColonistPanel />
          <WorkPriorityTable />
          <ResourcePanel />
          <AnimalPanel />
          <EventLog />
        </aside>
      </div>
    </div>
  );
}
