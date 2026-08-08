// Save file format and migration chain (section 8).
//
// GameState is JSON-only by construction (section 4), so serialising is
// literally JSON.stringify. PathIndex is derived and therefore not saved;
// reservations are, because losing them re-opens the "two colonists, one tree"
// accident the moment a save is loaded.
import { COLONIST_MAX_HEALTH, RESOURCE_TYPES } from '../core/constants';
import { DEFAULT_SCENARIO } from '../core/scenario';
import { mulberry32 } from '../core/rng';
import { emptySkills } from '../core/skills';
import type { GameState } from '../core/types';

export const SCHEMA_VERSION = 10;

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
export const migrations: Record<number, Migration> = {
  /**
   * 1 -> 2: the animal layer (docs/design-animals.md 7). A version 1 save knows
   * nothing about animals, forage or colonist health, so the migration fills in
   * the values a freshly generated world would have had: no animals yet, grass
   * fully grown, everybody healthy. Nothing existing is rewritten, so a v1 save
   * keeps its colonies, jobs and reservations exactly as they were.
   */
  1: (old) => {
    const state = old as Partial<GameState>;
    const tiles: GameState['tiles'] = {};
    for (const tileId in state.tiles ?? {}) {
      const tile = state.tiles![tileId];
      tiles[tileId] = {
        ...tile,
        forage: tile.terrain === 'grass' ? 1 : 0,
      };
    }
    const colonists: GameState['colonists'] = {};
    for (const id in state.colonists ?? {}) {
      colonists[id] = { ...state.colonists![id], health: COLONIST_MAX_HEALTH };
    }
    return { ...state, tiles, colonists, animals: {} };
  },

  /**
   * 2 -> 3: predators grew a `huntCooldownUntilTick`, so that giving up a chase
   * means something. A version 2 save has animals without the field; left as
   * `undefined` the cooldown check happens to evaluate the right way, which is
   * exactly the kind of accident a migration exists to remove.
   */
  2: (old) => {
    const state = old as Partial<GameState>;
    const animals: GameState['animals'] = {};
    for (const id in state.animals ?? {}) {
      const animal = state.animals![id];
      animals[id] = { ...animal, huntCooldownUntilTick: animal.huntCooldownUntilTick ?? null };
    }
    return { ...state, animals };
  },

  /**
   * 3 -> 4: colonists learned to get better at their work. An existing colony
   * has no record of what its people have been doing, and inventing a history
   * for them would be a lie, so everybody starts from zero: the same work at
   * the same speed as before, improving from here.
   */
  3: (old) => {
    const state = old as Partial<GameState>;
    const colonists: GameState['colonists'] = {};
    for (const id in state.colonists ?? {}) {
      const colonist = state.colonists![id];
      colonists[id] = { ...colonist, skills: { ...emptySkills(), ...(colonist.skills ?? {}) } };
    }
    return { ...state, colonists };
  },

  /**
   * 4 -> 5: zones say what they take. An old save's storage zones were taking
   * everything, so that is what they keep doing; pastures counted as storage by
   * accident, which is how firewood ended up stacked among the livestock, and
   * they are narrowed to the feed pile they were meant to be.
   */
  4: (old) => {
    const state = old as Partial<GameState>;
    const zones: GameState['zones'] = {};
    for (const id in state.zones ?? {}) {
      const zone = state.zones![id];
      zones[id] = {
        ...zone,
        accepts: zone.accepts ?? (zone.type === 'storage' ? [...RESOURCE_TYPES] : ['food']),
      };
    }
    return { ...state, zones };
  },

  /**
   * 5 -> 6: colonists have traits. Dealing them out to people who already have
   * a history in the player's colony would silently change who they are, so an
   * old save's colonists get none - which multiplies out to exactly the
   * colonist the save was written with. Newcomers arrive with theirs.
   */
  5: (old) => {
    const state = old as Partial<GameState>;
    const colonists: GameState['colonists'] = {};
    for (const id in state.colonists ?? {}) {
      const colonist = state.colonists![id];
      colonists[id] = { ...colonist, traits: colonist.traits ?? [] };
    }
    return { ...state, colonists };
  },

  /**
   * 6 -> 7: the forest grows back, up to what the map supports. An old save
   * never recorded that number, so it takes the woodland it has now as its
   * capacity - which means a save made after a big clearance keeps the clearing
   * rather than being handed back trees it never had.
   */
  6: (old) => {
    const state = old as Partial<GameState>;
    if (typeof state.forestCapacity === 'number') return state;
    let standing = 0;
    for (const tileId in state.tiles ?? {}) {
      if (state.tiles![tileId].terrain === 'forest') standing++;
    }
    return { ...state, forestCapacity: standing };
  },

  /**
   * 7 -> 8: maps are generated under a scenario, and the scenario keeps
   * mattering afterwards (it says how many wolves the map sustains). Every
   * existing save was played under what is now the standard opening, so that is
   * what it gets - the game it has been all along.
   */
  7: (old) => {
    const state = old as Partial<GameState>;
    return { ...state, scenario: state.scenario ?? DEFAULT_SCENARIO };
  },

  /**
   * 8 -> 9: the world remembers the seed it was made from, so that incidents
   * can differ between colonies rather than only between days. An old save
   * never recorded one and takes zero, which keeps exactly the schedule it has
   * been running on rather than being handed a different future mid-game.
   */
  8: (old) => {
    const state = old as Partial<GameState>;
    return { ...state, worldSeed: state.worldSeed ?? 0 };
  },

  /**
   * 9 -> 10: mana crystal (11章 フェーズ2). Two things an old save is missing.
   *
   * Its rock faces contain no veins, so a colony saved before this existed
   * could never reach phase 2 at all - the migration seeds veins into rock the
   * same way worldgen would have, deriving the choice from the world seed so a
   * given world gets the same veins whether it was generated or migrated.
   *
   * Its storage zones list the resource types that existed when they were
   * created, and a zone that does not accept mana crystal will never have any
   * hauled into it. The new type is added to every existing zone: the player
   * chose to exclude nothing, so nothing should arrive excluded.
   */
  9: (old) => {
    const state = old as Partial<GameState>;
    const tiles = { ...(state.tiles ?? {}) };
    const rnd = mulberry32(Math.abs(Math.floor(state.worldSeed ?? 0)) + 4231);
    for (const id in tiles) {
      const tile = tiles[id];
      if (tile.terrain !== 'stone') continue;
      // rarer than worldgen's own rule, because this is retrofitting a map that
      // has already been quarried: the veins that are left are the deep ones
      if (rnd() < 0.04) tiles[id] = { ...tile, terrain: 'crystal' };
    }
    const zones = { ...(state.zones ?? {}) };
    for (const id in zones) {
      const zone = zones[id];
      if (zone.type !== 'storage' || zone.accepts?.includes('manaCrystal')) continue;
      zones[id] = { ...zone, accepts: [...(zone.accepts ?? []), 'manaCrystal'] };
    }
    return { ...state, tiles, zones };
  },
};

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
