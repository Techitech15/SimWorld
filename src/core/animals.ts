// The ecology layer (docs/design-animals.md 4).
//
// Animals live outside the job system: they are not work the player schedules,
// they are creatures that graze, flee, hunt and breed on their own. The only
// place the two meet is the `hunt` / `handle` jobs, which reserve an animal
// through the normal reservation machinery (section 6 of the main document).
//
// Performance rule from section 7 of the design doc: the herd must never eat
// into the colonists' pathfinding budget. Wandering, fleeing and grazing are
// single-step decisions with no A* at all; only pursuit and heading home use a
// real path, and those are capped per tick by ANIMAL_PATH_BUDGET_PER_TICK.
import {
  ANIMAL_GRAZE_HUNGER_RESTORED,
  ANIMAL_GRAZE_THRESHOLD,
  ANIMAL_FODDER_HUNGER_RESTORED,
  ANIMAL_FODDER_PER_MEAL,
  ANIMAL_GRAZE_TICKS,
  ANIMAL_HUNGER_PER_TICK,
  ANIMAL_PATH_BUDGET_PER_TICK,
  ANIMAL_PATH_TTL_TICKS,
  ANIMAL_SPECIES,
  ANIMAL_STARVATION_DAMAGE_PER_TICK,
  BOAR_CHARGE_CHANCE_PER_TICK,
  BOAR_CHARGE_RANGE,
  BREEDING_CHANCE_PER_TICK,
  BREEDING_HUNGER_MAX,
  COLONIST_HEALTH_REGEN_PER_TICK,
  COLONIST_MAX_HEALTH,
  FLEE_DURATION_TICKS,
  FLEE_TRIGGER_DISTANCE,
  FORAGE_PER_GRAZE,
  FORAGE_REGROW_INTERVAL_TICKS,
  FORAGE_REGROW_PER_TICK,
  GESTATION_TICKS,
  MAP_HEIGHT,
  MAP_WIDTH,
  PASTURE_TILES_PER_ANIMAL,
  PREDATOR_BITE_DAMAGE,
  PREDATOR_BITE_INTERVAL_TICKS,
  PREDATOR_FIRST_SPAWN_TICK,
  PREDATOR_GIVE_UP_COOLDOWN_TICKS,
  PREDATOR_HUNGER_PER_KILL,
  PREDATOR_HUNT_THRESHOLD,
  PREDATOR_MIN_SPAWN_DISTANCE,
  PREDATOR_PURSUIT_TICKS,
  PREDATOR_RESPAWN_INTERVAL_TICKS,
  PREDATOR_RETREAT_HEALTH,
  PREDATOR_SIGHT_RANGE,
  SPECIES,
  WILDLIFE_MIN_SPAWN_DISTANCE,
  WILDLIFE_RESPAWN_INTERVAL_TICKS,
  PREDATOR_STRUCTURE_DAMAGE,
  PREDATOR_GNAW_INTERVAL_TICKS,
  BLOCKS_MOVEMENT,
} from './constants';
import { killColonist } from './death';
import { invalidateTile } from './derived';
import { invalidateNetworks, isManaBuilding } from './mana';
import type { SimContext } from './derived';
import { findPath, isWalkable, isWalkableByAnimal } from './pathfinding';
import { scaledCount, scenarioOf } from './scenario';
import { BREEDING_BY_SEASON, FORAGE_REGROW_BY_SEASON, seasonOf } from './season';
import { mulberry32 } from './rng';
import { traitMultiplier } from './traits';
import {
  addLog,
  manhattan,
  removeAnimal,
  removeItem,
  updateItem,
  tileIdOf,
  updateAnimal,
  updateBuilding,
  updateColonist,
  updateTile,
} from './state';
import { releaseByJob, releaseEntity } from './jobs/reservations';
import type { Animal, AnimalId, AnimalSpecies, GameState, Vector2 } from './types';
import { addItem, createAnimal, findSpawnTile } from './worldgen';

/** Deterministic per-tick randomness: the same save replays the same way. */
function tickRandom(state: GameState, salt: number): () => number {
  return mulberry32(state.tick * 7919 + salt);
}

export function isAdult(state: GameState, animal: Animal): boolean {
  return state.tick - animal.bornAtTick >= SPECIES[animal.species].adultAtTicks;
}

export function isPredator(animal: Animal): boolean {
  return SPECIES[animal.species].diet === 'carnivore';
}

// --- main entry point -------------------------------------------------------

export function runAnimals(state: GameState, ctx: SimContext): void {
  ctx.animalPathBudget = ANIMAL_PATH_BUDGET_PER_TICK;

  regrowForage(state, ctx);
  spawnPredators(state);
  spawnWildlife(state);

  for (const id in state.animals) {
    const animal = state.animals[id];
    if (!animal) continue;
    decayAnimalNeeds(state, id);
    if (!state.animals[id]) continue; // starved to death this tick
    runBehaviour(state, ctx, id);
    runBreeding(state, id);
    runProduction(state, id);
  }
}

/**
 * Grass regrows a full bar per day. Only tiles that were actually grazed are
 * touched (ctx.forageDepleted), so this stays far cheaper than sweeping all
 * 3,600 tiles every tick.
 */
function regrowForage(state: GameState, ctx: SimContext): void {
  if (state.tick % FORAGE_REGROW_INTERVAL_TICKS !== 0) return;
  if (ctx.forageDepleted.size === 0) return;
  const step =
    FORAGE_REGROW_PER_TICK *
    FORAGE_REGROW_INTERVAL_TICKS *
    FORAGE_REGROW_BY_SEASON[seasonOf(state.tick)];
  for (const tileId of [...ctx.forageDepleted]) {
    const tile = state.tiles[tileId];
    if (!tile || tile.terrain !== 'grass') {
      ctx.forageDepleted.delete(tileId);
      continue;
    }
    const forage = Math.min(1, tile.forage + step);
    updateTile(state, tileId, { forage });
    if (forage >= 1) ctx.forageDepleted.delete(tileId);
  }
}

function decayAnimalNeeds(state: GameState, id: AnimalId): void {
  const animal = state.animals[id];
  const hunger = Math.min(100, animal.hunger + ANIMAL_HUNGER_PER_TICK);
  let health = animal.health;
  if (hunger >= 100) health -= ANIMAL_STARVATION_DAMAGE_PER_TICK;
  updateAnimal(state, id, { hunger, health });
  if (health <= 0) killAnimal(state, id, 'starved', false);
}

// --- behaviour --------------------------------------------------------------

function runBehaviour(state: GameState, ctx: SimContext, id: AnimalId): void {
  const animal = state.animals[id];

  if (animal.activity.kind === 'fleeing') {
    if (state.tick >= animal.activity.untilTick) {
      updateAnimal(state, id, { activity: { kind: 'idle' } });
    } else {
      fleeFrom(state, id, animal.activity.fromAnimalId);
      return;
    }
  }

  // predators, and anything else already committed to a fight: a charging boar
  // uses exactly the same stalk-and-bite machinery
  if (
    isPredator(animal) ||
    animal.activity.kind === 'stalking' ||
    animal.activity.kind === 'attacking'
  ) {
    runPredator(state, ctx, id);
    return;
  }

  if (startBoarCharge(state, id)) return;

  // prey: run from any predator that got close, then eat, then wander
  const threat = nearestPredator(state, animal.position, FLEE_TRIGGER_DISTANCE);
  if (threat) {
    updateAnimal(state, id, {
      activity: {
        kind: 'fleeing',
        fromAnimalId: threat.id,
        untilTick: state.tick + FLEE_DURATION_TICKS,
      },
    });
    fleeFrom(state, id, threat.id);
    return;
  }

  if (animal.activity.kind === 'grazing') {
    continueGrazing(state, ctx, id);
    return;
  }

  if (animal.hunger >= ANIMAL_GRAZE_THRESHOLD && startGrazing(state, id)) return;

  if (animal.tame) {
    // grass first, fodder second: a stack in the pen is what carries a herd
    // through a winter the pasture cannot
    if (animal.hunger >= ANIMAL_GRAZE_THRESHOLD && eatFodder(state, id)) return;
    if (animal.hunger >= ANIMAL_GRAZE_THRESHOLD && stepTowardsFodder(state, id)) return;
    returnToPasture(state, ctx, id);
    return;
  }
  wander(state, id);
}

/**
 * A wild boar being hunted may turn on the hunter. It only happens to the
 * colonist who is actually hunting it, so a boar minding its own business stays
 * a boar - the risk is the price of the meat, not an ambient hazard.
 */
function startBoarCharge(state: GameState, id: AnimalId): boolean {
  const animal = state.animals[id];
  if (animal.species !== 'boar' || animal.tame) return false;
  if (animal.designation !== 'hunt' || !animal.reservedByJobId) return false;

  const job = state.jobs[animal.reservedByJobId];
  const hunterId = job?.reservedBy;
  if (!hunterId) return false;
  const hunter = state.colonists[hunterId];
  if (!hunter || manhattan(hunter.position, animal.position) > BOAR_CHARGE_RANGE) return false;

  const rnd = tickRandom(state, hashId(id) + 57);
  if (rnd() > BOAR_CHARGE_CHANCE_PER_TICK) return false;

  updateAnimal(state, id, {
    activity: { kind: 'stalking', targetKind: 'colonist', targetId: hunterId },
    pursuitUntilTick: state.tick + PREDATOR_PURSUIT_TICKS,
  });
  addLog(state, `${animal.name} the boar turned on ${hunter.name}`);
  return true;
}

function startGrazing(state: GameState, id: AnimalId): boolean {
  const animal = state.animals[id];
  const tile = state.tiles[tileIdOf(animal.position.x, animal.position.y)];
  if (!tile || tile.terrain !== 'grass' || tile.forage < FORAGE_PER_GRAZE) return false;
  if (animal.tame && !isInsidePasture(state, animal)) return false;
  updateAnimal(state, id, {
    activity: { kind: 'grazing', ticksRemaining: ANIMAL_GRAZE_TICKS },
  });
  return true;
}

function continueGrazing(state: GameState, ctx: SimContext, id: AnimalId): void {
  const animal = state.animals[id];
  if (animal.activity.kind !== 'grazing') return;
  const remaining = animal.activity.ticksRemaining - 1;
  if (remaining > 0) {
    updateAnimal(state, id, { activity: { kind: 'grazing', ticksRemaining: remaining } });
    return;
  }
  const tile = state.tiles[tileIdOf(animal.position.x, animal.position.y)];
  const eaten = Math.min(tile.forage, FORAGE_PER_GRAZE);
  updateTile(state, tile.id, { forage: tile.forage - eaten });
  ctx.forageDepleted.add(tile.id);
  const restored = (eaten / FORAGE_PER_GRAZE) * ANIMAL_GRAZE_HUNGER_RESTORED;
  updateAnimal(state, id, {
    hunger: Math.max(0, animal.hunger - restored),
    activity: { kind: 'idle' },
  });
}

/** Eat a food stack the animal is standing on. Returns false when there is none. */
function eatFodder(state: GameState, id: AnimalId): boolean {
  const animal = state.animals[id];
  const tile = state.tiles[tileIdOf(animal.position.x, animal.position.y)];
  const stack = tile.itemIds
    .map((itemId) => state.items[itemId])
    .find((item) => item && item.type === 'food' && item.reservedByJobId === null);
  if (!stack) return false;

  const eaten = Math.min(ANIMAL_FODDER_PER_MEAL, stack.quantity);
  if (stack.quantity - eaten <= 0) removeItem(state, stack.id);
  else updateItem(state, stack.id, { quantity: stack.quantity - eaten });
  const restored = (eaten / ANIMAL_FODDER_PER_MEAL) * ANIMAL_FODDER_HUNGER_RESTORED;
  updateAnimal(state, id, { hunger: Math.max(0, animal.hunger - restored) });
  return true;
}

/**
 * Walk one step towards fodder inside the pasture. Greedy, like every other
 * animal move: the pen is small, so a straight line is enough and no A* budget
 * is spent on feeding.
 */
function stepTowardsFodder(state: GameState, id: AnimalId): boolean {
  const animal = state.animals[id];
  if (!animal.pastureZoneId) return false;
  const zone = state.zones[animal.pastureZoneId];
  if (!zone) return false;

  let best: Vector2 | null = null;
  let bestDistance = Infinity;
  for (const tileId of zone.tileIds) {
    const tile = state.tiles[tileId];
    if (!tile) continue;
    const hasFood = tile.itemIds.some((itemId) => state.items[itemId]?.type === 'food');
    if (!hasFood) continue;
    const distance = manhattan(animal.position, { x: tile.x, y: tile.y });
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { x: tile.x, y: tile.y };
    }
  }
  if (!best || bestDistance === 0) return false;
  if (!canStep(state, animal)) return true; // waiting for its step tick still counts
  return greedyStep(state, id, best);
}

/** One random walkable step. No A*: this is what most animals do most ticks. */
function wander(state: GameState, id: AnimalId): void {
  const animal = state.animals[id];
  if (!canStep(state, animal)) return;
  const rnd = tickRandom(state, hashId(id));
  if (rnd() < 0.55) return; // stand still most of the time
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  const dir = dirs[Math.floor(rnd() * 4)];
  stepTo(state, id, animal.position.x + dir.x, animal.position.y + dir.y);
}

/**
 * The single step that puts the most ground between `from` and `threat`.
 *
 * All four neighbours are considered, not just the two along the escape axis:
 * something with its back to a rock face has to be able to slip sideways, or it
 * simply stands there and is eaten.
 */
export function fleeStep(
  state: GameState,
  from: Vector2,
  threat: Vector2,
  /** colonists may use doors, animals may not - see isWalkableByAnimal */
  canEnter: (state: GameState, x: number, y: number) => boolean = isWalkable,
): Vector2 | null {
  const here = manhattan(from, threat);
  let best: Vector2 | null = null;
  let bestDistance = here;
  for (const delta of [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ]) {
    const step = { x: from.x + delta.x, y: from.y + delta.y };
    if (!canEnter(state, step.x, step.y)) continue;
    const distance = manhattan(step, threat);
    if (distance > bestDistance) {
      bestDistance = distance;
      best = step;
    }
  }
  return best;
}

function fleeFrom(state: GameState, id: AnimalId, threatId: AnimalId): void {
  const animal = state.animals[id];
  const threat = state.animals[threatId];
  if (!threat) {
    updateAnimal(state, id, { activity: { kind: 'idle' } });
    return;
  }
  if (!canStep(state, animal)) return;
  const step = fleeStep(state, animal.position, threat.position, isWalkableByAnimal);
  if (step) stepTo(state, id, step.x, step.y);
}

// --- predators --------------------------------------------------------------

function runPredator(state: GameState, ctx: SimContext, id: AnimalId): void {
  const animal = state.animals[id];

  // give up when full, hurt, or after chasing for too long
  const exhausted = animal.pursuitUntilTick !== null && state.tick >= animal.pursuitUntilTick;
  if (animal.health <= PREDATOR_RETREAT_HEALTH || exhausted) {
    if (animal.activity.kind !== 'idle') {
      updateAnimal(state, id, {
        activity: { kind: 'idle' },
        pursuitUntilTick: null,
        // walk away for a while: an immediate re-target would make the give-up
        // meaningless and would eventually kill whoever it was chasing
        huntCooldownUntilTick: state.tick + PREDATOR_GIVE_UP_COOLDOWN_TICKS,
      });
    }
    wander(state, id);
    return;
  }

  if (animal.activity.kind === 'attacking') {
    runAttack(state, ctx, id);
    return;
  }

  if (animal.activity.kind === 'stalking') {
    const target = targetPosition(state, animal.activity.targetKind, animal.activity.targetId);
    if (!target) {
      updateAnimal(state, id, { activity: { kind: 'idle' }, pursuitUntilTick: null });
      return;
    }
    if (manhattan(animal.position, target) <= 1) {
      updateAnimal(state, id, {
        activity: {
          kind: 'attacking',
          targetKind: animal.activity.targetKind,
          targetId: animal.activity.targetId,
          nextBiteTick: state.tick,
        },
      });
      // bite in the same tick contact is made: anything that runs is gone again
      // by the next one, so a "wind-up" tick means a predator never lands a hit
      runAttack(state, ctx, id);
      return;
    }
    if (pursue(state, ctx, id, target) === 'blocked') {
      const wall = blockingStructure(state, state.animals[id], target);
      if (wall) {
        updateAnimal(state, id, {
          activity: {
            kind: 'attacking',
            targetKind: 'building',
            targetId: wall,
            nextBiteTick: state.tick,
          },
          path: null,
          pathExpiresAtTick: null,
        });
        runAttack(state, ctx, id);
      }
    }
    return;
  }

  const onCooldown =
    animal.huntCooldownUntilTick !== null && state.tick < animal.huntCooldownUntilTick;
  if (animal.hunger < PREDATOR_HUNT_THRESHOLD || onCooldown) {
    wander(state, id);
    return;
  }

  const prey = findPrey(state, animal);
  if (!prey) {
    wander(state, id);
    return;
  }
  updateAnimal(state, id, {
    activity: { kind: 'stalking', targetKind: prey.kind, targetId: prey.id },
    pursuitUntilTick: state.tick + PREDATOR_PURSUIT_TICKS,
  });
}

/**
 * Prey preference is wild herbivores > livestock > colonists, so a wolf rarely
 * opens by going for a person (docs/design-animals.md 5).
 */
function findPrey(
  state: GameState,
  predator: Animal,
): { kind: 'animal' | 'colonist'; id: string } | null {
  type Candidate = { kind: 'animal' | 'colonist'; id: string; score: number };
  let best: Candidate | null = null;
  const consider = (kind: 'animal' | 'colonist', id: string, position: Vector2, bias: number) => {
    const distance = manhattan(predator.position, position);
    if (distance > PREDATOR_SIGHT_RANGE) return;
    const score = distance + bias;
    if (best === null || score < best.score) best = { kind, id, score } satisfies Candidate;
  };

  for (const id in state.animals) {
    const other = state.animals[id];
    if (other.id === predator.id || isPredator(other)) continue;
    consider('animal', id, other.position, other.tame ? 6 : 0);
  }
  for (const id in state.colonists) {
    consider('colonist', id, state.colonists[id].position, 14);
  }
  const chosen = best as Candidate | null;
  return chosen ? { kind: chosen.kind, id: chosen.id } : null;
}

function runAttack(state: GameState, ctx: SimContext, id: AnimalId): void {
  const animal = state.animals[id];
  if (animal.activity.kind !== 'attacking') return;
  const { targetKind, targetId, nextBiteTick } = animal.activity;
  const target = targetPosition(state, targetKind, targetId);
  if (!target) {
    updateAnimal(state, id, { activity: { kind: 'idle' }, pursuitUntilTick: null });
    return;
  }
  if (manhattan(animal.position, target) > 1) {
    // a structure is not something to chase: step away from a wall and the
    // animal simply goes back to looking for prey
    if (targetKind === 'building') {
      updateAnimal(state, id, { activity: { kind: 'idle' } });
    } else {
      updateAnimal(state, id, { activity: { kind: 'stalking', targetKind, targetId } });
    }
    return;
  }
  if (state.tick < nextBiteTick) return;

  updateAnimal(state, id, {
    activity: {
      kind: 'attacking',
      targetKind,
      targetId,
      nextBiteTick:
        state.tick +
        (targetKind === 'building' ? PREDATOR_GNAW_INTERVAL_TICKS : PREDATOR_BITE_INTERVAL_TICKS),
    },
  });

  if (targetKind === 'building') {
    gnawStructure(state, ctx, id, targetId);
    return;
  }

  if (targetKind === 'animal') {
    const prey = state.animals[targetId];
    if (!prey) return;
    const health = prey.health - PREDATOR_BITE_DAMAGE;
    updateAnimal(state, targetId, {
      health,
      activity: { kind: 'fleeing', fromAnimalId: id, untilTick: state.tick + FLEE_DURATION_TICKS },
    });
    if (health <= 0) {
      killAnimal(state, targetId, `killed by a ${SPECIES[animal.species].label.toLowerCase()}`, false);
      updateAnimal(state, id, {
        hunger: Math.max(0, animal.hunger - PREDATOR_HUNGER_PER_KILL),
        activity: { kind: 'idle' },
        pursuitUntilTick: null,
      });
    }
    return;
  }

  damageColonist(state, targetId, PREDATOR_BITE_DAMAGE, id);
  if (!state.colonists[targetId]) {
    updateAnimal(state, id, {
      hunger: Math.max(0, animal.hunger - PREDATOR_HUNGER_PER_KILL),
      activity: { kind: 'idle' },
      pursuitUntilTick: null,
    });
  }
}

/**
 * A predator chewing on a structure it cannot get past. A door standing between
 * a wolf and a pen full of livestock is the case this exists for: the fence
 * works until it does not, and the colony has to keep it standing.
 */
function gnawStructure(
  state: GameState,
  ctx: SimContext,
  id: AnimalId,
  buildingId: string,
): void {
  const animal = state.animals[id];
  const building = state.buildings[buildingId];
  if (!building) {
    updateAnimal(state, id, { activity: { kind: 'idle' } });
    return;
  }
  const hpCurrent = building.hpCurrent - PREDATOR_STRUCTURE_DAMAGE;
  if (hpCurrent > 0) {
    updateBuilding(state, buildingId, { hpCurrent });
    if (building.hpCurrent === building.hpMax) {
      addLog(
        state,
        `${animal.name} the ${SPECIES[animal.species].label.toLowerCase()} is tearing at the ${building.type}`,
      );
    }
    return;
  }

  const tile = state.tiles[building.tileId];
  releaseEntity(state, buildingId);
  const { [buildingId]: _removed, ...rest } = state.buildings;
  state.buildings = rest;
  updateTile(state, tile.id, { buildingId: null, designation: null });
  // a chewed-through conduit cuts the run it was part of
  if (isManaBuilding(building.type)) invalidateNetworks(ctx);
  if (BLOCKS_MOVEMENT[building.type]) {
    updateTile(state, tile.id, { walkable: true });
    invalidateTile(ctx, state, tile.id);
  }
  addLog(state, `the ${building.type} at ${tile.id} was broken open`);
  // whatever it was after is on the other side; go and look again
  updateAnimal(state, id, { activity: { kind: 'idle' }, path: null, pathExpiresAtTick: null });
}

/**
 * Move towards a moving target. Uses the shared per-tick A* budget.
 *
 * Returns 'blocked' only when a route was actually looked for and there was
 * none - not when the animal is merely between steps or out of path budget.
 * The caller uses that to decide the prey is behind something.
 */
function pursue(
  state: GameState,
  ctx: SimContext,
  id: AnimalId,
  target: Vector2,
): 'ok' | 'blocked' {
  const animal = state.animals[id];
  if (!canStep(state, animal)) return 'ok';

  const pathStale =
    !animal.path ||
    animal.path.length === 0 ||
    animal.pathExpiresAtTick === null ||
    state.tick >= animal.pathExpiresAtTick;

  if (pathStale) {
    // greedy step first: it is free, and predators are usually already close
    if (greedyStep(state, id, target)) return 'ok';
    if (ctx.animalPathBudget <= 0) return 'ok';
    ctx.animalPathBudget -= 1;
    const path = findPath(state, animal.position, target, { adjacent: true });
    if (!path || path.length === 0) return 'blocked';
    // A* does not know about doors, so a route through one is useless to an
    // animal: drop it rather than walking into the door every tick
    if (path.some((step) => !isWalkableByAnimal(state, step.x, step.y))) return 'blocked';
    updateAnimal(state, id, {
      path,
      pathExpiresAtTick: state.tick + ANIMAL_PATH_TTL_TICKS,
    });
  }

  const current = state.animals[id];
  const next = current.path?.[0];
  if (!next) return 'ok';
  if (stepTo(state, id, next.x, next.y)) {
    updateAnimal(state, id, { path: current.path!.slice(1) });
  } else {
    updateAnimal(state, id, { path: null, pathExpiresAtTick: null });
  }
  return 'ok';
}

/** One step that reduces the distance, if such a step is walkable. */
function greedyStep(state: GameState, id: AnimalId, target: Vector2): boolean {
  const animal = state.animals[id];
  const dx = Math.sign(target.x - animal.position.x);
  const dy = Math.sign(target.y - animal.position.y);
  const options =
    Math.abs(target.x - animal.position.x) >= Math.abs(target.y - animal.position.y)
      ? [
          { x: dx, y: 0 },
          { x: 0, y: dy },
        ]
      : [
          { x: 0, y: dy },
          { x: dx, y: 0 },
        ];
  for (const option of options) {
    if (option.x === 0 && option.y === 0) continue;
    if (stepTo(state, id, animal.position.x + option.x, animal.position.y + option.y)) return true;
  }
  return false;
}

// --- livestock --------------------------------------------------------------

function isInsidePasture(state: GameState, animal: Animal): boolean {
  if (!animal.pastureZoneId) return true;
  const zone = state.zones[animal.pastureZoneId];
  if (!zone) return true;
  return zone.tileIds.includes(tileIdOf(animal.position.x, animal.position.y));
}

function returnToPasture(state: GameState, ctx: SimContext, id: AnimalId): void {
  const animal = state.animals[id];
  const zone = animal.pastureZoneId ? state.zones[animal.pastureZoneId] : null;
  if (!zone || zone.tileIds.length === 0) {
    wander(state, id);
    return;
  }
  if (isInsidePasture(state, animal)) {
    wander(state, id);
    return;
  }
  const target = nearestZoneTile(state, zone.tileIds, animal.position);
  if (target) pursue(state, ctx, id, target);
}

function nearestZoneTile(
  state: GameState,
  tileIds: string[],
  from: Vector2,
): Vector2 | null {
  let best: Vector2 | null = null;
  let bestDistance = Infinity;
  for (const tileId of tileIds) {
    const tile = state.tiles[tileId];
    if (!tile) continue;
    const distance = manhattan(from, { x: tile.x, y: tile.y });
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { x: tile.x, y: tile.y };
    }
  }
  return best;
}

/** Pasture capacity is what stops a herd from eating the map bare. */
export function pastureCapacity(state: GameState, zoneId: string): number {
  const zone = state.zones[zoneId];
  if (!zone) return 0;
  return Math.max(1, Math.floor(zone.tileIds.length / PASTURE_TILES_PER_ANIMAL));
}

export function herdSize(state: GameState, zoneId: string): number {
  let count = 0;
  for (const id in state.animals) {
    if (state.animals[id].pastureZoneId === zoneId) count++;
  }
  return count;
}

function runBreeding(state: GameState, id: AnimalId): void {
  const animal = state.animals[id];
  if (!animal.tame || !animal.pastureZoneId) return;

  if (animal.gestationUntilTick !== null) {
    if (state.tick < animal.gestationUntilTick) return;
    updateAnimal(state, id, { gestationUntilTick: null });
    if (herdSize(state, animal.pastureZoneId) >= pastureCapacity(state, animal.pastureZoneId)) {
      return;
    }
    const calf = createAnimal(state, animal.species, animal.position.x, animal.position.y, {
      tame: true,
      pastureZoneId: animal.pastureZoneId,
      bornAtTick: state.tick,
    });
    addLog(state, `${animal.name} the ${SPECIES[animal.species].label.toLowerCase()} had ${calf.name}`);
    return;
  }

  if (!isAdult(state, animal) || animal.hunger > BREEDING_HUNGER_MAX) return;
  if (herdSize(state, animal.pastureZoneId) >= pastureCapacity(state, animal.pastureZoneId)) return;

  // needs a second well-fed adult of the same species in the same pasture
  let mates = 0;
  for (const otherId in state.animals) {
    const other = state.animals[otherId];
    if (otherId === id || other.species !== animal.species) continue;
    if (other.pastureZoneId !== animal.pastureZoneId) continue;
    if (!isAdult(state, other) || other.hunger > BREEDING_HUNGER_MAX) continue;
    mates++;
  }
  if (mates === 0) return;

  const seasonal = BREEDING_CHANCE_PER_TICK * BREEDING_BY_SEASON[seasonOf(state.tick)];
  if (seasonal <= 0) return; // nothing is born in winter
  const rnd = tickRandom(state, hashId(id) + 31);
  if (rnd() > seasonal) return;
  updateAnimal(state, id, { gestationUntilTick: state.tick + GESTATION_TICKS });
}

/** Eggs and the like: dropped on the ground, then picked up by the haul chain. */
function runProduction(state: GameState, id: AnimalId): void {
  const animal = state.animals[id];
  const profile = SPECIES[animal.species];
  if (!animal.tame || profile.produceAmount <= 0) return;

  if (animal.nextProduceTick === null) {
    updateAnimal(state, id, { nextProduceTick: state.tick + profile.produceIntervalTicks });
    return;
  }
  if (state.tick < animal.nextProduceTick) return;
  updateAnimal(state, id, { nextProduceTick: state.tick + profile.produceIntervalTicks });
  if (animal.hunger > 70) return; // a starving animal produces nothing
  addItem(state, 'food', profile.produceAmount, animal.position.x, animal.position.y);
}

// --- shared helpers ---------------------------------------------------------

function canStep(state: GameState, animal: Animal): boolean {
  return state.tick % SPECIES[animal.species].ticksPerStep === 0;
}

function stepTo(state: GameState, id: AnimalId, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
  if (!isWalkableByAnimal(state, x, y)) return false;
  updateAnimal(state, id, { position: { x, y } });
  return true;
}

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function targetPosition(
  state: GameState,
  kind: 'animal' | 'colonist' | 'building',
  id: string,
): Vector2 | null {
  if (kind === 'building') {
    const building = state.buildings[id];
    const tile = building ? state.tiles[building.tileId] : undefined;
    return tile ? { x: tile.x, y: tile.y } : null;
  }
  const entity = kind === 'animal' ? state.animals[id] : state.colonists[id];
  return entity ? entity.position : null;
}

/**
 * A finished structure next to the animal that stands between it and where it
 * wants to be. This is the whole of "the wolf noticed the door": no pathfinding
 * against buildings, just the neighbour that blocks and that faces the prey.
 */
function blockingStructure(state: GameState, animal: Animal, target: Vector2): string | null {
  const here = manhattan(animal.position, target);
  const neighbours = [
    { x: animal.position.x + 1, y: animal.position.y },
    { x: animal.position.x - 1, y: animal.position.y },
    { x: animal.position.x, y: animal.position.y + 1 },
    { x: animal.position.x, y: animal.position.y - 1 },
  ];
  let best: string | null = null;
  let bestDistance = here;
  for (const at of neighbours) {
    if (manhattan(at, target) >= bestDistance) continue;
    const tile = state.tiles[tileIdOf(at.x, at.y)];
    if (!tile?.buildingId) continue;
    const building = state.buildings[tile.buildingId];
    if (!building || building.isBlueprint) continue;
    if (isWalkableByAnimal(state, at.x, at.y)) continue; // it is not in the way
    best = building.id;
    bestDistance = manhattan(at, target);
  }
  return best;
}

/**
 * The nearest animal of a species to a point, for "show me one".
 *
 * Thirty-three animals live on a sixty by sixty map and eight or nine of them
 * are inside the opening camera - they are there, they are simply small and
 * muted against grass and easy to miss in the trees. Being able to ask the
 * panel to take you to one is the difference between a list of numbers and a
 * list of creatures.
 */
export function nearestOfSpecies(
  state: GameState,
  species: AnimalSpecies,
  from: Vector2,
): Animal | null {
  let best: Animal | null = null;
  let bestDistance = Infinity;
  for (const id in state.animals) {
    const animal = state.animals[id];
    if (animal.species !== species) continue;
    const distance = manhattan(from, animal.position);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = animal;
    }
  }
  return best;
}

export function nearestPredator(state: GameState, from: Vector2, range: number): Animal | null {
  let best: Animal | null = null;
  let bestDistance = range + 1;
  for (const id in state.animals) {
    const other = state.animals[id];
    if (!isPredator(other)) continue;
    const distance = manhattan(from, other.position);
    if (distance <= range && distance < bestDistance) {
      bestDistance = distance;
      best = other;
    }
  }
  return best;
}

/**
 * Remove an animal, releasing anything that held it. `dropFood` is what turns a
 * hunt into meat; a starved carcass leaves nothing.
 */
export function killAnimal(
  state: GameState,
  id: AnimalId,
  reason: string,
  dropFood: boolean,
): void {
  const animal = state.animals[id];
  if (!animal) return;
  if (animal.reservedByJobId) releaseByJob(state, animal.reservedByJobId);
  if (dropFood) {
    addItem(state, 'food', SPECIES[animal.species].foodYield, animal.position.x, animal.position.y);
  }
  removeAnimal(state, id);
  // A wolf eating a rabbit in the woods is weather, not news. Watching the
  // built game for five days at speed the log was four fifths ambient
  // predation, which pushes the things a player acts on - a wanderer arriving,
  // livestock lost, a wall coming down - out of a hundred-line buffer. Losing
  // an animal you own, or one you had marked, is still worth a line.
  if (!animal.tame && animal.designation === null) return;
  addLog(state, `${animal.name} the ${SPECIES[animal.species].label.toLowerCase()} ${reason}`);
}

/** Colonists never fight back; they take the hit and run (design doc 5). */
export function damageColonist(
  state: GameState,
  colonistId: string,
  amount: number,
  fromAnimalId: AnimalId,
): void {
  const colonist = state.colonists[colonistId];
  if (!colonist) return;
  const health = colonist.health - amount;
  if (health <= 0) {
    const killer = state.animals[fromAnimalId];
    killColonist(
      state,
      colonistId,
      killer ? `was killed by a ${SPECIES[killer.species].label.toLowerCase()}` : 'was killed',
    );
    return;
  }
  updateColonist(state, colonistId, {
    health,
    activity: { kind: 'fleeing', fromAnimalId, untilTick: state.tick + FLEE_DURATION_TICKS },
    currentJobId: null,
  });
}

export function healColonists(state: GameState): void {
  for (const id in state.colonists) {
    const colonist = state.colonists[id];
    if (colonist.health >= COLONIST_MAX_HEALTH) continue;
    const resting = colonist.activity.kind === 'sleeping';
    if (!resting) continue;
    updateColonist(state, id, {
      health: Math.min(
        COLONIST_MAX_HEALTH,
        colonist.health + COLONIST_HEALTH_REGEN_PER_TICK * traitMultiplier(colonist, 'healing'),
      ),
    });
  }
}

/**
 * Predators arrive from day 2 onwards, from the edge of the map, never right
 * next to the camp. Keeping the population topped up is what makes hunting them
 * an ongoing job rather than a one-off.
 */
function spawnPredators(state: GameState): void {
  if (state.tick < PREDATOR_FIRST_SPAWN_TICK) return;
  if (state.tick % PREDATOR_RESPAWN_INTERVAL_TICKS !== 0) return;

  let alive = 0;
  for (const id in state.animals) if (isPredator(state.animals[id])) alive++;
  // how many wolves the map sustains is the scenario's, not a global constant:
  // it is a rule that runs every day rather than a decision made at generation
  if (alive >= scenarioOf(state).predators) return;

  const camp = colonyCentre(state);
  const rnd = tickRandom(state, 991);
  const spot = findSpawnTile(state, rnd, camp, PREDATOR_MIN_SPAWN_DISTANCE);
  if (!spot) return;
  const wolf = createAnimal(state, 'wolf', spot.x, spot.y);
  addLog(state, `A wolf was spotted near the treeline (${wolf.name})`);
}

/**
 * Restock the wild herds towards their starting numbers. Only wild animals
 * count: a tamed deer belongs to the colony, not to the woods.
 */
function spawnWildlife(state: GameState): void {
  if (state.tick === 0 || state.tick % WILDLIFE_RESPAWN_INTERVAL_TICKS !== 0) return;

  const wild: Partial<Record<AnimalSpecies, number>> = {};
  for (const id in state.animals) {
    const animal = state.animals[id];
    if (animal.tame || isPredator(animal)) continue;
    wild[animal.species] = (wild[animal.species] ?? 0) + 1;
  }

  const camp = colonyCentre(state);
  const rnd = tickRandom(state, 613);
  for (const species of ANIMAL_SPECIES) {
    const profile = SPECIES[species];
    if (profile.diet === 'carnivore') continue;
    if ((wild[species] ?? 0) >= scaledCount(profile.initialCount, scenarioOf(state).wildlife)) {
      continue;
    }
    const spot = findSpawnTile(state, rnd, camp, WILDLIFE_MIN_SPAWN_DISTANCE);
    if (spot) createAnimal(state, species, spot.x, spot.y);
  }
}

function colonyCentre(state: GameState): Vector2 {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const id in state.colonists) {
    sumX += state.colonists[id].position.x;
    sumY += state.colonists[id].position.y;
    count++;
  }
  if (count === 0) return { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
  return { x: Math.round(sumX / count), y: Math.round(sumY / count) };
}
