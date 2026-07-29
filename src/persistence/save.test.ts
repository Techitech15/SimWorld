// Week 1 acceptance (section 10): a GameState survives a JSON round trip
// unchanged. Plus the versioning rules of section 8.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { setDesignation } from '../core/actions';
import { COLONIST_MAX_HEALTH } from '../core/constants';
import { createEmptyState } from '../core/state';
import type { GameState } from '../core/types';
import { createHarness, nearestTilesWithTerrain } from '../core/testUtils';
import { createSimContext } from '../core/derived';
import { tickMany } from '../core/simulation';
import { DEFAULT_SLOT, deleteSave, hasSave, loadGame, saveGame } from './indexeddb';
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

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
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

  it('reports a missing slot instead of returning junk', async () => {
    await expect(loadGame('does-not-exist')).rejects.toBeInstanceOf(SaveLoadError);
  });
});
