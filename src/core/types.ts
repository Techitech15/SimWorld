// Data model (design document section 4).
//
// Every type here is plain data: no classes, no methods, no Date/Map/Set, and no
// object references between entities (IDs only). This is what makes section 8's
// "GameState is JSON.stringify-able as-is" hold.
//
// Fields marked [ext] are small additions the document's type list does not spell
// out but which the MVP feature list (section 9) requires. They are all plain
// data and keep the save format JSON-only:
//   Tile.designation        - the "伐採指定された木 / 採掘指定タイル" of section 6.1
//   Building.buildProgress  - build job progress
//   Building.growth         - farm plot growth (section 12 lists 3 farm stages)
//   Colonist.carrying       - haul jobs need something to carry the stack in
//   Colonist.activity       - need-driven eat/sleep behaviour (section 5)
//   Colonist.workPriorities - per-colonist priorities, implied by
//                             setJobPriority(colonistId, jobType, priority)
//
// The animal layer (docs/design-animals.md) adds `Animal`, `Tile.forage`,
// `Colonist.health` and the pasture zone. It follows the same rules: plain
// data, ID references, nothing that JSON cannot represent.

export type TileId = string; // `${x},${y}`
export type ColonistId = string;
export type BuildingId = string;
export type ItemId = string;
export type JobId = string;
export type ZoneId = string;
export type AnimalId = string;

export interface Vector2 {
  x: number;
  y: number;
}

export type TerrainType = 'grass' | 'forest' | 'stone';

/**
 * [ext] Player designation marking a tile as work to be done. `deconstruct`
 * targets the finished building standing on the tile rather than the ground.
 */
export type Designation = 'chop' | 'mine' | 'deconstruct';

export interface Tile {
  id: TileId;
  x: number;
  y: number;
  terrain: TerrainType;
  /** stone is walkable=false until mined; terrain changes update this */
  walkable: boolean;
  buildingId: BuildingId | null;
  /** items lying on the ground */
  itemIds: ItemId[];
  /** [ext] chop/mine/deconstruct designation, or null */
  designation: Designation | null;
  /**
   * [ext] grazeable growth on grass tiles, 0..1. Grazing consumes it and it
   * regrows over a day, which is the whole of the overgrazing puzzle.
   */
  forage: number;
}

export type ResourceType = 'wood' | 'stone' | 'food';

export interface Item {
  id: ItemId;
  type: ResourceType;
  quantity: number;
  /** map coordinates; items inside a storage zone still carry real coordinates */
  position: Vector2;
  reservedByJobId: JobId | null;
}

export type NeedType = 'hunger' | 'sleep';

export interface ColonistNeeds {
  /** 0 (full) .. 100 (starving), linear decay */
  hunger: number;
  /** 0 (rested) .. 100 (exhausted), linear decay */
  sleep: number;
}

/** [ext] Need-driven behaviour, which is deliberately outside the job system. */
export type ColonistActivity =
  | { kind: 'none' }
  | { kind: 'moving'; targetTileId: TileId } // player-issued move order
  | { kind: 'eating'; itemId: ItemId | null; ticksRemaining: number }
  | { kind: 'sleeping'; bedId: BuildingId | null }
  /** [ext] running from a predator. Colonists never fight back (design-animals.md 5) */
  | { kind: 'fleeing'; fromAnimalId: AnimalId; untilTick: number };

export interface CarriedStack {
  type: ResourceType;
  quantity: number;
}

export interface Colonist {
  id: ColonistId;
  name: string;
  /** tint applied to the shared walk spritesheet (section 12) */
  color: number;
  position: Vector2;
  /** cached path (section 7) */
  path: Vector2[] | null;
  pathTargetTileId: TileId | null;
  needs: ColonistNeeds;
  currentJobId: JobId | null;
  /**
   * [ext] 0..100. Deliberately a single number: no body parts, no illness and
   * no medical jobs (docs/design-animals.md 1). Predators are the only source
   * of damage; rest is the only source of healing; 0 means death.
   */
  health: number;
  /** [ext] */
  carrying: CarriedStack | null;
  /** [ext] */
  activity: ColonistActivity;
  /** [ext] 0 = disabled, 1 (highest) .. 3 (lowest) */
  workPriorities: Record<JobType, number>;
  /**
   * [ext] Accumulated experience per skill. Levels are derived from it rather
   * than stored, so there is exactly one number to save and one place that
   * decides what a level means (src/core/skills.ts).
   */
  skills: Record<SkillName, number>;
  /**
   * [ext] Fixed-for-life quirks. Each one is a multiplier on a number the game
   * already had (src/core/traits.ts), so an empty list is exactly the colonist
   * the game had before traits existed.
   */
  traits: TraitName[];
}

/** [ext] See src/core/traits.ts for what each one bends. */
export type TraitName =
  | 'quickLearner'
  | 'slowLearner'
  | 'industrious'
  | 'unhurried'
  | 'bigEater'
  | 'frugal'
  | 'heavySleeper'
  | 'restless'
  | 'tough'
  | 'frail';

export type BuildingType =
  | 'wall'
  | 'stoneWall'
  | 'floor'
  | 'stoneFloor'
  | 'door'
  | 'bed'
  | 'farmPlot'
  | 'berryBush'
  | 'storageZoneMarker';

export interface RequiredResource {
  type: ResourceType;
  quantity: number;
}

export interface Building {
  id: BuildingId;
  type: BuildingType;
  tileId: TileId;
  /** blueprint (planned) vs finished structure */
  isBlueprint: boolean;
  hpCurrent: number;
  hpMax: number;
  /** materials still missing while isBlueprint */
  requiredResources: RequiredResource[];
  /** [ext] 0..1, advanced by the build job once materials are delivered */
  buildProgress: number;
  /** [ext] farm plots and berry bushes: 0 = bare, >0 .. 1 = growing, 1 = harvestable */
  growth: number;
  /** [ext] farm plots only */
  sown: boolean;
}

export type JobType =
  | 'chop'
  | 'mine'
  | 'farm'
  | 'build'
  | 'haul'
  | 'hunt'
  | 'handle'
  | 'deconstruct';

/**
 * The columns of the work-priority table. `deconstruct` is deliberately absent:
 * it runs under the `build` work type, so tearing a wall down is governed by the
 * same column that put it up.
 */
export const JOB_TYPES: JobType[] = [
  'chop',
  'mine',
  'farm',
  'build',
  'haul',
  'hunt',
  'handle',
];

/**
 * [ext] The skills a colonist can practise: one per column of the work table.
 * `deconstruct` has no skill of its own because it has no column of its own -
 * it is construction work either way (see skillFor).
 */
export type SkillName = Exclude<JobType, 'deconstruct'>;

export type JobState = 'pending' | 'reserved' | 'active' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: JobId;
  /** what the execute stage does with this job */
  type: JobType;
  /**
   * [ext] which column of the work priority table governs this job. Usually the
   * same as `type`, but carrying materials to a blueprint is construction work,
   * not hauling - otherwise a colony with hauling set to "lowest" never
   * finishes a building.
   */
  workType: JobType;
  /** 1 (highest) .. 3 (lowest) */
  priority: number;
  targetTileId: TileId | null;
  /** BuildingId | ItemId; meaning depends on job type */
  targetEntityId: string | null;
  /** haul only: where the carried stack goes (storage tile id or building id) */
  destinationId: string | null;
  /**
   * [ext] haul only: which resource this job moves. Kept on the job so its
   * identity survives the carrying phase, when the source item no longer exists.
   */
  payloadType: ResourceType | null;
  state: JobState;
  reservedBy: ColonistId | null;
  createdAtTick: number;
  retryCount: number;
  cooldownUntilTick: number | null;
  /** 0..1 work progress once the colonist is in place */
  workProgress: number;
}

export interface Zone {
  id: ZoneId;
  /** [ext] 'pasture' keeps tamed animals in one place and bounds the herd size */
  type: 'storage' | 'pasture';
  tileIds: TileId[];
  /**
   * [ext] Which resources may be hauled here. A storage zone starts accepting
   * everything and the player narrows it; a pasture only ever accepts food,
   * because a feed pile is the one thing that belongs in a pen.
   */
  accepts: ResourceType[];
}

// --- animal layer (docs/design-animals.md) ----------------------------------

export type AnimalSpecies = 'deer' | 'boar' | 'rabbit' | 'chicken' | 'wolf';

/** What the player has marked this animal for; mirrors Tile.designation. */
export type AnimalDesignation = 'hunt' | 'tame' | 'slaughter';

/**
 * Animal behaviour. Like ColonistActivity this sits *outside* the job system:
 * it is not work the player prioritises, it is what the creature does on its own.
 */
export type AnimalActivity =
  | { kind: 'idle' }
  | { kind: 'grazing'; ticksRemaining: number }
  | { kind: 'fleeing'; fromAnimalId: AnimalId; untilTick: number }
  | { kind: 'stalking'; targetKind: 'animal' | 'colonist'; targetId: string }
  | {
      kind: 'attacking';
      targetKind: 'animal' | 'colonist';
      targetId: string;
      nextBiteTick: number;
    };

export interface Animal {
  id: AnimalId;
  species: AnimalSpecies;
  name: string;
  position: Vector2;
  /** only held while chasing or heading home; wandering and fleeing use single steps */
  path: Vector2[] | null;
  pathExpiresAtTick: number | null;
  /** 0 (full) .. 100 (starving), same linear decay as colonists */
  hunger: number;
  health: number;
  bornAtTick: number;
  tame: boolean;
  /** tamed animals only: which pasture they belong to */
  pastureZoneId: ZoneId | null;
  activity: AnimalActivity;
  designation: AnimalDesignation | null;
  /** set while a hunt/handle job holds this animal (the reservation is the real lock) */
  reservedByJobId: JobId | null;
  gestationUntilTick: number | null;
  /** ticks of pursuit left before a predator gives up */
  pursuitUntilTick: number | null;
  /**
   * A predator that gave up will not pick a new target until this tick. Without
   * it a wolf re-targets the same colonist the moment its pursuit expires, which
   * turns "flee and survive" into "flee until you die".
   */
  huntCooldownUntilTick: number | null;
  /** next tick this animal may lay an egg / be milked */
  nextProduceTick: number | null;
}

/** Section 6: reservations are part of the job lifecycle, not a side table. */
export interface Reservation {
  /** TileId | ItemId | BuildingId, or a composite key such as `deliver:<id>:<res>` */
  entityId: string;
  jobId: JobId;
  colonistId: ColonistId;
}

export interface GameState {
  tick: number;
  /** 0 = paused, 1 = normal, 3 = fast */
  speed: 0 | 1 | 3;
  tiles: Record<TileId, Tile>;
  colonists: Record<ColonistId, Colonist>;
  buildings: Record<BuildingId, Building>;
  items: Record<ItemId, Item>;
  jobs: Record<JobId, Job>;
  zones: Record<ZoneId, Zone>;
  /** [ext] wild and tamed creatures (docs/design-animals.md) */
  animals: Record<AnimalId, Animal>;
  reservations: Record<string, Reservation>;
  /** monotonic counters so entity ids stay stable across save/load */
  nextIds: Record<string, number>;
  /** rolling event log surfaced in the UI (failed jobs, deaths of crops, ...) */
  log: LogEntry[];
}

export interface LogEntry {
  tick: number;
  message: string;
}
