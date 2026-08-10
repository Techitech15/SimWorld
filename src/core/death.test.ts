// A colonist is the anchor of a job, a set of reservations and a carried stack.
// Removing the record without releasing those leaves the world permanently
// worse off: the job never runs again and the tree stays locked forever.
import { describe, expect, it } from 'vitest';
import { setDesignation } from './actions';
import { killColonist } from './death';
import { createHarness, nearestTilesWithTerrain } from './testUtils';
import type { GameState } from './types';

/** Run until someone holds a job with a reservation, then hand them a stack. */
function colonistMidJob(harness: ReturnType<typeof createHarness>): string {
  const centre = Object.values(harness.state.colonists)[0].position;
  harness.state = setDesignation(
    harness.state,
    nearestTilesWithTerrain(harness.state, 'forest', centre, 20),
    'chop',
  );
  let found: string | null = null;
  for (let i = 0; i < 200 && !found; i++) {
    harness.run(1);
    for (const id in harness.state.colonists) {
      if (harness.state.colonists[id].currentJobId) found = id;
    }
  }
  if (!found) throw new Error('no colonist picked up a job');
  harness.state.colonists[found] = {
    ...harness.state.colonists[found],
    carrying: { type: 'wood', quantity: 20 },
  };
  return found;
}

function reservationsOf(state: GameState, colonistId: string): string[] {
  return Object.keys(state.reservations).filter(
    (key) => state.reservations[key].colonistId === colonistId,
  );
}

describe('losing a colonist', () => {
  it('releases the job, every reservation and the carried stack', () => {
    const harness = createHarness(211);
    const colonistId = colonistMidJob(harness);
    const jobId = harness.state.colonists[colonistId].currentJobId!;
    const at = { ...harness.state.colonists[colonistId].position };
    expect(reservationsOf(harness.state, colonistId).length).toBeGreaterThan(0);

    killColonist(harness.state, colonistId, { key: 'colonistKilled' });

    expect(harness.state.colonists[colonistId]).toBeUndefined();
    expect(reservationsOf(harness.state, colonistId)).toEqual([]);
    expect(harness.state.jobs[jobId].reservedBy).toBeNull();
    expect(harness.state.jobs[jobId].state).toBe('cancelled');
    // the wood they were carrying is on the ground where they fell
    const dropped = Object.values(harness.state.items).filter(
      (item) => item.type === 'wood' && item.position.x === at.x && item.position.y === at.y,
    );
    expect(dropped.reduce((sum, item) => sum + item.quantity, 0)).toBeGreaterThanOrEqual(20);
    expect(harness.state.log.some((entry) => entry.key === 'colonistKilled')).toBe(true);
  });

  it('leaves the survivors able to take over the work', () => {
    const harness = createHarness(223);
    const colonistId = colonistMidJob(harness);
    const tileId = harness.state.jobs[harness.state.colonists[colonistId].currentJobId!].targetTileId!;

    killColonist(harness.state, colonistId, { key: 'colonistKilled' });
    harness.run(400);

    // the tree the dead colonist had reserved is either felled or reserved by
    // somebody else - what must not happen is it staying locked by a ghost
    const holder = harness.state.reservations[tileId]?.colonistId;
    if (holder) expect(harness.state.colonists[holder]).toBeDefined();
    expect(harness.state.tiles[tileId].terrain === 'grass' || holder !== undefined).toBe(true);
  });

  it('notes it in the log when the last colonist dies', () => {
    const harness = createHarness(227);
    for (const id of Object.keys(harness.state.colonists)) {
      killColonist(harness.state, id, { key: 'colonistKilled' });
    }
    expect(harness.state.log.some((entry) => entry.key === 'colonyDiedOut')).toBe(true);
    // and the world keeps ticking rather than throwing
    expect(() => harness.run(50)).not.toThrow();
  });
});
