// A finished building used to be permanent: a wall placed one tile off stayed
// there forever. `deconstruct` is an ordinary job (build work, tile reservation,
// five-stage lifecycle) whose effect is removal plus a partial refund.
import { describe, expect, it } from 'vitest';
import { cancelBlueprint, placeBuildingBlueprint, setDesignation } from './actions';
import { BUILDING_COSTS, DECONSTRUCT_REFUND } from './constants';
import { tileIdOf } from './state';
import { createHarness } from './testUtils';
import type { GameState } from './types';

function centre(state: GameState) {
  return Object.values(state.colonists)[0].position;
}

/** Place a wall and let the colony finish it. */
function finishedWall(harness: ReturnType<typeof createHarness>): { tileId: string } {
  const at = centre(harness.state);
  const tileId = tileIdOf(at.x + 2, at.y - 6);
  harness.state = placeBuildingBlueprint(harness.state, 'wall', [tileId]);
  for (let i = 0; i < 2000; i++) {
    harness.run(1);
    const buildingId = harness.state.tiles[tileId].buildingId;
    if (buildingId && !harness.state.buildings[buildingId].isBlueprint) return { tileId };
  }
  throw new Error('the wall never got built');
}

function woodOnTile(state: GameState, tileId: string): number {
  return state.tiles[tileId].itemIds
    .map((id) => state.items[id])
    .filter((item) => item.type === 'wood')
    .reduce((sum, item) => sum + item.quantity, 0);
}

describe('dismantling a finished building', () => {
  it('removes the wall, refunds half the wood and reopens the tile', () => {
    const harness = createHarness(401);
    const { tileId } = finishedWall(harness);
    expect(harness.state.tiles[tileId].walkable).toBe(false);

    harness.state = setDesignation(harness.state, [tileId], 'deconstruct');
    expect(harness.state.tiles[tileId].designation).toBe('deconstruct');

    let done = false;
    for (let i = 0; i < 2000 && !done; i++) {
      harness.run(1);
      done = harness.state.tiles[tileId].buildingId === null;
    }
    expect(done).toBe(true);

    const tile = harness.state.tiles[tileId];
    expect(tile.walkable).toBe(true); // and the region labels were invalidated
    expect(tile.designation).toBeNull();
    const cost = BUILDING_COSTS.wall.find((c) => c.type === 'wood')!.quantity;
    expect(woodOnTile(harness.state, tileId)).toBe(Math.floor(cost * DECONSTRUCT_REFUND));
    expect(harness.state.log.some((entry) => entry.key === 'buildingDismantled')).toBe(true);
    // paths run through it again rather than round it
    harness.run(200);
    expect(harness.state.tiles[tileId].walkable).toBe(true);
  });

  it('refuses to mark a blueprint or a storage marker', () => {
    const harness = createHarness(409);
    const at = centre(harness.state);
    const blueprint = tileIdOf(at.x + 3, at.y - 6);
    harness.state = placeBuildingBlueprint(harness.state, 'wall', [blueprint]);
    harness.state = setDesignation(harness.state, [blueprint], 'deconstruct');
    // a blueprint is cancelled, not dismantled: nothing has been spent yet
    expect(harness.state.tiles[blueprint].designation).toBeNull();
    harness.state = cancelBlueprint(harness.state, [blueprint]);
    expect(harness.state.tiles[blueprint].buildingId).toBeNull();

    const storageId = Object.keys(harness.state.zones).find(
      (id) => harness.state.zones[id].type === 'storage',
    )!;
    const markerTile = harness.state.zones[storageId].tileIds[0];
    harness.state = setDesignation(harness.state, [markerTile], 'deconstruct');
    expect(harness.state.tiles[markerTile].designation).toBeNull();
  });

  it('drops the job when the designation is taken back', () => {
    const harness = createHarness(413);
    const { tileId } = finishedWall(harness);
    harness.state = setDesignation(harness.state, [tileId], 'deconstruct');
    harness.run(5);
    expect(Object.values(harness.state.jobs).some((j) => j.type === 'deconstruct')).toBe(true);

    harness.state = setDesignation(harness.state, [tileId], null);
    harness.run(5);
    expect(Object.values(harness.state.jobs).some((j) => j.type === 'deconstruct')).toBe(false);
    expect(harness.state.tiles[tileId].buildingId).not.toBeNull();
    expect(harness.state.reservations[tileId]).toBeUndefined();
  });

  it('frees a bed nobody may keep sleeping in', () => {
    const harness = createHarness(419);
    const bed = Object.values(harness.state.buildings).find((b) => b.type === 'bed')!;
    // pretend a colonist claimed it, as the sleep behaviour would
    const colonistId = Object.keys(harness.state.colonists)[0];
    harness.state.colonists[colonistId] = {
      ...harness.state.colonists[colonistId],
      activity: { kind: 'sleeping', bedId: bed.id },
    };
    harness.state.reservations = {
      ...harness.state.reservations,
      [bed.id]: { entityId: bed.id, jobId: 'need-sleep', colonistId },
    };

    harness.state = setDesignation(harness.state, [bed.tileId], 'deconstruct');
    let gone = false;
    for (let i = 0; i < 3000 && !gone; i++) {
      harness.run(1);
      gone = harness.state.buildings[bed.id] === undefined;
    }
    expect(gone).toBe(true);
    expect(harness.state.reservations[bed.id]).toBeUndefined();
    for (const id in harness.state.colonists) {
      const activity = harness.state.colonists[id].activity;
      if (activity.kind === 'sleeping') expect(activity.bedId).not.toBe(bed.id);
    }
  });
});
