// Playing badly, on purpose.
//
// The wall bug - a builder sealing themselves inside what they were building,
// after which every job on the map read as unreachable to them - was found by
// looking at a screenshot and noticing three idle colonists next to a queue.
// That is luck, and it does not scale. This is the general form: drive the game
// with a stream of arbitrary player actions and, after every round, assert the
// things that must be true of any state the game can possibly be in.
//
// The actions are seeded, so a failure here is a reproducible failure. The
// invariants are deliberately structural rather than behavioural - "this state
// is describable" rather than "the colony is doing well" - because a fuzzer
// that asserts taste finds nothing but its own opinions.
import { describe, expect, it } from 'vitest';
import {
  cancelBlueprint,
  designateAnimals,
  placeBuildingBlueprint,
  placePastureZone,
  placeStorageZone,
  removeZoneTiles,
  setDesignation,
  setJobPriority,
  setZoneAccepts,
} from './actions';
import { DEFAULT_MAP_WIDTH, RESOURCE_TYPES } from './constants';
import { mulberry32 } from './rng';
import { tileIdOf } from './state';
import { candidatesFor } from './jobs/assign';
import { createHarness } from './testUtils';
import { JOB_TYPES } from './types';
import type { BuildingType, Designation, GameState } from './types';

const BUILDINGS: BuildingType[] = [
  'wall',
  'stoneWall',
  'floor',
  'stoneFloor',
  'door',
  'bed',
  'farmPlot',
];
const DESIGNATIONS: (Designation | null)[] = ['chop', 'mine', 'deconstruct', null];

/** A rectangle of tile ids somewhere on the map, as a drag would produce. */
function rectangle(state: GameState, rnd: () => number, size: number): string[] {
  const x0 = Math.floor(rnd() * state.width);
  const y0 = Math.floor(rnd() * state.height);
  const w = 1 + Math.floor(rnd() * size);
  const h = 1 + Math.floor(rnd() * size);
  const ids: string[] = [];
  for (let y = y0; y < Math.min(state.height, y0 + h); y++) {
    for (let x = x0; x < Math.min(state.width, x0 + w); x++) ids.push(tileIdOf(x, y));
  }
  return ids;
}

/** One arbitrary thing a player could do. */
function act(state: GameState, rnd: () => number): GameState {
  const roll = Math.floor(rnd() * 9);
  switch (roll) {
    case 0:
      return setDesignation(
        state,
        rectangle(state, rnd, 5),
        DESIGNATIONS[Math.floor(rnd() * DESIGNATIONS.length)],
      );
    case 1:
      return placeBuildingBlueprint(
        state,
        BUILDINGS[Math.floor(rnd() * BUILDINGS.length)],
        rectangle(state, rnd, 4),
      );
    case 2:
      return cancelBlueprint(state, rectangle(state, rnd, 6));
    case 3:
      return placeStorageZone(state, rectangle(state, rnd, 3));
    case 4:
      return placePastureZone(state, rectangle(state, rnd, 4));
    case 5:
      return removeZoneTiles(state, rectangle(state, rnd, 3));
    case 6: {
      const marks = ['hunt', 'tame', 'slaughter', null] as const;
      return designateAnimals(state, rectangle(state, rnd, 8), marks[Math.floor(rnd() * marks.length)]);
    }
    case 7: {
      const ids = Object.keys(state.colonists);
      if (ids.length === 0) return state;
      return setJobPriority(
        state,
        ids[Math.floor(rnd() * ids.length)],
        JOB_TYPES[Math.floor(rnd() * JOB_TYPES.length)],
        Math.floor(rnd() * 4),
      );
    }
    default: {
      const zoneIds = Object.keys(state.zones);
      if (zoneIds.length === 0) return state;
      return setZoneAccepts(
        state,
        zoneIds[Math.floor(rnd() * zoneIds.length)],
        RESOURCE_TYPES[Math.floor(rnd() * RESOURCE_TYPES.length)],
        rnd() < 0.5,
      );
    }
  }
}

/** Everything that has to be true of any state the game can reach. */
function assertDescribable(state: GameState): void {
  for (const id in state.colonists) {
    const colonist = state.colonists[id];
    const tile = state.tiles[tileIdOf(colonist.position.x, colonist.position.y)];
    expect(tile).toBeDefined();
    // the wall bug: an entity on an unwalkable tile has no region, and from
    // that moment every job on the map is unreachable to it
    expect(tile.walkable).toBe(true);
    if (colonist.currentJobId) {
      const job = state.jobs[colonist.currentJobId];
      expect(job).toBeDefined();
      expect(job.reservedBy).toBe(id);
    }
  }

  for (const id in state.animals) {
    const animal = state.animals[id];
    expect(state.tiles[tileIdOf(animal.position.x, animal.position.y)]).toBeDefined();
    if (animal.reservedByJobId) expect(state.jobs[animal.reservedByJobId]).toBeDefined();
  }

  // equipment (フェーズ8 E-1): exactly one of wornBy/position, and a wearer
  // that actually exists - the one-way reference must never dangle
  for (const id in state.equipment ?? {}) {
    const piece = state.equipment[id];
    expect(piece.wornBy === null).not.toBe(piece.position === null);
    if (piece.wornBy) expect(state.colonists[piece.wornBy]).toBeDefined();
    expect(piece.condition).toBeGreaterThan(0);
    expect(piece.condition).toBeLessThanOrEqual(1);
  }

  // the three records that hold a lock have to agree, always
  for (const entityId in state.reservations) {
    const reservation = state.reservations[entityId];
    expect(state.colonists[reservation.colonistId]).toBeDefined();
    if (!reservation.jobId.startsWith('need-')) {
      const job = state.jobs[reservation.jobId];
      expect(job).toBeDefined();
      expect(job.reservedBy).toBe(reservation.colonistId);
    }
  }

  // buildings and the tiles they stand on point at each other
  for (const id in state.buildings) {
    const building = state.buildings[id];
    const tile = state.tiles[building.tileId];
    expect(tile).toBeDefined();
    expect(tile.buildingId).toBe(id);
  }
  for (const tileId in state.tiles) {
    const tile = state.tiles[tileId];
    if (tile.buildingId) expect(state.buildings[tile.buildingId]).toBeDefined();
    for (const itemId of tile.itemIds) {
      const item = state.items[itemId];
      expect(item).toBeDefined();
      expect(tileIdOf(item.position.x, item.position.y)).toBe(tileId);
    }
  }

  // and every stack is on the tile that lists it
  for (const id in state.items) {
    const item = state.items[id];
    const tile = state.tiles[tileIdOf(item.position.x, item.position.y)];
    expect(tile).toBeDefined();
    expect(tile.itemIds).toContain(id);
    expect(item.quantity).toBeGreaterThan(0);
    if (item.reservedByJobId && !item.reservedByJobId.startsWith('need-')) {
      expect(state.jobs[item.reservedByJobId]).toBeDefined();
    }
  }

  // zones only ever cover real tiles, and only take real resources
  for (const zoneId in state.zones) {
    const zone = state.zones[zoneId];
    expect(zone.tileIds.length).toBeGreaterThan(0);
    for (const tileId of zone.tileIds) expect(state.tiles[tileId]).toBeDefined();
    for (const type of zone.accepts) expect(RESOURCE_TYPES).toContain(type);
  }
}

/**
 * Idle beside work you could be doing.
 *
 * This is the wall bug stated directly: colonists standing about while jobs sit
 * pending. It asks the assignment stage itself which jobs are candidates, so it
 * cannot drift from the engine's definition - a second copy of that rule
 * written here would eventually stop describing the real one.
 *
 * A colonist can legitimately be idle for a tick or two: the path-attempt
 * budget is per tick, and a job may be claimed by someone else in between. What
 * is never legitimate is idling for hundreds of ticks with a job the engine
 * agrees they could take.
 */
function stalledColonists(
  harness: ReturnType<typeof createHarness>,
  ticks: number,
): Record<string, number> {
  const streak: Record<string, number> = {};
  const worst: Record<string, number> = {};
  harness.run(ticks, (state) => {
    for (const id in state.colonists) {
      const colonist = state.colonists[id];
      const free = !colonist.currentJobId && colonist.activity.kind === 'none';
      const hasWork = free && candidatesFor(state, harness.ctx, id).length > 0;
      streak[id] = hasWork ? (streak[id] ?? 0) + 1 : 0;
      worst[id] = Math.max(worst[id] ?? 0, streak[id]);
    }
  });
  return worst;
}

describe('playing badly', () => {
  it('cannot wedge the colony into a state that does not make sense', () => {
    const harness = createHarness(9501);
    const rnd = mulberry32(9501);
    // A new world's clock starts at dawn, not at zero (START_TICK, issue #25),
    // so what this test is actually claiming - "every round advanced the clock,
    // nothing seized up" - is about elapsed ticks, not an absolute reading.
    const startTick = harness.state.tick;

    for (let round = 0; round < 40; round++) {
      // a burst of orders, then time to carry them out
      for (let i = 0; i < 3; i++) harness.state = act(harness.state, rnd);
      harness.run(200);
      assertDescribable(harness.state);
    }

    // and after all that the game is still running rather than seized up
    expect(harness.state.tick - startTick).toBe(40 * 200);
    expect(Object.keys(harness.state.colonists).length).toBeGreaterThan(0);
  }, 120000);

  it('holds the same invariants on the map the game ships', () => {
    // The invariants are statements about the shape of the state, so they
    // should not depend on how big the map is - which is a claim, and this is
    // where it gets checked (docs/design-phase6-space.md 5, A-3).
    const harness = createHarness(9507, DEFAULT_MAP_WIDTH);
    const rnd = mulberry32(9507);
    for (let round = 0; round < 12; round++) {
      for (let i = 0; i < 3; i++) harness.state = act(harness.state, rnd);
      harness.run(200);
      assertDescribable(harness.state);
    }
    expect(Object.keys(harness.state.colonists).length).toBeGreaterThan(0);
  }, 300000);

  it('holds up under a different stream of nonsense', () => {
    // a second seed, because one sequence is one sequence
    const harness = createHarness(9511);
    const rnd = mulberry32(9511);
    for (let round = 0; round < 40; round++) {
      for (let i = 0; i < 3; i++) harness.state = act(harness.state, rnd);
      harness.run(200);
      assertDescribable(harness.state);
    }
    expect(Object.keys(harness.state.colonists).length).toBeGreaterThan(0);
  }, 120000);

  it('never leaves anyone idle beside work the engine says they could take', () => {
    // This was written to be "the wall bug stated directly", and it is not:
    // reverting the wall fix leaves it passing. A colonist sealed inside a wall
    // has no region, so isReachable rejects every job and the engine honestly
    // reports that there is no work for them - the queue was never the broken
    // part, the point of view was. The walkable-tile assertion above is what
    // catches that one.
    //
    // It is still worth having, for the different wedge: work that is takeable
    // by the engine's own rule and never taken.
    const harness = createHarness(9531);
    const rnd = mulberry32(9531);

    let longest = 0;
    for (let round = 0; round < 15; round++) {
      for (let i = 0; i < 2; i++) harness.state = act(harness.state, rnd);
      const worst = stalledColonists(harness, 400);
      longest = Math.max(longest, ...Object.values(worst));
      assertDescribable(harness.state);
    }
    // a tick or two of hesitation is the path budget; hundreds is a wedge
    expect(longest).toBeLessThan(200);
  }, 120000);

  it('never loses or invents a resource while shuffling it about', () => {
    // hauling moves stacks between the ground, colonists' hands and storage;
    // none of those transfers may change the total
    const harness = createHarness(9521);
    const rnd = mulberry32(9521);
    const total = (state: GameState) => {
      let sum = 0;
      for (const id in state.items) sum += state.items[id].quantity;
      for (const id in state.colonists) sum += state.colonists[id].carrying?.quantity ?? 0;
      return sum;
    };

    for (let round = 0; round < 20; round++) {
      // only orders that move things, never ones that create or consume them
      harness.state = designateAnimals(harness.state, rectangle(harness.state, rnd, 8), null);
      harness.state = placeStorageZone(harness.state, rectangle(harness.state, rnd, 3));
      const before = total(harness.state);
      harness.run(120);
      const after = total(harness.state);
      // food is eaten and crops are harvested, so this is a band rather than an
      // equality: what it catches is a stack vanishing or doubling
      expect(after).toBeGreaterThan(before - 200);
      expect(after).toBeLessThan(before + 400);
      assertDescribable(harness.state);
    }
  }, 120000);
});
