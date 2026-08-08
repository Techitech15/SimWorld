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

import type { ScenarioName } from './scenario';

export type { ScenarioName };
export type { Season } from './season';

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

/**
 * [ext] `crystal` is a rock face shot through with mana crystal (11章 フェーズ2).
 * It is a terrain rather than a building because mining it is the same act as
 * mining stone - the design document asked whether the existing `mine` job
 * could be extended rather than a new job added, and this is what makes the
 * answer yes.
 */
export type TerrainType = 'grass' | 'forest' | 'stone' | 'crystal';

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

export type ResourceType = 'wood' | 'stone' | 'food' | 'manaCrystal';

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
  | { kind: 'fleeing'; fromAnimalId: AnimalId; untilTick: number }
  /**
   * [ext] Too miserable to work (src/core/mood.ts). Stored rather than derived
   * because a break has to outlast the moment that caused it - otherwise
   * feeding someone one meal puts them straight back to work and the player
   * never sees that anything happened.
   */
  | { kind: 'brooding'; untilTick: number };

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
  | 'frail'
  | 'cheerful'
  | 'gloomy'
  | 'sociable'
  | 'private';

export type BuildingType =
  | 'wall'
  | 'stoneWall'
  | 'floor'
  | 'stoneFloor'
  | 'door'
  | 'bed'
  | 'farmPlot'
  | 'berryBush'
  | 'storageZoneMarker'
  /**
   * [ext] The mana layer (11章 フェーズ2). A furnace burns crystal to supply a
   * network, a conduit joins buildings into one, and a lamp is the first thing
   * that spends what the furnace makes. What each type supplies or draws lives
   * in a table beside the build costs (src/core/mana.ts), not on the building:
   * it is a property of the kind of thing, not of this one, and a number that
   * is saved is a number that can disagree with the rules that made it.
   */
  | 'manaFurnace'
  | 'manaConduit'
  | 'manaLamp'
  | 'manaExtractor';

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
  /**
   * [ext] Ticks of burn left in a mana furnace. Unlike output and draw this is
   * genuinely per-building state - it is what the fuel haul job fills up and
   * what running the network spends - so it is stored and saved.
   */
  manaFuel: number;
  /**
   * [ext] How far an extractor has got into the rock face it is cutting. Stored
   * rather than derived from the tick because progress has to stop when the
   * power does: an extractor that kept its place in the schedule while unpowered
   * would make an outage free, and the outage is the thing the player is
   * supposed to feel.
   */
  manaProgress: number;
}

export type JobType =
  | 'chop'
  | 'mine'
  | 'farm'
  | 'build'
  | 'haul'
  | 'hunt'
  | 'handle'
  | 'deconstruct'
  | 'repair';

/**
 * The columns of the work-priority table. `deconstruct` and `repair` are
 * deliberately absent: both run under the `build` work type, so tearing a wall
 * down and patching it up are governed by the same column that put it up.
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
 * `deconstruct` and `repair` have no skill of their own because they have no
 * column of their own - both are construction work (see skillFor).
 */
export type SkillName = Exclude<JobType, 'deconstruct' | 'repair'>;

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

export type AnimalSpecies = 'deer' | 'boar' | 'rabbit' | 'chicken' | 'goat' | 'wolf';

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
  /**
   * `building` is what a predator falls back to when the prey is behind a door
   * it cannot open: it chews on the door instead. That is what gives a pen its
   * cost - it keeps the wolves out until it does not.
   */
  | {
      kind: 'attacking';
      targetKind: 'animal' | 'colonist' | 'building';
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
  /**
   * 0 = paused. The rest are ticks per real 200ms: the tick length itself never
   * changes, so growth rates and cooldowns mean the same thing at every speed.
   * A day is 3,000 ticks, which is 200 real seconds at 3x and 60 at 10x - and
   * seasons, incidents and skills all happen on the scale of days, so without
   * the fast setting most of the game is something you read about rather than
   * watch. The simulation costs about 0.6ms a tick, so 10x is roughly 3% of one
   * core; the limit was never the simulation.
   */
  speed: 0 | 1 | 3 | 10;
  tiles: Record<TileId, Tile>;
  colonists: Record<ColonistId, Colonist>;
  buildings: Record<BuildingId, Building>;
  items: Record<ItemId, Item>;
  jobs: Record<JobId, Job>;
  zones: Record<ZoneId, Zone>;
  /** [ext] wild and tamed creatures (docs/design-animals.md) */
  animals: Record<AnimalId, Animal>;
  reservations: Record<string, Reservation>;
  /**
   * [ext] How much woodland this map supports: the number of forest tiles it
   * was generated with. Regrowth heals a clearing back towards it and stops
   * there, so a felled wood returns but the trees never march across the
   * grassland the herds graze on.
   */
  forestCapacity: number;
  /**
   * [ext] The seed this map was generated from, kept because some rules need to
   * differ between worlds rather than only between ticks. Incidents are the
   * case: rolling them from the tick alone is reproducible, which is required,
   * but it also gives every colony that has ever been started the identical
   * schedule of good and bad years.
   */
  worldSeed: number;
  /**
   * [ext] Which opening this map was generated under (src/core/scenario.ts).
   * Stored because it keeps mattering after generation: how many predators the
   * map sustains is a rule that runs every day, not a one-off decision.
   */
  scenario: ScenarioName;
  /** monotonic counters so entity ids stay stable across save/load */
  nextIds: Record<string, number>;
  /**
   * [ext] Bonds between colonists, one entry per pair (11章 フェーズ3).
   * The key is the two ids sorted and joined, so a pair has one number rather
   * than two that can disagree. See src/core/relationships.ts.
   */
  relationships: Record<string, number>;
  /**
   * [ext] The last few colonists to die, so the people who knew them can grieve
   * for a while. Bounded: this is a memory, not a graveyard.
   */
  deaths: { colonistId: ColonistId; name: string; tick: number }[];
  /** rolling event log surfaced in the UI (failed jobs, deaths of crops, ...) */
  log: LogEntry[];
}

export interface LogEntry {
  tick: number;
  message: string;
  /**
   * [ext] What sort of line this is, so the log can show a wolf pack arriving
   * differently from a colonist reaching Hauling level 2. Optional on purpose:
   * an entry written before this existed simply has none, which reads as an
   * ordinary line and needs no migration.
   */
  kind?: 'incident';
}
