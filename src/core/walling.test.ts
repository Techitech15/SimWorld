// Building a wall used to seal the builder inside it.
//
// A blueprint tile is walkable right up until the wall goes up, so the builder
// stood on the tile and finished the wall around themselves. An entity on an
// unwalkable tile has no region label, and isReachable starts by asking for the
// region it is standing in - so from that moment every job on the map read as
// unreachable to them and they idled for ever, with work queued and nobody
// holding a reservation. Three walls of a six-wall row went up and the whole
// colony stopped.
import { describe, expect, it } from 'vitest';
import { placeBuildingBlueprint } from './actions';
import { BLOCKS_MOVEMENT } from './constants';
import { regionAt } from './derived';
import { tileIdOf } from './state';
import { createHarness } from './testUtils';
import type { GameState } from './types';

function standingInsideAWall(state: GameState): string[] {
  const stuck: string[] = [];
  for (const id in state.colonists) {
    const at = state.colonists[id].position;
    if (!state.tiles[tileIdOf(at.x, at.y)]?.walkable) stuck.push(state.colonists[id].name);
  }
  return stuck;
}

describe('building a wall', () => {
  it('never leaves anyone standing inside one', () => {
    const harness = createHarness(9401);
    const at = Object.values(harness.state.colonists)[0].position;
    // straight through where the colonists are standing and working, which is
    // exactly where a player draws a wall
    const tiles: string[] = [];
    for (let d = -3; d <= 3; d++) tiles.push(tileIdOf(at.x + d, at.y));
    harness.state = placeBuildingBlueprint(harness.state, 'wall', tiles);

    harness.run(1500, (state) => {
      expect(standingInsideAWall(state)).toEqual([]);
    });
  });

  it('finishes the whole row rather than stalling halfway', () => {
    const harness = createHarness(9401);
    const at = Object.values(harness.state.colonists)[0].position;
    const tiles: string[] = [];
    for (let d = 0; d < 6; d++) tiles.push(tileIdOf(at.x - 2 + d, at.y - 8));
    harness.state = placeBuildingBlueprint(harness.state, 'wall', tiles);
    const planned = Object.values(harness.state.buildings).filter((b) => b.isBlueprint).length;
    expect(planned).toBe(6);

    harness.run(2500);

    const unfinished = Object.values(harness.state.buildings).filter((b) => b.isBlueprint);
    expect(unfinished).toEqual([]);
  });

  it('leaves the colony able to find work afterwards', () => {
    const harness = createHarness(9407);
    const at = Object.values(harness.state.colonists)[0].position;
    const tiles: string[] = [];
    for (let d = 0; d < 6; d++) tiles.push(tileIdOf(at.x - 2 + d, at.y - 8));
    harness.state = placeBuildingBlueprint(harness.state, 'wall', tiles);
    harness.run(2500);

    // everybody is somewhere they can walk out of
    for (const id in harness.state.colonists) {
      const position = harness.state.colonists[id].position;
      expect(regionAt(harness.ctx, position.x, position.y)).toBeGreaterThanOrEqual(0);
    }
    // and the colony is working again rather than sitting on a queue
    const before = harness.state.tick;
    harness.run(900);
    const working = Object.values(harness.state.colonists).some(
      (c) => c.currentJobId !== null || c.activity.kind !== 'none',
    );
    expect(working).toBe(true);
    expect(harness.state.tick).toBe(before + 900);
  });

  it('pushes aside anything caught on the tile when the wall closes', () => {
    // the builder now stands next to the wall, but the tile stays walkable
    // until the last tick, so a passer-by can still be on it
    const harness = createHarness(9411);
    const at = Object.values(harness.state.colonists)[0].position;
    const tileId = tileIdOf(at.x + 4, at.y);
    harness.state = placeBuildingBlueprint(harness.state, 'wall', [tileId]);

    let sealed = false;
    harness.run(2000, (state) => {
      const tile = state.tiles[tileId];
      if (tile.walkable) return;
      sealed = true;
      // nothing may be standing here, this tick or any tick after it
      for (const id in state.colonists) {
        const position = state.colonists[id].position;
        expect(`${position.x},${position.y}`).not.toBe(tileId);
      }
      for (const id in state.animals) {
        const position = state.animals[id].position;
        expect(`${position.x},${position.y}`).not.toBe(tileId);
      }
    });
    expect(sealed).toBe(true);
  });

  it('still lets a floor be built from on top of it', () => {
    // only structures that block movement need standing back from; a floor is
    // laid under your feet
    expect(BLOCKS_MOVEMENT.floor).toBe(false);
    const harness = createHarness(9413);
    const at = Object.values(harness.state.colonists)[0].position;
    const tiles = [tileIdOf(at.x + 2, at.y + 1), tileIdOf(at.x + 3, at.y + 1)];
    harness.state = placeBuildingBlueprint(harness.state, 'floor', tiles);

    harness.run(1500);

    const unfinished = Object.values(harness.state.buildings).filter((b) => b.isBlueprint);
    expect(unfinished).toEqual([]);
    for (const tileId of tiles) expect(harness.state.tiles[tileId].walkable).toBe(true);
  });
});
