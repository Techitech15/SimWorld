// A door used to be a wall that anyone could walk through, which made it a
// decoration. Animals cannot work a handle, so walls plus a door are a pen:
// colonists pass, wolves and livestock do not.
import { describe, expect, it } from 'vitest';
import { isWalkable, isWalkableByAnimal } from './pathfinding';
import { tileIdOf } from './state';
import { createHarness, idleColony } from './testUtils';
import { addBuilding, createAnimal } from './worldgen';
import type { GameState, Vector2 } from './types';

/** A 5x5 ring of walls with a single door in the middle of the south side. */
function buildPen(state: GameState, centre: Vector2): { door: Vector2; inside: Vector2 } {
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const onEdge = Math.abs(dx) === 2 || Math.abs(dy) === 2;
      if (!onEdge) continue;
      const x = centre.x + dx;
      const y = centre.y + dy;
      const tileId = tileIdOf(x, y);
      if (state.tiles[tileId].buildingId) continue;
      if (dx === 0 && dy === 2) {
        addBuilding(state, 'door', tileId);
        continue;
      }
      addBuilding(state, 'wall', tileId);
      state.tiles[tileId] = { ...state.tiles[tileId], walkable: false };
    }
  }
  return { door: { x: centre.x, y: centre.y + 2 }, inside: centre };
}

describe('doors', () => {
  it('are walkable for colonists and not for animals', () => {
    const harness = createHarness(901);
    const at = Object.values(harness.state.colonists)[0].position;
    const { door } = buildPen(harness.state, { x: at.x + 8, y: at.y - 8 });

    expect(isWalkable(harness.state, door.x, door.y)).toBe(true);
    expect(isWalkableByAnimal(harness.state, door.x, door.y)).toBe(false);
  });

  it('still lets animals through a door that is only planned', () => {
    const harness = createHarness(907);
    const at = Object.values(harness.state.colonists)[0].position;
    const tileId = tileIdOf(at.x + 4, at.y - 8);
    addBuilding(harness.state, 'door', tileId, { isBlueprint: true });
    const tile = harness.state.tiles[tileId];
    expect(isWalkableByAnimal(harness.state, tile.x, tile.y)).toBe(true);
  });

  it('keeps a penned animal in and a hungry wolf out', () => {
    const harness = createHarness(911);
    idleColony(harness.state);
    harness.state.animals = {};
    const at = Object.values(harness.state.colonists)[0].position;
    const centre = { x: at.x + 9, y: at.y - 9 };
    const { inside } = buildPen(harness.state, centre);

    const deer = createAnimal(harness.state, 'deer', inside.x, inside.y);
    const wolf = createAnimal(harness.state, 'wolf', centre.x, centre.y + 5);
    harness.state.animals[wolf.id] = { ...wolf, hunger: 100 };

    const penned = (p: Vector2) =>
      Math.abs(p.x - centre.x) <= 1 && Math.abs(p.y - centre.y) <= 1;

    harness.run(600, (state) => {
      const w = state.animals[wolf.id];
      // the wolf may circle the pen but must never be inside it
      if (w) expect(penned(w.position)).toBe(false);
    });

    const survivor = harness.state.animals[deer.id];
    expect(survivor).toBeDefined();
    expect(penned(survivor.position)).toBe(true); // and the deer never got out
    expect(survivor.health).toBe(60);
  });
});
