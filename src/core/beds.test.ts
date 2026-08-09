// Beds cost 12 wood and used to recover sleep at exactly the same rate as bare
// floor, which made them decoration. Now the colony has a reason to build one
// per colonist - and a nudge when it has not.
import { describe, expect, it } from 'vitest';
import { collectAlerts } from './alerts';
import { SLEEP_RECOVERY_ON_GROUND_PER_TICK, SLEEP_RECOVERY_PER_TICK } from './constants';
import { createHarness, idleColony } from './testUtils';
import type { GameState } from './types';

function removeBeds(state: GameState): void {
  for (const id of Object.keys(state.buildings)) {
    if (state.buildings[id].type !== 'bed') continue;
    const tileId = state.buildings[id].tileId;
    state.tiles[tileId] = { ...state.tiles[tileId], buildingId: null };
    const { [id]: _removed, ...rest } = state.buildings;
    state.buildings = rest;
  }
}

/** Put everyone to bed at the same exhaustion and run. */
function sleepFor(harness: ReturnType<typeof createHarness>, ticks: number): number {
  idleColony(harness.state);
  for (const id in harness.state.colonists) {
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      needs: { hunger: 0, sleep: 100 , recreation: 0 },
    };
  }
  harness.run(ticks, (state) => {
    for (const id in state.colonists) {
      state.colonists[id] = { ...state.colonists[id], needs: { ...state.colonists[id].needs, hunger: 0 } };
    }
  });
  const values = Object.values(harness.state.colonists).map((c) => c.needs.sleep);
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

describe('beds', () => {
  it('rest better than the floor does', () => {
    expect(SLEEP_RECOVERY_ON_GROUND_PER_TICK).toBeLessThan(SLEEP_RECOVERY_PER_TICK);

    const withBeds = createHarness(1301);
    const rested = sleepFor(withBeds, 400);

    const without = createHarness(1301);
    removeBeds(without.state);
    const tired = sleepFor(without, 400);

    expect(rested).toBeLessThan(tired); // lower sleep need = better rested
  });

  it('are counted, and a shortfall is worth saying out loud', () => {
    const harness = createHarness(1303);
    harness.state.animals = {};
    expect(collectAlerts(harness.state).some((a) => a.message.includes('no bed'))).toBe(false);

    removeBeds(harness.state);
    const alert = collectAlerts(harness.state).find((a) => a.message.includes('no bed'));
    expect(alert?.message).toBe('3 colonists have no bed — they rest poorly');
    expect(alert?.level).toBe('info');
  });
});
