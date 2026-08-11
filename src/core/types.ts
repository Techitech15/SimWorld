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
// The animal layer (docs/design-phase2.5-animals.md) adds `Animal`, `Tile.forage`,
// `Colonist.health` and the pasture zone. It follows the same rules: plain
// data, ID references, nothing that JSON cannot represent.

import type { ScenarioName } from './scenario';
import type { BiomeName } from './biome';

export type { ScenarioName };
export type { BiomeName };
export type { Season } from './season';

export type TileId = string; // `${x},${y}`
export type ColonistId = string;
export type BuildingId = string;
export type ItemId = string;
export type JobId = string;
export type ZoneId = string;
export type AnimalId = string;
export type RaiderId = string;
export type TraderId = string;

export interface Vector2 {
  x: number;
  y: number;
}

/**
 * [ext] `crystal` is a rock face shot through with mana crystal (11章 フェーズ2).
 * It is a terrain rather than a building because mining it is the same act as
 * mining stone - the design document asked whether the existing `mine` job
 * could be extended rather than a new job added, and this is what makes the
 * answer yes. `ironVein` is the second ore and follows the same precedent
 * (フェーズ10): what differs between the two is a row in VEIN_YIELD, not a
 * mechanism.
 *
 * `shallowWater` / `deepWater` are the water terrain (フェーズ14 段階 W-1,
 * docs/design-phase14-water-medicine.md 2.1). Depth is two terrain members
 * rather than a new `Tile.depth` field, for the same reason `crystal` is a
 * terrain rather than a building: `walkable` already derives from terrain
 * everywhere else, and a second field deciding passability would mean every
 * place that writes `walkable` has to start reading depth too. Shallow water
 * is walkable but unbuildable; deep water is neither.
 */
export type TerrainType =
  | 'grass'
  | 'forest'
  | 'stone'
  | 'crystal'
  | 'ironVein'
  | 'shallowWater'
  | 'deepWater';

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

/**
 * [ext] `herb` (フェーズ14 段階 H-1, docs/design-phase14-water-medicine.md 4.2)
 * is deliberately its own resource rather than a `food` variant: `variant` is
 * "what was done to it", not "what it is", and a hungry colonist eating the
 * medicine would be exactly the bug that distinction exists to prevent.
 */
export type ResourceType = 'wood' | 'stone' | 'food' | 'manaCrystal' | 'iron' | 'herb';

export interface Item {
  id: ItemId;
  type: ResourceType;
  quantity: number;
  /**
   * [ext] What was done to it, not what it is (design-next 提案3, foretold by
   * design-phase2.5-animals.md 2章). A cooked meal is still `food` to every
   * job, filter and trade - only stacking (variants never merge), eating (a
   * meal restores more and leaves a thought) and the display read this.
   * Absent on every item from before the field existed, which reads as "raw"
   * and needs no migration.
   */
  variant?: 'meal';
  /** map coordinates; items inside a storage zone still carry real coordinates */
  position: Vector2;
  reservedByJobId: JobId | null;
}

export type EquipmentId = string;

/**
 * [ext] The gear the workbench can turn out (フェーズ8). The warm coat the
 * design案 lists is deliberately absent: its material was left undecided there
 * (8章「決めた顔をしないほうがよい」) and stays undecided here - E-5 is on
 * hold until cloth exists. The sword and armor are E-6, materials from the
 * existing four resources (iron carries both).
 */
export type EquipmentKind =
  | 'axe'
  | 'pickaxe'
  | 'huntingBow'
  | 'huntingSpear'
  | 'sword'
  | 'ironArmor';

/** One per colonist per slot; the hand doubles as tool and weapon. */
export type EquipmentSlot = 'hand' | 'body';

export interface Equipment {
  id: EquipmentId;
  kind: EquipmentKind;
  /** who wears it, or null while it lies somewhere */
  wornBy: ColonistId | null;
  /** where it lies, or null while worn - exactly one of the two is ever set */
  position: Vector2 | null;
  /** 0..1, worn down by use; at 0 it breaks and is gone (loudly - E-4) */
  condition: number;
}

export type NeedType = 'hunger' | 'sleep';

export interface ColonistNeeds {
  /** 0 (full) .. 100 (starving), linear decay */
  hunger: number;
  /** 0 (rested) .. 100 (exhausted), linear decay */
  sleep: number;
  /**
   * [ext] 0 (content) .. 100 (sick of it), linear decay (11章 フェーズ3).
   * The third need the design document left for this phase. It is the one that
   * is met by other people rather than by a resource, which is why it waited
   * for the colonists to know each other.
   */
  recreation: number;
}

/** [ext] Need-driven behaviour, which is deliberately outside the job system. */
export type ColonistActivity =
  | { kind: 'none' }
  | { kind: 'moving'; targetTileId: TileId } // player-issued move order
  | { kind: 'eating'; itemId: ItemId | null; ticksRemaining: number }
  | { kind: 'sleeping'; bedId: BuildingId | null }
  /**
   * [ext] Running from something. The id is an animal or a raider - a colonist
   * fleeing a person is running from exactly the same thing as far as this is
   * concerned, and the field was called fromAnimalId until raiders made that
   * name a lie (design-phase2.5-animals.md 5).
   */
  | { kind: 'fleeing'; fromId: AnimalId | RaiderId; untilTick: number }
  /**
   * [ext] Too miserable to work (src/core/mood.ts). Stored rather than derived
   * because a break has to outlast the moment that caused it - otherwise
   * feeding someone one meal puts them straight back to work and the player
   * never sees that anything happened.
   */
  /**
   * [ext] Time off around the hearth. Not a job: nobody assigns it, and it
   * cannot be prioritised away. Since フェーズ10 the id may also point at an
   * armchair - the field keeps its old name so every save written before
   * armchairs existed still reads without a migration, the same reason
   * `fleeing.fromId` kept its shape when raiders arrived.
   */
  | { kind: 'relaxing'; hearthId: BuildingId | null; untilTick: number }
  /**
   * [ext] A mental break (11章 フェーズ3). One kind of thing, three ways of
   * showing it, chosen by what actually went wrong:
   *   brooding  - stands and refuses work
   *   wandering - walks off and will not be talked to
   *   binge     - eats their way through the larder
   * All three stop work; what differs is what the colony has to watch.
   */
  | { kind: 'brooding'; untilTick: number }
  | { kind: 'wandering'; untilTick: number }
  | { kind: 'binge'; untilTick: number; eaten: number }
  /**
   * [ext] Standing and fighting (11章 フェーズ4). Colonists fled from anything
   * that attacked them until raiders arrived; a raider does not lose interest
   * and cannot be outrun, so somebody has to meet them. Who does is decided by
   * the hunting column of the work table - the militia is the people already
   * told to handle dangerous animals, not a separate draft screen.
   */
  | { kind: 'fighting'; raiderId: RaiderId };

export interface CarriedStack {
  type: ResourceType;
  quantity: number;
  /** [ext] rides along so a carried meal is still a meal when it is put down */
  variant?: 'meal';
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
   * no medical jobs (docs/design-phase2.5-animals.md 1). Predators are the only source
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
  /**
   * [ext] Ticks walked towards the next step (docs/design-phase7-time.md 2.3):
   * the pace multipliers make "ticks per step" fractional, so the count has to
   * live somewhere. The one saved field phase 7 adds; absent reads as 0.
   */
  stepProgress?: number;
  /**
   * [ext] Until when the "decent meal" thought lasts (design-next 提案3).
   * Event state like a furnace's fuel: "ate a cooked meal recently" is not
   * derivable from anything else. Absent on colonists from before the field
   * existed, which reads as "no recent meal".
   */
  mealUntilTick?: number;
  /**
   * [ext] 0 = healthy, >0 = sick (フェーズ14 段階 M-1,
   * docs/design-phase14-water-medicine.md 5.1). This is the whole of the
   * illness layer's state: no severity, no body part, no name for what it is -
   * the discipline `health` already keeps (docs/design-phase2.5-animals.md 1)
   * extends to illness rather than being carved into an exception for it. Not
   * derivable (it records that an incident happened), so it is saved. It never
   * counts down on its own - only a `treat` job reduces it - which is what
   * makes an untreated illness something the player has to act on rather than
   * something that quietly passes.
   *
   * Optional like `mealUntilTick` above, and for the same reason: worldgen's
   * colonist constructor is off limits for this stage, so a fresh colonist is
   * simply never given the field, which reads as "not sick" without it -
   * exactly the value every colonist implicitly has before anyone falls ill.
   */
  illnessTicks?: number;
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
  /**
   * [ext] Frostbloom (11章 フェーズ5). Wild like the berry bush, and grown the
   * same way, but it reads the season table upside down: the one plant on the
   * map whose season is winter. Nobody builds one.
   */
  | 'frostbloom'
  /**
   * [ext] Herb (フェーズ14 段階 H-1, docs/design-phase14-water-medicine.md 4章).
   * Wild like the berry bush and the frostbloom, and grown the same way, but
   * placed by the water rule (`isWater`) rather than the forest or the rock
   * one: it only grows on grass beside a shore, which is what gives the lake
   * layer (段階 W-1) something to be for. Nobody builds one.
   */
  | 'herb'
  /**
   * [ext] The workbench (design-next 提案3): the entrance to second-stage
   * goods. One recipe for now - raw food in, meals out - worked by the `craft`
   * column.
   */
  | 'workbench'
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
  | 'manaExtractor'
  /** [ext] where colonists take their time off (11章 フェーズ3) */
  | 'hearth'
  /** [ext] mana-fed defence (11章 フェーズ4, depends on the phase 2 network) */
  | 'manaTurret'
  /** [ext] where a trader stands (11章 フェーズ5, design-phase5-trade.md 4.2) */
  | 'tradingPost'
  /**
   * [ext] Furniture (11章 フェーズ10, design-phase10-ores.md 4章). Five pieces,
   * no new needs and no new jobs: each one plugs into a system the game already
   * had. The table, stool and statue are the mana lamp's shape (a thought for
   * colonists near it), the dresser is the heavySleeper trait's shape (a
   * multiplier on sleep recovery), and the armchair is the hearth's shape (a
   * second place the `relaxing` activity can sit). Effect numbers live in a
   * constants table beside the build costs, not on the building.
   */
  | 'table'
  | 'stool'
  | 'dresser'
  | 'armchair'
  | 'statue'
  /**
   * [ext] The research desk (11章 フェーズ12, design-phase12-research.md 2章).
   * One building, one job, one column: it targets the desk the same way a
   * farm plot targets `farm`, and what it unlocks lives in `TECHS`
   * (src/core/constants.ts) rather than on the building, for the same reason
   * `SPECIES` is a table and not a field.
   */
  | 'researchDesk';

export interface RequiredResource {
  type: ResourceType;
  quantity: number;
}

/**
 * [ext] The research tree (11章 フェーズ12, design-phase12-research.md 3.2).
 * Four techs, two deep: `TECHS` (src/core/constants.ts) carries prerequisites,
 * cost and what each unlocks - a kind's profile, not an instance's, so it is
 * never saved (the same reasoning as `SPECIES`).
 */
export type TechName = 'woodcraft' | 'stonecarving' | 'ironwork' | 'crystallography';

/**
 * [ext] What the colony has done with the tree so far (design-phase12-research.md 5章).
 * `progress` keeps every tech's tally, completed ones included: it is a
 * history, not a derived value, so it is not reset on completion.
 */
export interface ResearchState {
  /** the tech the desk is working on; null = nothing selected */
  current: TechName | null;
  progress: Record<TechName, number>;
  unlocked: TechName[];
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
   * [ext] The workbench's order queue (フェーズ8 E-1): equipment the player
   * asked for, crafted before any meal batch. Absent on every building from
   * before the field existed and on everything that is not a workbench.
   */
  craftOrders?: EquipmentKind[];
  /**
   * [ext] How far an extractor has got into the rock face it is cutting. Stored
   * rather than derived from the tick because progress has to stop when the
   * power does: an extractor that kept its place in the schedule while unpowered
   * would make an outage free, and the outage is the thing the player is
   * supposed to feel.
   */
  manaProgress: number;
}

/** [ext] What a raider is doing. Deliberately shorter than an animal's list. */
export type RaiderActivity =
  | { kind: 'advancing' }
  | { kind: 'attacking'; targetId: ColonistId }
  | { kind: 'breaking'; buildingId: BuildingId }
  | { kind: 'leaving' };

export interface Raider {
  id: RaiderId;
  name: string;
  position: Vector2;
  path: Vector2[] | null;
  pathExpiresAtTick: number | null;
  health: number;
  activity: RaiderActivity;
  /** the tick they give up and go home, win or lose */
  leavesAtTick: number;
}

/** [ext] Trade (11章 フェーズ5). See docs/design-phase5-trade.md. */
export type TraderKind = 'pedlar' | 'crystalFactor';

/**
 * One line of a trader's stall. `rate` is a multiplier on the resource's base
 * value, so a trader is a spread around the same table rather than a price list
 * of its own.
 */
export interface TradeOffer {
  resource: ResourceType;
  quantity: number;
  rate: number;
}

export interface Trader {
  id: TraderId;
  kind: TraderKind;
  name: string;
  /** beside the trading post. They never move (design-phase5-trade.md 4.2) */
  position: Vector2;
  departsAtTick: number;
  /** what they will hand over */
  offers: TradeOffer[];
  /** what they will take */
  wants: TradeOffer[];
  /**
   * The deal the player has asked for, or null while nobody has decided.
   *
   * It lives on the trader rather than on `GameState` because it is per-visit
   * state - when they leave it goes with them - and because the design note
   * allows exactly one new record on GameState.
   */
  deal: { give: ResourceType; take: ResourceType } | null;
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
  | 'repair'
  /**
   * [ext] Working the research desk (11章 フェーズ12). Its own column, its own
   * skill, default priority 3 (lowest) so a colonist never drifts to the desk
   * unasked (design-phase12-research.md 2.2).
   */
  | 'research'
  /**
   * [ext] Working the workbench (design-next 提案3). Its own column and skill,
   * the same defaults as research: nobody cooks until the player raises it.
   */
  | 'craft'
  /**
   * [ext] Treating a sick colonist (フェーズ14 段階 M-1,
   * docs/design-phase14-water-medicine.md 5.3). Adding this one member is the
   * entire mechanism: `SkillName = Exclude<JobType, 'deconstruct' | 'repair'>`
   * below means a `treat` skill exists the moment this does, with no code of
   * its own. Its own column, default priority the same as research/craft
   * (lowest) - nobody drifts into nursing until the player raises it.
   */
  | 'treat';

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
  'research',
  'craft',
  'treat',
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

// --- animal layer (docs/design-phase2.5-animals.md) ----------------------------------

export type AnimalSpecies =
  | 'deer'
  | 'boar'
  | 'rabbit'
  | 'chicken'
  | 'goat'
  | 'wolf'
  /**
   * [ext] The fantasy layer (11章 フェーズ5). A crystal elk is the only animal
   * that produces something other than food, and a rockeater is the only one
   * that eats the map rather than what grows on it.
   */
  | 'crystalElk'
  | 'rockeater';

/** What the player has marked this animal for; mirrors Tile.designation. */
export type AnimalDesignation = 'hunt' | 'tame' | 'slaughter';

/**
 * Animal behaviour. Like ColonistActivity this sits *outside* the job system:
 * it is not work the player prioritises, it is what the creature does on its own.
 */
export type AnimalActivity =
  | { kind: 'idle' }
  | { kind: 'grazing'; ticksRemaining: number }
  /**
   * [ext] Running from something. The id is an animal or a raider - a colonist
   * fleeing a person is running from exactly the same thing as far as this is
   * concerned, and the field was called fromAnimalId until raiders made that
   * name a lie.
   */
  | { kind: 'fleeing'; fromId: AnimalId | RaiderId; untilTick: number }
  | { kind: 'stalking'; targetKind: 'animal' | 'colonist'; targetId: string }
  /**
   * `building` is what a predator falls back to when the prey is behind a door
   * it cannot open: it chews on the door instead. That is what gives a pen its
   * cost - it keeps the wolves out until it does not.
   */
  /**
   * [ext] A rockeater working through a tile of stone (11章 フェーズ5). It is
   * not `attacking`: there is nothing to hurt, no bite interval and no target
   * that can run away - just a countdown against a tile that either finishes or
   * is interrupted because somebody mined it first.
   */
  | { kind: 'gnawing'; targetTileId: TileId; ticksRemaining: number }
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
  /**
   * [ext] How big this map is (docs/design-phase6-space.md 3.1).
   *
   * Saved rather than read from a module constant, and that is not a violation
   * of "do not store what can be derived": the size of a world is not derived
   * from anything - it is a fact about that world, like `worldSeed`. Storing it
   * is what lets the default grow without every existing colony becoming an
   * unreadable save.
   */
  width: number;
  height: number;
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
  /** [ext] wild and tamed creatures (docs/design-phase2.5-animals.md) */
  animals: Record<AnimalId, Animal>;
  /**
   * [ext] Raiders currently on the map (11章 フェーズ4). Empty almost always:
   * a raid is an event with a beginning and an end, not a population.
   */
  raiders: Record<RaiderId, Raider>;
  /**
   * [ext] Traders standing at the post (11章 フェーズ5). Like raiders this is
   * empty almost always: a visit is an event with an end, not a population.
   */
  traders: Record<TraderId, Trader>;
  /**
   * [ext] Tools and gear (11章 フェーズ8, docs/design-phase8-equipment.md 4章).
   * Individuals rather than stacks - a bow has a condition of its own - so
   * they live beside `items`, not in them, and `ResourceType` does not grow.
   * The reference runs one way only: `wornBy` here, never a list on the
   * colonist, so "who wears what" cannot disagree with itself.
   */
  equipment: Record<EquipmentId, Equipment>;
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
  /**
   * [ext] Which biome this map was generated under (11章 フェーズ11 段階A,
   * src/core/biome.ts). Stored directly rather than derived, because stage A
   * has no world map yet to derive it from - stage B will keep this field but
   * make it a cached derivation of a `worldCell` (design-phase11-worldmap.md
   * 6章). Like `scenario`, it keeps mattering after generation: forage and
   * forest regrowth rates, wildlife respawn and the lamp's mood bonus all read
   * it every day.
   */
  biome: BiomeName;
  /**
   * [ext] The world-map cell this colony was started on (11章 フェーズ11 段階B,
   * docs/design-phase11-worldmap.md 6章), or `null` for a save from before the
   * world map existed. Everything else about the world map - the 16x16 grid,
   * every cell's biome, the tribal territories - is derived from `worldSeed`
   * and never saved (2.1章); this coordinate is the one fact that cannot be
   * derived, because nothing says which cell among equally valid ones a player
   * picked. `biome` above is filled in from this cell at generation time and
   * kept as a separate field rather than computed on every read, the same
   * adaptation stage A already made (see the field's own comment).
   *
   * `null` means "treat this colony as if it were nowhere near any tribe" -
   * `src/core/tribes.ts` returns every multiplier at 1 for it, so an old save
   * behaves exactly as it did before this phase existed.
   */
  worldCell: { x: number; y: number } | null;
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
  /** [ext] the research tree (11章 フェーズ12). The one field the phase adds. */
  research: ResearchState;
}

/**
 * [ext] What happened, as a key (11章 フェーズ9). The log stores the event -
 * who, what, where - and the sentence is derived at display time in whichever
 * language the player is reading (src/ui/strings.ts renders every key).
 * `legacy` wraps entries written before this existed; they carry their original
 * English sentence in `params.text` and are shown verbatim.
 */
export type LogKey =
  | 'legacy'
  | 'colonistArrived' // { name, tribe? } - tribe is 'waldkin' on the colonies that mention it (11章 段階C)
  | 'skillLevelUp' // { name, skill, level }
  | 'seasonArrived' // { season }
  | 'colonistStarving' // { name }
  | 'colonistCannotFindFood' // { name }
  | 'breakBrooding' // { name, thought? }
  | 'breakWandering' // { name, thought? }
  | 'breakBinge' // { name, thought? }
  | 'backToWork' // { name }
  | 'orderedToMove' // { name, x, y }
  | 'incidentBumperCrop' // { plots }
  | 'incidentBlight' // { plots }
  | 'incidentBerryGlut' // { bushes }
  | 'incidentWolfPack' // { count }
  | 'incidentHerd' // { count, species }
  | 'incidentLostSupplies' // { quantity, resource }
  | 'incidentIllness' // { name } (フェーズ14 段階 M-1)
  | 'incidentRaid' // { count, tribe } - tribe is always 'parched' (11章 段階C, raiders are the Parched's raid)
  | 'raiderCutDownBy' // { raider, colonist }
  | 'raiderCutDownByTurret' // { raider }
  | 'raidOver'
  | 'raiderRetreats' // { raider }
  | 'raiderBreaking' // { raider, building }
  | 'buildingSmashed' // { building, tile }
  | 'furnaceBurnedOut' // { tile }
  | 'furnaceStoked' // { tile }
  | 'extractorOutOfRock' // { tile }
  | 'extractorCutVein' // { tile, resource? } - entries older than phase 10 have no resource
  | 'veinCutOpen' // { x, y, resource? } - entries older than phase 10 have no resource
  | 'buildingRepaired' // { building, tile }
  | 'buildingDismantled' // { building, tile }
  | 'animalTamed' // { name, species }
  | 'animalTameFailed' // { name, species }
  | 'jobFailed' // { job, jobType, reason }
  | 'colonistStarvedToDeath' // { name }
  | 'colonistKilledByRaider' // { name, raider }
  | 'colonistKilledByAnimal' // { name, species }
  | 'colonistKilled' // { name }
  | 'colonyDiedOut'
  | 'boarTurnedOn' // { name, hunter }
  | 'animalTearing' // { name, species, building }
  | 'buildingBrokenOpen' // { building, tile }
  | 'animalBorn' // { name, species, calf }
  | 'animalHunted' // { name, species }
  | 'animalSlaughtered' // { name, species }
  | 'animalStarvedToDeath' // { name, species }
  | 'animalKilledByPredator' // { name, species, predator }
  | 'wolfSpotted' // { name }
  | 'rockeaterExposedVein' // { name, tile }
  | 'traderArrived' // { name, kind, tribe } - tribe is always 'lanternfolk' (11章 段階C, traders are the Lanternfolk's)
  | 'traderLeft' // { name }
  | 'tradeSettled' // { gaveQuantity, gave, tookQuantity, took }
  | 'researchUnlocked' // { tech }
  | 'mealsCooked' // { count } (design-next 提案3)
  | 'equipmentCrafted' // { kind } (フェーズ8)
  | 'equipmentBroke' // { kind } (フェーズ8 E-4: a broken tool is never silent)
  | 'colonistTreated'; // { name, healer } (フェーズ14 段階 M-1)

/**
 * [ext] Why a job was given up on; rendered per language like everything else.
 * These sit on `jobFailed` log entries as `params.reason`.
 */
export type JobFailReason =
  | 'interrupted'
  | 'noWorkSite'
  | 'unreachable'
  | 'animalUnreachable'
  | 'itemUnreachable'
  | 'noDestination'
  | 'blueprintUnreachable'
  | 'destinationGone'
  | 'storageUnreachable';

/** Parameters are primitives only: IDs and names as strings, counts as numbers. */
export type LogParams = Record<string, string | number>;

export interface LogEntry {
  tick: number;
  /**
   * [ext] What sort of line this is, so the log can show a wolf pack arriving
   * differently from a colonist reaching Hauling level 2. Optional on purpose:
   * an entry written before this existed simply has none, which reads as an
   * ordinary line and needs no migration.
   */
  kind?: 'incident';
  key: LogKey;
  params?: LogParams;
}
