import { useShallow } from 'zustand/react/shallow';
import { BUILDING_COSTS, SPECIES } from '../core/constants';
import { isAdult, isPredator } from '../core/animals';
import type { BuildingType, GameState, TerrainType } from '../core/types';
import { useGameStore } from '../store/gameStore';

const TERRAIN_LABEL: Record<TerrainType, string> = {
  grass: 'Grass',
  forest: 'Forest',
  stone: 'Rock face',
};

const BUILDING_LABEL: Record<BuildingType, string> = {
  wall: 'Wooden wall',
  stoneWall: 'Stone wall',
  floor: 'Wooden floor',
  stoneFloor: 'Flagstone floor',
  door: 'Door',
  bed: 'Bed',
  farmPlot: 'Farm plot',
  storageZoneMarker: 'Storage marker',
};

const DESIGNATION_LABEL: Record<string, string> = {
  chop: 'marked for chopping',
  mine: 'marked for mining',
  deconstruct: 'marked for dismantling',
  hunt: 'marked for hunting',
  tame: 'marked for taming',
  slaughter: 'marked for slaughter',
};

/**
 * What is standing on the clicked tile. Everything is derived here rather than
 * stored, so the panel always agrees with the simulation.
 *
 * The selector returns one flat array of label/value strings on purpose:
 * `useShallow` only compares one level deep, so a selector that rebuilt nested
 * objects every tick would re-render without end (the bug this panel's sibling
 * AnimalPanel had).
 */
export function describeTile(state: GameState, tileId: string | null): string[] {
  if (!tileId) return [];
  const tile = state.tiles[tileId];
  if (!tile) return [];
  const rows: string[] = [];
  // one flat string per row keeps the selector shallow-comparable
  const add = (label: string, value: string) => rows.push(`${label}: ${value}`);

  add('Tile', `${tile.x}, ${tile.y}`);
  add('Terrain', TERRAIN_LABEL[tile.terrain] + (tile.walkable ? '' : ' (impassable)'));
  if (tile.terrain === 'grass') add('Forage', `${Math.round(tile.forage * 100)}%`);
  if (tile.designation) add('Order', DESIGNATION_LABEL[tile.designation] ?? tile.designation);

  const zone = Object.values(state.zones).find((z) => z.tileIds.includes(tileId));
  if (zone) add('Zone', zone.type === 'storage' ? 'Storage' : 'Pasture');

  const building = tile.buildingId ? state.buildings[tile.buildingId] : undefined;
  if (building) {
    add('Building', BUILDING_LABEL[building.type] ?? building.type);
    if (building.isBlueprint) {
      const missing = building.requiredResources.filter((r) => r.quantity > 0);
      add(
        'Status',
        missing.length > 0
          ? `waiting for ${missing.map((r) => `${r.quantity} ${r.type}`).join(', ')}`
          : 'materials delivered, waiting for a builder',
      );
      const cost = BUILDING_COSTS[building.type];
      if (cost.length > 0) add('Cost', cost.map((r) => `${r.quantity} ${r.type}`).join(', '));
    } else {
      add('Condition', `${Math.round(building.hpCurrent)} / ${building.hpMax} hp`);
      if (building.type === 'farmPlot') {
        add(
          'Crop',
          !building.sown
            ? 'not sown'
            : building.growth >= 1
              ? 'ready to harvest'
              : `growing (${Math.round(building.growth * 100)}%)`,
        );
      }
    }
  }

  for (const itemId of tile.itemIds) {
    const item = state.items[itemId];
    if (item) add('Items', `${item.quantity} ${item.type}${item.reservedByJobId ? ' (claimed)' : ''}`);
  }

  for (const id in state.animals) {
    const animal = state.animals[id];
    if (animal.position.x !== tile.x || animal.position.y !== tile.y) continue;
    const profile = SPECIES[animal.species];
    const kind = animal.tame ? 'tame' : isPredator(animal) ? 'predator' : 'wild';
    add('Animal', `${animal.name} — ${profile.label} (${kind})`);
    add('Condition', `${Math.round(animal.health)} / ${profile.maxHealth} hp`);
    add('Hunger', `${Math.round(animal.hunger)} / 100`);
    add('Doing', animal.activity.kind);
    if (!isAdult(state, animal)) add('Age', 'young');
    if (animal.gestationUntilTick !== null) add('Age', 'pregnant');
    if (animal.designation) add('Order', DESIGNATION_LABEL[animal.designation] ?? animal.designation);
  }

  for (const id in state.colonists) {
    const colonist = state.colonists[id];
    if (colonist.position.x !== tile.x || colonist.position.y !== tile.y) continue;
    add('Colonist', colonist.name);
  }

  return rows;
}

export function SelectionPanel(): React.JSX.Element | null {
  const rows = useGameStore(useShallow((s) => describeTile(s.state, s.selectedTileId)));
  const clear = useGameStore((s) => s.selectTile);
  if (rows.length === 0) return null;

  return (
    <section className="panel">
      <h2>
        Selection
        <button type="button" className="panel__clear" onClick={() => clear(null)} title="clear">
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
