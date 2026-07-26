// Week 3 acceptance (section 10): a colonist walks around obstacles to a
// clicked destination, and terrain changes invalidate exactly the affected paths.
import { describe, expect, it } from 'vitest';
import { orderMove } from './actions';
import { invalidateTile } from './derived';
import { findPath } from './pathfinding';
import { tileIdOf, updateTile } from './state';
import { createHarness, idleColony } from './testUtils';

describe('grid A*', () => {
  it('finds a 4-directional path and never returns diagonal steps', () => {
    const { state } = createHarness();
    const path = findPath(state, { x: 5, y: 5 }, { x: 9, y: 8 });
    expect(path).not.toBeNull();
    let previous = { x: 5, y: 5 };
    for (const step of path!) {
      expect(Math.abs(step.x - previous.x) + Math.abs(step.y - previous.y)).toBe(1);
      expect(state.tiles[tileIdOf(step.x, step.y)].walkable).toBe(true);
      previous = step;
    }
    expect(previous).toEqual({ x: 9, y: 8 });
  });

  it('routes around an unwalkable wall instead of through it', () => {
    const harness = createHarness();
    const state = harness.state;
    // clear a test arena, then seal a vertical wall across it with a single gap
    for (let y = 0; y <= 20; y++) {
      for (let x = 0; x <= 20; x++) {
        updateTile(state, tileIdOf(x, y), { walkable: true, terrain: 'grass' });
      }
    }
    for (let y = 0; y < 20; y++) {
      if (y === 12) continue;
      updateTile(state, tileIdOf(10, y), { walkable: false, terrain: 'stone' });
    }
    const path = findPath(state, { x: 8, y: 4 }, { x: 12, y: 4 });
    expect(path).not.toBeNull();
    expect(path!.some((step) => step.x === 10 && step.y === 12)).toBe(true);
  });

  it('returns null when the goal is walled off completely', () => {
    const harness = createHarness();
    const state = harness.state;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      updateTile(state, tileIdOf(20 + dx, 20 + dy), {
        walkable: false,
        terrain: 'stone',
      });
    }
    expect(findPath(state, { x: 5, y: 5 }, { x: 20, y: 20 })).toBeNull();
  });

  it('stops next to the goal when asked for an adjacent path', () => {
    const { state } = createHarness();
    updateTile(state, tileIdOf(15, 15), { walkable: false, terrain: 'stone' });
    const path = findPath(state, { x: 10, y: 15 }, { x: 15, y: 15 }, { adjacent: true });
    expect(path).not.toBeNull();
    const last = path![path!.length - 1];
    expect(Math.abs(last.x - 15) + Math.abs(last.y - 15)).toBe(1);
  });
});

describe('path cache and PathIndex', () => {
  it('walks a colonist to a clicked destination', () => {
    const harness = createHarness();
    const colonistId = Object.keys(harness.state.colonists)[0];
    idleColony(harness.state);
    const start = harness.state.colonists[colonistId].position;
    const target = { x: start.x + 6, y: start.y - 4 };

    harness.state = orderMove(harness.state, harness.ctx, colonistId, target);
    let arrived = false;
    harness.run(120, (state) => {
      const at = state.colonists[colonistId].position;
      if (at.x === target.x && at.y === target.y) arrived = true;
    });

    expect(arrived).toBe(true);
  });

  it('invalidates only the paths that cross the changed tile', () => {
    const harness = createHarness();
    idleColony(harness.state);
    const [a, b] = Object.keys(harness.state.colonists);
    harness.state = orderMove(harness.state, harness.ctx, a, { x: 30, y: 45 });
    harness.state = orderMove(harness.state, harness.ctx, b, { x: 12, y: 12 });
    harness.run(4);

    const pathA = harness.state.colonists[a].path;
    const pathB = harness.state.colonists[b].path;
    expect(pathA && pathA.length > 0).toBe(true);
    expect(pathB && pathB.length > 0).toBe(true);

    const crossed = pathA![Math.floor(pathA!.length / 2)];
    expect(pathB!.some((step) => step.x === crossed.x && step.y === crossed.y)).toBe(false);

    invalidateTile(harness.ctx, harness.state, tileIdOf(crossed.x, crossed.y));

    expect(harness.state.colonists[a].path).toBeNull();
    expect(harness.state.colonists[b].path).toBe(pathB);
  });
});
