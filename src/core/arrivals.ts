// Wanderers joining the colony.
//
// This is the only way the population grows, and it is deliberately tied to the
// larder: a colony that is visibly feeding itself attracts people, one that is
// scraping by does not. That makes a food surplus worth something beyond not
// dying - it buys hands, and the hands then eat.
//
// Like the seasons this needs no saved state: the schedule is a function of the
// tick and the condition is a function of the stores.
import {
  ARRIVAL_FOOD_PER_COLONIST,
  ARRIVAL_INTERVAL_TICKS,
  ARRIVAL_MAX_COLONISTS,
} from './constants';
import { isWalkable } from './pathfinding';
import { seasonOf } from './season';
import { addLog, tileIdOf } from './state';
import type { GameState, Vector2 } from './types';
import { addColonist } from './worldgen';

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

/** A free walkable tile near the camp, searched outwards so they arrive close by. */
function arrivalSpot(state: GameState, camp: Vector2): Vector2 | null {
  for (let radius = 3; radius < 14; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (const dy of [radius - Math.abs(dx), -(radius - Math.abs(dx))]) {
        const x = camp.x + dx;
        const y = camp.y + dy;
        if (!isWalkable(state, x, y)) continue;
        const tile = state.tiles[tileIdOf(x, y)];
        if (tile.buildingId) continue;
        const taken = Object.values(state.colonists).some(
          (c) => c.position.x === x && c.position.y === y,
        );
        if (!taken) return { x, y };
      }
    }
  }
  return null;
}

export function runArrivals(state: GameState): void {
  if (state.tick === 0 || state.tick % ARRIVAL_INTERVAL_TICKS !== 0) return;

  const population = Object.keys(state.colonists).length;
  if (population === 0 || population >= ARRIVAL_MAX_COLONISTS) return;

  let food = 0;
  for (const id in state.items) {
    if (state.items[id].type === 'food') food += state.items[id].quantity;
  }
  // the newcomer counts: the stock has to cover the colony it is about to be
  if (food < (population + 1) * ARRIVAL_FOOD_PER_COLONIST) return;

  // nobody sets out across a frozen map, which also stops the population
  // growing in the one season the stores are falling
  if (seasonOf(state.tick) === 'winter') return;

  const camp = colonyCentre(state);
  if (!camp) return;
  const spot = arrivalSpot(state, camp);
  if (!spot) return;

  const arrival = addColonist(state, spot);
  addLog(state, `${arrival.name} arrived, drawn by the colony's stores`);
}
