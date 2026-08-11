// Tunable simulation constants. Everything time-based is expressed in ticks so
// that changing the speed multiplier never changes game balance (section 5).
import type {
  AnimalSpecies,
  BuildingType,
  JobType,
  RequiredResource,
  ResourceType,
  TechName,
  TerrainType,
} from './types';

/**
 * The size a *new* world is generated at (docs/design-phase6-space.md 3.1).
 *
 * These are defaults, not the map's dimensions: a loaded save carries its own
 * `width` / `height`, so a 60x60 colony saved before the map grew keeps being a
 * 60x60 colony. Everything that needs to know how big the map is reads it off
 * the state - the rename from MAP_WIDTH/MAP_HEIGHT was deliberate, so that all
 * seventy-odd call sites had to be looked at rather than silently keeping a
 * module constant that had stopped being true.
 */
export const DEFAULT_MAP_WIDTH = 120;
export const DEFAULT_MAP_HEIGHT = 120;
export const TILE_SIZE = 32;

/** 1 tick = 200ms => 5 ticks/second (section 5) */
export const TICK_MS = 200;
export const TICKS_PER_DAY = 3000;
export const TICKS_PER_HOUR = TICKS_PER_DAY / 24;

/** Colonists move one tile every N ticks. */
export const TICKS_PER_STEP = 2;

// --- needs (section 5): linear decay, threshold triggers behaviour -----------
export const HUNGER_PER_TICK = 100 / 2400; // full bar in 0.8 day
// Full bar in ~19 waking hours. Was 2000 (16 hours) until phase 7 anchored
// waking to dawn: with a 15.6-hour ceiling on wakefulness (the day threshold,
// 97.5, over this rate) a 16-hour bar forced ~8.4 bed-hours a day, a quarter
// more than the pre-phase economy was balanced for - and the year-long runs
// starved (design-notes.md「時間と動き」). 2400 puts the natural day at
// ~15.7h awake + ~8.3h in bed, which is a 24-hour circadian budget.
export const SLEEP_PER_TICK = 100 / 2400;
export const SLEEP_RECOVERY_PER_TICK = 100 / 900; // rested again in ~7 hours
/**
 * Sleeping on the ground. Beds cost 12 wood and recovered sleep at exactly the
 * same rate as bare floor, which made them decoration; at 60% a colonist
 * without one spends most of the night asleep instead of most of the day
 * working, which is the cost that makes building beds worth doing.
 */
export const SLEEP_RECOVERY_ON_GROUND_PER_TICK = SLEEP_RECOVERY_PER_TICK * 0.6;
export const HUNGER_THRESHOLD = 55; // start looking for food
export const SLEEP_THRESHOLD = 75; // start looking for a bed

/**
 * Recreation (11章 フェーズ3). Slower than hunger: a colonist who has not had
 * an hour to themselves in two days is the point, not one who needs entertaining
 * every afternoon.
 */
export const RECREATION_PER_TICK = 100 / 6000; // full bar in two days
export const RECREATION_THRESHOLD = 70; // start looking for the hearth
export const RECREATION_RESTORED_PER_TICK = 100 / 150; // a sitting is ~150 ticks
export const RELAX_TICKS = 150;
/** Without a hearth they take it where they stand, and get less from it. */
export const RECREATION_ALONE_MULTIPLIER = 0.45;

/**
 * Raids (11章 フェーズ4). The numbers are a starting point, measured and
 * adjusted below in docs/design-notes.md.
 */
export const RAID_FIRST_DAY = 8; // nothing before this: a colony needs walls first
export const RAIDER_HEALTH = 60;
export const RAIDER_DAMAGE = 6;
export const RAIDER_ATTACK_INTERVAL_TICKS = 30;
export const RAIDER_STRUCTURE_DAMAGE = 8;
export const RAID_DURATION_TICKS = 1800; // they give up after about half a day
/** ...and are gone this long after that, whether or not they found their way out. */
export const RAID_LEAVE_GRACE_TICKS = 600;
/** Base damage a colonist does per swing; hunting skill multiplies it. */
export const COLONIST_MELEE_DAMAGE = 7;
export const COLONIST_ATTACK_INTERVAL_TICKS = 30;
/** How far from the colony a defender will go to meet a raider. */
export const DEFEND_RANGE = 14;
/** The turret. */
export const TURRET_RANGE = 7;
export const TURRET_DAMAGE = 9;
export const TURRET_INTERVAL_TICKS = 40;

/**
 * Trade (11章 フェーズ5, design-phase5-trade.md 6). Base values, and the spread
 * that stops trade being a machine for turning spare wood into mana: a trader
 * buys at 0.7 and sells at 1.4, so 120 wood buys about five crystals against a
 * vein's six.
 */
export const TRADE_BASE_VALUE: Record<ResourceType, number> = {
  wood: 1,
  stone: 1,
  food: 2,
  manaCrystal: 12,
  // between the commodities and the crystal: rarer than stone, but a vein of
  // it holds more than a crystal vein does (design-phase10-ores.md 7.1)
  iron: 3,
};
export const TRADE_BUY_RATE = 0.7;
export const TRADE_SELL_RATE = 1.4;
/** Checked every five days: rarer than the three-day arrival roll. */
export const TRADE_INTERVAL_TICKS = TICKS_PER_DAY * 5;
/** One day at the post - long enough to ask whether the hauling keeps up. */
export const TRADE_STAY_TICKS = TICKS_PER_DAY;
export const SLEEP_WAKE_AT = 3;
export const EAT_TICKS = 30;
export const FOOD_PER_MEAL = 10;
export const HUNGER_RESTORED_PER_MEAL = 70;
/**
 * A colonist who cannot find food starves: the hunger bar stops at 100 and the
 * damage starts. Slow enough (a full bar over two days) that a bad afternoon is
 * survivable and only a real food crisis kills.
 */
export const STARVATION_DAMAGE_PER_TICK = 100 / 6000;
export const STARVATION_WARNING_INTERVAL_TICKS = 500;

// --- job system (section 6) -------------------------------------------------
export const COOLDOWN_TICKS = 50;
export const MAX_RETRIES = 3;
/** How long a failed job stays as a tombstone before the world may recreate it. */
export const FAILED_JOB_RETENTION_TICKS = 1000;
/** How many nearest candidates get a real A* reachability check per colonist. */
export const CANDIDATE_PATH_ATTEMPTS = 4;

/** Default Job.priority per type; the per-colonist table overrides ordering. */
export const DEFAULT_JOB_PRIORITY: Record<JobType, number> = {
  build: 1,
  deconstruct: 1, // construction work, and the player asked for it explicitly
  hunt: 1, // a designated predator should be dealt with promptly
  farm: 2,
  chop: 2,
  mine: 2,
  handle: 2,
  haul: 3,
  repair: 1, // a hole in the fence is not something to get round to
  // a colonist can only ever be sent here on purpose (2.2), so ties never
  // matter; grouped with haul so it never jumps the queue by accident
  research: 3,
  craft: 3, // same reasoning as research: cooking is deliberate work
};

/** Work ticks required once the colonist stands in place. */
export const WORK_TICKS: Record<JobType, number> = {
  chop: 40,
  mine: 60,
  farm: 25,
  build: 35,
  haul: 5,
  hunt: 60,
  handle: 45,
  deconstruct: 30, // faster to tear down than to put up
  repair: 30,
  research: 50, // heavier than farm(25), lighter than mine(60)
  craft: 50, // one batch of meals is a research cycle's worth of standing work
};

/**
 * Fraction of the build cost returned when a finished structure is dismantled.
 * Half means a misplaced wall costs something without being a disaster.
 */
export const DECONSTRUCT_REFUND = 0.5;

// --- resources --------------------------------------------------------------
export const STACK_MAX = 75;
export const WOOD_PER_TREE = 25;
export const STONE_PER_ROCK = 20;
/**
 * A crystal vein gives fewer units than a rock face gives stone, and takes the
 * same work: mana is meant to be the scarce input the whole phase-2 puzzle is
 * arranged around (11章).
 */
export const CRYSTAL_PER_VEIN = 6;
/**
 * An iron vein: less than a rock face gives stone, slightly more than a crystal
 * vein gives crystal. Iron is the ore you meet on the way in, not the prize at
 * the back of the seam (design-phase10-ores.md 7.1).
 */
export const IRON_PER_VEIN = 8;

export interface VeinYield {
  resource: ResourceType;
  quantity: number;
}

/**
 * What cutting a rock face yields, per terrain (design-phase10-ores.md 2.1).
 *
 * The mine job (jobs/execute.ts) and the extractor (mana.ts) used to carry the
 * same two-way if - crystal or stone - once each. A third ore would have made
 * that four branches in two files, so the branch became this table: adding an
 * ore is now one row here, one check in worldgen and one member on TerrainType.
 * Plain rock is deliberately the fallback rather than a row, so a terrain the
 * table has never heard of still yields stone instead of nothing.
 */
export const VEIN_YIELD: Partial<Record<TerrainType, VeinYield>> = {
  crystal: { resource: 'manaCrystal', quantity: CRYSTAL_PER_VEIN },
  ironVein: { resource: 'iron', quantity: IRON_PER_VEIN },
};

/** The single place that answers "what falls out of this rock face". */
export function veinYieldOf(terrain: TerrainType): VeinYield {
  return VEIN_YIELD[terrain] ?? { resource: 'stone', quantity: STONE_PER_ROCK };
}

export const FOOD_PER_HARVEST = 16;
/**
 * Wild berries. A bush ripens on its own with no sowing and yields less than a
 * tended plot, which makes foraging the thing a young colony does before it has
 * a farm running - and a reason to walk into the woods at all.
 */
export const FOOD_PER_BERRY_HARVEST = 9;
export const BERRY_REGROW_PER_TICK = 1 / 12000; // four days a bush, so it never rivals a farm
export const BERRY_BUSH_COUNT = 26;
/**
 * Forest regrowth. Wood was the one thing a colony could use up for good: grass
 * regrows, berries ripen again and wildlife walks back in from the edge, but a
 * felled tree was gone for ever. A bare tile next to a standing tree gets this
 * chance per day, so a clear-cut closes from its edges over a season or two
 * rather than immediately - felling the last tree in sight still costs
 * something.
 */
export const FOREST_REGROW_CHANCE_PER_DAY = 0.04;
export const FOREST_REGROW_INTERVAL_TICKS = TICKS_PER_DAY;

/** Farm plot goes from sown to harvestable in about two thirds of a day. */
export const CROP_GROWTH_PER_TICK = 1 / 2000;

export const RESOURCE_TYPES: ResourceType[] = ['wood', 'stone', 'food', 'manaCrystal', 'iron'];

// --- buildings --------------------------------------------------------------
export const BUILDING_COSTS: Record<BuildingType, RequiredResource[]> = {
  wall: [{ type: 'wood', quantity: 5 }],
  // stone was a resource with nowhere to go: these two are what mining is for
  stoneWall: [{ type: 'stone', quantity: 8 }],
  floor: [{ type: 'wood', quantity: 2 }],
  stoneFloor: [{ type: 'stone', quantity: 3 }],
  door: [{ type: 'wood', quantity: 8 }],
  bed: [{ type: 'wood', quantity: 12 }],
  farmPlot: [],
  berryBush: [], // wild: nobody builds one
  frostbloom: [], // likewise: it grows where the map put it (11章 フェーズ5)
  storageZoneMarker: [],
  // The mana layer (11章 フェーズ2). A furnace is the expensive one on purpose:
  // it is the decision the player commits to, and conduit runs are what they
  // then have to plan around it.
  manaFurnace: [
    { type: 'stone', quantity: 25 },
    { type: 'wood', quantity: 10 },
  ],
  manaConduit: [{ type: 'stone', quantity: 2 }],
  manaLamp: [
    { type: 'stone', quantity: 4 },
    { type: 'wood', quantity: 4 },
  ],
  // the expensive one: it replaces labour, so it costs more than the labour
  // saves for a good while
  manaExtractor: [
    { type: 'stone', quantity: 30 },
    { type: 'wood', quantity: 15 },
  ],
  // cheap on purpose: the colony should be able to afford company early
  hearth: [
    { type: 'wood', quantity: 15 },
    { type: 'stone', quantity: 5 },
  ],
  // the most expensive thing in the game, and it needs a lit grid on top
  manaTurret: [
    { type: 'stone', quantity: 35 },
    { type: 'wood', quantity: 10 },
    { type: 'manaCrystal', quantity: 4 },
  ],
  // cheap: the point of trade is to be reachable by a colony that is short of
  // something, and a post nobody can afford defeats it
  tradingPost: [
    { type: 'wood', quantity: 20 },
    { type: 'stone', quantity: 10 },
  ],
  // Furniture (design-phase10-ores.md 7.2). The table and dresser are what the
  // iron is *for*: the first build costs that ask for the second ore. The
  // statue is the same thing for stone, which mining piles up faster than
  // walls spend it.
  table: [
    { type: 'wood', quantity: 10 },
    { type: 'iron', quantity: 2 },
  ],
  stool: [{ type: 'wood', quantity: 6 }],
  dresser: [
    { type: 'wood', quantity: 15 },
    { type: 'iron', quantity: 4 },
  ],
  armchair: [{ type: 'wood', quantity: 12 }],
  statue: [{ type: 'stone', quantity: 15 }],
  // Research (11章 フェーズ12, design-phase12-research.md 6章). Heavier than a
  // bed (wood 12), lighter than a furnace (stone 25 + wood 10): a real
  // decision, not a formality.
  researchDesk: [
    { type: 'wood', quantity: 20 },
    { type: 'stone', quantity: 5 },
  ],
  // The workbench (design-next 提案3): between a bed (12) and a desk (20) -
  // early enough to cook the first winter's stores, not free.
  workbench: [{ type: 'wood', quantity: 15 }],
};

export const BUILDING_HP: Record<BuildingType, number> = {
  wall: 120,
  stoneWall: 260, // costlier and slower, but it lasts
  floor: 60,
  stoneFloor: 110,
  door: 90,
  bed: 60,
  farmPlot: 30,
  berryBush: 20,
  frostbloom: 20,
  storageZoneMarker: 10,
  manaFurnace: 200,
  manaConduit: 40,
  manaLamp: 50,
  manaExtractor: 180,
  hearth: 90,
  manaTurret: 150,
  tradingPost: 100,
  table: 60,
  stool: 40,
  dresser: 80,
  statue: 120, // solid stone: it outlasts the wooden wall it decorates
  armchair: 60,
  researchDesk: 90,
  workbench: 90,
};

/** Structures that block movement once finished. */
export const BLOCKS_MOVEMENT: Record<BuildingType, boolean> = {
  wall: true,
  stoneWall: true,
  floor: false,
  stoneFloor: false,
  // passable for colonists; animals cannot work a handle, which is what makes a
  // walled pen with a door in it useful (see isWalkableByAnimal)
  door: false,
  bed: false,
  farmPlot: false,
  berryBush: false,
  frostbloom: false,
  storageZoneMarker: false,
  // A furnace is a solid installation you walk around; a conduit is laid into
  // the floor and a lamp stands out of the way, so both stay walkable - a power
  // run must never become a wall the colony has to path around.
  manaFurnace: true,
  manaConduit: false,
  manaLamp: false,
  // a machine standing against the rock face, not something you walk over
  manaExtractor: true,
  // you sit at it, so you have to be able to reach it
  hearth: false,
  manaTurret: true,
  // a post is a counter you walk up to
  tradingPost: false,
  // Furniture: what you sit on stays walkable (like the bed and the hearth);
  // what you stand things on or in blocks the tile (like the furnace).
  table: true,
  stool: false,
  dresser: true,
  armchair: false,
  statue: true,
  // a desk you stand at, like the table it is built the same way as
  researchDesk: true,
  workbench: true, // a bench you work at, not walk through
};

// --- furniture effects (design-phase10-ores.md 4.2 / 7.2) --------------------
// Per-*type* constants, like MANA_DRAW: a radius or a multiplier is a property
// of what a table is, not of this table, and a number that is saved on the
// building is a number that can disagree with the rule that made it.
//
// Every radius here is Chebyshev (a square of tiles, the "room around it" a
// player reads straight off the grid) - the stool's adjacency is the same
// metric at distance 1, so one helper serves all of it.

/** Eating within this square of a finished table earns the thought. */
export const TABLE_RADIUS = 2;
export const TABLE_THOUGHT_BONUS = 3;
/** ...and a finished stool adjacent (Chebyshev 1) to that table upgrades it. */
export const TABLE_WITH_STOOL_THOUGHT_BONUS = 4;
/**
 * Sleep recovery in a bed within this square of a finished dresser. Multiplies
 * with traits but deliberately stays under heavySleeper's 1.35: furniture is
 * weaker than who somebody is (design-phase10-ores.md 7.2). One dresser at
 * most - two wardrobes do not make the bed twice as good.
 */
export const DRESSER_RADIUS = 2;
export const DRESSER_REST_MULTIPLIER = 1.15;
/** Relaxing in an armchair, against the hearth's 1.0 baseline. */
export const ARMCHAIR_RECREATION_MULTIPLIER = 1.3;
/** A finished statue is worth a thought to anyone within its square. */
export const STATUE_RADIUS = 4;
export const STATUE_THOUGHT_BONUS = 3;

// --- research (11章 フェーズ12, design-phase12-research.md 3.2 / 5章 / 6章) ---
//
// A tech's profile - what it needs, what it unlocks - is a property of the
// kind of tech, not of one colony's run at it, so it lives here beside
// BUILDING_COSTS rather than on GameState (the same reasoning as SPECIES).

export interface TechProfile {
  prerequisites: TechName[];
  /** progress points to complete, at TECH_PROGRESS_PER_CYCLE per work cycle */
  cost: number;
  /**
   * Delivered to the desk before progress starts accumulating (crystallography
   * only, for now) - the same shape as a blueprint's `requiredResources`, and
   * carried on the desk building itself rather than duplicated here.
   */
  resourceCost?: RequiredResource[];
  /** what building the world grandfathers as free until this tech clears it */
  unlocks: BuildingType[];
}

/** Iteration order for the research panel: the tree's own reading order. */
export const TECH_NAMES: TechName[] = [
  'woodcraft',
  'stonecarving',
  'ironwork',
  'crystallography',
];

/**
 * The design document's starting costs (300 / 300 / 600 / 500) measured at
 * roughly a third of a day for woodcraft with one dedicated, uninterrupted
 * researcher - not the "about a day" the document estimated (docs/design-notes.md,
 * 「研究と職業（フェーズ12）」). All four are scaled up 2.5x from that
 * measurement, which lands woodcraft within a few percent of a day; the
 * scaling keeps every tech's cost relative to the others exactly as designed.
 */
export const TECHS: Record<TechName, TechProfile> = {
  woodcraft: { prerequisites: [], cost: 750, unlocks: ['armchair'] },
  stonecarving: { prerequisites: [], cost: 750, unlocks: ['statue'] },
  ironwork: { prerequisites: ['woodcraft'], cost: 1500, unlocks: ['dresser'] },
  // "unlocks nothing yet" is deliberate (design-phase12-research.md 3.2): this
  // tech exists to prove the resource-cost mechanism on its own, one time,
  // before a later phase brings the mana-side building that spends it.
  crystallography: {
    prerequisites: [],
    cost: 1250,
    resourceCost: [{ type: 'manaCrystal', quantity: 4 }],
    unlocks: [],
  },
};

/** Points banked per completed WORK_TICKS.research cycle, before skill/mood. */
export const TECH_PROGRESS_PER_CYCLE = 10;

export const COLONIST_COLORS = [
  0x8ecae6, 0xffb703, 0xb5e48c, 0xe0a3c8, 0x9d8df1, 0xf28f6b, 0x6bd6c4, 0xd6cf6b,
];
export const COLONIST_NAMES = [
  'Aria',
  'Bruno',
  'Cleo',
  'Dmitri',
  'Esme',
  'Faye',
  'Goro',
  'Hana',
  'Ines',
  'Jonas',
  'Kira',
  'Lars',
];

/**
 * Wanderers. A colony that is clearly feeding itself attracts people, which is
 * the only way the population grows - and it makes the food economy matter for
 * something other than not dying: a bigger stock buys more hands, and more
 * hands eat more.
 */
export const ARRIVAL_INTERVAL_TICKS = TICKS_PER_DAY * 3;
/**
 * Food in store per head, counting the newcomer, before anyone considers
 * joining. A colonist eats roughly 12 a day, so this is about a fortnight each:
 * enough that the colony is provably feeding itself through a winter rather
 * than merely through a good summer.
 */
export const ARRIVAL_FOOD_PER_COLONIST = 160;
export const ARRIVAL_MAX_COLONISTS = 8;

// --- animal layer (docs/design-phase2.5-animals.md 6) --------------------------------

export const ANIMAL_SPECIES: AnimalSpecies[] = [
  'deer',
  'boar',
  'rabbit',
  'chicken',
  'goat',
  'wolf',
  'crystalElk',
  'rockeater',
];

export interface SpeciesProfile {
  // what a species is called (singular and plural, per language) lives in the
  // UI dictionary (src/ui/strings.ts); the profile is numbers only
  /**
   * `lithovore` eats the map itself (11章 フェーズ5). It is a diet rather than a
   * flag because every place that asks "what does this animal eat" already
   * switches on this field, and a third answer costs one branch each.
   */
  diet: 'herbivore' | 'omnivore' | 'carnivore' | 'lithovore';
  /** moves one tile every N ticks; colonists move every TICKS_PER_STEP (2) */
  ticksPerStep: number;
  maxHealth: number;
  /** food dropped when killed */
  foodYield: number;
  /** 0 = cannot be tamed */
  tameChance: number;
  /** tamed animals only: resource produced periodically, 0 = produces nothing */
  produceAmount: number;
  produceIntervalTicks: number;
  /**
   * What that production is. Every animal in the base game gives `food`, and
   * the whole of the crystal elk (11章 フェーズ5) is this one field being
   * something else - which is why it is a field and not a second code path.
   */
  produceType: ResourceType;
  /** ticks before a newborn counts as an adult for breeding */
  adultAtTicks: number;
  initialCount: number;
}

export const SPECIES: Record<AnimalSpecies, SpeciesProfile> = {
  deer: {
    diet: 'herbivore',
    ticksPerStep: 3,
    maxHealth: 60,
    foodYield: 45,
    tameChance: 0.4,
    produceAmount: 0,
    produceIntervalTicks: 0,
    produceType: 'food',
    adultAtTicks: TICKS_PER_DAY * 2,
    initialCount: 6,
  },
  boar: {
    diet: 'omnivore',
    ticksPerStep: 3,
    maxHealth: 80,
    foodYield: 60,
    tameChance: 0.3,
    produceAmount: 0,
    produceIntervalTicks: 0,
    produceType: 'food',
    adultAtTicks: TICKS_PER_DAY * 2,
    initialCount: 4,
  },
  rabbit: {
    diet: 'herbivore',
    ticksPerStep: 2, // as quick as a wolf: catching one is a real chase
    maxHealth: 20,
    foodYield: 10,
    tameChance: 0.55,
    produceAmount: 0,
    produceIntervalTicks: 0,
    produceType: 'food',
    adultAtTicks: TICKS_PER_DAY, // and quick to mature, so the herd rebuilds fast
    initialCount: 10,
  },
  chicken: {
    diet: 'herbivore',
    ticksPerStep: 4,
    maxHealth: 25,
    foodYield: 12,
    tameChance: 0.6,
    produceAmount: 6, // eggs
    produceIntervalTicks: 1500,
    produceType: 'food',
    adultAtTicks: TICKS_PER_DAY,
    initialCount: 8,
  },
  /**
   * The reason to build a pen. A pasture tile holds the same one animal
   * whatever species it is (PASTURE_TILES_PER_ANIMAL), so what a pen is worth
   * is what its occupants give per head - and until now the best of those was a
   * chicken at six eggs every fifteen hundred ticks. A goat gives twice as much
   * on a shorter cycle and is worth more slaughtered, against a lower chance of
   * being tamed in the first place: harder to get, better to keep.
   *
   * It is deliberately not best at everything. A boar is still the bigger
   * carcass, and gives nothing at all while it lives - so the choice between
   * hunting one and keeping the other stays a choice.
   */
  goat: {
    diet: 'herbivore',
    ticksPerStep: 3,
    maxHealth: 45,
    foodYield: 30,
    tameChance: 0.45,
    produceAmount: 12, // milk
    produceIntervalTicks: 1200,
    produceType: 'food',
    adultAtTicks: TICKS_PER_DAY * 2,
    initialCount: 5,
  },
  wolf: {
    diet: 'carnivore',
    ticksPerStep: 2, // as fast as a colonist: fleeing buys time, not safety
    maxHealth: 70,
    foodYield: 30,
    tameChance: 0, // predators cannot be tamed in this iteration
    produceAmount: 0,
    produceIntervalTicks: 0,
    produceType: 'food',
    adultAtTicks: TICKS_PER_DAY * 3,
    initialCount: 2,
  },
  /**
   * The one renewable source of mana (11章 フェーズ5). Everything about it is
   * worse than a deer - slower, frailer, harder to tame, half the meat - and it
   * is worth keeping anyway, because a tamed one grows crystal instead of milk.
   *
   * Deliberately **not** enough on its own. One elk yields 1 crystal every 2400
   * ticks (1.25 a day) against a furnace burning one every 1980 (1.52 a day),
   * so a single elk runs a furnace down slowly and two run it with a little
   * spare. The mine stays the way you get mana in bulk; the herd is what stops
   * a mined-out map from being a dead one.
   */
  crystalElk: {
    diet: 'herbivore',
    ticksPerStep: 3,
    maxHealth: 40,
    foodYield: 18,
    tameChance: 0.25,
    produceAmount: 1,
    produceIntervalTicks: 2400,
    produceType: 'manaCrystal',
    adultAtTicks: TICKS_PER_DAY * 3,
    initialCount: 3,
  },
  /**
   * Eats the map (11章 フェーズ5). Not a predator - it never touches a colonist
   * or an animal - so it is not a threat but a piece of terrain that moves. It
   * is worth no meat and cannot be tamed, which leaves exactly two attitudes to
   * take: leave it alone, or hunt it because it is chewing towards a wall.
   */
  rockeater: {
    diet: 'lithovore',
    ticksPerStep: 4, // the slowest thing on the map
    maxHealth: 90, // and the toughest short of a raid
    foodYield: 0, // there is nothing on it worth eating
    tameChance: 0,
    produceAmount: 0,
    produceIntervalTicks: 0,
    produceType: 'food',
    adultAtTicks: TICKS_PER_DAY * 3,
    initialCount: 2,
  },
};

/**
 * The fantasy layer (11章 フェーズ5, docs/design-phase5-trade.md 3).
 *
 * Frostbloom: wild, scattered like berries, and the only harvest a winter has.
 * It yields less than a berry bush on purpose - the point is that the season
 * has work in it, not that winter becomes the good season.
 */
// 8 since phase 7: the slower winter walks (forest pace) and the dawn-anchored
// nights squeezed the season's labour, and the winter crop is the number that
// answers for the winter budget - measured, 7 left a stocked colony eating
// into its stores over the frostbloom season (design-notes.md「時間と動き」).
// Still strictly under the berry bush (9), so winter never becomes the good
// season.
export const FOOD_PER_FROSTBLOOM_HARVEST = 8;
/** Ripe in a day and a half, so a five-day winter gives about three harvests. */
export const FROSTBLOOM_REGROW_PER_TICK = 1 / 4500;
export const FROSTBLOOM_COUNT = 14;

/**
 * Lightmoss: forage comes back under a lit lamp whatever the season, at this
 * fraction of the summer rate. Slower than grass so a lamp is a way to keep a
 * small herd through the winter rather than a better pasture than a meadow.
 */
export const LIGHTMOSS_REGROW_FACTOR = 0.6;

/**
 * Rockeater: ticks to work through one tile of stone, and how far it will look
 * for the next one. The radius is small and squared off because the search runs
 * on the animal's own step interval - a bounded box beats an A* call here, and
 * stone comes in masses rather than single tiles, so a hungry rockeater that
 * has just finished one is already standing next to the next.
 */
export const ROCKEATER_GNAW_TICKS = 900;
export const ROCKEATER_SEARCH_RADIUS = 8;
export const ROCKEATER_HUNGER_RESTORED = 35;

/** Slower than colonists (100/2400): animals graze often but not constantly. */
export const ANIMAL_HUNGER_PER_TICK = 100 / 3600;
export const ANIMAL_GRAZE_THRESHOLD = 40;
export const ANIMAL_GRAZE_TICKS = 20;
export const ANIMAL_GRAZE_HUNGER_RESTORED = 35;
/**
 * Livestock will eat from a food stack lying in their pasture when the grass is
 * gone. Without this a penned herd simply starves through winter with nothing
 * the player can do about it; with it, a stockpile inside the pen is fodder and
 * the existing haul jobs fill it.
 */
export const ANIMAL_FODDER_PER_MEAL = 5;
export const ANIMAL_FODDER_HUNGER_RESTORED = 45;
/** Starving animals lose health; this is how overgrazing eventually kills a herd. */
export const ANIMAL_STARVATION_DAMAGE_PER_TICK = 100 / 1200;

/** Grass tiles carry 0..1 of grazeable growth, fully regrown in a day. */
export const FORAGE_REGROW_PER_TICK = 1 / TICKS_PER_DAY;
/**
 * Grass is only topped up every N ticks (in one larger step). A grazed tile
 * stays below full for most of a day, so regrowing it every single tick would
 * mean rewriting hundreds of tiles per tick for no visible difference.
 */
export const FORAGE_REGROW_INTERVAL_TICKS = 50;
export const FORAGE_PER_GRAZE = 0.35;

// predators
export const PREDATOR_HUNT_THRESHOLD = 60;
export const PREDATOR_SIGHT_RANGE = 12;
export const PREDATOR_BITE_DAMAGE = 12;
export const PREDATOR_BITE_INTERVAL_TICKS = 10;
export const PREDATOR_RETREAT_HEALTH = 40;
export const PREDATOR_PURSUIT_TICKS = 300;
/** After giving up a chase a predator leaves its quarry alone for this long. */
export const PREDATOR_GIVE_UP_COOLDOWN_TICKS = 600;
export const PREDATOR_HUNGER_PER_KILL = 70;
/**
 * Gnawing at a door. Slower and weaker than a bite, and bounded by the same
 * PREDATOR_PURSUIT_TICKS that ends any other chase: a wolf gets at most about a
 * dozen goes at a door per visit, so a wooden door survives roughly three
 * uninterrupted visits and a stone wall effectively never falls. A fence is
 * meant to be a barrier that needs keeping up, not a formality and not a wall
 * of infinite patience.
 */
export const PREDATOR_STRUCTURE_DAMAGE = 3;
export const PREDATOR_GNAW_INTERVAL_TICKS = 25;
/** Predators only appear from day 2 and never right next to the camp. */
export const PREDATOR_FIRST_SPAWN_TICK = TICKS_PER_DAY;
export const PREDATOR_MIN_SPAWN_DISTANCE = 20;
export const PREDATOR_RESPAWN_INTERVAL_TICKS = TICKS_PER_DAY;
/**
 * Wild herbivores do not breed (only livestock in a pasture do), so without a
 * top-up the wolves would eat the map empty in about a fortnight and then have
 * nothing left to hunt but colonists. One head per species per day walks in from
 * the edge, up to the species' starting population.
 */
export const WILDLIFE_RESPAWN_INTERVAL_TICKS = TICKS_PER_DAY;
export const WILDLIFE_MIN_SPAWN_DISTANCE = 18;

// colonists under threat
export const COLONIST_MAX_HEALTH = 100;
export const COLONIST_HEALTH_REGEN_PER_TICK = 100 / 6000; // full heal in two days of rest
export const FLEE_DURATION_TICKS = 120;
export const FLEE_TRIGGER_DISTANCE = 4;

/**
 * A cornered boar. Hunting is ranged and was therefore free: the prey could not
 * answer back, so a hunt cost nothing but time. An omnivore with 80 health and
 * tusks is the natural exception - it charges the hunter instead of running,
 * which makes boar meat the expensive kind.
 */
export const BOAR_CHARGE_CHANCE_PER_TICK = 1 / 120;
export const BOAR_CHARGE_RANGE = 6;

// hunting and handling
/** Hunting is ranged, so prey does not need to be cornered (see design doc 3). */
export const HUNT_RANGE = 5;
export const TAME_FAIL_FLEE_TICKS = 200;

// breeding and pasture
export const BREEDING_HUNGER_MAX = 40;
export const GESTATION_TICKS = TICKS_PER_DAY;
export const BREEDING_CHANCE_PER_TICK = 1 / 600;
/** Herd cap = pasture tiles / this. Reaching it simply stops new pregnancies. */
export const PASTURE_TILES_PER_ANIMAL = 4;

/** A* budget for animals per tick, so the herd cannot starve the colonists' pathfinding. */
export const ANIMAL_PATH_BUDGET_PER_TICK = 3;
export const ANIMAL_PATH_TTL_TICKS = 60;

// --- the workbench and cooking (design-next 提案3) ---------------------------
/** Raw food one cooking batch consumes. */
export const CRAFT_MEAL_INPUT = 10;
/** Meals one batch produces: cooking upgrades food, it does not multiply it. */
export const CRAFT_MEAL_OUTPUT = 10;
/**
 * Raw food the colony keeps out of the pot. A batch is only started while raw
 * stock exceeds input + reserve, so cooking can never carry the last meals off
 * to the bench while somebody is starving.
 */
export const CRAFT_FOOD_RESERVE = 10;
/** A cooked meal restores this much hunger (raw: HUNGER_RESTORED_PER_MEAL). */
export const MEAL_HUNGER_RESTORED = 95;
/** Mood for having eaten a cooked meal, and how long the glow lasts. */
export const MEAL_THOUGHT_BONUS = 6;
export const MEAL_THOUGHT_TICKS = 1500; // half a day
