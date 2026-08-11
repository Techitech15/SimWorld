// Week 4 acceptance (section 10): mass designations across three colonists must
// never produce two colonists walking to the same tree.
import { describe, expect, it } from 'vitest';
import { placeBuildingBlueprint, setDesignation } from './actions';
import { createHarness, nearestTilesWithTerrain } from './testUtils';
import type { GameState } from './types';

function colonyCentre(state: GameState) {
  const first = Object.values(state.colonists)[0];
  return { x: first.position.x, y: first.position.y };
}

/** Nobody may hold the same job, and no entity may be reserved twice. */
function assertNoDoubleBooking(state: GameState): void {
  const jobsHeld = new Set<string>();
  for (const id in state.colonists) {
    const jobId = state.colonists[id].currentJobId;
    if (!jobId) continue;
    expect(jobsHeld.has(jobId)).toBe(false);
    jobsHeld.add(jobId);
    expect(state.jobs[jobId]?.reservedBy).toBe(id);
  }
  const owners = new Map<string, string>();
  for (const entityId in state.reservations) {
    const reservation = state.reservations[entityId];
    expect(owners.has(entityId)).toBe(false);
    owners.set(entityId, reservation.colonistId);
    // a reservation always belongs to a live job or to a need behaviour
    if (reservation.jobId.startsWith('need-')) continue;
    const job = state.jobs[reservation.jobId];
    expect(job).toBeDefined();
    expect(job.reservedBy).toBe(reservation.colonistId);
  }
}

describe('job lifecycle', () => {
  it('never sends two colonists to the same tree', () => {
    const harness = createHarness(7);
    const centre = colonyCentre(harness.state);
    const trees = nearestTilesWithTerrain(harness.state, 'forest', centre, 40);
    harness.state = setDesignation(harness.state, trees, 'chop');

    let chopped = 0;
    harness.run(1500, (state) => {
      assertNoDoubleBooking(state);
      // two colonists must never target the same tile
      const targets = new Map<string, string>();
      for (const id in state.colonists) {
        const jobId = state.colonists[id].currentJobId;
        if (!jobId) continue;
        const job = state.jobs[jobId];
        if (!job?.targetTileId) continue;
        expect(targets.has(job.targetTileId)).toBe(false);
        targets.set(job.targetTileId, id);
      }
    });

    for (const tileId of trees) {
      if (harness.state.tiles[tileId].terrain === 'grass') chopped++;
    }
    expect(chopped).toBeGreaterThan(10);
    expect(harness.state.log.filter((l) => l.key === 'jobFailed').length).toBe(0);
  });

  it('mines stone, turns the tile walkable and drops a stone stack', () => {
    const harness = createHarness(11);
    const centre = colonyCentre(harness.state);
    const rocks = nearestTilesWithTerrain(harness.state, 'stone', centre, 6);
    harness.state = setDesignation(harness.state, rocks, 'mine');
    harness.run(1200, assertNoDoubleBooking);

    const mined = rocks.filter((id) => harness.state.tiles[id].terrain === 'grass');
    expect(mined.length).toBeGreaterThan(0);
    for (const id of mined) expect(harness.state.tiles[id].walkable).toBe(true);
    const stone = Object.values(harness.state.items).filter((i) => i.type === 'stone');
    expect(stone.length).toBeGreaterThan(0);
  });

  it('hauls loose stacks into the storage zone and then leaves them alone', () => {
    const harness = createHarness(13);
    const centre = colonyCentre(harness.state);
    const trees = nearestTilesWithTerrain(harness.state, 'forest', centre, 6);
    harness.state = setDesignation(harness.state, trees, 'chop');
    harness.run(2000, assertNoDoubleBooking);

    const storageTiles = new Set(Object.values(harness.state.zones).flatMap((z) => z.tileIds));
    const wood = Object.values(harness.state.items).filter((i) => i.type === 'wood');
    const storedWood = wood.filter((i) => storageTiles.has(`${i.position.x},${i.position.y}`));
    expect(storedWood.length).toBeGreaterThan(0);

    // no haul job should exist for an item that already sits in storage
    for (const jobId in harness.state.jobs) {
      const job = harness.state.jobs[jobId];
      if (job.type !== 'haul' || !job.targetEntityId) continue;
      const item = harness.state.items[job.targetEntityId];
      if (!item) continue;
      const inStorage = storageTiles.has(`${item.position.x},${item.position.y}`);
      expect(inStorage && job.destinationId === null).toBe(false);
    }
  });

  it('builds a wall from hauled materials (week 6 acceptance)', () => {
    const harness = createHarness(17);
    const centre = colonyCentre(harness.state);
    const wallTiles = [`${centre.x + 3},${centre.y + 1}`, `${centre.x + 4},${centre.y + 1}`];
    harness.state = placeBuildingBlueprint(harness.state, 'wall', wallTiles);

    harness.run(1500, assertNoDoubleBooking);

    const walls = Object.values(harness.state.buildings).filter((b) => b.type === 'wall');
    expect(walls.length).toBe(2);
    expect(walls.every((w) => !w.isBlueprint)).toBe(true);
    for (const wall of walls) {
      expect(harness.state.tiles[wall.tileId].walkable).toBe(false);
    }
  });

  it('keeps colonists busy instead of re-assigning and cancelling the same job', () => {
    const harness = createHarness(17);
    const centre = colonyCentre(harness.state);
    harness.state = setDesignation(
      harness.state,
      nearestTilesWithTerrain(harness.state, 'forest', centre, 60),
      'chop',
    );

    const ticks = 2000;
    let idleWithWorkAvailable = 0;
    let longestIdleStreak = 0;
    const streak: Record<string, number> = {};

    harness.run(ticks, (state) => {
      const workAvailable = Object.values(state.jobs).some((j) => j.state === 'pending');
      for (const id in state.colonists) {
        const colonist = state.colonists[id];
        const idle = !colonist.currentJobId && colonist.activity.kind === 'none';
        if (idle && workAvailable) {
          idleWithWorkAvailable++;
          streak[id] = (streak[id] ?? 0) + 1;
          longestIdleStreak = Math.max(longestIdleStreak, streak[id]);
        } else {
          streak[id] = 0;
        }
      }
    });

    // one tick of slack between finishing a job and being handed the next one is
    // expected; anything longer means the queue is churning rather than working
    expect(longestIdleStreak).toBeLessThanOrEqual(2);
    expect(idleWithWorkAvailable).toBeLessThan(ticks * 3 * 0.1);
  });

  it('gives up on an unreachable job instead of retrying forever', () => {
    const harness = createHarness(19);
    const state = harness.state;
    // an isolated forest tile ringed by unwalkable stone
    const x = 50;
    const y = 50;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      state.tiles[`${x + dx},${y + dy}`] = {
        ...state.tiles[`${x + dx},${y + dy}`],
        terrain: 'stone',
        walkable: false,
      };
    }
    state.tiles[`${x},${y}`] = {
      ...state.tiles[`${x},${y}`],
      terrain: 'forest',
      walkable: true,
    };
    harness.ctx.regionsDirty = true;
    harness.state = setDesignation(state, [`${x},${y}`], 'chop');

    harness.run(400);

    const chopJobs = Object.values(harness.state.jobs).filter((j) => j.type === 'chop');
    // either never picked up (unreachable region) or failed out; never active
    expect(chopJobs.every((j) => j.state === 'pending' || j.state === 'failed')).toBe(true);
    for (const id in harness.state.colonists) {
      const jobId = harness.state.colonists[id].currentJobId;
      if (!jobId) continue;
      expect(harness.state.jobs[jobId].type).not.toBe('chop');
    }
  });
});
