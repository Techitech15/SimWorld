// Saving mid-action is the case where a reservation bug would hide: the lock
// lives in three places at once (state.reservations, job.reservedBy and the
// entity's own reservedByJobId), and a load that restores two of the three
// leaves work that can never finish or an entity two colonists both own.
import { describe, expect, it } from 'vitest';
import { designateAnimals, placeBuildingBlueprint, setDesignation } from './actions';
import { createSimContext } from './derived';
import { tickMany } from './simulation';
import { tileIdOf } from './state';
import { createHarness, nearestTilesWithTerrain } from './testUtils';
import { createAnimal } from './worldgen';
import type { GameState } from './types';

/** Every lock in the world, as the three records that must agree. */
function lockReport(state: GameState) {
  const byEntity = new Map<string, string>();
  for (const entityId in state.reservations) {
    byEntity.set(entityId, state.reservations[entityId].colonistId);
  }
  const heldJobs = new Set<string>();
  for (const id in state.colonists) {
    const jobId = state.colonists[id].currentJobId;
    if (jobId) heldJobs.add(jobId);
  }
  return { byEntity, heldJobs };
}

function assertLocksAgree(state: GameState): void {
  for (const entityId in state.reservations) {
    const reservation = state.reservations[entityId];
    if (!reservation.jobId.startsWith('need-')) {
      const job = state.jobs[reservation.jobId];
      expect(job).toBeDefined();
      expect(job.reservedBy).toBe(reservation.colonistId);
    }
    expect(state.colonists[reservation.colonistId]).toBeDefined();
  }
  // an animal that thinks it is claimed must be claimed by a job that exists
  for (const id in state.animals) {
    const jobId = state.animals[id].reservedByJobId;
    if (jobId) expect(state.jobs[jobId]).toBeDefined();
  }
  for (const id in state.items) {
    const jobId = state.items[id].reservedByJobId;
    if (jobId && !jobId.startsWith('need-')) expect(state.jobs[jobId]).toBeDefined();
  }
}

describe('saving in the middle of everything', () => {
  it('keeps two map sizes apart in one process', () => {
    // The failure this exists for: a 60x60 save loaded into a session that was
    // showing a 120x120 one. Everything indexed by width - the region labels,
    // the A* grid, the minimap buffer - is silently wrong at the other stride
    // rather than loudly broken (docs/design-phase6-space.md 5, A-1).
    const small = createHarness(1951, 60);
    const large = createHarness(1953, 120);
    expect(small.state.width).toBe(60);
    expect(large.state.width).toBe(120);

    const smallSave = JSON.parse(JSON.stringify(small.state)) as GameState;
    const largeSave = JSON.parse(JSON.stringify(large.state)) as GameState;
    expect(Object.keys(smallSave.tiles).length).toBe(60 * 60);
    expect(Object.keys(largeSave.tiles).length).toBe(120 * 120);

    // reload them the other way round, each with its own rebuilt caches
    small.state = largeSave;
    small.ctx = createSimContext(largeSave);
    large.state = smallSave;
    large.ctx = createSimContext(smallSave);
    small.run(60);
    large.run(60);

    for (const harness of [small, large]) {
      for (const id in harness.state.colonists) {
        const at = harness.state.colonists[id].position;
        expect(at.x).toBeLessThan(harness.state.width);
        expect(at.y).toBeLessThan(harness.state.height);
        expect(harness.state.tiles[tileIdOf(at.x, at.y)].walkable).toBe(true);
      }
    }
  });

  it('restores hunts, builds and chops without losing or duplicating a claim', () => {
    const harness = createHarness(1901);
    const at = Object.values(harness.state.colonists)[0].position;

    // three kinds of work in flight at once
    harness.state = setDesignation(
      harness.state,
      nearestTilesWithTerrain(harness.state, 'forest', at, 12),
      'chop',
    );
    harness.state = placeBuildingBlueprint(harness.state, 'wall', [tileIdOf(at.x + 2, at.y - 6)]);
    const deer = createAnimal(harness.state, 'deer', at.x + 4, at.y + 1);
    harness.state = designateAnimals(harness.state, [tileIdOf(at.x + 4, at.y + 1)], 'hunt');

    harness.run(240);
    expect(Object.keys(harness.state.reservations).length).toBeGreaterThan(0);
    assertLocksAgree(harness.state);
    const before = lockReport(harness.state);

    // the save is literally JSON, so this is the round trip the game performs
    const reloaded = JSON.parse(JSON.stringify(harness.state)) as GameState;
    const after = lockReport(reloaded);
    expect([...after.byEntity.entries()]).toEqual([...before.byEntity.entries()]);
    expect([...after.heldJobs]).toEqual([...before.heldJobs]);
    assertLocksAgree(reloaded);

    // and it keeps running: the derived caches are rebuilt, not saved
    const ctx = createSimContext(reloaded);
    const continued = tickMany(reloaded, ctx, 600);
    assertLocksAgree(continued);
    expect(continued.tick).toBe(harness.state.tick + 600);
    // the deer either got hunted or is still claimed by exactly one job
    const survivor = continued.animals[deer.id];
    if (survivor?.reservedByJobId) {
      expect(continued.jobs[survivor.reservedByJobId]).toBeDefined();
    }
  });

  it('never lets two colonists hold the same entity after a reload', () => {
    const harness = createHarness(1907);
    const at = Object.values(harness.state.colonists)[0].position;
    harness.state = setDesignation(
      harness.state,
      nearestTilesWithTerrain(harness.state, 'forest', at, 30),
      'chop',
    );

    for (let round = 0; round < 4; round++) {
      harness.run(150);
      const reloaded = JSON.parse(JSON.stringify(harness.state)) as GameState;
      harness.state = reloaded;
      harness.ctx = createSimContext(reloaded);

      const owners = new Map<string, string>();
      for (const entityId in harness.state.reservations) {
        const owner = harness.state.reservations[entityId].colonistId;
        expect(owners.has(entityId)).toBe(false);
        owners.set(entityId, owner);
      }
      assertLocksAgree(harness.state);
    }
  });
});
