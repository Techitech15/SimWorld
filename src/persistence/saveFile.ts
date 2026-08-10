// Save file format and migration chain (section 8).
//
// GameState is JSON-only by construction (section 4), so serialising is
// literally JSON.stringify. PathIndex is derived and therefore not saved;
// reservations are, because losing them re-opens the "two colonists, one tree"
// accident the moment a save is loaded.
import { COLONIST_MAX_HEALTH, RESOURCE_TYPES } from '../core/constants';
import { emptyResearch } from '../core/research';
import { DEFAULT_SCENARIO } from '../core/scenario';
import { mulberry32 } from '../core/rng';
import { emptySkills } from '../core/skills';
import type { GameState } from '../core/types';

export const SCHEMA_VERSION = 20;

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
   * 1 -> 2: the animal layer (docs/design-phase2.5-animals.md 7). A version 1 save knows
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

  /**
   * 10 -> 11: every building carries a fuel level. No save from before this can
   * contain a furnace, so the value is always zero; it is filled in anyway so
   * that "every saved building has every field" stays true and the round-trip
   * test keeps comparing whole objects rather than the ones it happens to know.
   */
  10: (old) => {
    const state = old as Partial<GameState>;
    const buildings = { ...(state.buildings ?? {}) };
    for (const id in buildings) {
      if (buildings[id].manaFuel === undefined) buildings[id] = { ...buildings[id], manaFuel: 0 };
    }
    return { ...state, buildings };
  },

  /**
   * 11 -> 12: extractors keep their progress into the rock face. Same shape as
   * the fuel field one version ago, and for the same reason - no save from
   * before this can hold an extractor, but "every saved building has every
   * field" is worth more than the version number it costs.
   */
  11: (old) => {
    const state = old as Partial<GameState>;
    const buildings = { ...(state.buildings ?? {}) };
    for (const id in buildings) {
      if (buildings[id].manaProgress === undefined) {
        buildings[id] = { ...buildings[id], manaProgress: 0 };
      }
    }
    return { ...state, buildings };
  },

  /**
   * 12 -> 13: colonists know each other (11章 フェーズ3). An old save has no
   * bonds and no memory of who has died, and both start empty rather than being
   * invented: a colony reloaded from before this existed has genuinely not been
   * observed spending time together, and handing it friendships it never earned
   * would be the save telling the player a story that did not happen.
   */
  12: (old) => {
    const state = old as Partial<GameState>;
    return {
      ...state,
      relationships: state.relationships ?? {},
      deaths: state.deaths ?? [],
    };
  },

  /**
   * 13 -> 14: colonists need time off (11章 フェーズ3). An old save's people
   * start content rather than half worn out: the need did not exist while they
   * were working, so charging them for the time they already served would put a
   * loaded colony straight into breaks on the first tick after loading.
   */
  13: (old) => {
    const state = old as Partial<GameState>;
    const colonists: GameState['colonists'] = {};
    for (const id in state.colonists ?? {}) {
      const colonist = state.colonists![id];
      colonists[id] = {
        ...colonist,
        needs: { ...colonist.needs, recreation: colonist.needs?.recreation ?? 0 },
      };
    }
    return { ...state, colonists };
  },

  /**
   * 14 -> 15: raiders exist (11章 フェーズ4). Nobody is mid-raid in a save that
   * predates raids, so the map starts empty - and an old colony gets the same
   * grace period a new one does, because the incident is gated on the day
   * rather than on when the feature arrived.
   */
  14: (old) => {
    const state = old as Partial<GameState>;
    return { ...state, raiders: state.raiders ?? {} };
  },

  /**
   * 15 -> 16: traders (11章 フェーズ5). Nobody is mid-visit in a save that
   * predates trade, and the visit schedule is a function of the tick, so an old
   * colony simply gets its first roll at the next five-day boundary.
   */
  15: (old) => {
    const state = old as Partial<GameState>;
    return { ...state, traders: state.traders ?? {} };
  },

  /**
   * 16 -> 17: the map carries its own size (11章 フェーズ6, design-phase6-space.md 3.1).
   *
   * Every save before this was 60x60, because that was the only size there was.
   * Writing it down is what lets the *default* grow without those colonies
   * becoming unreadable - the alternative was a version bump that could only
   * refuse them, and a change that makes the player throw their colony away is
   * not one worth making.
   */
  16: (old) => {
    const state = old as Partial<GameState>;
    return { ...state, width: state.width ?? 60, height: state.height ?? 60 };
  },

  /**
   * 17 -> 18: the log stores events, not sentences (11章 フェーズ9). An old
   * entry is a finished English sentence; parsing it back into an event would
   * be guesswork that necessarily misses, so it is wrapped as `legacy` and
   * shown verbatim in whatever language it was written. The ring buffer holds
   * 100 entries, so a few days of play push the old lines out naturally.
   */
  17: (old) => {
    const state = old as Omit<Partial<GameState>, 'log'> & {
      log?: { tick: number; message?: string; kind?: 'incident'; key?: string }[];
    };
    const log = (state.log ?? []).map((entry) => {
      if (entry.key !== undefined) return entry; // already structured
      const { message, ...rest } = entry;
      return { ...rest, key: 'legacy', params: { text: message ?? '' } };
    });
    return { ...state, log };
  },

  /**
   * 18 -> 19: iron veins (design-phase10-ores.md 段階A). The same two gaps the
   * mana crystal migration closed one ore ago, closed the same way.
   *
   * Old rock faces contain no iron, so veins are seeded into existing stone
   * deterministically from the world seed - same world, same veins, however
   * many times it is loaded. Fresh worldgen turns about a fifth of its rock
   * into iron (median 114 veins of ~550 rock tiles, 200 seeds); the rate here
   * is slightly under that because a migrated map has already been quarried,
   * exactly as the crystal rate was set below its worldgen fraction.
   *
   * And storage zones that predate the resource would silently never take it,
   * so `iron` joins every existing storage zone's accepts: the player chose to
   * exclude nothing, so nothing should arrive excluded.
   */
  18: (old) => {
    const state = old as Partial<GameState>;
    const tiles = { ...(state.tiles ?? {}) };
    const rnd = mulberry32(Math.abs(Math.floor(state.worldSeed ?? 0)) + 7211);
    for (const id in tiles) {
      const tile = tiles[id];
      if (tile.terrain !== 'stone') continue;
      if (rnd() < 0.18) tiles[id] = { ...tile, terrain: 'ironVein' };
    }
    const zones = { ...(state.zones ?? {}) };
    for (const id in zones) {
      const zone = zones[id];
      if (zone.type !== 'storage' || zone.accepts?.includes('iron')) continue;
      zones[id] = { ...zone, accepts: [...(zone.accepts ?? []), 'iron'] };
    }
    return { ...state, tiles, zones };
  },

  /**
   * 19 -> 20: the research tree (11章 フェーズ12). No save from before this can
   * have a desk, a selected tech or any progress, so the colony starts exactly
   * where 3.1 promises it does: nothing unlocked, nothing re-locked, every
   * existing building still standing. `research.research = 3` and
   * `skills.research = 0` join every colonist the same way the traits and
   * recreation migrations added a field nobody had touched yet.
   */
  19: (old) => {
    const state = old as Partial<GameState>;
    const colonists: GameState['colonists'] = {};
    for (const id in state.colonists ?? {}) {
      const colonist = state.colonists![id];
      colonists[id] = {
        ...colonist,
        workPriorities: { ...colonist.workPriorities, research: colonist.workPriorities?.research ?? 3 },
        skills: { ...colonist.skills, research: colonist.skills?.research ?? 0 },
      };
    }
    return { ...state, colonists, research: state.research ?? emptyResearch() };
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
