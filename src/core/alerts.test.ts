// Alerts answer "what is wrong right now", which the event log cannot: a
// warning that scrolled past four hundred ticks ago reads the same as a live
// one. So every alert here has to appear only while its condition holds.
import { describe, expect, it } from 'vitest';
import { placeBuildingBlueprint } from './actions';
import { collectAlerts } from './alerts';
import { PREDATOR_ALERT_DISTANCE } from './alerts';
import { TICKS_PER_SEASON } from './season';
import { tileIdOf } from './state';
import { createHarness } from './testUtils';
import { createAnimal } from './worldgen';
import type { GameState } from './types';

const keys = (state: GameState): string[] => collectAlerts(state).map((a) => a.key);
const levels = (state: GameState): string[] => collectAlerts(state).map((a) => a.level);

function dropAllFood(state: GameState): void {
  for (const id of Object.keys(state.items)) {
    if (state.items[id].type !== 'food') continue;
    const { [id]: _removed, ...rest } = state.items;
    state.items = rest;
  }
}

describe('alerts', () => {
  it('says nothing alarming about a healthy colony', () => {
    const harness = createHarness(801);
    harness.state.animals = {};
    expect(levels(harness.state)).not.toContain('critical');
  });

  it('reports an empty larder and then starving colonists', () => {
    const harness = createHarness(803);
    harness.state.animals = {};
    dropAllFood(harness.state);
    expect(keys(harness.state)).toContain('noFood');

    for (const id in harness.state.colonists) {
      harness.state.colonists[id] = {
        ...harness.state.colonists[id],
        needs: { hunger: 100, sleep: 0 , recreation: 0 },
      };
    }
    const starving = collectAlerts(harness.state).find((a) => a.key === 'colonistsStarving');
    expect(starving?.params).toEqual({ count: 3 });
  });

  it('counts one hurt colonist with singular wording', () => {
    const harness = createHarness(809);
    harness.state.animals = {};
    const id = Object.keys(harness.state.colonists)[0];
    harness.state.colonists[id] = { ...harness.state.colonists[id], health: 20 };
    const hurt = collectAlerts(harness.state).find((a) => a.key === 'colonistsHurt');
    expect(hurt?.params).toEqual({ count: 1 });
  });

  it('warns about a predator near the camp but not one far away', () => {
    const harness = createHarness(811);
    harness.state.animals = {};
    const at = Object.values(harness.state.colonists)[0].position;

    const far = createAnimal(harness.state, 'wolf', at.x, at.y + PREDATOR_ALERT_DISTANCE + 6);
    expect(keys(harness.state)).not.toContain('predatorNear');

    harness.state.animals[far.id] = { ...far, position: { x: at.x + 1, y: at.y } };
    expect(keys(harness.state)).toContain('predatorNear');
  });

  it('reports work the colony gave up on, and points at it', () => {
    const harness = createHarness(841);
    harness.state.animals = {};
    expect(keys(harness.state)).not.toContain('jobsAbandoned');

    // a tombstoned job is what the colony leaves behind after MAX_RETRIES
    const tile = Object.values(harness.state.tiles).find((t) => t.terrain === 'forest')!;
    harness.state.jobs = {
      ...harness.state.jobs,
      j99: {
        id: 'j99',
        type: 'chop',
        workType: 'chop',
        priority: 2,
        targetTileId: tile.id,
        targetEntityId: tile.id,
        destinationId: null,
        payloadType: null,
        state: 'failed',
        reservedBy: null,
        createdAtTick: 0,
        retryCount: 4,
        cooldownUntilTick: 9999,
        workProgress: 0,
      },
    };
    const alert = collectAlerts(harness.state).find((a) => a.key === 'jobsAbandoned');
    expect(alert?.params).toEqual({ count: 1 });
    expect(alert?.at).toEqual({ x: tile.x, y: tile.y });
  });

  it('names the season when nothing can grow', () => {
    const harness = createHarness(821);
    harness.state.animals = {};
    harness.state.tick = TICKS_PER_SEASON * 3; // winter
    const winter = collectAlerts(harness.state).find((a) => a.key === 'nothingGrows');
    expect(winter?.params).toEqual({ season: 'winter' });

    harness.state.tick = TICKS_PER_SEASON * 2 + 1; // early autumn
    expect(keys(harness.state)).not.toContain('nothingGrows');
  });

  it('says when a blueprint is waiting on a resource the colony has none of', () => {
    const harness = createHarness(831);
    harness.state.animals = {};
    const at = Object.values(harness.state.colonists)[0].position;
    // no stone has been mined yet, so a stone wall cannot start
    harness.state = placeBuildingBlueprint(harness.state, 'stoneWall', [
      tileIdOf(at.x + 2, at.y - 6),
    ]);
    const stalled = collectAlerts(harness.state).find((a) => a.key === 'buildingStalled');
    expect(stalled?.params).toEqual({ resources: 'stone' });

    // a wooden wall is fine: the colony starts with wood
    const clean = createHarness(833);
    clean.state.animals = {};
    const there = Object.values(clean.state.colonists)[0].position;
    clean.state = placeBuildingBlueprint(clean.state, 'wall', [tileIdOf(there.x + 2, there.y - 6)]);
    expect(keys(clean.state)).not.toContain('buildingStalled');
  });

  it('warns when the livestock have nothing left to eat', () => {
    const harness = createHarness(829);
    harness.state.animals = {};
    const at = Object.values(harness.state.colonists)[0].position;
    const cow = createAnimal(harness.state, 'deer', at.x + 3, at.y, { tame: true });
    harness.state.animals[cow.id] = { ...cow, hunger: 99 };
    const alert = collectAlerts(harness.state).find((a) => a.key === 'livestockStarving');
    expect(alert).toBeDefined();
    expect(alert?.params).toEqual({ count: 1 });
    expect(alert?.at).toEqual({ x: at.x + 3, y: at.y });

    // a wild animal going hungry is the ecology working, not a problem to fix
    harness.state.animals = {};
    const wild = createAnimal(harness.state, 'deer', at.x + 3, at.y);
    harness.state.animals[wild.id] = { ...wild, hunger: 99 };
    expect(keys(harness.state)).not.toContain('livestockStarving');
  });

  it('points at where the problem is, when there is one place to look', () => {
    const harness = createHarness(827);
    harness.state.animals = {};
    const [id, other] = Object.keys(harness.state.colonists);
    harness.state.colonists[id] = { ...harness.state.colonists[id], health: 10 };
    const hurt = collectAlerts(harness.state).find((a) => a.key === 'colonistsHurt');
    expect(hurt?.at).toEqual(harness.state.colonists[id].position);
    // a colony-wide condition has nowhere in particular to point
    expect(other).toBeDefined();
    harness.state.tick = TICKS_PER_SEASON * 3;
    const winter = collectAlerts(harness.state).find((a) => a.key === 'nothingGrows');
    expect(winter?.at).toBeUndefined();
  });

  it('collapses to one line once everybody is gone', () => {
    const harness = createHarness(823);
    harness.state.colonists = {};
    expect(collectAlerts(harness.state)).toEqual([{ level: 'critical', key: 'colonyDied' }]);
  });
});
