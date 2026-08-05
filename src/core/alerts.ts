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

  const starving = colonists.filter((c) => c.needs.hunger >= 100).length;
  if (starving > 0) {
    alerts.push({
      level: 'critical',
      message: `${starving} ${plural(starving, 'colonist is', 'colonists are')} starving`,
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

  const hurt = colonists.filter((c) => c.health < HURT_THRESHOLD).length;
  if (hurt > 0) {
    alerts.push({
      level: 'warning',
      message: `${hurt} ${plural(hurt, 'colonist is', 'colonists are')} badly hurt`,
    });
  }

  const centre = colonyCentre(state);
  if (centre) {
    const near = Object.values(state.animals).filter(
      (a) => isPredator(a) && manhattan(a.position, centre) <= PREDATOR_ALERT_DISTANCE,
    );
    if (near.length > 0) {
      const what = near.map((a) => SPECIES[a.species].label.toLowerCase()).join(', ');
      alerts.push({ level: 'warning', message: `Predator near the camp (${what})` });
    }
  }

  for (const zoneId in state.zones) {
    if (state.zones[zoneId].type !== 'pasture') continue;
    const herd = herdSize(state, zoneId);
    const capacity = pastureCapacity(state, zoneId);
    if (herd > capacity) {
      alerts.push({
        level: 'warning',
        message: `Pasture is over capacity (${herd}/${capacity}) — the grass cannot keep up`,
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
