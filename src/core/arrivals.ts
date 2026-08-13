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
import { recordChronicle } from './chronicle';
import { isWalkable } from './pathfinding';
import { mulberry32 } from './rng';
import { seasonOf } from './season';
import { addLog, tileIdOf } from './state';
import { tribalInfluence } from './tribes';
import type { GameState, Vector2 } from './types';
import { addColonist } from './worldgen';

/**
 * How often a newcomer who says so mentions Waldkin country (11章 段階C,
 * design-phase11-worldmap.md 4.1章: "移住者の多くは森歩きの出"). Independent
 * of the Waldkin-proximity interval lever below - this is flavour on the
 * arrival that already happened, not another effect of distance.
 */
const WALDKIN_ORIGIN_CHANCE = 0.4;

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
  // Waldkin proximity shortens the interval (11章 段階C, design-phase11-worldmap.md
  // 7章: 3日 → 2日); everywhere else this is exactly ARRIVAL_INTERVAL_TICKS.
  const interval = Math.round(ARRIVAL_INTERVAL_TICKS * tribalInfluence(state).waldkin.migrantIntervalMultiplier);
  if (state.tick === 0 || state.tick % interval !== 0) return;

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
  // seeded from the tick like every other roll here, so a reload gives the
  // same newcomer the same origin line
  const flavorRnd = mulberry32(state.worldSeed * 59 + state.tick + 260001);
  const mentionsWaldkin = flavorRnd() < WALDKIN_ORIGIN_CHANCE;
  const params = {
    name: arrival.name,
    ...(mentionsWaldkin ? { tribe: 'waldkin' } : {}),
  };
  addLog(state, 'colonistArrived', params);
  recordChronicle(state, 'colonistArrived', params); // a migrant's arrival (issue #28)
}
