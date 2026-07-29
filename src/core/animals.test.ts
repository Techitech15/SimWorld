// Acceptance conditions for the animal layer (docs/design-animals.md 9), one
// describe block per implementation stage A-D. Everything here runs headless,
// like the rest of src/core/*.test.ts.
import { describe, expect, it, vi } from 'vitest';

// findPath is wrapped, not replaced: the counter lets the performance test below
// prove the herd stays inside its A* budget without changing any behaviour.
const pathCalls = { count: 0 };
vi.mock('./pathfinding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pathfinding')>();
  return {
    ...actual,
    findPath: (...args: Parameters<typeof actual.findPath>) => {
      pathCalls.count += 1;
      return actual.findPath(...args);
    },
  };
});

import { designateAnimals, placePastureZone } from './actions';
import { herdSize, isPredator, pastureCapacity } from './animals';
import {
  ANIMAL_PATH_BUDGET_PER_TICK,
  COLONIST_MAX_HEALTH,
  PASTURE_TILES_PER_ANIMAL,
  PREDATOR_HUNGER_PER_KILL,
  SPECIES,
  TICKS_PER_DAY,
} from './constants';
import { tileIdOf } from './state';
import { createHarness, idleColony } from './testUtils';
import type { AnimalSpecies, GameState, JobType, TileId, Vector2 } from './types';
import { createAnimal } from './worldgen';

function centreOf(state: GameState): Vector2 {
  const first = Object.values(state.colonists)[0];
  return { x: first.position.x, y: first.position.y };
}

/** Free walkable ground, so a test animal never starts inside a wall or a bed. */
function freeTileNear(state: GameState, from: Vector2, distance: number): Vector2 {
  for (let radius = distance; radius < distance + 12; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (const dy of [radius - Math.abs(dx), -(radius - Math.abs(dx))]) {
        const x = from.x + dx;
        const y = from.y + dy;
        const tile = state.tiles[tileIdOf(x, y)];
        if (tile?.walkable && !tile.buildingId) return { x, y };
      }
    }
  }
  throw new Error('no free tile near the camp');
}

/** A rectangle of plain grass east of the camp: no farm plots, no beds. */
function pastureTiles(state: GameState, size: number): TileId[] {
  const centre = centreOf(state);
  const ids: TileId[] = [];
  for (let dy = 0; dy < size && ids.length < size * size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const x = centre.x + 4 + dx;
      const y = centre.y - 3 + dy;
      const tile = state.tiles[tileIdOf(x, y)];
      if (tile?.terrain === 'grass' && !tile.buildingId) ids.push(tile.id);
    }
  }
  return ids;
}

function onlyWork(state: GameState, allowed: JobType[]): void {
  idleColony(state);
  for (const id in state.colonists) {
    const colonist = state.colonists[id];
    const workPriorities = { ...colonist.workPriorities };
    for (const jobType of allowed) workPriorities[jobType] = 1;
    state.colonists[id] = { ...colonist, workPriorities };
  }
}

function foodOutsideStorage(state: GameState): number {
  const storage = new Set<string>();
  for (const id in state.zones) {
    if (state.zones[id].type === 'storage') for (const t of state.zones[id].tileIds) storage.add(t);
  }
  let total = 0;
  for (const id in state.items) {
    const item = state.items[id];
    if (item.type !== 'food') continue;
    if (storage.has(tileIdOf(item.position.x, item.position.y))) continue;
    total += item.quantity;
  }
  return total;
}

function foodInStorage(state: GameState): number {
  const storage = new Set<string>();
  for (const id in state.zones) {
    if (state.zones[id].type === 'storage') for (const t of state.zones[id].tileIds) storage.add(t);
  }
  let total = 0;
  for (const id in state.items) {
    const item = state.items[id];
    if (item.type === 'food' && storage.has(tileIdOf(item.position.x, item.position.y))) {
      total += item.quantity;
    }
  }
  return total;
}

/** Stock a pasture with tame adults of one species. */
function stockPasture(
  state: GameState,
  species: AnimalSpecies,
  zoneId: string,
  count: number,
): void {
  const zone = state.zones[zoneId];
  for (let i = 0; i < count; i++) {
    const tile = state.tiles[zone.tileIds[i % zone.tileIds.length]];
    createAnimal(state, species, tile.x, tile.y, { tame: true, pastureZoneId: zoneId });
  }
}

/**
 * Keep the pasture tests to the pasture. The world restocks its wild herds and
 * sends wolves in from day 2 onwards; both are the point of stage B and pure
 * noise here, where the herd is what is being measured.
 */
function keepHerdOnly(state: GameState): void {
  for (const id in state.animals) {
    if (!state.animals[id].pastureZoneId) delete state.animals[id];
  }
}

function meanHunger(state: GameState): number {
  const animals = Object.values(state.animals);
  if (animals.length === 0) return 0;
  return animals.reduce((sum, a) => sum + a.hunger, 0) / animals.length;
}

// --- stage A: wild animals, hunting, meat ------------------------------------

describe('stage A: hunting', () => {
  it('turns a designated deer into food that reaches the storage zone', () => {
    const harness = createHarness(101);
    harness.state.animals = {};
    onlyWork(harness.state, ['hunt', 'haul']);

    const spot = freeTileNear(harness.state, centreOf(harness.state), 5);
    const deer = createAnimal(harness.state, 'deer', spot.x, spot.y);
    harness.state = designateAnimals(harness.state, [tileIdOf(spot.x, spot.y)], 'hunt');

    const before = foodInStorage(harness.state);
    let meatOnTheGround = 0;
    harness.run(900, (state) => {
      // hold hunger at zero so nobody eats: then the food ledger moves for
      // exactly one reason, the deer
      for (const id in state.colonists) {
        state.colonists[id] = { ...state.colonists[id], needs: { hunger: 0, sleep: 0 } };
      }
      meatOnTheGround = Math.max(meatOnTheGround, foodOutsideStorage(state));
      // the reservation is what stops a second colonist joining the same hunt
      const hunters = Object.keys(state.colonists).filter((id) => {
        const jobId = state.colonists[id].currentJobId;
        return jobId ? state.jobs[jobId]?.targetEntityId === deer.id : false;
      });
      expect(hunters.length).toBeLessThanOrEqual(1);
    });

    expect(harness.state.animals[deer.id]).toBeUndefined();
    expect(harness.state.log.some((entry) => entry.message.includes('was hunted'))).toBe(true);
    // the carcass became a stack on the ground...
    expect(meatOnTheGround).toBeGreaterThanOrEqual(SPECIES.deer.foodYield);
    // ...and the existing haul chain carried it home untouched
    expect(foodOutsideStorage(harness.state)).toBe(0);
    expect(foodInStorage(harness.state)).toBe(before + SPECIES.deer.foodYield);
  });

  it('cancels the job when the designation is taken back', () => {
    const harness = createHarness(103);
    harness.state.animals = {};
    onlyWork(harness.state, ['hunt']);

    const spot = freeTileNear(harness.state, centreOf(harness.state), 8);
    const deer = createAnimal(harness.state, 'deer', spot.x, spot.y);
    harness.state = designateAnimals(harness.state, [tileIdOf(spot.x, spot.y)], 'hunt');
    harness.run(10);
    expect(Object.values(harness.state.jobs).some((j) => j.type === 'hunt')).toBe(true);

    harness.state = designateAnimals(
      harness.state,
      [tileIdOf(harness.state.animals[deer.id].position.x, harness.state.animals[deer.id].position.y)],
      null,
    );
    harness.run(5);
    expect(Object.values(harness.state.jobs).some((j) => j.type === 'hunt')).toBe(false);
    expect(harness.state.animals[deer.id]).toBeDefined();
    expect(harness.state.reservations[deer.id]).toBeUndefined();
  });
});

// --- stage B: predators, health, fleeing --------------------------------------

describe('stage B: predators', () => {
  it('lets a wolf kill its prey and then stop hunting', () => {
    const harness = createHarness(107);
    harness.state.animals = {};
    idleColony(harness.state);

    const spot = freeTileNear(harness.state, centreOf(harness.state), 14);
    const deer = createAnimal(harness.state, 'deer', spot.x, spot.y);
    const wolf = createAnimal(harness.state, 'wolf', spot.x + 1, spot.y);
    harness.state.animals[wolf.id] = { ...wolf, hunger: 100 };

    let atTheKill: { hunger: number; activity: string } | null = null;
    harness.run(600, (state) => {
      if (atTheKill || state.animals[deer.id]) return;
      const hunter = state.animals[wolf.id];
      atTheKill = { hunger: hunter.hunger, activity: hunter.activity.kind };
    });

    expect(harness.state.animals[deer.id]).toBeUndefined();
    expect(harness.state.log.some((entry) => entry.message.includes('killed by a wolf'))).toBe(true);
    expect(harness.state.animals[wolf.id]).toBeDefined();
    // fed by the kill, and it drops the hunt the moment it is fed
    expect(atTheKill!.hunger).toBeLessThanOrEqual(100 - PREDATOR_HUNGER_PER_KILL + 1);
    expect(atTheKill!.activity).toBe('idle');
  });

  it('makes an attacked colonist flee and survive', () => {
    const harness = createHarness(109);
    harness.state.animals = {};
    idleColony(harness.state);

    const everyone = Object.keys(harness.state.colonists);
    const at = harness.state.colonists[everyone[0]].position;
    // drop the wolf into the middle of the camp: whoever it picks, it picks
    const wolf = createAnimal(harness.state, 'wolf', at.x, at.y - 1);
    harness.state.animals[wolf.id] = { ...wolf, hunger: 100 };

    let fled = false;
    let lowest = COLONIST_MAX_HEALTH;
    harness.run(700, (state) => {
      for (const id of everyone) {
        const colonist = state.colonists[id];
        if (!colonist) continue;
        if (colonist.activity.kind === 'fleeing') fled = true;
        lowest = Math.min(lowest, colonist.health);
      }
    });

    // alive: running keeps a colonist ahead of the bite interval
    for (const id of everyone) expect(harness.state.colonists[id]).toBeDefined();
    expect(fled).toBe(true);
    expect(lowest).toBeLessThan(COLONIST_MAX_HEALTH); // it did cost blood
    expect(lowest).toBeGreaterThan(0);
  });

  it('restocks the wild herds so the woods never run empty', () => {
    // Wild animals do not breed, so without the daily top-up the wolves would
    // eventually have nothing left to hunt but the colony.
    const harness = createHarness(117);
    idleColony(harness.state);
    const atStart = Object.keys(harness.state.animals).length;

    harness.run(TICKS_PER_DAY * 5);

    let wildPrey = 0;
    for (const id in harness.state.animals) {
      const animal = harness.state.animals[id];
      if (!animal.tame && !isPredator(animal)) wildPrey++;
    }
    expect(wildPrey).toBeGreaterThanOrEqual(atStart / 2);
    for (const id in harness.state.colonists) {
      expect(harness.state.colonists[id].health).toBeGreaterThan(0);
    }
  });

  it('removes the threat when the player designates the wolf for hunting', () => {
    const harness = createHarness(113);
    harness.state.animals = {};
    onlyWork(harness.state, ['hunt']);

    const spot = freeTileNear(harness.state, centreOf(harness.state), 6);
    const wolf = createAnimal(harness.state, 'wolf', spot.x, spot.y);
    harness.state = designateAnimals(harness.state, [tileIdOf(spot.x, spot.y)], 'hunt');

    harness.run(1200);
    expect(harness.state.animals[wolf.id]).toBeUndefined();
  });
});

// --- stage C: taming, pasture, forage ----------------------------------------

describe('stage C: pasture and forage', () => {
  it('feeds a herd the pasture can carry and starves one it cannot', () => {
    const run = (count: number): GameState => {
      const harness = createHarness(127);
      harness.state.animals = {};
      idleColony(harness.state);
      const tiles = pastureTiles(harness.state, 4);
      harness.state = placePastureZone(harness.state, tiles);
      const zoneId = Object.keys(harness.state.zones).find(
        (id) => harness.state.zones[id].type === 'pasture',
      )!;
      stockPasture(harness.state, 'deer', zoneId, count);
      harness.run(2400, keepHerdOnly);
      return harness.state;
    };

    const withinCapacity = run(2);
    const overStocked = run(14);

    expect(meanHunger(overStocked)).toBeGreaterThan(meanHunger(withinCapacity));
    // and the ground shows it: an overgrazed pasture is visibly bare
    const bare = (state: GameState): number => {
      const zoneId = Object.keys(state.zones).find((id) => state.zones[id].type === 'pasture')!;
      const tiles = state.zones[zoneId].tileIds;
      return tiles.reduce((sum, id) => sum + state.tiles[id].forage, 0) / tiles.length;
    };
    expect(bare(overStocked)).toBeLessThan(bare(withinCapacity));
  });

  it('keeps tamed animals on their pasture', () => {
    const harness = createHarness(131);
    harness.state.animals = {};
    idleColony(harness.state);
    const tiles = pastureTiles(harness.state, 4);
    harness.state = placePastureZone(harness.state, tiles);
    const zoneId = Object.keys(harness.state.zones).find(
      (id) => harness.state.zones[id].type === 'pasture',
    )!;
    stockPasture(harness.state, 'deer', zoneId, 3);
    const inZone = new Set(tiles);

    harness.run(1200, keepHerdOnly);
    for (const id in harness.state.animals) {
      const animal = harness.state.animals[id];
      const tileId = tileIdOf(animal.position.x, animal.position.y);
      // one step of slack: an animal may be walking back at the moment we look
      expect(
        inZone.has(tileId) || tiles.some((t) => neighbours(t).includes(tileId)),
      ).toBe(true);
    }
  });
});

function neighbours(tileId: TileId): TileId[] {
  const comma = tileId.indexOf(',');
  const x = Number(tileId.slice(0, comma));
  const y = Number(tileId.slice(comma + 1));
  return [tileIdOf(x + 1, y), tileIdOf(x - 1, y), tileIdOf(x, y + 1), tileIdOf(x, y - 1)];
}

// --- stage D: breeding, production, herd cap ----------------------------------

describe('stage D: breeding and production', () => {
  it('grows a herd unattended but never past the pasture capacity', () => {
    const harness = createHarness(137);
    harness.state.animals = {};
    idleColony(harness.state);
    const tiles = pastureTiles(harness.state, 4);
    harness.state = placePastureZone(harness.state, tiles);
    const zoneId = Object.keys(harness.state.zones).find(
      (id) => harness.state.zones[id].type === 'pasture',
    )!;
    stockPasture(harness.state, 'deer', zoneId, 2);
    const capacity = pastureCapacity(harness.state, zoneId);
    expect(capacity).toBe(Math.floor(tiles.length / PASTURE_TILES_PER_ANIMAL));

    harness.run(9000, (state) => {
      keepHerdOnly(state);
      expect(herdSize(state, zoneId)).toBeLessThanOrEqual(capacity);
    });

    expect(herdSize(harness.state, zoneId)).toBeGreaterThan(2);
    for (const id in harness.state.animals) {
      const animal = harness.state.animals[id];
      expect(animal.tame).toBe(true);
      expect(animal.pastureZoneId).toBe(zoneId);
    }
  });

  it('never breeds a herd that is already at capacity', () => {
    const harness = createHarness(139);
    harness.state.animals = {};
    idleColony(harness.state);
    const tiles = pastureTiles(harness.state, 4);
    harness.state = placePastureZone(harness.state, tiles);
    const zoneId = Object.keys(harness.state.zones).find(
      (id) => harness.state.zones[id].type === 'pasture',
    )!;
    const capacity = pastureCapacity(harness.state, zoneId);
    stockPasture(harness.state, 'deer', zoneId, capacity);

    harness.run(6000, keepHerdOnly);
    expect(herdSize(harness.state, zoneId)).toBe(capacity);
  });

  it('has tamed chickens lay food inside the pasture', () => {
    const harness = createHarness(149);
    harness.state.animals = {};
    idleColony(harness.state); // nobody hauls, so the eggs stay where they land
    const tiles = pastureTiles(harness.state, 4);
    harness.state = placePastureZone(harness.state, tiles);
    const zoneId = Object.keys(harness.state.zones).find(
      (id) => harness.state.zones[id].type === 'pasture',
    )!;
    stockPasture(harness.state, 'chicken', zoneId, 2);

    const before = foodOutsideStorage(harness.state);
    harness.run(SPECIES.chicken.produceIntervalTicks * 2 + 100, keepHerdOnly);
    expect(foodOutsideStorage(harness.state)).toBeGreaterThanOrEqual(
      before + SPECIES.chicken.produceAmount,
    );
  });
});

// --- performance: the herd must not eat the pathfinding budget ----------------

describe('animal pathfinding budget', () => {
  it('caps A* calls per tick no matter how big the herd is', () => {
    const harness = createHarness(151);
    harness.state.animals = {};
    idleColony(harness.state); // no job assignment, so every A* call is an animal's
    for (const id in harness.state.colonists) {
      const colonist = harness.state.colonists[id];
      harness.state.colonists[id] = { ...colonist, needs: { hunger: 0, sleep: 0 } };
    }

    const centre = centreOf(harness.state);
    for (let i = 0; i < 30; i++) {
      const spot = freeTileNear(harness.state, centre, 6 + (i % 9));
      const wolf = createAnimal(harness.state, 'wolf', spot.x, spot.y);
      harness.state.animals[wolf.id] = { ...wolf, hunger: 100 };
    }

    const ticks = 40;
    pathCalls.count = 0;
    harness.run(ticks);
    expect(pathCalls.count).toBeLessThanOrEqual(ticks * ANIMAL_PATH_BUDGET_PER_TICK);
  });
});
