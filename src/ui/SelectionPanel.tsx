import { useShallow } from 'zustand/react/shallow';
import { BUILDING_COSTS, RESOURCE_TYPES, SPECIES } from '../core/constants';
import { herdSize, isAdult, isPredator, pastureCapacity } from '../core/animals';
import { CROP_GROWTH_BY_SEASON, seasonOf } from '../core/season';
import type { GameState } from '../core/types';
import { useGameStore } from '../store/gameStore';
import { EQUIPMENT, EQUIPMENT_KINDS } from '../core/equipment';
import { useStrings } from './language';
import type { Strings } from './strings';

/**
 * What is standing on the clicked tile. Everything is derived here rather than
 * stored, so the panel always agrees with the simulation - and because it is
 * derived, the dictionary is applied at render time and a language switch
 * retranslates the whole panel.
 *
 * The selector returns one flat array of label/value strings on purpose:
 * `useShallow` only compares one level deep, so a selector that rebuilt nested
 * objects every tick would re-render without end (the bug this panel's sibling
 * AnimalPanel had).
 */
export function describeTile(state: GameState, tileId: string | null, strings: Strings): string[] {
  if (!tileId) return [];
  const tile = state.tiles[tileId];
  if (!tile) return [];
  const rows: string[] = [];
  // one flat string per row keeps the selector shallow-comparable
  const add = (label: string, value: string) => rows.push(`${label}: ${value}`);

  // the coordinates are the heading now (13章 段階B), not a row
  add(strings.rowSeason, strings.seasonLabels[seasonOf(state.tick)]);
  add(
    strings.rowTerrain,
    strings.terrainLabels[tile.terrain] + (tile.walkable ? '' : strings.impassableSuffix),
  );
  if (tile.terrain === 'grass') add(strings.rowForage, `${Math.round(tile.forage * 100)}%`);
  if (tile.designation) add(strings.rowOrder, strings.designationLabels[tile.designation]);

  const zone = Object.values(state.zones).find((z) => z.tileIds.includes(tileId));
  if (zone?.type === 'storage') {
    add(
      strings.rowZone,
      zone.accepts.length === RESOURCE_TYPES.length
        ? strings.zoneStorageAll(zone.tileIds.length)
        : zone.accepts.length === 0
          ? strings.zoneStorageNone(zone.tileIds.length)
          : strings.zoneStorageSome(strings.resourceList(zone.accepts), zone.tileIds.length),
    );
  }
  if (zone?.type === 'pasture') {
    // a colony may keep several pens, so say which one and how full it is
    add(
      strings.rowZone,
      strings.zonePasture(
        herdSize(state, zone.id),
        pastureCapacity(state, zone.id),
        zone.tileIds.length,
      ),
    );
  }

  const building = tile.buildingId ? state.buildings[tile.buildingId] : undefined;
  if (building) {
    add(strings.rowBuilding, strings.buildingLabels[building.type] ?? building.type);
    if (building.isBlueprint) {
      const missing = building.requiredResources.filter((r) => r.quantity > 0);
      add(
        strings.rowStatus,
        missing.length > 0
          ? strings.blueprintWaiting(strings.costList(missing))
          : strings.blueprintReady,
      );
      const cost = BUILDING_COSTS[building.type];
      if (cost.length > 0) add(strings.rowCost, strings.costList(cost));
    } else {
      add(strings.rowCondition, strings.conditionHp(Math.round(building.hpCurrent), building.hpMax));
      if (building.type === 'berryBush') {
        add(
          strings.rowBerries,
          building.growth >= 1
            ? strings.berriesRipe
            : strings.berriesRipening(Math.round(building.growth * 100)),
        );
      }
      if (building.type === 'herb') {
        add(
          strings.rowHerb,
          building.growth >= 1
            ? strings.herbReady
            : strings.herbGrowing(Math.round(building.growth * 100)),
        );
      }
      if (building.type === 'frostbloom') {
        // the one plant whose dormancy is every season but one, so it says which
        add(
          strings.rowBloom,
          building.growth >= 1
            ? strings.bloomInFlower
            : seasonOf(state.tick) === 'winter'
              ? strings.bloomOpening(Math.round(building.growth * 100))
              : strings.bloomDormant(Math.round(building.growth * 100)),
        );
      }
      if (building.type === 'farmPlot') {
        add(
          strings.rowCrop,
          !building.sown
            ? strings.cropNotSown
            : building.growth >= 1
              ? strings.cropReady
              : CROP_GROWTH_BY_SEASON[seasonOf(state.tick)] <= 0
                ? strings.cropDormant(Math.round(building.growth * 100))
                : strings.cropGrowing(Math.round(building.growth * 100)),
        );
      }
    }
  }

  for (const itemId of tile.itemIds) {
    const item = state.items[itemId];
    if (item) {
      add(
        strings.rowItems,
        strings.itemLine(item.quantity, item.type) +
          (item.variant === 'meal' ? strings.itemMealSuffix : '') +
          (item.reservedByJobId ? strings.itemClaimedSuffix : ''),
      );
    }
  }

  for (const id in state.animals) {
    const animal = state.animals[id];
    if (animal.position.x !== tile.x || animal.position.y !== tile.y) continue;
    const profile = SPECIES[animal.species];
    const kind = animal.tame ? 'tame' : isPredator(animal) ? 'predator' : 'wild';
    add(strings.rowAnimal, strings.animalLine(animal.name, animal.species, kind));
    add(strings.rowCondition, strings.conditionHp(Math.round(animal.health), profile.maxHealth));
    add(strings.rowHunger, `${Math.round(animal.hunger)} / 100`);
    add(strings.rowDoing, strings.animalActivityLabels[animal.activity.kind]);
    if (!isAdult(state, animal)) add(strings.rowAge, strings.ageYoung);
    if (animal.gestationUntilTick !== null) add(strings.rowAge, strings.agePregnant);
    if (animal.designation) add(strings.rowOrder, strings.designationLabels[animal.designation]);
  }

  for (const id in state.colonists) {
    const colonist = state.colonists[id];
    if (colonist.position.x !== tile.x || colonist.position.y !== tile.y) continue;
    add(strings.rowColonist, colonist.name);
  }

  return rows;
}

/**
 * What the selected storage zone takes. Narrowing it does not teleport the
 * wrong stacks out - they become haul work like anything else - so the toggles
 * are an order, not an edit.
 *
 * The selector returns the zone id and a flat "wood,food" string rather than
 * the zone object, for the same reason describeTile returns strings: a fresh
 * object every tick is a re-render every tick.
 */
function StorageFilters(): React.JSX.Element | null {
  const strings = useStrings();
  const [zoneId, accepted] = useGameStore(
    useShallow((s): [string | null, string] => {
      const tileId = s.selectedTileId;
      if (!tileId) return [null, ''];
      const zone = Object.values(s.state.zones).find(
        (z) => z.type === 'storage' && z.tileIds.includes(tileId),
      );
      return zone ? [zone.id, zone.accepts.join(',')] : [null, ''];
    }),
  );
  const setZoneAccepts = useGameStore((s) => s.setZoneAccepts);
  if (!zoneId) return null;

  const accepts = accepted.length > 0 ? accepted.split(',') : [];
  return (
    <div className="filters">
      <span className="filters__label">{strings.acceptsLabel}</span>
      {RESOURCE_TYPES.map((type) => {
        const on = accepts.includes(type);
        return (
          <button
            type="button"
            key={type}
            className={`filters__chip ${on ? 'filters__chip--on' : ''}`}
            onClick={() => setZoneAccepts(zoneId, type, !on)}
            title={on ? strings.acceptChipOn(type) : strings.acceptChipOff(type)}
          >
            {strings.resourceLabels[type]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The workbench's order buttons (フェーズ8 E-1): one per equipment kind, and a
 * line showing what is queued. Rendered only when the selected tile carries a
 * finished workbench - the meal batch needs no button, it runs itself.
 */
function WorkbenchOrders({ tileId }: { tileId: string }): React.JSX.Element | null {
  const strings = useStrings();
  const orderEquipment = useGameStore((s) => s.orderEquipment);
  const bench = useGameStore((s) => {
    const buildingId = s.state.tiles[tileId]?.buildingId;
    const building = buildingId ? s.state.buildings[buildingId] : undefined;
    return building && building.type === 'workbench' && !building.isBlueprint ? building : null;
  });
  const queue = useGameStore((s) => {
    const buildingId = s.state.tiles[tileId]?.buildingId;
    const building = buildingId ? s.state.buildings[buildingId] : undefined;
    return (building?.craftOrders ?? []).map((kind) => strings.equipmentLabels[kind]).join(', ');
  });
  if (!bench) return null;
  return (
    <div className="workbench-orders">
      {EQUIPMENT_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          title={costLine(strings, kind)}
          onClick={() => orderEquipment(bench.id, kind)}
        >
          {strings.orderEquipment(strings.equipmentLabels[kind])}
        </button>
      ))}
      {queue ? <p className="muted small">{strings.craftQueue(queue)}</p> : null}
    </div>
  );
}

function costLine(strings: Strings, kind: (typeof EQUIPMENT_KINDS)[number]): string {
  return EQUIPMENT[kind].cost
    .map((need) => `${strings.resourceLabels[need.type]} ${need.quantity}`)
    .join(' + ');
}

export function SelectionPanel(): React.JSX.Element | null {
  const strings = useStrings();
  const rows = useGameStore(useShallow((s) => describeTile(s.state, s.selectedTileId, strings)));
  const tileId = useGameStore((s) => s.selectedTileId);
  const clear = useGameStore((s) => s.selectTile);
  if (rows.length === 0 || !tileId) return null;
  const [x, y] = tileId.split(',').map(Number);

  return (
    <section className="panel">
      <h2>
        {strings.tileTitle(x, y)}
        <button
          type="button"
          className="panel__clear"
          onClick={() => clear(null)}
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
      <WorkbenchOrders tileId={tileId} />
      <StorageFilters />
    </section>
  );
}
