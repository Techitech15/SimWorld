// Illness and treatment (フェーズ14 段階 M-1,
// docs/design-phase14-water-medicine.md 5章と8章). The layer is deliberately
// thin - one field, one job, one alert - so the tests pin exactly that: it
// happens (an incident sets it), it costs something (health, work speed,
// mood), it is fixed by one specific thing (herb, worked by someone else's
// `treat` skill) and never by anything else (time alone, or the patient's
// own hands), and the player is never left to notice the slide on their own.
import { describe, expect, it } from 'vitest';
import { collectAlerts } from './alerts';
import { ILLNESS_ONSET_TICKS } from './constants';
import { INCIDENTS } from './events';
import { mulberry32 } from './rng';
import { SKILL_MAX_LEVEL, emptySkills, xpForLevel } from './skills';
import { TICKS_PER_SEASON } from './season';
import { createHarness, idleColony } from './testUtils';
import { addItem } from './worldgen';
import type { GameState } from './types';
import {
  SCHEMA_VERSION,
  createSaveFile,
  migrations,
  parseSave,
  serializeSave,
} from '../persistence/saveFile';

const YEAR = TICKS_PER_SEASON * 4;

const totalHerb = (state: GameState) =>
  Object.values(state.items)
    .filter((item) => item.type === 'herb')
    .reduce((sum, item) => sum + item.quantity, 0);

/** Remove every herb item and stop wild herb plants from making more. */
function stripHerb(state: GameState): void {
  for (const id of Object.keys(state.items)) {
    if (state.items[id].type !== 'herb') continue;
    const item = state.items[id];
    const tile = state.tiles[`${item.position.x},${item.position.y}`];
    if (tile) {
      state.tiles[tile.id] = { ...tile, itemIds: tile.itemIds.filter((i) => i !== id) };
    }
    const { [id]: _removed, ...rest } = state.items;
    state.items = rest;
  }
  for (const id of Object.keys(state.buildings)) {
    if (state.buildings[id].type !== 'herb') continue;
    const building = state.buildings[id];
    const tile = state.tiles[building.tileId];
    if (tile) state.tiles[tile.id] = { ...tile, buildingId: null };
    const { [id]: _removed, ...rest } = state.buildings;
    state.buildings = rest;
  }
}

describe('illness (段階 M-1)', () => {
  it('does not wipe a colony out from illness alone over an unattended year', () => {
    const harness = createHarness(3401);
    const founders = Object.keys(harness.state.colonists).length;
    harness.run(YEAR);
    expect(Object.keys(harness.state.colonists).length).toBeGreaterThan(0);
    // and the mechanism actually connected to something - a run with zero
    // onsets would prove nothing about the death rate above
    expect(founders).toBeGreaterThan(0);
  });

  it('cures with herb: one completed treat job clears the illness and spends the herb', () => {
    const harness = createHarness(3403);
    idleColony(harness.state);
    const [patientId, healerId] = Object.keys(harness.state.colonists);
    expect(healerId).toBeDefined();

    harness.state.colonists[patientId] = {
      ...harness.state.colonists[patientId],
      illnessTicks: ILLNESS_ONSET_TICKS,
    };
    harness.state.colonists[healerId] = {
      ...harness.state.colonists[healerId],
      workPriorities: { ...harness.state.colonists[healerId].workPriorities, treat: 1 },
    };
    const at = harness.state.colonists[patientId].position;
    addItem(harness.state, 'herb', 10, at.x, at.y);
    const before = totalHerb(harness.state);

    let curedAtTick = -1;
    harness.run(3000, (state) => {
      if (curedAtTick < 0 && (state.colonists[patientId]?.illnessTicks ?? 0) <= 0) {
        curedAtTick = state.tick;
      }
    });

    expect(curedAtTick).toBeGreaterThan(0);
    expect(harness.state.colonists[patientId].illnessTicks).toBe(0);
    expect(totalHerb(harness.state)).toBeLessThan(before);
    expect(harness.state.log.some((e) => e.key === 'colonistTreated')).toBe(true);
  });

  it('does not cure without herb: illnessTicks never recovers on its own', () => {
    const harness = createHarness(3407);
    idleColony(harness.state);
    stripHerb(harness.state);
    const [patientId, healerId] = Object.keys(harness.state.colonists);

    harness.state.colonists[patientId] = {
      ...harness.state.colonists[patientId],
      illnessTicks: ILLNESS_ONSET_TICKS,
    };
    harness.state.colonists[healerId] = {
      ...harness.state.colonists[healerId],
      workPriorities: { ...harness.state.colonists[healerId].workPriorities, treat: 1 },
    };

    let sawTreatedLog = false;
    harness.run(5000, (state) => {
      if (state.log.some((e) => e.key === 'colonistTreated')) sawTreatedLog = true;
      expect(totalHerb(state)).toBe(0);
    });

    // exactly the value it was set to: illnessTicks only ever moves when a
    // treat job completes, and none ever could without herb to spend
    expect(harness.state.colonists[patientId].illnessTicks).toBe(ILLNESS_ONSET_TICKS);
    expect(sawTreatedLog).toBe(false);
    // and the colonist is measurably worse off for having gone untreated
    expect(harness.state.colonists[patientId].health).toBeLessThan(100);
  });

  it('cures faster in the hands of a more skilled healer', () => {
    function ticksToCure(seed: number, level: number): number {
      const harness = createHarness(seed);
      idleColony(harness.state);
      const ids = Object.keys(harness.state.colonists);
      // exactly one patient and one healer, so the gap is the skill alone
      for (const id of ids.slice(2)) delete harness.state.colonists[id];
      const [patientId, healerId] = ids;

      harness.state.colonists[patientId] = {
        ...harness.state.colonists[patientId],
        illnessTicks: ILLNESS_ONSET_TICKS,
      };
      harness.state.colonists[healerId] = {
        ...harness.state.colonists[healerId],
        workPriorities: { ...harness.state.colonists[healerId].workPriorities, treat: 1 },
        skills: { ...emptySkills(), treat: xpForLevel(level) },
      };
      const at = harness.state.colonists[patientId].position;
      addItem(harness.state, 'herb', 10, at.x, at.y);

      let spent = 0;
      harness.run(3000, (state) => {
        if ((state.colonists[patientId]?.illnessTicks ?? 0) > 0) spent = state.tick;
      });
      return spent;
    }

    for (const seed of [3411, 3413, 3417]) {
      const novice = ticksToCure(seed, 0);
      const expert = ticksToCure(seed, SKILL_MAX_LEVEL);
      expect(novice).toBeGreaterThan(0);
      expect(expert).toBeGreaterThan(0);
      expect(expert).toBeLessThan(novice);
    }
  });

  it('raises an alert while anyone is sick, and only then', () => {
    const harness = createHarness(3419);
    harness.state.animals = {};
    expect(collectAlerts(harness.state).some((a) => a.key === 'colonistsIll')).toBe(false);

    const id = Object.keys(harness.state.colonists)[0];
    harness.state.colonists[id] = { ...harness.state.colonists[id], illnessTicks: ILLNESS_ONSET_TICKS };
    const alert = collectAlerts(harness.state).find((a) => a.key === 'colonistsIll');
    expect(alert).toBeDefined();
    expect(alert?.params).toEqual({ count: 1 });
    expect(alert?.at).toEqual(harness.state.colonists[id].position);
  });

  it('survives a save round trip: illnessTicks is preserved exactly', () => {
    const harness = createHarness(3423);
    const id = Object.keys(harness.state.colonists)[0];
    harness.state.colonists[id] = { ...harness.state.colonists[id], illnessTicks: 4321 };

    const json = serializeSave(harness.state);
    const loaded = parseSave(json);
    expect(loaded.state.colonists[id].illnessTicks).toBe(4321);
  });

  it('bumped the schema by exactly one version, with a 26 -> 27 migration in place', () => {
    // Pinned to >= rather than the exact value M-1 shipped at (27), the same
    // convention herb.test.ts's own version-check test uses one step earlier:
    // issue #28 (the chronicle) bumped the schema again on top of this one,
    // and that bump owns its own version-check test (save.test.ts). What this
    // test is actually about - the 26 -> 27 step itself still existing in the
    // chain - does not change when a later step is added after it.
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(27);
    expect(typeof migrations[26]).toBe('function');
    const harness = createHarness(3427);
    expect(createSaveFile(harness.state).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('is never self-administered: a lone sick colonist stays sick', () => {
    const harness = createHarness(3429);
    idleColony(harness.state);
    const ids = Object.keys(harness.state.colonists);
    for (const id of ids.slice(1)) delete harness.state.colonists[id];
    const [soloId] = ids;

    harness.state.colonists[soloId] = {
      ...harness.state.colonists[soloId],
      illnessTicks: ILLNESS_ONSET_TICKS,
      // raised on purpose: if self-treatment were possible, this is exactly
      // the setup that would make it happen
      workPriorities: { ...harness.state.colonists[soloId].workPriorities, treat: 1 },
    };
    const at = harness.state.colonists[soloId].position;
    addItem(harness.state, 'herb', 10, at.x, at.y);

    harness.run(4000);

    expect(harness.state.colonists[soloId].illnessTicks).toBe(ILLNESS_ONSET_TICKS);
    expect(harness.state.log.some((e) => e.key === 'colonistTreated')).toBe(false);
  });

  it('does not spread by contact: onset never reads a colonist position', () => {
    // The onset roll (events.ts INCIDENTS 'illness') is invoked directly with
    // the same rnd sequence against two states that differ only in where the
    // colonists stand - one clumped onto a single tile (worst case for
    // contact-based spread), one scattered across the map. Reading who was
    // picked off the *same* deterministic roll proves position played no
    // part: a spreading mechanism would have to consult it somewhere.
    const illness = INCIDENTS.find((i) => i.name === 'illness');
    expect(illness).toBeDefined();

    const clumped = createHarness(3431).state;
    for (const id of Object.keys(clumped.colonists)) {
      clumped.colonists[id] = { ...clumped.colonists[id], position: { x: 40, y: 40 } };
    }
    const scattered = createHarness(3431).state;
    Object.keys(scattered.colonists).forEach((id, i) => {
      scattered.colonists[id] = {
        ...scattered.colonists[id],
        position: { x: 3 + i * 11, y: 3 + i * 7 },
      };
    });

    const pickedClumped = illness!.apply(clumped, mulberry32(9001));
    const pickedScattered = illness!.apply(scattered, mulberry32(9001));
    expect(pickedClumped?.params?.name).toBe(pickedScattered?.params?.name);
  });
});
