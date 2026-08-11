// Week 1 acceptance (section 10): a GameState survives a JSON round trip
// unchanged. Plus the versioning rules of section 8.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { placePastureZone, setDesignation } from '../core/actions';
import { COLONIST_MAX_HEALTH, RESOURCE_TYPES } from '../core/constants';
import { SKILL_NAMES, emptySkills } from '../core/skills';
import { createEmptyState } from '../core/state';
import type { GameState } from '../core/types';
import { createHarness, nearestTilesWithTerrain } from '../core/testUtils';
import { createSimContext } from '../core/derived';
import { tickMany } from '../core/simulation';
import { AUTOSAVE_SLOT, DEFAULT_SLOT, deleteSave, hasSave, loadGame, saveGame } from './indexeddb';
import {
  SCHEMA_VERSION,
  SaveLoadError,
  createSaveFile,
  migrateSave,
  migrations,
  parseSave,
  serializeSave,
} from './saveFile';

describe('JSON round trip', () => {
  it('round-trips an empty state', () => {
    const state = createEmptyState();
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('round-trips a played state, reservations and cached paths included', () => {
    const harness = createHarness(53);
    const centre = Object.values(harness.state.colonists)[0].position;
    harness.state = setDesignation(
      harness.state,
      nearestTilesWithTerrain(harness.state, 'forest', centre, 20),
      'chop',
    );
    harness.run(400);

    expect(Object.keys(harness.state.reservations).length).toBeGreaterThan(0);
    const restored = JSON.parse(JSON.stringify(harness.state));
    expect(restored).toEqual(harness.state);
    // the details section 8 explicitly wants preserved
    expect(restored.reservations).toEqual(harness.state.reservations);
    for (const id in harness.state.colonists) {
      expect(restored.colonists[id].path).toEqual(harness.state.colonists[id].path);
    }
  });

  it('resumes cleanly from a reloaded state', () => {
    const harness = createHarness(59);
    harness.run(300);
    const reloaded = JSON.parse(serializeSave(harness.state)).state;
    const ctx = createSimContext(reloaded);
    const after = tickMany(reloaded, ctx, 300);
    expect(after.tick).toBe(harness.state.tick + 300);
    // the PathIndex is rebuilt from the saved paths, not saved itself
    expect(Object.keys(ctx.pathIndex).length).toBeGreaterThanOrEqual(0);
  });
});

describe('save file versioning', () => {
  it('stamps the current schema version and an ISO timestamp', () => {
    const save = createSaveFile(createEmptyState(), '2026-07-26T00:00:00.000Z');
    expect(save.schemaVersion).toBe(SCHEMA_VERSION);
    expect(save.savedAtRealTime).toBe('2026-07-26T00:00:00.000Z');
    expect(typeof save.savedAtRealTime).toBe('string');
  });

  it('rejects a save that is too old to migrate', () => {
    const save = { ...createSaveFile(createEmptyState()), schemaVersion: 0 };
    expect(() => migrateSave(save)).toThrow(SaveLoadError);
  });

  it('rejects a save from a newer build', () => {
    const save = {
      ...createSaveFile(createEmptyState()),
      schemaVersion: SCHEMA_VERSION + 5,
    };
    expect(() => migrateSave(save)).toThrow(SaveLoadError);
  });

  it('applies the migration chain in order', () => {
    const applied: number[] = [];
    migrations[0] = (old) => {
      applied.push(0);
      return old;
    };
    try {
      const save = { ...createSaveFile(createEmptyState()), schemaVersion: 0 };
      const migrated = migrateSave(save);
      expect(applied).toEqual([0]);
      expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    } finally {
      delete migrations[0];
    }
  });

  it('migrates a version 1 save into the animal layer', () => {
    // A v1 save as it was actually written: no animals, no forage, no health.
    const harness = createHarness(67);
    harness.run(200);
    const v1 = JSON.parse(JSON.stringify(harness.state)) as Record<string, unknown>;
    delete v1.animals;
    for (const id in v1.tiles as Record<string, Record<string, unknown>>) {
      delete (v1.tiles as Record<string, Record<string, unknown>>)[id].forage;
    }
    for (const id in v1.colonists as Record<string, Record<string, unknown>>) {
      delete (v1.colonists as Record<string, Record<string, unknown>>)[id].health;
    }

    const migrated = migrateSave({
      schemaVersion: 1,
      savedAtTick: harness.state.tick,
      savedAtRealTime: '2026-07-26T00:00:00.000Z',
      state: v1 as unknown as GameState,
    });

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION); // through every step of the chain
    const state = migrated.state;
    expect(state.animals).toEqual({});
    for (const id in state.tiles) {
      const tile = state.tiles[id];
      expect(tile.forage).toBe(tile.terrain === 'grass' ? 1 : 0);
    }
    for (const id in state.colonists) {
      expect(state.colonists[id].health).toBe(COLONIST_MAX_HEALTH);
    }
    // and it keeps ticking: a migrated save is a real save, not a shell
    const ctx = createSimContext(state);
    const after = tickMany(state, ctx, 200);
    expect(after.tick).toBe(harness.state.tick + 200);
  });

  it('migrates a version 2 save into the predator cooldown', () => {
    const harness = createHarness(71);
    harness.run(120);
    const v2 = JSON.parse(JSON.stringify(harness.state)) as GameState;
    for (const id in v2.animals) {
      const { huntCooldownUntilTick: _dropped, ...rest } = v2.animals[id];
      v2.animals[id] = rest as GameState['animals'][string];
    }
    expect(Object.keys(v2.animals).length).toBeGreaterThan(0);

    const migrated = migrateSave({
      schemaVersion: 2,
      savedAtTick: harness.state.tick,
      savedAtRealTime: '2026-08-05T00:00:00.000Z',
      state: v2,
    });

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    for (const id in migrated.state.animals) {
      expect(migrated.state.animals[id].huntCooldownUntilTick).toBeNull();
    }
    const ctx = createSimContext(migrated.state);
    expect(tickMany(migrated.state, ctx, 200).tick).toBe(harness.state.tick + 200);
  });

  it('migrates a version 3 save into the skill layer', () => {
    const harness = createHarness(73);
    harness.run(150);
    const v3 = JSON.parse(JSON.stringify(harness.state)) as GameState;
    for (const id in v3.colonists) {
      const { skills: _dropped, ...rest } = v3.colonists[id];
      v3.colonists[id] = rest as GameState['colonists'][string];
    }

    const migrated = migrateSave({
      schemaVersion: 3,
      savedAtTick: harness.state.tick,
      savedAtRealTime: '2026-08-05T00:00:00.000Z',
      state: v3,
    });

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    for (const id in migrated.state.colonists) {
      // no invented history: an existing colony starts the ladder at the bottom
      expect(migrated.state.colonists[id].skills).toEqual(emptySkills());
    }
    // And from there they learn like anyone else - given something to learn on.
    // This used to run the migrated colony for four hundred ticks and check
    // that somebody had gained *any* experience, which passed on whatever scrap
    // of work the colony happened to have left at tick 150: measured, that was
    // five points of experience in the whole run, and a change elsewhere that
    // shifted the world by a hair took it to zero. A test for "the ladder
    // works" has to put a rung in front of them.
    const withWork = setDesignation(
      migrated.state,
      nearestTilesWithTerrain(
        migrated.state,
        'forest',
        Object.values(migrated.state.colonists)[0].position,
        4,
      ),
      'chop',
    );
    const ctx = createSimContext(withWork);
    const after = tickMany(withWork, ctx, 400);
    expect(after.tick).toBe(harness.state.tick + 400);
    const learned = Object.values(after.colonists).some((c) =>
      SKILL_NAMES.some((name) => c.skills[name] > 0),
    );
    expect(learned).toBe(true);
  });

  it('migrates a version 4 save into zone filters', () => {
    const harness = createHarness(79);
    harness.run(100);
    harness.state = placePastureZone(
      harness.state,
      [0, 1, 2].map((d) => {
        const at = Object.values(harness.state.colonists)[0].position;
        return `${at.x + 4 + d},${at.y - 3}`;
      }),
    );
    const v4 = JSON.parse(JSON.stringify(harness.state)) as GameState;
    for (const id in v4.zones) {
      const { accepts: _dropped, ...rest } = v4.zones[id];
      v4.zones[id] = rest as GameState['zones'][string];
    }

    const migrated = migrateSave({
      schemaVersion: 4,
      savedAtTick: harness.state.tick,
      savedAtRealTime: '2026-08-05T00:00:00.000Z',
      state: v4,
    });

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    let sawPasture = false;
    for (const id in migrated.state.zones) {
      const zone = migrated.state.zones[id];
      if (zone.type === 'storage') {
        // an old store was taking everything, so that is what it keeps doing
        expect([...zone.accepts].sort()).toEqual([...RESOURCE_TYPES].sort());
      } else {
        expect(zone.accepts).toEqual(['food']);
        sawPasture = true;
      }
    }
    expect(sawPasture).toBe(true);
    const ctx = createSimContext(migrated.state);
    expect(tickMany(migrated.state, ctx, 300).tick).toBe(harness.state.tick + 300);
  });

  it('migrates a version 22 save into the craft column', () => {
    // A real v22 save predates the workbench: no `craft` on any colonist's
    // workPriorities or skills, and no `variant` on any item - which is the
    // shape those optional fields are designed to read as-is.
    const harness = createHarness(111);
    harness.run(100);
    const v22 = JSON.parse(JSON.stringify(harness.state)) as GameState;
    for (const id in v22.colonists) {
      const { craft: _wp, ...workPriorities } = v22.colonists[id].workPriorities as Record<
        string,
        number
      >;
      const { craft: _sk, ...skills } = v22.colonists[id].skills as Record<string, number>;
      v22.colonists[id] = {
        ...v22.colonists[id],
        workPriorities: workPriorities as GameState['colonists'][string]['workPriorities'],
        skills: skills as GameState['colonists'][string]['skills'],
      };
    }

    const migrated = migrateSave({
      schemaVersion: 22,
      savedAtTick: harness.state.tick,
      savedAtRealTime: '2026-08-11T00:00:00.000Z',
      state: v22,
    });

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    for (const id in migrated.state.colonists) {
      // same defaults a fresh colonist gets: nobody cooks unasked
      expect(migrated.state.colonists[id].workPriorities.craft).toBe(3);
      expect(migrated.state.colonists[id].skills.craft).toBe(0);
    }
    const ctx = createSimContext(migrated.state);
    expect(tickMany(migrated.state, ctx, 300).tick).toBe(harness.state.tick + 300);
  });

  it('migrates a version 5 save into traits', () => {
    const harness = createHarness(83);
    harness.run(100);
    const v5 = JSON.parse(JSON.stringify(harness.state)) as GameState;
    for (const id in v5.colonists) {
      const { traits: _dropped, ...rest } = v5.colonists[id];
      v5.colonists[id] = rest as GameState['colonists'][string];
    }

    const migrated = migrateSave({
      schemaVersion: 5,
      savedAtTick: harness.state.tick,
      savedAtRealTime: '2026-08-05T00:00:00.000Z',
      state: v5,
    });

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    for (const id in migrated.state.colonists) {
      // dealing traits to people who already have a history would quietly
      // change who they are; none multiplies out to the colonist as saved
      expect(migrated.state.colonists[id].traits).toEqual([]);
    }
    const ctx = createSimContext(migrated.state);
    expect(tickMany(migrated.state, ctx, 300).tick).toBe(harness.state.tick + 300);
  });

  it('migrates a version 6 save into forest regrowth', () => {
    const harness = createHarness(89);
    harness.run(100);
    const v6 = JSON.parse(JSON.stringify(harness.state)) as GameState;
    const { forestCapacity: _dropped, ...rest } = v6;
    const standing = Object.values(v6.tiles).filter((t) => t.terrain === 'forest').length;

    const migrated = migrateSave({
      schemaVersion: 6,
      savedAtTick: harness.state.tick,
      savedAtRealTime: '2026-08-05T00:00:00.000Z',
      state: rest as GameState,
    });

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    // a save made after a big clearance keeps its clearing rather than being
    // handed back trees it never had
    expect(migrated.state.forestCapacity).toBe(standing);
    const ctx = createSimContext(migrated.state);
    expect(tickMany(migrated.state, ctx, 300).tick).toBe(harness.state.tick + 300);
  });

  it('migrates a version 7 save into scenarios', () => {
    const harness = createHarness(97);
    harness.run(100);
    const v7 = JSON.parse(JSON.stringify(harness.state)) as GameState;
    const { scenario: _dropped, ...rest } = v7;

    const migrated = migrateSave({
      schemaVersion: 7,
      savedAtTick: harness.state.tick,
      savedAtRealTime: '2026-08-05T00:00:00.000Z',
      state: rest as GameState,
    });

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    // every existing save was played under what is now the standard opening
    expect(migrated.state.scenario).toBe('standard');
    const ctx = createSimContext(migrated.state);
    expect(tickMany(migrated.state, ctx, 300).tick).toBe(harness.state.tick + 300);
  });

  it('migrates a version 8 save into world-seeded incidents', () => {
    const harness = createHarness(101);
    harness.run(100);
    const v8 = JSON.parse(JSON.stringify(harness.state)) as GameState;
    const { worldSeed: _dropped, ...rest } = v8;

    const migrated = migrateSave({
      schemaVersion: 8,
      savedAtTick: harness.state.tick,
      savedAtRealTime: '2026-08-05T00:00:00.000Z',
      state: rest as GameState,
    });

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    // zero keeps the schedule the save has been running on rather than handing
    // it a different future halfway through
    expect(migrated.state.worldSeed).toBe(0);
    const ctx = createSimContext(migrated.state);
    expect(tickMany(migrated.state, ctx, 300).tick).toBe(harness.state.tick + 300);
  });

  it('migrates a version 15 save through traders, map size and the structured log', () => {
    const harness = createHarness(103);
    harness.run(100);
    // a real v15 save predates traders (16), stored map sizes (17) and the
    // structured log (18): strip all three so the whole tail of the chain runs
    const {
      traders: _noTraders,
      width: _noWidth,
      height: _noHeight,
      ...v15
    } = JSON.parse(JSON.stringify(harness.state)) as GameState;
    // a v15 log as it was actually written: finished English sentences
    (v15 as unknown as { log: unknown }).log = [
      { tick: 10, message: 'Aria reached Woodcutting level 2' },
      { tick: 20, message: 'A pack of 2 wolves came down out of the trees', kind: 'incident' },
    ];

    const migrated = migrateSave({
      schemaVersion: 15,
      savedAtTick: harness.state.tick,
      savedAtRealTime: '2026-08-10T00:00:00.000Z',
      state: v15 as GameState,
    });

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    // nobody is mid-visit in a save that predates trade
    expect(migrated.state.traders).toEqual({});
    // every save before v17 was 60x60, because that was the only size there was
    expect(migrated.state.width).toBe(60);
    expect(migrated.state.height).toBe(60);
    // old sentences are wrapped, not parsed: guessing the event back out of the
    // wording would necessarily miss, so they display verbatim as `legacy`
    expect(migrated.state.log).toEqual([
      { tick: 10, key: 'legacy', params: { text: 'Aria reached Woodcutting level 2' } },
      {
        tick: 20,
        key: 'legacy',
        params: { text: 'A pack of 2 wolves came down out of the trees' },
        kind: 'incident',
      },
    ]);
    // and it keeps ticking, writing structured entries after the legacy ones
    const ctx = createSimContext(migrated.state);
    expect(tickMany(migrated.state, ctx, 200).tick).toBe(harness.state.tick + 200);
  });

  it('migrates a version 19 save into the research tree', () => {
    // A real v19 save predates research entirely: no `research` on state, no
    // `research` column on any colonist's workPriorities or skills.
    const harness = createHarness(109);
    harness.run(100);
    const v19 = JSON.parse(JSON.stringify(harness.state)) as GameState;
    const { research: _dropped, ...rest } = v19;
    for (const id in rest.colonists) {
      const { research: _wp, ...workPriorities } = rest.colonists[id].workPriorities as Record<
        string,
        number
      >;
      const { research: _sk, ...skills } = rest.colonists[id].skills as Record<string, number>;
      rest.colonists[id] = {
        ...rest.colonists[id],
        workPriorities: workPriorities as GameState['colonists'][string]['workPriorities'],
        skills: skills as GameState['colonists'][string]['skills'],
      };
    }

    const migrated = migrateSave({
      schemaVersion: 19,
      savedAtTick: harness.state.tick,
      savedAtRealTime: '2026-08-10T00:00:00.000Z',
      state: rest as GameState,
    });

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    // 3.1: nothing existing gets re-locked, and nothing is unlocked for free
    expect(migrated.state.research).toEqual({
      current: null,
      progress: { woodcraft: 0, stonecarving: 0, ironwork: 0, crystallography: 0 },
      unlocked: [],
    });
    for (const id in migrated.state.colonists) {
      expect(migrated.state.colonists[id].workPriorities.research).toBe(3);
      expect(migrated.state.colonists[id].skills.research).toBe(0);
    }
    const ctx = createSimContext(migrated.state);
    expect(tickMany(migrated.state, ctx, 300).tick).toBe(harness.state.tick + 300);
  });

  it('migrates a version 20 save into biomes', () => {
    // A real v20 save predates biomes entirely: no `biome` on state at all.
    const harness = createHarness(113);
    harness.run(100);
    const v20 = JSON.parse(JSON.stringify(harness.state)) as GameState;
    const { biome: _dropped, ...rest } = v20;

    const migrated = migrateSave({
      schemaVersion: 20,
      savedAtTick: harness.state.tick,
      savedAtRealTime: '2026-08-10T00:00:00.000Z',
      state: rest as GameState,
    });

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    // every existing save was generated under exactly the rules `meadow` now
    // names - the migration writes down what was already true
    expect(migrated.state.biome).toBe('meadow');
    const ctx = createSimContext(migrated.state);
    expect(tickMany(migrated.state, ctx, 300).tick).toBe(harness.state.tick + 300);
  });

  it('migrates a version 21 save into the world map', () => {
    // A real v21 save predates the world map entirely: no `worldCell` on state.
    const harness = createHarness(127);
    harness.run(100);
    const v21 = JSON.parse(JSON.stringify(harness.state)) as GameState;
    const { worldCell: _dropped, ...rest } = v21;

    const migrated = migrateSave({
      schemaVersion: 21,
      savedAtTick: harness.state.tick,
      savedAtRealTime: '2026-08-10T00:00:00.000Z',
      state: rest as GameState,
    });

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    // nothing says which cell among equally valid ones the player would have
    // picked, so a migrated save is simply nowhere near any tribe
    expect(migrated.state.worldCell).toBeNull();
    const ctx = createSimContext(migrated.state);
    expect(tickMany(migrated.state, ctx, 300).tick).toBe(harness.state.tick + 300);
  });

  it('migrates a version 23 save into the equipment record', () => {
    const harness = createHarness(113);
    harness.run(50);
    const v23 = JSON.parse(JSON.stringify(harness.state)) as Partial<GameState>;
    delete v23.equipment;

    const migrated = migrateSave({
      schemaVersion: 23,
      savedAtTick: harness.state.tick,
      savedAtRealTime: '2026-08-11T00:00:00.000Z',
      state: v23 as GameState,
    });

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.state.equipment).toEqual({});
    const ctx = createSimContext(migrated.state);
    expect(tickMany(migrated.state, ctx, 300).tick).toBe(harness.state.tick + 300);
  });

  it('migrates a version 24 save unchanged (water terrain, no retrofit)', () => {
    const harness = createHarness(131);
    harness.run(50);
    const v24 = JSON.parse(JSON.stringify(harness.state)) as GameState;

    const migrated = migrateSave({
      schemaVersion: 24,
      savedAtTick: harness.state.tick,
      savedAtRealTime: '2026-08-11T00:00:00.000Z',
      state: v24,
    });

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    // no retrofit: a pre-water save's tiles come through byte-for-byte
    expect(migrated.state.tiles).toEqual(v24.tiles);
    const ctx = createSimContext(migrated.state);
    expect(tickMany(migrated.state, ctx, 300).tick).toBe(harness.state.tick + 300);
  });

  it('migrates a version 25 save into herb-accepting storage zones (フェーズ14 段階 H-1)', () => {
    const harness = createHarness(137);
    harness.run(50);
    const v25 = JSON.parse(JSON.stringify(harness.state)) as GameState;

    const migrated = migrateSave({
      schemaVersion: 25,
      savedAtTick: harness.state.tick,
      savedAtRealTime: '2026-08-11T00:00:00.000Z',
      state: v25,
    });

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    for (const id in migrated.state.zones) {
      if (migrated.state.zones[id].type !== 'storage') continue;
      expect(migrated.state.zones[id].accepts).toContain('herb');
    }
    // and no herb plants were invented on a map generated before the
    // placement rule existed - only newly generated worlds have them (6章)
    expect(
      Object.values(migrated.state.buildings).filter((b) => b.type === 'herb').length,
    ).toBe(Object.values(v25.buildings).filter((b) => b.type === 'herb').length);
    const ctx = createSimContext(migrated.state);
    expect(tickMany(migrated.state, ctx, 300).tick).toBe(harness.state.tick + 300);
  });

  it('migrates a version 26 save into the treat column and illnessTicks (フェーズ14 段階 M-1)', () => {
    // A real v26 save predates illness entirely: no `treat` on any colonist's
    // workPriorities or skills, and no `illnessTicks` field at all.
    const harness = createHarness(139);
    harness.run(50);
    const v26 = JSON.parse(JSON.stringify(harness.state)) as GameState;
    for (const id in v26.colonists) {
      const { treat: _wp, ...workPriorities } = v26.colonists[id].workPriorities as Record<
        string,
        number
      >;
      const { treat: _sk, ...skills } = v26.colonists[id].skills as Record<string, number>;
      const { illnessTicks: _it, ...colonistRest } = v26.colonists[id];
      v26.colonists[id] = {
        ...colonistRest,
        workPriorities: workPriorities as GameState['colonists'][string]['workPriorities'],
        skills: skills as GameState['colonists'][string]['skills'],
      } as GameState['colonists'][string];
    }

    const migrated = migrateSave({
      schemaVersion: 26,
      savedAtTick: harness.state.tick,
      savedAtRealTime: '2026-08-11T00:00:00.000Z',
      state: v26,
    });

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    for (const id in migrated.state.colonists) {
      expect(migrated.state.colonists[id].workPriorities.treat).toBe(3);
      expect(migrated.state.colonists[id].skills.treat).toBe(0);
      // nobody is sick in a save from before sickness existed
      expect(migrated.state.colonists[id].illnessTicks).toBe(0);
    }
    const ctx = createSimContext(migrated.state);
    expect(tickMany(migrated.state, ctx, 300).tick).toBe(harness.state.tick + 300);
  });

  it('rejects malformed json and missing fields', () => {
    expect(() => parseSave('{oops')).toThrow(SaveLoadError);
    expect(() => parseSave('{"schemaVersion":1,"state":{}}')).toThrow(SaveLoadError);
  });
});

describe('IndexedDB slot', () => {
  it('saves and loads through IndexedDB', async () => {
    const harness = createHarness(61);
    harness.run(120);
    await saveGame(harness.state, DEFAULT_SLOT);
    expect(await hasSave(DEFAULT_SLOT)).toBe(true);

    const loaded = await loadGame(DEFAULT_SLOT);
    expect(loaded.tick).toBe(harness.state.tick);
    expect(loaded).toEqual(JSON.parse(JSON.stringify(harness.state)));

    await deleteSave(DEFAULT_SLOT);
    expect(await hasSave(DEFAULT_SLOT)).toBe(false);
  });

  it('keeps the autosave in a slot of its own', async () => {
    const harness = createHarness(83);
    harness.run(60);
    await saveGame(harness.state, DEFAULT_SLOT);
    const manualTick = harness.state.tick;

    // play on, then autosave: the deliberate save must not move
    harness.run(120);
    await saveGame(harness.state, AUTOSAVE_SLOT);

    expect((await loadGame(DEFAULT_SLOT)).tick).toBe(manualTick);
    expect((await loadGame(AUTOSAVE_SLOT)).tick).toBe(harness.state.tick);
    expect(await hasSave(AUTOSAVE_SLOT)).toBe(true);

    await deleteSave(DEFAULT_SLOT);
    await deleteSave(AUTOSAVE_SLOT);
  });

  it('reports a missing slot instead of returning junk', async () => {
    await expect(loadGame('does-not-exist')).rejects.toBeInstanceOf(SaveLoadError);
  });

  it('gives an old save a reason to care about mana', () => {
    // A colony saved before phase 2 existed has rock faces with nothing in them
    // and storage zones that never heard of the resource. Both would leave the
    // player looking at a mana furnace they can never fuel.
    const harness = createHarness(71);
    const v9 = JSON.parse(JSON.stringify(harness.state)) as GameState;
    for (const id in v9.tiles) {
      if (v9.tiles[id].terrain === 'crystal') v9.tiles[id] = { ...v9.tiles[id], terrain: 'stone' };
    }
    for (const id in v9.zones) {
      v9.zones[id] = {
        ...v9.zones[id],
        accepts: v9.zones[id].accepts.filter((type) => type !== 'manaCrystal'),
      };
    }

    const migrated = migrateSave({
      schemaVersion: 9,
      savedAtTick: v9.tick,
      savedAtRealTime: '2026-08-08T00:00:00.000Z',
      state: v9,
    }).state;

    const veins = Object.values(migrated.tiles).filter((t) => t.terrain === 'crystal');
    expect(veins.length).toBeGreaterThan(0);
    for (const vein of veins) expect(vein.walkable).toBe(false);
    for (const id in migrated.zones) {
      if (migrated.zones[id].type !== 'storage') continue;
      expect(migrated.zones[id].accepts).toContain('manaCrystal');
    }

    // and the same world migrates to the same veins, not a fresh roll each load
    const again = migrateSave({
      schemaVersion: 9,
      savedAtTick: v9.tick,
      savedAtRealTime: '2026-08-08T00:00:00.000Z',
      state: JSON.parse(JSON.stringify(v9)) as GameState,
    }).state;
    expect(Object.values(again.tiles).filter((t) => t.terrain === 'crystal').length).toBe(
      veins.length,
    );
  });

  it('gives an old save iron to find, the same way it was given mana', () => {
    // A colony saved before phase 10 (v18) has rock with no iron in it and
    // storage zones that never heard of the resource - the same two gaps, one
    // ore on.
    const harness = createHarness(107);
    const v18 = JSON.parse(JSON.stringify(harness.state)) as GameState;
    for (const id in v18.tiles) {
      if (v18.tiles[id].terrain === 'ironVein') {
        v18.tiles[id] = { ...v18.tiles[id], terrain: 'stone' };
      }
    }
    for (const id in v18.zones) {
      v18.zones[id] = {
        ...v18.zones[id],
        accepts: v18.zones[id].accepts.filter((type) => type !== 'iron'),
      };
    }

    const migrated = migrateSave({
      schemaVersion: 18,
      savedAtTick: v18.tick,
      savedAtRealTime: '2026-08-10T00:00:00.000Z',
      state: v18,
    }).state;

    const veins = Object.values(migrated.tiles).filter((t) => t.terrain === 'ironVein');
    expect(veins.length).toBeGreaterThan(0);
    for (const vein of veins) expect(vein.walkable).toBe(false);
    // and crystal was left exactly where it was: iron is seeded into stone only
    expect(Object.values(migrated.tiles).filter((t) => t.terrain === 'crystal').length).toBe(
      Object.values(v18.tiles).filter((t) => t.terrain === 'crystal').length,
    );
    for (const id in migrated.zones) {
      if (migrated.zones[id].type !== 'storage') continue;
      expect(migrated.zones[id].accepts).toContain('iron');
    }

    // and the same world migrates to the same veins, not a fresh roll each load
    const again = migrateSave({
      schemaVersion: 18,
      savedAtTick: v18.tick,
      savedAtRealTime: '2026-08-10T00:00:00.000Z',
      state: JSON.parse(JSON.stringify(v18)) as GameState,
    }).state;
    expect(Object.values(again.tiles).filter((t) => t.terrain === 'ironVein').length).toBe(
      veins.length,
    );
  });

});
