// Buildings had hit points that nothing could ever change, so a wall was
// permanent and BUILDING_HP was decoration. A predator that cannot get round a
// fence now chews on it, which gives the number a meaning and gives the colony
// something to keep up.
import { describe, expect, it } from 'vitest';
import { PREDATOR_STRUCTURE_DAMAGE } from './constants';
import { collectAlerts } from './alerts';
import { tileIdOf } from './state';
import { createHarness, idleColony } from './testUtils';
import { addBuilding, createAnimal } from './worldgen';
import type { GameState, Vector2 } from './types';

/** A 5x5 ring of walls with a single door in the middle of the south side. */
function buildPen(state: GameState, centre: Vector2): void {
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      if (Math.abs(dx) !== 2 && Math.abs(dy) !== 2) continue;
      const tileId = tileIdOf(centre.x + dx, centre.y + dy);
      if (state.tiles[tileId].buildingId) continue;
      if (dx === 0 && dy === 2) {
        addBuilding(state, 'door', tileId);
        continue;
      }
      addBuilding(state, 'wall', tileId);
      state.tiles[tileId] = { ...state.tiles[tileId], walkable: false };
    }
  }
}

function damagedParts(state: GameState) {
  return Object.values(state.buildings).filter(
    (b) => !b.isBlueprint && b.hpCurrent < b.hpMax,
  );
}

describe('damage and repair', () => {
  it('lets a predator take a fence apart when the prey is behind it', () => {
    const harness = createHarness(7001);
    idleColony(harness.state); // nobody repairs anything: this is the damage half
    harness.state.animals = {};
    const at = Object.values(harness.state.colonists)[0].position;
    const centre = { x: at.x + 9, y: at.y - 9 };
    buildPen(harness.state, centre);
    createAnimal(harness.state, 'deer', centre.x, centre.y);
    const wolf = createAnimal(harness.state, 'wolf', centre.x, centre.y + 5);
    harness.state.animals[wolf.id] = { ...wolf, hunger: 100 };

    harness.run(600);

    const chewed = damagedParts(harness.state);
    expect(chewed.length).toBeGreaterThan(0);
    // in whole bites, not some other number that happens to be smaller
    for (const part of chewed) {
      expect((part.hpMax - part.hpCurrent) % PREDATOR_STRUCTURE_DAMAGE).toBe(0);
    }
    expect(harness.state.log.some((e) => e.key === 'animalTearing')).toBe(true);
  });

  it('leaves a fence alone when there is nothing behind it worth having', () => {
    const harness = createHarness(7013);
    idleColony(harness.state);
    harness.state.animals = {};
    const at = Object.values(harness.state.colonists)[0].position;
    const centre = { x: at.x + 9, y: at.y - 9 };
    buildPen(harness.state, centre); // empty pen
    const wolf = createAnimal(harness.state, 'wolf', centre.x, centre.y + 5);
    harness.state.animals[wolf.id] = { ...wolf, hunger: 100 };

    harness.run(600, (state) => {
      // keep the map to this one predator, so nothing else wanders into the pen
      for (const id in state.animals) {
        if (id !== wolf.id) delete state.animals[id];
      }
    });

    expect(damagedParts(harness.state).length).toBe(0);
  });

  it('generates repair work and puts the wall back to full', () => {
    const harness = createHarness(7019);
    const at = Object.values(harness.state.colonists)[0].position;
    const tileId = tileIdOf(at.x + 3, at.y - 3);
    const wall = addBuilding(harness.state, 'wall', tileId);
    harness.state.tiles[tileId] = { ...harness.state.tiles[tileId], walkable: false };
    harness.state.buildings[wall.id] = { ...wall, hpCurrent: 30 };

    harness.run(900);

    expect(harness.state.buildings[wall.id].hpCurrent).toBe(wall.hpMax);
    expect(harness.state.log.some((e) => e.key === 'buildingRepaired')).toBe(true);
  });

  it('runs repair under the construction column, not a column of its own', () => {
    const harness = createHarness(7027);
    const at = Object.values(harness.state.colonists)[0].position;
    const tileId = tileIdOf(at.x + 3, at.y - 3);
    const wall = addBuilding(harness.state, 'wall', tileId);
    harness.state.tiles[tileId] = { ...harness.state.tiles[tileId], walkable: false };
    harness.state.buildings[wall.id] = { ...wall, hpCurrent: 30 };
    // switch construction off for everyone and the patch never happens
    for (const id in harness.state.colonists) {
      const colonist = harness.state.colonists[id];
      harness.state.colonists[id] = {
        ...colonist,
        workPriorities: { ...colonist.workPriorities, build: 0 },
      };
    }

    harness.run(900);

    expect(harness.state.buildings[wall.id].hpCurrent).toBe(30);
    const repairJobs = Object.values(harness.state.jobs).filter((j) => j.type === 'repair');
    expect(repairJobs.length).toBeGreaterThan(0);
    for (const job of repairJobs) expect(job.workType).toBe('build');
  });

  it('stops asking once the wall is whole again', () => {
    const harness = createHarness(7031);
    const at = Object.values(harness.state.colonists)[0].position;
    const tileId = tileIdOf(at.x + 3, at.y - 3);
    const wall = addBuilding(harness.state, 'wall', tileId);
    harness.state.tiles[tileId] = { ...harness.state.tiles[tileId], walkable: false };
    harness.state.buildings[wall.id] = { ...wall, hpCurrent: 100 };

    harness.run(900);
    expect(harness.state.buildings[wall.id].hpCurrent).toBe(wall.hpMax);

    const before = Object.values(harness.state.jobs).filter((j) => j.type === 'repair').length;
    harness.run(600);
    const after = Object.values(harness.state.jobs).filter((j) => j.type === 'repair').length;
    expect(after).toBe(before); // no new work for a wall that is already whole
  });

  it('tells the player the fence is coming down', () => {
    const harness = createHarness(7037);
    const at = Object.values(harness.state.colonists)[0].position;
    const tileId = tileIdOf(at.x + 3, at.y - 3);
    const wall = addBuilding(harness.state, 'wall', tileId);
    const damaged = (a: { key: string }) =>
      a.key === 'buildingDamaged' || a.key === 'buildingsDamaged';
    expect(collectAlerts(harness.state).some(damaged)).toBe(false);

    harness.state.buildings[wall.id] = { ...wall, hpCurrent: wall.hpMax * 0.8 };
    const warned = collectAlerts(harness.state).find(damaged);
    expect(warned?.level).toBe('warning');

    harness.state.buildings[wall.id] = { ...wall, hpCurrent: wall.hpMax * 0.2 };
    const urgent = collectAlerts(harness.state).find(damaged);
    expect(urgent?.level).toBe('critical');
    expect(urgent?.at).toEqual({ x: at.x + 3, y: at.y - 3 });
  });
});
