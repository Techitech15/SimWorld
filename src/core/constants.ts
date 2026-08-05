// Tunable simulation constants. Everything time-based is expressed in ticks so
// that changing the speed multiplier never changes game balance (section 5).
import type {
  AnimalSpecies,
  BuildingType,
  JobType,
  RequiredResource,
  ResourceType,
} from './types';

export const MAP_WIDTH = 60;
export const MAP_HEIGHT = 60;
export const TILE_SIZE = 32;

/** 1 tick = 200ms => 5 ticks/second (section 5) */
export const TICK_MS = 200;
export const TICKS_PER_DAY = 3000;
export const TICKS_PER_HOUR = TICKS_PER_DAY / 24;

/** Colonists move one tile every N ticks. */
export const TICKS_PER_STEP = 2;

// --- needs (section 5): linear decay, threshold triggers behaviour -----------
export const HUNGER_PER_TICK = 100 / 2400; // full bar in 0.8 day
export const SLEEP_PER_TICK = 100 / 2000; // full bar in ~16 in-game hours
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
export const FOOD_PER_HARVEST = 16;
/**
 * Wild berries. A bush ripens on its own with no sowing and yields less than a
 * tended plot, which makes foraging the thing a young colony does before it has
 * a farm running - and a reason to walk into the woods at all.
 */
export const FOOD_PER_BERRY_HARVEST = 9;
export const BERRY_REGROW_PER_TICK = 1 / 4500;
export const BERRY_BUSH_COUNT = 26;
/** Farm plot goes from sown to harvestable in about two thirds of a day. */
export const CROP_GROWTH_PER_TICK = 1 / 2000;

export const RESOURCE_TYPES: ResourceType[] = ['wood', 'stone', 'food'];

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
  storageZoneMarker: [],
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
  storageZoneMarker: 10,
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
  storageZoneMarker: false,
};

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

// --- animal layer (docs/design-animals.md 6) --------------------------------

export const ANIMAL_SPECIES: AnimalSpecies[] = ['deer', 'boar', 'rabbit', 'chicken', 'wolf'];

export interface SpeciesProfile {
  label: string;
  diet: 'herbivore' | 'omnivore' | 'carnivore';
  /** moves one tile every N ticks; colonists move every TICKS_PER_STEP (2) */
  ticksPerStep: number;
  maxHealth: number;
  /** food dropped when killed */
  foodYield: number;
  /** 0 = cannot be tamed */
  tameChance: number;
  /** tamed animals only: food produced periodically, 0 = produces nothing */
  produceAmount: number;
  produceIntervalTicks: number;
  /** ticks before a newborn counts as an adult for breeding */
  adultAtTicks: number;
  initialCount: number;
}

export const SPECIES: Record<AnimalSpecies, SpeciesProfile> = {
  deer: {
    label: 'Deer',
    diet: 'herbivore',
    ticksPerStep: 3,
    maxHealth: 60,
    foodYield: 45,
    tameChance: 0.4,
    produceAmount: 0,
    produceIntervalTicks: 0,
    adultAtTicks: TICKS_PER_DAY * 2,
    initialCount: 6,
  },
  boar: {
    label: 'Boar',
    diet: 'omnivore',
    ticksPerStep: 3,
    maxHealth: 80,
    foodYield: 60,
    tameChance: 0.3,
    produceAmount: 0,
    produceIntervalTicks: 0,
    adultAtTicks: TICKS_PER_DAY * 2,
    initialCount: 4,
  },
  rabbit: {
    label: 'Rabbit',
    diet: 'herbivore',
    ticksPerStep: 2, // as quick as a wolf: catching one is a real chase
    maxHealth: 20,
    foodYield: 10,
    tameChance: 0.55,
    produceAmount: 0,
    produceIntervalTicks: 0,
    adultAtTicks: TICKS_PER_DAY, // and quick to mature, so the herd rebuilds fast
    initialCount: 10,
  },
  chicken: {
    label: 'Chicken',
    diet: 'herbivore',
    ticksPerStep: 4,
    maxHealth: 25,
    foodYield: 12,
    tameChance: 0.6,
    produceAmount: 6, // eggs
    produceIntervalTicks: 1500,
    adultAtTicks: TICKS_PER_DAY,
    initialCount: 8,
  },
  wolf: {
    label: 'Wolf',
    diet: 'carnivore',
    ticksPerStep: 2, // as fast as a colonist: fleeing buys time, not safety
    maxHealth: 70,
    foodYield: 30,
    tameChance: 0, // predators cannot be tamed in this iteration
    produceAmount: 0,
    produceIntervalTicks: 0,
    adultAtTicks: TICKS_PER_DAY * 3,
    initialCount: 2,
  },
};

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
/** Predators only appear from day 2 and never right next to the camp. */
export const PREDATOR_FIRST_SPAWN_TICK = TICKS_PER_DAY;
export const PREDATOR_MIN_SPAWN_DISTANCE = 20;
export const PREDATOR_MAX_ALIVE = 2;
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
