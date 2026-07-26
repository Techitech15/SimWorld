// Save file format and migration chain (section 8).
//
// GameState is JSON-only by construction (section 4), so serialising is
// literally JSON.stringify. PathIndex is derived and therefore not saved;
// reservations are, because losing them re-opens the "two colonists, one tree"
// accident the moment a save is loaded.
import type { GameState } from '../core/types';

export const SCHEMA_VERSION = 1;

export interface SaveFile {
  schemaVersion: number;
  savedAtTick: number;
  /** ISO8601 string; Date instances are never stored */
  savedAtRealTime: string;
  state: GameState;
}

export type Migration = (old: unknown) => unknown;

/**
 * migrations[n] upgrades a state saved at schemaVersion n to version n + 1.
 * A save whose version has no migration path is rejected outright rather than
 * loaded half-broken.
 */
export const migrations: Record<number, Migration> = {};

export function createSaveFile(state: GameState, now: string = new Date().toISOString()): SaveFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAtTick: state.tick,
    savedAtRealTime: now,
    state,
  };
}

export function serializeSave(state: GameState, now?: string): string {
  return JSON.stringify(createSaveFile(state, now));
}

export class SaveLoadError extends Error {}

export function migrateSave(save: SaveFile): SaveFile {
  if (save.schemaVersion > SCHEMA_VERSION) {
    throw new SaveLoadError(
      `Save was written by a newer version (schemaVersion ${save.schemaVersion} > ${SCHEMA_VERSION}).`,
    );
  }
  let version = save.schemaVersion;
  let state: unknown = save.state;
  while (version < SCHEMA_VERSION) {
    const migration = migrations[version];
    if (!migration) {
      throw new SaveLoadError(
        `No migration from schemaVersion ${version}; this save is too old to load.`,
      );
    }
    state = migration(state);
    version += 1;
  }
  return { ...save, schemaVersion: version, state: state as GameState };
}

export function parseSave(json: string): SaveFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SaveLoadError('Save file is not valid JSON.');
  }
  return migrateSave(assertSaveShape(parsed));
}

function assertSaveShape(value: unknown): SaveFile {
  if (typeof value !== 'object' || value === null) throw new SaveLoadError('Save file is empty.');
  const save = value as Partial<SaveFile>;
  if (typeof save.schemaVersion !== 'number') throw new SaveLoadError('Save has no schemaVersion.');
  if (typeof save.state !== 'object' || save.state === null) {
    throw new SaveLoadError('Save has no state.');
  }
  const required: (keyof GameState)[] = [
    'tick',
    'tiles',
    'colonists',
    'buildings',
    'items',
    'jobs',
    'zones',
    'reservations',
  ];
  for (const key of required) {
    if (!(key in (save.state as object)))
      throw new SaveLoadError(`Save state is missing "${key}".`);
  }
  return save as SaveFile;
}
