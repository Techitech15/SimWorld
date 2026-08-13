// Alerts: the handful of conditions a player must not miss.
//
// Everything here is derived from the state on read, like the inspection panel.
// The event log already records what *happened*; this answers the different
// question of what is wrong *right now*, which a scrolling log is bad at - a
// starvation warning from four hundred ticks ago looks identical to a current
// one once it has scrolled.
import { COLONIST_MAX_HEALTH, RESOURCE_TYPES, TICKS_PER_HOUR } from './constants';
import { herdSize, isPredator, pastureCapacity } from './animals';
import { buildNetworks } from './mana';
import { manhattan, tileIdOf } from './state';
import { freeCapacity } from './storage';
import { CROP_GROWTH_BY_SEASON, DAYS_PER_SEASON, dayOfSeason, seasonOf } from './season';
import type { GameState, LogParams, ResourceType, Vector2 } from './types';

export type AlertLevel = 'critical' | 'warning' | 'info';

/**
 * What is wrong, as a key. Alerts are derived on every read, so the sentence is
 * composed at display time - which is also what lets a language switch
 * retranslate an alert that is already on screen (11章 フェーズ9).
 * List parameters (species, resources) are comma-joined ids; the dictionary
 * renders each id in its own language.
 */
export type AlertKey =
  | 'colonyDied'
  | 'colonistsStarving' // { count }
  | 'noFood'
  | 'foodLow' // { food }
  | 'colonistsHurt' // { count }
  | 'colonistsIll' // { count } (フェーズ14 段階 M-1)
  | 'raidWarning' // { count, hours } (段階 R-1, issue #29)
  | 'predatorNear' // { species }
  | 'nowhereToStore' // { resources }
  | 'storageFull'
  | 'buildingDamaged' // { building, percent }
  | 'buildingsDamaged' // { count, percent }
  | 'buildingStalled' // { resources }
  | 'bedsShort' // { count }
  | 'livestockStarving' // { count }
  | 'pastureOverCapacity' // { herd, capacity }
  | 'jobsAbandoned' // { count }
  | 'nothingGrows' // { season }
  | 'winterClose'
  // [ext] design-next 提案2: the grid going dark is the "one visible fact" the
  // all-or-nothing fuse was designed around, and it never reached this strip.
  | 'furnaceEmpty' // { count }
  | 'gridDown'; // { count }

export interface Alert {
  level: AlertLevel;
  key: AlertKey;
  params?: LogParams;
  /** where on the map the problem is, when there is a single place to look */
  at?: Vector2;
}

/** How close a predator has to be to the camp before it is worth saying so. */
export const PREDATOR_ALERT_DISTANCE = 12;
const HURT_THRESHOLD = COLONIST_MAX_HEALTH * 0.5;

function colonyCentre(state: GameState): Vector2 | null {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const id in state.colonists) {
    sumX += state.colonists[id].position.x;
    sumY += state.colonists[id].position.y;
    count++;
  }
  if (count === 0) return null;
  return { x: Math.round(sumX / count), y: Math.round(sumY / count) };
}

export function collectAlerts(state: GameState): Alert[] {
  const alerts: Alert[] = [];
  const colonists = Object.values(state.colonists);

  if (colonists.length === 0) {
    return [{ level: 'critical', key: 'colonyDied' }];
  }

  const starvingColonists = colonists.filter((c) => c.needs.hunger >= 100);
  if (starvingColonists.length > 0) {
    const count = starvingColonists.length;
    alerts.push({
      level: 'critical',
      key: 'colonistsStarving',
      params: { count },
      at: { ...starvingColonists[0].position },
    });
  }

  // This runs on every render, so both passes below are indexed rather than
  // nested: one pass over the zones to learn what each tile takes, then one
  // pass over the items. Asking `acceptsHere` per item would re-scan every zone
  // a few hundred times a frame.
  const accepts = new Map<string, ResourceType[]>();
  for (const zoneId in state.zones) {
    const zone = state.zones[zoneId];
    for (const tileId of zone.tileIds) accepts.set(tileId, zone.accepts);
  }

  const stock: Partial<Record<ResourceType, number>> = {};
  const loose: Partial<Record<ResourceType, number>> = {};
  for (const id in state.items) {
    const item = state.items[id];
    stock[item.type] = (stock[item.type] ?? 0) + item.quantity;
    const here = accepts.get(tileIdOf(item.position.x, item.position.y));
    if (!here?.includes(item.type)) {
      loose[item.type] = (loose[item.type] ?? 0) + item.quantity;
    }
  }

  const food = stock.food ?? 0;
  if (food === 0) {
    alerts.push({ level: 'critical', key: 'noFood' });
  } else if (food < colonists.length * 30) {
    alerts.push({ level: 'warning', key: 'foodLow', params: { food } });
  }

  const hurt = colonists.filter((c) => c.health < HURT_THRESHOLD);
  if (hurt.length > 0) {
    alerts.push({
      level: 'warning',
      key: 'colonistsHurt',
      params: { count: hurt.length },
      at: { ...hurt[0].position },
    });
  }

  // Illness (フェーズ14 段階 M-1). Not optional (design doc 5.4, CLAUDE.md's
  // "プレイヤーに見えない失敗"): it is a change that shows up nowhere else
  // unless the player opens the colonist sheet, so it gets the one alert every
  // other silently-worsening condition already has.
  const ill = colonists.filter((c) => (c.illnessTicks ?? 0) > 0);
  if (ill.length > 0) {
    alerts.push({
      level: 'warning',
      key: 'colonistsIll',
      params: { count: ill.length },
      at: { ...ill[0].position },
    });
  }

  // A raid has been rolled but has not arrived yet (段階 R-1, issue #29).
  // `warning`, not `critical`: nothing has actually happened to the colony
  // yet, and `critical` is reserved for a crisis already in progress (an
  // empty larder, a starving colonist) - the level the game loop's auto-pause
  // watches for (src/game/loop.ts). A raid still on its way must not stop the
  // clock the way the raid itself, once it is actually hurting somebody,
  // already does through `colonistsHurt`/`colonistsStarving` above.
  if (state.pendingRaid) {
    const hours = Math.max(0, Math.round((state.pendingRaid.atTick - state.tick) / TICKS_PER_HOUR));
    alerts.push({
      level: 'warning',
      key: 'raidWarning',
      params: { count: state.pendingRaid.size, hours },
    });
  }

  const centre = colonyCentre(state);
  if (centre) {
    const near = Object.values(state.animals).filter(
      (a) => isPredator(a) && manhattan(a.position, centre) <= PREDATOR_ALERT_DISTANCE,
    );
    if (near.length > 0) {
      const what = near.map((a) => a.species).join(',');
      alerts.push({
        level: 'warning',
        key: 'predatorNear',
        params: { species: what },
        at: { ...near[0].position },
      });
    }
  }

  // A full larder is silent: the haulers simply stop finding anywhere to put
  // things, and the stacks sit where they were dropped with no explanation. A
  // year of the default colony ends within a few units of filling its starting
  // store, so this is a wall the player meets rather than a theoretical one.
  // room per resource, in the same single pass: a tile holding a full stack of
  // something else is no use to a resource that needs a home
  const room: Partial<Record<ResourceType, boolean>> = {};
  let freeTiles = 0;
  let zoneTiles = 0;
  for (const zoneId in state.zones) {
    const zone = state.zones[zoneId];
    if (zone.type !== 'storage') continue;
    for (const tileId of zone.tileIds) {
      zoneTiles++;
      let hasRoom = false;
      for (const type of zone.accepts) {
        if (freeCapacity(state, tileId, type) <= 0) continue;
        room[type] = true;
        hasRoom = true;
      }
      if (hasRoom) freeTiles++;
    }
  }
  const homeless = RESOURCE_TYPES.filter((type) => (loose[type] ?? 0) > 0 && !room[type]);
  if (homeless.length > 0) {
    alerts.push({
      level: 'warning',
      key: 'nowhereToStore',
      params: { resources: homeless.sort().join(',') },
    });
  } else if (zoneTiles > 0 && freeTiles === 0) {
    alerts.push({ level: 'info', key: 'storageFull' });
  }

  // Something is chewing on the fence. A repair job is generated automatically,
  // but the player still wants to know - a door coming down is how a pen full
  // of livestock stops being a pen.
  let worst: { id: string; fraction: number } | null = null;
  let damagedCount = 0;
  for (const id in state.buildings) {
    const building = state.buildings[id];
    if (building.isBlueprint || building.hpCurrent >= building.hpMax) continue;
    damagedCount++;
    const fraction = building.hpCurrent / building.hpMax;
    if (!worst || fraction < worst.fraction) worst = { id, fraction };
  }
  if (worst) {
    const building = state.buildings[worst.id];
    const tile = state.tiles[building.tileId];
    const percent = Math.round(worst.fraction * 100);
    alerts.push({
      level: worst.fraction < 0.4 ? 'critical' : 'warning',
      key: damagedCount === 1 ? 'buildingDamaged' : 'buildingsDamaged',
      params:
        damagedCount === 1
          ? { building: building.type, percent }
          : { count: damagedCount, percent },
      at: tile ? { x: tile.x, y: tile.y } : undefined,
    });
  }

  // a blueprint waiting on a resource the colony has none of will sit there for
  // ever, and the queue counter in the top bar looks the same either way
  const stalled = new Set<string>();
  for (const id in state.buildings) {
    const building = state.buildings[id];
    if (!building.isBlueprint) continue;
    for (const need of building.requiredResources) {
      if (need.quantity <= 0) continue;
      if ((stock[need.type] ?? 0) <= 0) stalled.add(need.type);
    }
  }
  if (stalled.size > 0) {
    alerts.push({
      level: 'warning',
      key: 'buildingStalled',
      params: { resources: [...stalled].sort().join(',') },
    });
  }

  let beds = 0;
  for (const id in state.buildings) {
    const building = state.buildings[id];
    if (building.type === 'bed' && !building.isBlueprint) beds++;
  }
  if (beds < colonists.length) {
    const short = colonists.length - beds;
    alerts.push({ level: 'info', key: 'bedsShort', params: { count: short } });
  }

  const hungryLivestock = Object.values(state.animals).filter((a) => a.tame && a.hunger >= 95);
  if (hungryLivestock.length > 0) {
    const count = hungryLivestock.length;
    alerts.push({
      level: 'warning',
      key: 'livestockStarving',
      params: { count },
      at: { ...hungryLivestock[0].position },
    });
  }

  for (const zoneId in state.zones) {
    if (state.zones[zoneId].type !== 'pasture') continue;
    const herd = herdSize(state, zoneId);
    const capacity = pastureCapacity(state, zoneId);
    if (herd > capacity) {
      const firstTile = state.tiles[state.zones[zoneId].tileIds[0]];
      alerts.push({
        level: 'warning',
        key: 'pastureOverCapacity',
        params: { herd, capacity },
        at: firstTile ? { x: firstTile.x, y: firstTile.y } : undefined,
      });
    }
  }

  // a job the colony gave up on stays as a tombstone; the queue counter in the
  // top bar looks the same whether work is flowing or stuck behind a rock face
  const abandoned = Object.values(state.jobs).filter((job) => job.state === 'failed');
  if (abandoned.length > 0) {
    const where = abandoned[0].targetTileId ? state.tiles[abandoned[0].targetTileId] : undefined;
    alerts.push({
      level: 'warning',
      key: 'jobsAbandoned',
      params: { count: abandoned.length },
      at: where ? { x: where.x, y: where.y } : undefined,
    });
  }

  // A dark grid (design-next 提案2). One alert per problem, pointing at the
  // actionable cause: a grid with an unfuelled furnace is reported as the empty
  // furnace (haul crystal to it), and only a grid whose furnaces are all lit
  // and still short is reported as down (take something off the line). An idle
  // grid - demand zero - is `powered` by definition and stays silent.
  let emptyFurnaces = 0;
  let emptyAt: Vector2 | undefined;
  let downGrids = 0;
  let downAt: Vector2 | undefined;
  const networks = buildNetworks(state);
  for (const grid of networks.grids) {
    if (grid.powered) continue;
    const buildingsOnGrid = grid.buildingIds.map((id) => state.buildings[id]);
    const empty = buildingsOnGrid.find((b) => b.type === 'manaFurnace' && !(b.manaFuel > 0));
    const anchor = empty ?? buildingsOnGrid.find((b) => b.type === 'manaFurnace') ?? buildingsOnGrid[0];
    const tile = state.tiles[anchor.tileId];
    const at = tile ? { x: tile.x, y: tile.y } : undefined;
    if (empty) {
      emptyFurnaces++;
      emptyAt ??= at;
    } else {
      downGrids++;
      downAt ??= at;
    }
  }
  if (emptyFurnaces > 0) {
    alerts.push({ level: 'warning', key: 'furnaceEmpty', params: { count: emptyFurnaces }, at: emptyAt });
  }
  if (downGrids > 0) {
    alerts.push({ level: 'warning', key: 'gridDown', params: { count: downGrids }, at: downAt });
  }

  const season = seasonOf(state.tick);
  if (CROP_GROWTH_BY_SEASON[season] <= 0) {
    alerts.push({ level: 'info', key: 'nothingGrows', params: { season } });
  } else if (season === 'autumn' && dayOfSeason(state.tick) >= DAYS_PER_SEASON - 1) {
    alerts.push({ level: 'info', key: 'winterClose' });
  }

  return alerts;
}
