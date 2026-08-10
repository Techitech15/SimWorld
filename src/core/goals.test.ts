// The colony grew a lot of systems and mentioned none of them. These are the
// things worth doing, derived from the state rather than from a record of what
// the player has done - so a goal that stops being true goes back to undone.
import { describe, expect, it } from 'vitest';
import { placePastureZone, placeStorageZone, setZoneAccepts } from './actions';
import { RESOURCE_TYPES } from './constants';
import { WINTER_STORE_PER_COLONIST, colonyGoals, goalSummary, nextGoal } from './goals';
import { STRINGS } from '../ui/strings';
import { tileIdOf } from './state';
import { createHarness } from './testUtils';
import { addBuilding, addItem, createAnimal } from './worldgen';
import type { GameState } from './types';

const goal = (state: GameState, id: string) => colonyGoals(state).find((g) => g.id === id)!;

describe('what to do next', () => {
  it('names something to do on a fresh colony, and nothing on a dead one', () => {
    const harness = createHarness(9601);
    const first = nextGoal(harness.state);
    expect(first).not.toBeNull();
    // a hint that says how, not just what - in both languages
    expect(STRINGS.en.goalHints[first!.id].length).toBeGreaterThan(20);
    expect(STRINGS.ja.goalHints[first!.id].length).toBeGreaterThan(10);

    harness.state.colonists = {};
    expect(colonyGoals(harness.state)).toEqual([]);
    expect(goalSummary(harness.state)).toBeNull();
  });

  it('gives every goal a way to do it that names a real tool', () => {
    const harness = createHarness(9603);
    const tools = ['Build', 'Orders', 'Animals', 'Accepts', 'winter'];
    const toolsJa = ['建設', '指示', '動物', '受け入れ', '冬'];
    for (const each of colonyGoals(harness.state)) {
      expect(each.id).toBeTruthy();
      expect(STRINGS.en.goalLabels[each.id](each.params)).toBeTruthy();
      expect(STRINGS.ja.goalLabels[each.id](each.params)).toBeTruthy();
      expect(tools.some((tool) => STRINGS.en.goalHints[each.id].includes(tool))).toBe(true);
      expect(toolsJa.some((tool) => STRINGS.ja.goalHints[each.id].includes(tool))).toBe(true);
      expect(each.progress).toBeGreaterThanOrEqual(0);
      expect(each.progress).toBeLessThanOrEqual(1);
    }
  });

  it('ticks the bed goal off only when there is one each', () => {
    const harness = createHarness(9607);
    const colonists = Object.keys(harness.state.colonists).length;
    expect(goal(harness.state, 'beds').done).toBe(true); // three colonists, three beds

    // a newcomer arrives and the goal comes back
    const at = Object.values(harness.state.colonists)[0].position;
    harness.state.colonists = {
      ...harness.state.colonists,
      cX: { ...Object.values(harness.state.colonists)[0], id: 'cX', name: 'Newcomer' },
    };
    const now = goal(harness.state, 'beds');
    expect(now.done).toBe(false);
    expect(now.progress).toBeCloseTo(colonists / (colonists + 1));
    expect(now.params.want).toBe(colonists + 1);
    expect(STRINGS.en.goalLabels.beds(now.params)).toContain(`/${colonists + 1}`);
    void at;
  });

  it('goes back to undone when the thing stops being true', () => {
    // the point of deriving from state rather than remembering history
    const harness = createHarness(9611);
    const beds = Object.values(harness.state.buildings).filter((b) => b.type === 'bed');
    expect(goal(harness.state, 'beds').done).toBe(true);
    const rest = { ...harness.state.buildings };
    delete rest[beds[0].id];
    harness.state.buildings = rest;
    expect(goal(harness.state, 'beds').done).toBe(false);
  });

  it('counts stone only once some has actually been quarried', () => {
    const harness = createHarness(9613);
    expect(goal(harness.state, 'stone').done).toBe(false);
    const at = Object.values(harness.state.colonists)[0].position;
    addItem(harness.state, 'stone', 20, at.x + 1, at.y + 1);
    expect(goal(harness.state, 'stone').done).toBe(true);
  });

  it('knows a pen from a stockpile, and a tame beast from a wild one', () => {
    const harness = createHarness(9617);
    expect(goal(harness.state, 'pasture').done).toBe(false);
    expect(goal(harness.state, 'tame').done).toBe(false);

    const at = Object.values(harness.state.colonists)[0].position;
    const ids: string[] = [];
    for (let d = 0; d < 3; d++) {
      const tile = harness.state.tiles[tileIdOf(at.x + 5 + d, at.y - 4)];
      if (tile?.terrain === 'grass' && !tile.buildingId) ids.push(tile.id);
    }
    harness.state = placePastureZone(harness.state, ids);
    expect(goal(harness.state, 'pasture').done).toBe(true);
    expect(goal(harness.state, 'tame').done).toBe(false); // a pen is not a herd

    createAnimal(harness.state, 'chicken', at.x + 5, at.y - 4, { tame: true });
    expect(goal(harness.state, 'tame').done).toBe(true);
  });

  it('notices a wall only once it is standing, not while it is a plan', () => {
    const harness = createHarness(9619);
    expect(goal(harness.state, 'wall').done).toBe(false);
    const at = Object.values(harness.state.colonists)[0].position;
    const tileId = tileIdOf(at.x + 6, at.y + 6);
    addBuilding(harness.state, 'wall', tileId, { isBlueprint: true });
    expect(goal(harness.state, 'wall').done).toBe(false);

    const built = Object.values(harness.state.buildings).find((b) => b.tileId === tileId)!;
    harness.state.buildings = {
      ...harness.state.buildings,
      [built.id]: { ...built, isBlueprint: false },
    };
    expect(goal(harness.state, 'wall').done).toBe(true);
  });

  it('spots a store that has been told what it takes', () => {
    const harness = createHarness(9623);
    expect(goal(harness.state, 'filter').done).toBe(false);
    const zoneId = Object.keys(harness.state.zones).find(
      (id) => harness.state.zones[id].type === 'storage',
    )!;
    harness.state = setZoneAccepts(harness.state, zoneId, 'stone', false);
    expect(goal(harness.state, 'filter').done).toBe(true);

    // a pasture only ever takes food, which is not the player having decided
    // anything, so it must not tick this off on its own
    const fresh = createHarness(9623);
    const at = Object.values(fresh.state.colonists)[0].position;
    const ids: string[] = [];
    for (let d = 0; d < 3; d++) {
      const tile = fresh.state.tiles[tileIdOf(at.x + 5 + d, at.y - 4)];
      if (tile?.terrain === 'grass' && !tile.buildingId) ids.push(tile.id);
    }
    fresh.state = placePastureZone(fresh.state, ids);
    expect(goal(fresh.state, 'filter').done).toBe(false);
  });

  it('scales the winter store with the number of mouths', () => {
    const harness = createHarness(9629);
    const colonists = Object.keys(harness.state.colonists).length;
    expect(goal(harness.state, 'winter').params.want).toBe(colonists * WINTER_STORE_PER_COLONIST);
    const at = Object.values(harness.state.colonists)[0].position;
    addItem(harness.state, 'food', colonists * WINTER_STORE_PER_COLONIST, at.x + 2, at.y + 2);
    expect(goal(harness.state, 'winter').done).toBe(true);
  });

  it('summarises how much is behind the colony', () => {
    const harness = createHarness(9631);
    const total = colonyGoals(harness.state).length;
    const summary = goalSummary(harness.state);
    expect(summary?.total).toBe(total);
    expect(summary!.done).toBeGreaterThanOrEqual(0);
    expect(summary!.done).toBeLessThanOrEqual(total);
    expect(['spring', 'summer', 'autumn', 'winter']).toContain(summary!.season);
  });

  it('is cheap enough to compute on every frame', () => {
    const harness = createHarness(9637);
    harness.run(600);
    harness.state = placeStorageZone(harness.state, [tileIdOf(5, 5), tileIdOf(6, 5)]);
    const started = performance.now();
    for (let i = 0; i < 200; i++) colonyGoals(harness.state);
    const per = (performance.now() - started) / 200;
    expect(per).toBeLessThan(2);
    // the cost is per resource type, so a new one has to stay inside the budget
    // rather than have this number quietly edited upwards
    expect(RESOURCE_TYPES.length).toBeGreaterThanOrEqual(3);
  });
});
