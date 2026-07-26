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

export type TileId = string; // `${x},${y}`
export type ColonistId = string;
export type BuildingId = string;
export type ItemId = string;
export type JobId = string;
export type ZoneId = string;

export interface Vector2 {
  x: number;
  y: number;
}

export type TerrainType = 'grass' | 'forest' | 'stone';

/** [ext] Player designation marking a tile as work to be done. */
export type Designation = 'chop' | 'mine';

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
  /** [ext] chop/mine designation, or null */
  designation: Designation | null;
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
  | { kind: 'sleeping'; bedId: BuildingId | null };

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
  /** [ext] */
  carrying: CarriedStack | null;
  /** [ext] */
  activity: ColonistActivity;
  /** [ext] 0 = disabled, 1 (highest) .. 3 (lowest) */
  workPriorities: Record<JobType, number>;
}

export type BuildingType = 'wall' | 'floor' | 'door' | 'bed' | 'farmPlot' | 'storageZoneMarker';

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
  /** [ext] farm plots only: 0 = not sown, >0 .. 1 = growing, 1 = harvestable */
  growth: number;
  /** [ext] farm plots only */
  sown: boolean;
}

export type JobType = 'chop' | 'mine' | 'farm' | 'build' | 'haul';

export const JOB_TYPES: JobType[] = ['chop', 'mine', 'farm', 'build', 'haul'];

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
  type: 'storage';
  tileIds: TileId[];
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
