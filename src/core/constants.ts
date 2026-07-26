// Tunable simulation constants. Everything time-based is expressed in ticks so
// that changing the speed multiplier never changes game balance (section 5).
import type { BuildingType, JobType, RequiredResource, ResourceType } from './types';

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
export const HUNGER_THRESHOLD = 55; // start looking for food
export const SLEEP_THRESHOLD = 75; // start looking for a bed
export const SLEEP_WAKE_AT = 3;
export const EAT_TICKS = 30;
export const FOOD_PER_MEAL = 10;
export const HUNGER_RESTORED_PER_MEAL = 70;

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
  farm: 2,
  chop: 2,
  mine: 2,
  haul: 3,
};

/** Work ticks required once the colonist stands in place. */
export const WORK_TICKS: Record<JobType, number> = {
  chop: 40,
  mine: 60,
  farm: 25,
  build: 35,
  haul: 5,
};

// --- resources --------------------------------------------------------------
export const STACK_MAX = 75;
export const WOOD_PER_TREE = 25;
export const STONE_PER_ROCK = 20;
export const FOOD_PER_HARVEST = 22;
/** Farm plot goes from sown to harvestable in half a day. */
export const CROP_GROWTH_PER_TICK = 1 / 1500;

export const RESOURCE_TYPES: ResourceType[] = ['wood', 'stone', 'food'];

// --- buildings --------------------------------------------------------------
export const BUILDING_COSTS: Record<BuildingType, RequiredResource[]> = {
  wall: [{ type: 'wood', quantity: 5 }],
  floor: [{ type: 'wood', quantity: 2 }],
  door: [{ type: 'wood', quantity: 8 }],
  bed: [{ type: 'wood', quantity: 12 }],
  farmPlot: [],
  storageZoneMarker: [],
};

export const BUILDING_HP: Record<BuildingType, number> = {
  wall: 120,
  floor: 60,
  door: 90,
  bed: 60,
  farmPlot: 30,
  storageZoneMarker: 10,
};

/** Structures that block movement once finished. */
export const BLOCKS_MOVEMENT: Record<BuildingType, boolean> = {
  wall: true,
  floor: false,
  door: false, // MVP: doors are always passable, they just render open/closed
  bed: false,
  farmPlot: false,
  storageZoneMarker: false,
};

export const COLONIST_COLORS = [0x8ecae6, 0xffb703, 0xb5e48c];
export const COLONIST_NAMES = ['Aria', 'Bruno', 'Cleo'];
