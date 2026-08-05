// Alerts: the handful of conditions a player must not miss.
//
// Everything here is derived from the state on read, like the inspection panel.
// The event log already records what *happened*; this answers the different
// question of what is wrong *right now*, which a scrolling log is bad at - a
// starvation warning from four hundred ticks ago looks identical to a current
// one once it has scrolled.
import { COLONIST_MAX_HEALTH, SPECIES } from './constants';
import { herdSize, isPredator, pastureCapacity } from './animals';
import { manhattan } from './state';
import {
  CROP_GROWTH_BY_SEASON,
  DAYS_PER_SEASON,
  SEASON_LABEL,
  dayOfSeason,
  seasonOf,
} from './season';
import type { GameState, Vector2 } from './types';

export type AlertLevel = 'critical' | 'warning' | 'info';

export interface Alert {
  level: AlertLevel;
  message: string;
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

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function collectAlerts(state: GameState): Alert[] {
  const alerts: Alert[] = [];
  const colonists = Object.values(state.colonists);

  if (colonists.length === 0) {
    return [{ level: 'critical', message: 'The colony has died out.' }];
  }

  const starvingColonists = colonists.filter((c) => c.needs.hunger >= 100);
  if (starvingColonists.length > 0) {
    const count = starvingColonists.length;
    alerts.push({
      level: 'critical',
      message: `${count} ${plural(count, 'colonist is', 'colonists are')} starving`,
      at: { ...starvingColonists[0].position },
    });
  }

  const food = Object.values(state.items)
    .filter((item) => item.type === 'food')
    .reduce((sum, item) => sum + item.quantity, 0);
  if (food === 0) {
    alerts.push({ level: 'critical', message: 'No food anywhere in the colony' });
  } else if (food < colonists.length * 30) {
    alerts.push({ level: 'warning', message: `Food is running low (${food})` });
  }

  const hurt = colonists.filter((c) => c.health < HURT_THRESHOLD);
  if (hurt.length > 0) {
    alerts.push({
      level: 'warning',
      message: `${hurt.length} ${plural(hurt.length, 'colonist is', 'colonists are')} badly hurt`,
      at: { ...hurt[0].position },
    });
  }

  const centre = colonyCentre(state);
  if (centre) {
    const near = Object.values(state.animals).filter(
      (a) => isPredator(a) && manhattan(a.position, centre) <= PREDATOR_ALERT_DISTANCE,
    );
    if (near.length > 0) {
      const what = near.map((a) => SPECIES[a.species].label.toLowerCase()).join(', ');
      alerts.push({
        level: 'warning',
        message: `Predator near the camp (${what})`,
        at: { ...near[0].position },
      });
    }
  }

  // a blueprint waiting on a resource the colony has none of will sit there for
  // ever, and the queue counter in the top bar looks the same either way
  const stalled = new Set<string>();
  for (const id in state.buildings) {
    const building = state.buildings[id];
    if (!building.isBlueprint) continue;
    for (const need of building.requiredResources) {
      if (need.quantity <= 0) continue;
      const available = Object.values(state.items)
        .filter((item) => item.type === need.type)
        .reduce((sum, item) => sum + item.quantity, 0);
      if (available <= 0) stalled.add(need.type);
    }
  }
  if (stalled.size > 0) {
    alerts.push({
      level: 'warning',
      message: `Building work is stalled: no ${[...stalled].sort().join(' or ')} left`,
    });
  }

  const hungryLivestock = Object.values(state.animals).filter((a) => a.tame && a.hunger >= 95);
  if (hungryLivestock.length > 0) {
    const count = hungryLivestock.length;
    alerts.push({
      level: 'warning',
      message: `${count} ${plural(count, 'animal is', 'animals are')} starving — the pasture has nothing left`,
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
        message: `Pasture is over capacity (${herd}/${capacity}) — the grass cannot keep up`,
        at: firstTile ? { x: firstTile.x, y: firstTile.y } : undefined,
      });
    }
  }

  const season = seasonOf(state.tick);
  if (CROP_GROWTH_BY_SEASON[season] <= 0) {
    alerts.push({ level: 'info', message: `${SEASON_LABEL[season]}: nothing is growing` });
  } else if (season === 'autumn' && dayOfSeason(state.tick) >= DAYS_PER_SEASON - 1) {
    alerts.push({ level: 'info', message: 'Winter is close — stock up on food' });
  }

  return alerts;
}
