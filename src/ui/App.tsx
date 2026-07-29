import { useEffect } from 'react';
import { startGameLoop } from '../game/loop';
import { AnimalPanel } from './AnimalPanel';
import { ColonistPanel } from './ColonistPanel';
import { EventLog } from './EventLog';
import { GameCanvas } from './GameCanvas';
import { ResourcePanel } from './ResourcePanel';
import { Toolbar } from './Toolbar';
import { TopBar } from './TopBar';
import { WorkPriorityTable } from './WorkPriorityTable';

export function App(): React.JSX.Element {
  useEffect(() => startGameLoop(), []);

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
