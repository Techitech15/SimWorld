// The dictionary (11章 フェーズ9).
//
// Every sentence a player reads exists exactly once per language, here. The
// `Strings` interface lists every key, and both dictionaries implement it, so
// a key added without a translation is a compile error rather than a runtime
// gap. There is no i18n library on purpose: two languages, a few hundred keys
// and a single-file build have none of the problems such a library solves.
//
// English grammar (plurals, 'a'/'an', word order) lives inside the `en`
// implementations; Japanese grammar lives inside `ja`. The core never composes
// a sentence - it hands over keys and primitive params, and the params that
// name a thing (a species, a building, a resource) carry its *id*, so the
// label is looked up here in whichever language is active.
import type { AlertKey } from '../core/alerts';
import type { GoalId } from '../core/goals';
import type { MoodWord, ThoughtKey } from '../core/mood';
import type { Season } from '../core/season';
import type { TribeName } from '../core/tribes';
import type { StatusKey } from '../store/gameStore';
import type { BuildCategory } from './buildMenu';
import type {
  AnimalSpecies,
  BiomeName,
  BuildingType,
  JobFailReason,
  JobType,
  LogKey,
  ResourceType,
  ScenarioName,
  SkillName,
  TechName,
  TerrainType,
  TraderKind,
  TraitName,
} from '../core/types';

export type Language = 'en' | 'ja';

/** Params are primitives; renderers cast the ids they know are in there. */
type P = Record<string, string | number>;

export type DesignationName = 'chop' | 'mine' | 'deconstruct' | 'hunt' | 'tame' | 'slaughter';
export type ColonistActivityName =
  | 'idle'
  | 'eating'
  | 'sleeping'
  | 'walking'
  | 'fleeing'
  | 'brooding'
  | 'wandering'
  | 'binge'
  | 'fighting'
  | 'relaxingHearth'
  | 'relaxingArmchair'
  | 'relaxingAlone';
export type AnimalActivityName =
  | 'idle'
  | 'grazing'
  | 'fleeing'
  | 'stalking'
  | 'attacking'
  | 'gnawing';
export type AnimalKind = 'tame' | 'predator' | 'wild';
export type NeedWord = 'fine' | 'wanting' | 'critical';

export interface Strings {
  languageName: string;

  // --- the absorbed label tables (one definition per language, nowhere else) --
  resourceLabels: Record<ResourceType, string>;
  speciesLabels: Record<AnimalSpecies, string>;
  /** counted head of a species: English needs its irregular plurals, Japanese does not */
  speciesCounted: (species: AnimalSpecies, count: number) => string;
  skillLabels: Record<SkillName, string>;
  seasonLabels: Record<Season, string>;
  moodWords: Record<MoodWord, string>;
  traitLabels: Record<TraitName, string>;
  traitDescriptions: Record<TraitName, string>;
  terrainLabels: Record<TerrainType, string>;
  buildingLabels: Record<BuildingType, string>;
  designationLabels: Record<DesignationName, string>;
  scenarioLabels: Record<ScenarioName, string>;
  scenarioDescriptions: Record<ScenarioName, string>;
  biomeLabels: Record<BiomeName, string>;
  biomeDescriptions: Record<BiomeName, string>;
  /** 11章 フェーズ11 段階C: the three tribes (design-phase11-worldmap.md 4章) */
  tribeLabels: Record<TribeName, string>;
  tribeDescriptions: Record<TribeName, string>;
  /** Joins already-composed phrases (e.g. worldMapTribeHere/Near results) with the language's list separator. */
  tribeList: (phrases: string[]) => string;
  jobTypeLabels: Record<JobType, string>;
  /** the research tree (11章 フェーズ12) */
  techLabels: Record<TechName, string>;
  /** the derived colonist title (design-phase12-research.md 4.2): highest skill wins */
  titleLabels: Record<SkillName, string>;
  titleColonist: string;
  activityLabels: Record<ColonistActivityName, string>;
  animalActivityLabels: Record<AnimalActivityName, string>;
  animalKinds: Record<AnimalKind, string>;
  traderKindLabels: Record<TraderKind, string>;
  needWords: Record<NeedWord, string>;

  // --- derived text: keys composed at display time -------------------------
  thoughts: Record<ThoughtKey, (p: P) => string>;
  alerts: Record<AlertKey, (p: P) => string>;
  goalLabels: Record<GoalId, (p: P) => string>;
  goalHints: Record<GoalId, string>;
  status: Record<StatusKey, (p: P) => string>;
  log: Record<LogKey, (p: P) => string>;
  jobFailReasons: Record<JobFailReason, string>;

  // --- top bar --------------------------------------------------------------
  dayLabel: (day: number) => string;
  yearLabel: (year: number) => string;
  seasonDay: (season: Season, day: number, total: number) => string;
  seasonDayTitle: (day: number, total: number) => string;
  tickLabel: (tick: number) => string;
  pauseHint: string;
  speedHint: (multiplier: number) => string;
  speedFastHint: string;
  populationCount: (count: number) => string;
  jobsSummary: (active: number, queued: number) => string;
  jobsFailed: (failed: number) => string;
  moodSummary: (mood: number, word: MoodWord) => string;
  moodTitle: string;
  saveButton: string;
  loadButton: string;
  loadAutosaveButton: string;
  autosaveTitle: string;
  newMapButton: string;
  languageToggleTitle: string;
  soundToggleTitle: string;
  worldMapButton: string;

  // --- world map overlay (11章 フェーズ11 段階B, design-phase11-worldmap.md 5章) --
  worldMapTitle: string;
  worldMapSelectIntro: string;
  worldMapViewIntro: string;
  worldMapCloseButton: string;
  worldMapRandomButton: string;
  worldMapStartButton: string;
  worldMapPickPrompt: string;
  worldMapNearbyLabel: string;
  worldMapNoTribesNearby: string;
  /** e.g. "Lanternfolk territory here" vs "near the Lanternfolk" */
  worldMapTribeHere: (tribeLabel: string) => string;
  worldMapTribeNear: (tribeLabel: string) => string;
  worldMapLegendTitle: string;
  worldMapCurrentCellLabel: string;
  worldMapPreWorldMapNote: string;

  // --- toolbar --------------------------------------------------------------
  ordersGroup: string;
  buildGroup: string;
  buildCategoryLabels: Record<BuildCategory, string>;
  animalsGroup: string;
  toolSelect: string;
  toolSelectHint: string;
  toolChop: string;
  toolChopHint: string;
  toolMine: string;
  toolMineHint: string;
  toolDeconstruct: string;
  toolDeconstructHint: string;
  toolClear: string;
  toolStorage: string;
  toolStorageHint: string;
  toolPasture: string;
  toolPastureHint: string;
  toolCancel: string;
  toolCancelHint: string;
  toolHunt: string;
  toolHuntHint: string;
  toolTame: string;
  toolTameHint: string;
  toolSlaughter: string;
  toolSlaughterHint: string;
  toolClearMarks: string;
  costFree: string;
  costList: (costs: { type: ResourceType; quantity: number }[]) => string;
  buildButtonTitle: (label: string, cost: string) => string;
  /** a build-menu button greyed out for a tech nobody has unlocked yet (design-phase12-research.md 3.3) */
  lockedHint: (techLabel: string) => string;
  toolbarHintDrag: string;
  toolbarHintKeys: string;

  // --- panel chrome ---------------------------------------------------------
  panelSelection: string;
  panelColonist: string;
  panelAnimal: string;
  panelColonists: string;
  panelAnimals: string;
  panelWork: string;
  panelResources: string;
  panelLog: string;
  panelMap: string;
  panelGoals: string;
  clearTitle: string;
  collapseTitle: string;
  expandTitle: string;

  // --- selection panel rows -------------------------------------------------
  /** the tile panel's own heading; the wrapping Fold already says "selection"
   *  (13章 段階B), so the panel names the tile instead of repeating the word */
  tileTitle: (x: number, y: number) => string;
  rowSeason: string;
  rowTerrain: string;
  rowForage: string;
  rowOrder: string;
  rowZone: string;
  rowBuilding: string;
  rowStatus: string;
  rowCost: string;
  rowCondition: string;
  rowBerries: string;
  rowCrop: string;
  rowItems: string;
  rowAnimal: string;
  rowHunger: string;
  rowDoing: string;
  rowAge: string;
  rowColonist: string;
  impassableSuffix: string;
  zoneStorageAll: (tiles: number) => string;
  zoneStorageNone: (tiles: number) => string;
  zoneStorageSome: (resources: string, tiles: number) => string;
  zonePasture: (herd: number, capacity: number, tiles: number) => string;
  resourceList: (ids: ResourceType[]) => string;
  blueprintWaiting: (cost: string) => string;
  blueprintReady: string;
  conditionHp: (current: number, max: number) => string;
  berriesRipe: string;
  berriesRipening: (percent: number) => string;
  rowBloom: string;
  bloomInFlower: string;
  bloomOpening: (percent: number) => string;
  bloomDormant: (percent: number) => string;
  cropNotSown: string;
  cropReady: string;
  cropDormant: (percent: number) => string;
  cropGrowing: (percent: number) => string;
  itemLine: (quantity: number, resource: ResourceType) => string;
  itemClaimedSuffix: string;
  /** shown after an item line when the stack is cooked (design-next 提案3) */
  itemMealSuffix: string;
  animalLine: (name: string, species: AnimalSpecies, kind: AnimalKind) => string;
  ageYoung: string;
  agePregnant: string;
  acceptsLabel: string;
  acceptChipOn: (resource: ResourceType) => string;
  acceptChipOff: (resource: ResourceType) => string;

  // --- colonist detail ------------------------------------------------------
  rowName: string;
  rowWhere: string;
  rowHealth: string;
  rowRest: string;
  rowTrait: string;
  rowPace: string;
  rowTitle: string;
  needLine: (value: number, word: NeedWord) => string;
  skillMastered: (level: number) => string;
  skillProgress: (level: number, percent: number) => string;
  traitLine: (trait: TraitName) => string;
  paceLine: (rate: string, level: number) => string;
  carrying: (quantity: number, resource: ResourceType) => string;

  // --- colonist panel -------------------------------------------------------
  moodBarTitle: (mood: number, word: MoodWord) => string;
  friendOf: (name: string) => string;
  knowsName: (name: string) => string;
  affinityTitle: (value: number, max: number) => string;
  skillTagTitle: (skill: SkillName, level: number) => string;

  // --- animal detail --------------------------------------------------------
  rowKind: string;
  rowGives: string;
  rowButchers: string;
  animalName: (name: string, species: AnimalSpecies) => string;
  givesLine: (amount: number, intervalTicks: number) => string;
  butchersLine: (amount: number) => string;

  // --- animal panel ---------------------------------------------------------
  colWild: string;
  colTame: string;
  colMarked: string;
  colWildTitle: string;
  colTameTitle: string;
  colMarkedTitle: string;
  findTitle: (species: AnimalSpecies) => string;
  pastureLine: (index: number, herd: number, capacity: number, tiles: number) => string;
  pastureFullSuffix: string;
  noPasture: string;

  // --- resource panel -------------------------------------------------------
  manaLabel: string;
  manaGrids: (grids: number) => string;
  manaShort: (short: number) => string;
  storedTotal: (total: number) => string;
  resourceFootnote: string;

  // --- minimap --------------------------------------------------------------
  minimapTitle: string;
  keyColonist: string;
  keyPredator: string;
  keyTame: string;
  keyWild: string;

  // --- work table -----------------------------------------------------------
  workColumnTitle: (jobType: JobType) => string;
  priorityDisabled: string;
  priorityTitle: (value: number) => string;
  workFootnote: string;
  assignBySkill: string;
  assignFootnote: string;

  // --- trade panel (11章 フェーズ5) ------------------------------------------
  panelTrader: string;
  rowWho: string;
  rowTradeKind: string;
  rowLeaves: string;
  leavesInHours: (hours: number) => string;
  traderSells: (quantity: number, resource: ResourceType, price: string) => string;
  traderDeal: (give: ResourceType, take: ResourceType) => string;
  tradeFootnote: string;
  tradeGiveTitle: (give: ResourceType, take: ResourceType) => string;
  tradeCallOff: string;

  // --- research panel (11章 フェーズ12) ---------------------------------------
  panelResearch: string;
  researchCurrentLabel: string;
  researchNoneSelected: string;
  researchProgressLine: (have: number, want: number) => string;
  researchAwaitingDelivery: (need: string) => string;
  researchAvailableLabel: string;
  researchUnlockedLabel: string;
  researchNoneUnlocked: string;
  researchSelectTitle: (techLabel: string) => string;
  researchCostLine: (points: number) => string;
  researchUnlocksLine: (buildings: string) => string;
  researchNoUnlocks: string;
  researchNeedsDesk: string;

  // --- profession presets (11章 フェーズ12, design-phase12-research.md 4.2) --
  professionsLabel: string;
  professionTitle: (label: string) => string;
  professionNoSelection: string;

  // --- goals panel ----------------------------------------------------------
  goalSummaryLine: (done: number, total: number, season: Season) => string;
  goalsDead: string;
  goalNext: (label: string) => string;
  goalsAllDone: string;

  // --- alerts panel ---------------------------------------------------------
  alertsMore: (count: number) => string;
  alertJumpTitle: string;
}

// ---------------------------------------------------------------------------
// English
// ---------------------------------------------------------------------------

const EN_RESOURCES: Record<ResourceType, string> = {
  wood: 'wood',
  stone: 'stone',
  food: 'food',
  manaCrystal: 'mana crystal',
  iron: 'iron',
};

const EN_SPECIES: Record<AnimalSpecies, string> = {
  deer: 'Deer',
  boar: 'Boar',
  rabbit: 'Rabbit',
  chicken: 'Chicken',
  goat: 'Goat',
  wolf: 'Wolf',
  crystalElk: 'Crystal elk',
  rockeater: 'Rockeater',
};

/** English is not regular: deer stay deer, a wolf becomes wolves, and the
 *  crystal elk inherits the deer's plural along with its silhouette. */
const EN_SPECIES_PLURAL: Record<AnimalSpecies, string> = {
  deer: 'Deer',
  boar: 'Boars',
  rabbit: 'Rabbits',
  chicken: 'Chickens',
  goat: 'Goats',
  wolf: 'Wolves',
  crystalElk: 'Crystal elk',
  rockeater: 'Rockeaters',
};

const EN_BUILDINGS: Record<BuildingType, string> = {
  // one definition ends the era of Toolbar 'Wall' vs SelectionPanel 'Wooden wall'
  wall: 'Wooden wall',
  stoneWall: 'Stone wall',
  floor: 'Wooden floor',
  stoneFloor: 'Flagstone floor',
  door: 'Door',
  bed: 'Bed',
  hearth: 'Hearth',
  farmPlot: 'Farm plot',
  berryBush: 'Berry bush',
  storageZoneMarker: 'Storage marker',
  manaFurnace: 'Mana furnace',
  manaConduit: 'Mana conduit',
  manaLamp: 'Mana lamp',
  manaExtractor: 'Mana extractor',
  manaTurret: 'Mana turret',
  tradingPost: 'Trading post',
  frostbloom: 'Frostbloom',
  table: 'Table',
  stool: 'Stool',
  dresser: 'Dresser',
  armchair: 'Armchair',
  statue: 'Statue',
  researchDesk: 'Research desk',
  workbench: 'Workbench',
};

const EN_SKILLS: Record<SkillName, string> = {
  chop: 'Woodcutting',
  mine: 'Mining',
  farm: 'Growing',
  build: 'Construction',
  haul: 'Hauling',
  hunt: 'Hunting',
  handle: 'Animals',
  research: 'Research',
  craft: 'Crafting',
};

const EN_TECHS: Record<TechName, string> = {
  woodcraft: 'Woodcraft',
  stonecarving: 'Stonecarving',
  ironwork: 'Ironwork',
  crystallography: 'Crystallography',
};

/** The colonist sheet's title (design-phase12-research.md 4.2): highest skill wins. */
const EN_TITLES: Record<SkillName, string> = {
  chop: 'Woodcutter',
  mine: 'Miner',
  farm: 'Farmer',
  build: 'Builder',
  haul: 'Hauler',
  hunt: 'Hunter',
  craft: 'Cook',
  handle: 'Handler',
  research: 'Researcher',
};

const EN_SEASONS: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};

/** singular/plural, the one helper English keeps needing */
function n(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function enSpecies(id: string | number): string {
  return (EN_SPECIES[id as AnimalSpecies] ?? String(id)).toLowerCase();
}

function enBuilding(id: string | number): string {
  return (EN_BUILDINGS[id as BuildingType] ?? String(id)).toLowerCase();
}

function enResourceList(joined: string | number): string {
  return String(joined)
    .split(',')
    .map((id) => EN_RESOURCES[id as ResourceType] ?? id)
    .join(' or ');
}

function enSpeciesList(joined: string | number): string {
  return String(joined)
    .split(',')
    .map((id) => enSpecies(id))
    .join(', ');
}

const en: Strings = {
  languageName: 'English',

  resourceLabels: EN_RESOURCES,
  speciesLabels: EN_SPECIES,
  speciesCounted: (species, count) =>
    `${count} ${(count === 1 ? EN_SPECIES[species] : EN_SPECIES_PLURAL[species]).toLowerCase()}`,
  skillLabels: EN_SKILLS,
  seasonLabels: EN_SEASONS,
  moodWords: { happy: 'happy', content: 'content', unsettled: 'unsettled', miserable: 'miserable' },
  traitLabels: {
    quickLearner: 'Quick learner',
    slowLearner: 'Slow learner',
    industrious: 'Industrious',
    unhurried: 'Unhurried',
    bigEater: 'Big eater',
    frugal: 'Frugal',
    heavySleeper: 'Heavy sleeper',
    restless: 'Restless',
    tough: 'Tough',
    frail: 'Frail',
    cheerful: 'Cheerful',
    gloomy: 'Gloomy',
    sociable: 'Sociable',
    private: 'Private',
  },
  traitDescriptions: {
    quickLearner: 'Picks up a trade half again as fast as anyone else.',
    slowLearner: 'Gets there in the end, but takes twice as long about it.',
    industrious: 'Works a little faster at everything, skilled or not.',
    unhurried: 'Never rushes. The work still gets done.',
    bigEater: 'Hungry a third sooner than everyone else.',
    frugal: 'Makes a meal last. Worth a farm plot in a hard winter.',
    heavySleeper: 'Wakes rested in less time than a bed has any right to give.',
    restless: 'Tires quickly and sleeps badly.',
    tough: 'Mends from a mauling in half the time.',
    frail: 'Slow to heal. Keep this one away from the wolves.',
    cheerful: 'Makes the best of it. Hard to push into a break.',
    gloomy: 'Feels every hardship twice. Give this one a bed early.',
    sociable: 'Makes friends of the people they work beside, and quickly.',
    private: 'Keeps to themselves. Takes a long winter to warm to anyone.',
  },
  terrainLabels: {
    grass: 'Grass',
    forest: 'Forest',
    stone: 'Rock face',
    crystal: 'Mana crystal vein',
    ironVein: 'Iron vein',
  },
  buildingLabels: EN_BUILDINGS,
  designationLabels: {
    chop: 'marked for chopping',
    mine: 'marked for mining',
    deconstruct: 'marked for dismantling',
    hunt: 'marked for hunting',
    tame: 'marked for taming',
    slaughter: 'marked for slaughter',
  },
  scenarioLabels: {
    gentle: 'Sheltered valley',
    standard: 'Open country',
    harsh: 'Hard frontier',
  },
  scenarioDescriptions: {
    gentle:
      'Four hands, eight plots broken, game everywhere and one wolf. Room to learn the controls.',
    standard: 'The colony as designed: enough to get started and no more.',
    harsh: 'Two hands, two plots, thin game and four wolves. The first winter is the test.',
  },
  biomeLabels: {
    meadow: 'Meadow',
    deepwood: 'Deepwood',
    crag: 'Crag',
    manaheath: 'Manaheath',
  },
  biomeDescriptions: {
    meadow: 'The land as generated before biomes existed. Balanced ground, no lever pulled.',
    deepwood: 'Wood without end and berries everywhere, but the farm has little room to grow.',
    crag: 'Stone and ore run deep here. Forage is thin, so the food has to come from elsewhere.',
    manaheath: "Mana bleeds into the ground. Crystal is abundant; the wildlife is not.",
  },
  tribeLabels: {
    lanternfolk: 'the Lanternfolk',
    waldkin: 'the Waldkin',
    parched: 'the Parched',
  },
  tribeDescriptions: {
    lanternfolk: 'Tend crystal and trade the surplus. Their traders cross the map more often nearby.',
    waldkin: 'Live off the woods and herds without mana. Migrants come from their country more often.',
    parched: 'Worn out veins and cold furnaces, left to raid what they no longer have. Heavier and more frequent near their territory.',
  },
  tribeList: (phrases) => phrases.join(', '),
  jobTypeLabels: {
    chop: 'chop',
    mine: 'mine',
    farm: 'farm',
    build: 'build',
    haul: 'haul',
    hunt: 'hunt',
    handle: 'handle',
    deconstruct: 'deconstruct',
    repair: 'repair',
    research: 'research',
    craft: 'craft',
  },
  techLabels: EN_TECHS,
  titleLabels: EN_TITLES,
  titleColonist: 'Colonist',
  activityLabels: {
    idle: 'idle',
    eating: 'eating',
    sleeping: 'sleeping',
    walking: 'walking',
    fleeing: 'fleeing!',
    brooding: 'refusing to work',
    wandering: 'wandering off',
    binge: 'raiding the larder',
    fighting: 'fighting!',
    relaxingHearth: 'at the hearth',
    relaxingArmchair: 'in the armchair',
    relaxingAlone: 'taking a moment',
  },
  animalActivityLabels: {
    idle: 'idle',
    grazing: 'grazing',
    fleeing: 'fleeing',
    stalking: 'stalking',
    attacking: 'attacking',
    gnawing: 'gnawing rock',
  },
  animalKinds: { tame: 'tame', predator: 'predator', wild: 'wild' },
  traderKindLabels: { pedlar: 'pedlar', crystalFactor: 'crystal factor' },
  needWords: { fine: 'fine', wanting: 'wanting', critical: 'critical' },

  thoughts: {
    starving: () => 'Starving',
    hungry: () => 'Hungry',
    wellFed: () => 'Well fed',
    exhausted: () => 'Dead on their feet',
    tired: () => 'Tired',
    wellRested: () => 'Well rested',
    badlyHurt: () => 'Badly hurt',
    inPain: () => 'In pain',
    sickOfPlace: () => 'Sick of the sight of this place',
    bored: () => 'Bored',
    hadTimeOff: () => 'Had some time off',
    beingHunted: () => 'Being hunted',
    sleepingOnGround: () => 'Sleeping on the ground',
    noBed: () => 'No bed of their own',
    larderEmpty: () => 'The larder is empty',
    larderFull: () => 'The larder is full',
    properFloor: () => 'A proper floor underfoot',
    manaLight: () => 'Mana light to work by',
    ateAtTable: () => 'Ate at a table',
    decentMeal: () => 'Had a decent meal',
    fineStatue: () => 'A fine statue to look at',
    friendNearby: () => 'A friend close by',
    knowsNobody: () => 'Nobody here they are close to',
    grieving: (p) => `Grieving for ${p.name}`,
    winterDrags: () => 'Winter drags on',
  },

  alerts: {
    colonyDied: () => 'The colony has died out.',
    colonistsStarving: (p) =>
      `${p.count} ${n(p.count as number, 'colonist is', 'colonists are')} starving`,
    noFood: () => 'No food anywhere in the colony',
    foodLow: (p) => `Food is running low (${p.food})`,
    colonistsHurt: (p) =>
      `${p.count} ${n(p.count as number, 'colonist is', 'colonists are')} badly hurt`,
    predatorNear: (p) => `Predator near the camp (${enSpeciesList(p.species)})`,
    nowhereToStore: (p) =>
      `Nowhere to store ${enResourceList(p.resources)} — the stacks are lying where they fell`,
    storageFull: () => 'Every storage tile is full — the next harvest will have nowhere to go',
    buildingDamaged: (p) => `The ${enBuilding(p.building)} is damaged (${p.percent}%)`,
    buildingsDamaged: (p) => `${p.count} structures are damaged (worst ${p.percent}%)`,
    buildingStalled: (p) => `Building work is stalled: no ${enResourceList(p.resources)} left`,
    bedsShort: (p) =>
      `${p.count} ${n(p.count as number, 'colonist has', 'colonists have')} no bed — they rest poorly`,
    livestockStarving: (p) =>
      `${p.count} ${n(p.count as number, 'animal is', 'animals are')} starving — the pasture has nothing left`,
    pastureOverCapacity: (p) =>
      `Pasture is over capacity (${p.herd}/${p.capacity}) — the grass cannot keep up`,
    jobsAbandoned: (p) =>
      `${p.count} ${n(p.count as number, 'job was', 'jobs were')} given up on — unreachable`,
    nothingGrows: (p) => `${EN_SEASONS[p.season as Season]}: nothing is growing`,
    winterClose: () => 'Winter is close — stock up on food',
    furnaceEmpty: (p) =>
      Number(p.count) === 1 ? 'A mana furnace is out of crystal' : `${p.count} mana furnaces are out of crystal`,
    gridDown: (p) =>
      Number(p.count) === 1 ? 'A mana grid is overloaded — demand exceeds supply' : `${p.count} mana grids are overloaded`,
  },

  goalLabels: {
    beds: (p) => `A bed for everyone (${p.have}/${p.want})`,
    winter: (p) => `Stores for the winter (${p.have}/${p.want} food)`,
    farm: (p) => `Ground under the plough (${p.plots} plots)`,
    stone: () => 'Quarry some stone',
    wall: () => 'Something worth fencing',
    pasture: () => 'A pasture to keep them in',
    tame: (p) => `Livestock of your own (${p.tame})`,
    filter: () => 'Tell a store what it takes',
    research: () => 'Finish your first research',
    mana: () => 'Mine a mana crystal',
    light: () => 'Put a lamp on a working grid',
  },
  goalHints: {
    beds: 'Build > Bed. Sleeping on the ground recovers rest at little more than half the rate.',
    winter: 'Nothing grows in winter, so the buffer has to be earned in the other three seasons.',
    farm: 'Build > Farm. One plot per colonist is a working colony; fewer is a shrinking one.',
    stone:
      'Orders > Mine a rock face. Stone walls take longer to build and twice as much to break.',
    wall: 'Build > Wall, with a Door in it. Animals cannot work a handle, so walls and a door make a pen.',
    pasture:
      'Build > Pasture on grass. Its area is what caps the herd, and the grass is what feeds them.',
    tame: 'Animals > Tame, on a deer, boar, rabbit or chicken. Wolves cannot be tamed.',
    research:
      'Build > Research desk, pick a tech in the research panel, then raise a column of the work table.',
    filter:
      'Click a storage tile and use the Accepts chips - a wood yard by the wall, a larder by the beds.',
    mana: 'Orders > Mine, on the violet crystal behind the rock. Digging through the grey face exposes it.',
    light:
      'Build > Mana furnace beside a Mana lamp, keep crystal hauled in, and the lamp lifts the mood around it.',
  },

  status: {
    refusalChop: () => 'Chopping needs forest.',
    refusalMine: () => 'Mining needs a rock face.',
    refusalDeconstruct: () => 'Only a finished building can be dismantled.',
    refusalBuild: () => 'Nothing can be built there: the ground is taken or is solid rock.',
    refusalLocked: (p) => `Requires ${en.techLabels[p.tech as TechName]} research.`,
    refusalStorage: () => 'A storage zone needs clear, walkable ground.',
    refusalPasture: () => 'A pasture needs grass to graze.',
    refusalTame: () => 'Nothing there can be tamed.',
    refusalSlaughter: () => 'Only tamed animals can be slaughtered.',
    refusalHunt: () => 'No wild animal there to hunt.',
    refusalCancel: () => 'Nothing there to remove.',
    assignNoChange: () => 'Everyone is already on their best work.',
    assignDone: () => 'Work assigned by skill.',
    newColony: (p) => `New colony started — ${en.scenarioLabels[p.scenario as ScenarioName]}.`,
    savedAt: (p) => `Saved at tick ${p.tick}.`,
    saveFailed: (p) => `Save failed: ${p.error}`,
    loadedAt: (p) => `Loaded tick ${p.tick}.`,
    loadFailed: (p) => `Load failed: ${p.error}`,
    speciesNone: (p) =>
      `No ${EN_SPECIES_PLURAL[p.species as AnimalSpecies].toLowerCase()} left on the map.`,
    speciesFound: (p) => `${p.name} the ${enSpecies(p.species)} — ${p.x}, ${p.y}`,
    pausedAlert: (p) => `Paused: ${en.alerts[p.alert as AlertKey](p)}`,
  },

  log: {
    legacy: (p) => String(p.text ?? ''),
    colonistArrived: (p) =>
      p.tribe
        ? `${p.name} arrived, drawn by the colony's stores - out of ${en.tribeLabels[p.tribe as TribeName]} country`
        : `${p.name} arrived, drawn by the colony's stores`,
    skillLevelUp: (p) => `${p.name} reached ${EN_SKILLS[p.skill as SkillName]} level ${p.level}`,
    seasonArrived: (p) => `${EN_SEASONS[p.season as Season]} has arrived`,
    colonistStarving: (p) => `${p.name} is starving`,
    colonistCannotFindFood: (p) => `${p.name} cannot find food`,
    breakBrooding: (p) =>
      `${p.name} has had enough${p.thought ? `: ${en.thoughts[p.thought as ThoughtKey](p).toLowerCase()}` : ''}`,
    breakWandering: (p) =>
      `${p.name} walks off in a daze${p.thought ? `: ${en.thoughts[p.thought as ThoughtKey](p).toLowerCase()}` : ''}`,
    breakBinge: (p) =>
      `${p.name} is eating their way through the stores${p.thought ? `: ${en.thoughts[p.thought as ThoughtKey](p).toLowerCase()}` : ''}`,
    backToWork: (p) => `${p.name} goes back to work`,
    orderedToMove: (p) => `${p.name} ordered to ${p.x},${p.y}`,
    incidentBumperCrop: (p) =>
      `A warm spell ripened ${p.plots} ${n(p.plots as number, 'plot', 'plots')} at once`,
    incidentBlight: (p) =>
      `Blight struck ${p.plots} ${n(p.plots as number, 'plot', 'plots')}; the crop is a loss`,
    incidentBerryGlut: (p) => `The woods came into berry all at once (${p.bushes} bushes)`,
    incidentWolfPack: (p) => `A pack of ${p.count} wolves came down out of the trees`,
    incidentHerd: (p) =>
      `A herd of ${en.speciesCounted(p.species as AnimalSpecies, p.count as number)} moved through`,
    incidentLostSupplies: (p) =>
      `Someone abandoned ${p.quantity} ${EN_RESOURCES[p.resource as ResourceType]} on the road nearby`,
    incidentRaid: (p) => {
      const tribe = p.tribe ? en.tribeLabels[p.tribe as TribeName] : null;
      if (tribe) {
        return p.count === 1
          ? `A raider of ${tribe} is coming out of the trees`
          : `${p.count} raiders of ${tribe} are coming out of the trees`;
      }
      return p.count === 1
        ? 'A raider is coming out of the trees'
        : `${p.count} raiders are coming out of the trees`;
    },
    raiderCutDownBy: (p) => `${p.raider} the raider was cut down by ${p.colonist}`,
    raiderCutDownByTurret: (p) => `${p.raider} the raider was cut down by the turret`,
    raidOver: () => 'the raid is over',
    raiderRetreats: (p) => `${p.raider} the raider gives up and turns back`,
    raiderBreaking: (p) => `${p.raider} the raider is breaking through the ${enBuilding(p.building)}`,
    buildingSmashed: (p) => `the ${enBuilding(p.building)} at ${p.tile} was smashed open`,
    furnaceBurnedOut: (p) => `the mana furnace at ${p.tile} has burned out`,
    furnaceStoked: (p) => `the mana furnace at ${p.tile} was stoked`,
    extractorOutOfRock: (p) => `the extractor at ${p.tile} has run out of rock`,
    // entries written before phase 10 carry no resource param: they could only
    // ever have meant mana crystal, so that is what the fallback says
    extractorCutVein: (p) =>
      `the extractor at ${p.tile} cut into a vein of ${EN_RESOURCES[(p.resource as ResourceType) ?? 'manaCrystal']}`,
    veinCutOpen: (p) =>
      `A vein of ${EN_RESOURCES[(p.resource as ResourceType) ?? 'manaCrystal']} was cut open at ${p.x}, ${p.y}`,
    buildingRepaired: (p) => `the ${enBuilding(p.building)} at ${p.tile} was repaired`,
    buildingDismantled: (p) => `${enBuilding(p.building)} at ${p.tile} was dismantled`,
    animalTamed: (p) => `${p.name} the ${enSpecies(p.species)} was tamed`,
    animalTameFailed: (p) => `${p.name} the ${enSpecies(p.species)} would not be tamed`,
    jobFailed: (p) =>
      `job ${p.job} (${p.jobType}) failed: ${en.jobFailReasons[p.reason as JobFailReason]}`,
    colonistStarvedToDeath: (p) => `${p.name} starved to death`,
    colonistKilledByRaider: (p) => `${p.name} was killed by ${p.raider} the raider`,
    colonistKilledByAnimal: (p) => `${p.name} was killed by a ${enSpecies(p.species)}`,
    colonistKilled: (p) => `${p.name} was killed`,
    colonyDiedOut: () => 'The colony has died out.',
    boarTurnedOn: (p) => `${p.name} the boar turned on ${p.hunter}`,
    animalTearing: (p) =>
      `${p.name} the ${enSpecies(p.species)} is tearing at the ${enBuilding(p.building)}`,
    buildingBrokenOpen: (p) => `the ${enBuilding(p.building)} at ${p.tile} was broken open`,
    animalBorn: (p) => `${p.name} the ${enSpecies(p.species)} had ${p.calf}`,
    animalHunted: (p) => `${p.name} the ${enSpecies(p.species)} was hunted`,
    animalSlaughtered: (p) => `${p.name} the ${enSpecies(p.species)} was slaughtered`,
    animalStarvedToDeath: (p) => `${p.name} the ${enSpecies(p.species)} starved`,
    animalKilledByPredator: (p) =>
      `${p.name} the ${enSpecies(p.species)} was killed by a ${enSpecies(p.predator)}`,
    wolfSpotted: (p) => `A wolf was spotted near the treeline (${p.name})`,
    rockeaterExposedVein: (p) =>
      `${p.name} the rockeater laid a mana crystal vein bare at ${p.tile}`,
    traderArrived: (p) =>
      p.kind === 'crystalFactor'
        ? `${p.name}, a crystal factor of ${en.tribeLabels.lanternfolk}, has set up at the post`
        : `${p.name} the pedlar, of ${en.tribeLabels.lanternfolk}, has set up at the post`,
    traderLeft: (p) => `${p.name} packs up and leaves`,
    tradeSettled: (p) =>
      `traded ${p.gaveQuantity} ${EN_RESOURCES[p.gave as ResourceType]} for ${p.tookQuantity} ${EN_RESOURCES[p.took as ResourceType]}`,
    researchUnlocked: (p) => `${en.techLabels[p.tech as TechName]} research completed`,
    mealsCooked: (p) => `${p.count} meals cooked at the workbench`,
  },
  jobFailReasons: {
    interrupted: 'interrupted by a need',
    noWorkSite: 'no work site',
    unreachable: 'unreachable',
    animalUnreachable: 'animal unreachable',
    itemUnreachable: 'item unreachable',
    noDestination: 'no destination',
    blueprintUnreachable: 'blueprint unreachable',
    destinationGone: 'destination gone',
    storageUnreachable: 'storage unreachable',
  },

  dayLabel: (day) => `Day ${day}`,
  yearLabel: (year) => `Year ${year}`,
  seasonDay: (season, day, total) => `${EN_SEASONS[season]} ${day}/${total}`,
  seasonDayTitle: (day, total) => `day ${day} of ${total}`,
  tickLabel: (tick) => `tick ${tick}`,
  pauseHint: 'Pause',
  speedHint: (multiplier) => `${multiplier}x`,
  speedFastHint: '10x — a day a minute',
  populationCount: (count) => `${count} ${n(count, 'colonist', 'colonists')}`,
  jobsSummary: (active, queued) => `jobs: ${active} active / ${queued} queued`,
  jobsFailed: (failed) => `${failed} failed`,
  moodSummary: (mood, word) => `mood ${mood} (${en.moodWords[word]})`,
  moodTitle: "average mood — hover a colonist's mood bar for the reasons",
  saveButton: 'Save',
  loadButton: 'Load',
  loadAutosaveButton: 'Load autosave',
  autosaveTitle: 'the game saves once per in-game day, into its own slot',
  newMapButton: 'New map',
  languageToggleTitle: 'Language',
  soundToggleTitle: 'Sound effects on/off (off by default)',
  worldMapButton: 'World map',

  worldMapTitle: 'World map',
  worldMapSelectIntro: 'Pick a cell to start on, or let the map choose.',
  worldMapViewIntro: 'Where this colony began. Read only - the choice was made at the start.',
  worldMapCloseButton: 'Close',
  worldMapRandomButton: 'Start anywhere',
  worldMapStartButton: 'Start here',
  worldMapPickPrompt: 'Click a cell to see what it holds.',
  worldMapNearbyLabel: 'Nearby peoples',
  worldMapNoTribesNearby: 'No tribe nearby - quiet, but no help either.',
  worldMapTribeHere: (tribeLabel) => `${tribeLabel} territory`,
  worldMapTribeNear: (tribeLabel) => `near ${tribeLabel}`,
  worldMapLegendTitle: 'Biomes',
  worldMapCurrentCellLabel: 'This colony',
  worldMapPreWorldMapNote: 'This save predates the world map; its cell is not on record.',

  ordersGroup: 'Orders',
  buildGroup: 'Build',
  buildCategoryLabels: {
    structure: 'Structure',
    furniture: 'Furniture',
    mana: 'Mana',
    zones: 'Zones',
  },
  animalsGroup: 'Animals',
  toolSelect: 'Select',
  toolSelectHint: 'Select a colonist, then click to move',
  toolChop: 'Chop',
  toolChopHint: 'Designate forest',
  toolMine: 'Mine',
  toolMineHint: 'Designate stone',
  toolDeconstruct: 'Deconstruct',
  toolDeconstructHint: 'Dismantle a finished building and get half the materials back',
  toolClear: 'Clear',
  toolStorage: 'Storage',
  toolStorageHint: 'Storage zone (free)',
  toolPasture: 'Pasture',
  toolPastureHint: 'Pasture zone on grass (free)',
  toolCancel: 'Cancel',
  toolCancelHint: 'Remove blueprints and zone tiles',
  toolHunt: 'Hunt',
  toolHuntHint: 'Mark wild animals to be hunted for meat',
  toolTame: 'Tame',
  toolTameHint: 'Mark wild animals to be tamed (wolves cannot be tamed)',
  toolSlaughter: 'Slaughter',
  toolSlaughterHint: 'Mark tamed animals to be slaughtered',
  toolClearMarks: 'Clear marks',
  costFree: 'free',
  costList: (costs) =>
    costs.map((c) => `${c.quantity} ${EN_RESOURCES[c.type]}`).join(', '),
  buildButtonTitle: (label, cost) => `${label} — ${cost}`,
  lockedHint: (techLabel) => `Requires ${techLabel} research`,
  toolbarHintDrag:
    'Drag to apply a tool over an area. Right-drag or shift-drag pans, wheel zooms; WASD or the arrow keys pan too.',
  toolbarHintKeys:
    'Keys: space pauses, 1/2/3/4 set speed, Esc selects. c chop, m mine, x deconstruct, q clear, b wall, f floor, r door, n bed, v farm, z storage, p pasture, e cancel, h hunt, t tame, k slaughter. A build key also opens its category.',

  panelSelection: 'Selection',
  panelColonist: 'Colonist',
  panelAnimal: 'Animal',
  panelColonists: 'Colonists',
  panelAnimals: 'Animals',
  panelWork: 'Work',
  panelResources: 'Resources',
  panelLog: 'Log',
  panelMap: 'Map',
  panelGoals: 'Next steps',
  clearTitle: 'clear',
  collapseTitle: 'collapse',
  expandTitle: 'expand',

  tileTitle: (x, y) => `Tile ${x}, ${y}`,
  rowSeason: 'Season',
  rowTerrain: 'Terrain',
  rowForage: 'Forage',
  rowOrder: 'Order',
  rowZone: 'Zone',
  rowBuilding: 'Building',
  rowStatus: 'Status',
  rowCost: 'Cost',
  rowCondition: 'Condition',
  rowBerries: 'Berries',
  rowCrop: 'Crop',
  rowItems: 'Items',
  rowAnimal: 'Animal',
  rowHunger: 'Hunger',
  rowDoing: 'Doing',
  rowAge: 'Age',
  rowColonist: 'Colonist',
  impassableSuffix: ' (impassable)',
  zoneStorageAll: (tiles) => `Storage — takes everything, ${tiles} tiles`,
  zoneStorageNone: (tiles) => `Storage — takes nothing, ${tiles} tiles`,
  zoneStorageSome: (resources, tiles) => `Storage — ${resources} only, ${tiles} tiles`,
  zonePasture: (herd, capacity, tiles) =>
    `Pasture — ${herd}/${capacity} animals on ${tiles} tiles`,
  resourceList: (ids) => ids.map((id) => EN_RESOURCES[id]).join(', '),
  blueprintWaiting: (cost) => `waiting for ${cost}`,
  blueprintReady: 'materials delivered, waiting for a builder',
  conditionHp: (current, max) => `${current} / ${max} hp`,
  berriesRipe: 'ripe',
  berriesRipening: (percent) => `ripening (${percent}%)`,
  rowBloom: 'Bloom',
  bloomInFlower: 'in flower',
  bloomOpening: (percent) => `opening (${percent}%)`,
  bloomDormant: (percent) => `${percent}% — dormant until winter`,
  cropNotSown: 'not sown',
  cropReady: 'ready to harvest',
  cropDormant: (percent) => `${percent}% — dormant until spring`,
  cropGrowing: (percent) => `growing (${percent}%)`,
  itemLine: (quantity, resource) => `${quantity} ${EN_RESOURCES[resource]}`,
  itemClaimedSuffix: ' (claimed)',
  itemMealSuffix: ' (meal)',
  animalLine: (name, species, kind) =>
    `${name} — ${EN_SPECIES[species]} (${en.animalKinds[kind]})`,
  ageYoung: 'young',
  agePregnant: 'pregnant',
  acceptsLabel: 'Accepts',
  acceptChipOn: (resource) => `stop hauling ${EN_RESOURCES[resource]} here`,
  acceptChipOff: (resource) => `haul ${EN_RESOURCES[resource]} here`,

  rowName: 'Name',
  rowWhere: 'Where',
  rowHealth: 'Health',
  rowRest: 'Rest',
  rowTrait: 'Trait',
  rowPace: 'Pace',
  rowTitle: 'Title',
  needLine: (value, word) => `${value} — ${en.needWords[word]}`,
  skillMastered: (level) => `${level} — mastered`,
  skillProgress: (level, percent) => `${level} (${percent}% to ${level + 1})`,
  traitLine: (trait) => `${en.traitLabels[trait]} — ${en.traitDescriptions[trait]}`,
  paceLine: (rate, level) => `${rate}x at construction (level ${level})`,
  carrying: (quantity, resource) => `carrying ${quantity} ${EN_RESOURCES[resource]}`,

  moodBarTitle: (mood, word) => `Mood ${mood} — ${en.moodWords[word]}`,
  friendOf: (name) => `friend of ${name}`,
  knowsName: (name) => `knows ${name}`,
  affinityTitle: (value, max) => `affinity ${value} of ${max}`,
  skillTagTitle: (skill, level) => `${EN_SKILLS[skill]} level ${level}`,

  rowKind: 'Kind',
  rowGives: 'Gives',
  rowButchers: 'Butchers for',
  animalName: (name, species) => `${name} the ${enSpecies(species)}`,
  givesLine: (amount, intervalTicks) => `${amount} food every ${intervalTicks} ticks`,
  butchersLine: (amount) => `${amount} food`,

  colWild: 'Wild',
  colTame: 'Tame',
  colMarked: 'Marked',
  colWildTitle: 'wild',
  colTameTitle: 'tamed',
  colMarkedTitle: 'marked for hunting, taming or slaughter',
  findTitle: (species) => `show me a ${enSpecies(species)}`,
  pastureLine: (index, herd, capacity, tiles) =>
    `Pasture ${index}: ${herd}/${capacity} animals on ${tiles} tiles`,
  pastureFullSuffix: ' — full, no new births',
  noPasture: 'No pasture yet: tamed animals need one to settle and breed.',

  manaLabel: 'mana',
  manaGrids: (grids) => `${grids} ${n(grids, 'grid', 'grids')}`,
  manaShort: (short) => `${short} short`,
  storedTotal: (total) => `/ ${total} total`,
  resourceFootnote: 'Bold = in a storage zone, total includes loose stacks.',

  minimapTitle: 'click to jump the camera',
  keyColonist: 'colonist',
  keyPredator: 'predator',
  keyTame: 'tame',
  keyWild: 'wild',

  workColumnTitle: (jobType) =>
    `${en.jobTypeLabels[jobType]} — click to set this column for everyone`,
  priorityDisabled: 'disabled',
  priorityTitle: (value) => `priority ${value}`,
  workFootnote:
    '1 = highest, 3 = lowest, – = will not do this work. Click an icon to set the whole column.',
  assignBySkill: 'Assign by skill',
  assignFootnote:
    'Puts each colonist first in line for the two things they are best at, so specialists do their speciality. The cost is that everything else drops behind it, including work you have just ordered. Nothing is switched off, and columns you have disabled stay disabled.',

  panelTrader: 'Trader',
  rowWho: 'Who',
  rowTradeKind: 'Trade',
  rowLeaves: 'Leaves',
  leavesInHours: (hours) => `in ${hours} ${n(hours, 'hour', 'hours')}`,
  traderSells: (quantity, resource, price) =>
    `Sells: ${quantity} ${EN_RESOURCES[resource]} at ${price} each`,
  traderDeal: (give, take) => `Deal: ${EN_RESOURCES[give]} for ${EN_RESOURCES[take]}`,
  tradeFootnote:
    'Pick what to hand over and what to take. Hauling it there is ordinary haul work, so it competes with everything else on that column.',
  tradeGiveTitle: (give, take) => `hand over ${EN_RESOURCES[give]} for ${EN_RESOURCES[take]}`,
  tradeCallOff: 'Call the deal off',

  panelResearch: 'Research',
  researchCurrentLabel: 'Current',
  researchNoneSelected: 'No tech selected',
  researchProgressLine: (have, want) => `${have} / ${want}`,
  researchAwaitingDelivery: (need) => `Awaiting delivery: ${need}`,
  researchAvailableLabel: 'Available',
  researchUnlockedLabel: 'Unlocked',
  researchNoneUnlocked: 'Nothing unlocked yet',
  researchSelectTitle: (techLabel) => `research ${techLabel}`,
  researchCostLine: (points) => `${points} points`,
  researchUnlocksLine: (buildings) => `unlocks: ${buildings}`,
  researchNoUnlocks: 'unlocks nothing yet',
  researchNeedsDesk: 'Build a research desk to put a chosen tech to work.',

  professionsLabel: 'Set as:',
  professionTitle: (label) => `Set the selected colonist's priorities to ${label}`,
  professionNoSelection: 'Select a colonist first',

  goalSummaryLine: (done, total, season) => `${done}/${total} — ${EN_SEASONS[season]}`,
  goalsDead: 'The colony has died out.',
  goalNext: (label) => ` · next: ${label}`,
  goalsAllDone: ' · all done',

  alertsMore: (count) => `+${count} more`,
  alertJumpTitle: 'show me',
};

// ---------------------------------------------------------------------------
// Japanese
// ---------------------------------------------------------------------------

const JA_RESOURCES: Record<ResourceType, string> = {
  wood: '木材',
  stone: '石材',
  food: '食料',
  manaCrystal: '魔力結晶',
  iron: '鉄',
};

const JA_SPECIES: Record<AnimalSpecies, string> = {
  deer: 'シカ',
  boar: 'イノシシ',
  rabbit: 'ウサギ',
  chicken: 'ニワトリ',
  goat: 'ヤギ',
  wolf: 'オオカミ',
  crystalElk: '晶角鹿',
  rockeater: '岩喰い',
};

const JA_BUILDINGS: Record<BuildingType, string> = {
  wall: '木の壁',
  stoneWall: '石の壁',
  floor: '木の床',
  stoneFloor: '石畳の床',
  door: 'ドア',
  bed: 'ベッド',
  hearth: '炉端',
  farmPlot: '畑',
  berryBush: 'ベリーの茂み',
  storageZoneMarker: '備蓄の標識',
  manaFurnace: '魔導炉',
  manaConduit: '導管',
  manaLamp: '魔力灯',
  manaExtractor: '自動採掘機',
  manaTurret: '防衛タレット',
  tradingPost: '交易柱',
  frostbloom: '霜花',
  table: '食卓',
  stool: '腰掛け',
  dresser: '戸棚',
  armchair: '安楽椅子',
  statue: '石像',
  researchDesk: '研究台',
  workbench: '作業台',
};

const JA_SKILLS: Record<SkillName, string> = {
  chop: '伐採',
  mine: '採掘',
  farm: '農作',
  build: '建築',
  haul: '運搬',
  hunt: '狩猟',
  handle: '世話',
  research: '研究',
  craft: '加工',
};

const JA_TECHS: Record<TechName, string> = {
  woodcraft: '木工の心得',
  stonecarving: '石彫の心得',
  ironwork: '鉄工の基礎',
  crystallography: '晶学の初歩',
};

/** 入植者パネルの肩書き（design-phase12-research.md 4.2）。最高スキルが決める。 */
const JA_TITLES: Record<SkillName, string> = {
  chop: '木こり',
  mine: '坑夫',
  farm: '農夫',
  build: '建築士',
  haul: '運び手',
  hunt: '狩人',
  handle: '世話係',
  research: '研究者',
  craft: '料理人',
};

const JA_SEASONS: Record<Season, string> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
};

function jaSpecies(id: string | number): string {
  return JA_SPECIES[id as AnimalSpecies] ?? String(id);
}

function jaBuilding(id: string | number): string {
  return JA_BUILDINGS[id as BuildingType] ?? String(id);
}

function jaResourceList(joined: string | number): string {
  return String(joined)
    .split(',')
    .map((id) => JA_RESOURCES[id as ResourceType] ?? id)
    .join('・');
}

function jaSpeciesList(joined: string | number): string {
  return String(joined)
    .split(',')
    .map((id) => jaSpecies(id))
    .join('・');
}

const ja: Strings = {
  languageName: '日本語',

  resourceLabels: JA_RESOURCES,
  speciesLabels: JA_SPECIES,
  speciesCounted: (species, count) => `${JA_SPECIES[species]}${count}頭`,
  skillLabels: JA_SKILLS,
  seasonLabels: JA_SEASONS,
  moodWords: { happy: '幸せ', content: '満足', unsettled: '不安定', miserable: '惨め' },
  traitLabels: {
    quickLearner: '飲み込みが早い',
    slowLearner: '飲み込みが遅い',
    industrious: '勤勉',
    unhurried: 'マイペース',
    bigEater: '大食い',
    frugal: '小食',
    heavySleeper: '寝つきがいい',
    restless: '眠りが浅い',
    tough: '頑健',
    frail: '虚弱',
    cheerful: '楽天家',
    gloomy: '悲観的',
    sociable: '社交的',
    private: '人見知り',
  },
  traitDescriptions: {
    quickLearner: '仕事の覚えが人より5割早い。',
    slowLearner: '最後には身につくが、人の倍かかる。',
    industrious: '何をやらせても少し手が早い。腕前とは別物。',
    unhurried: '決して急がない。仕事はちゃんと終わる。',
    bigEater: '人より3割早く腹が減る。',
    frugal: '一食を長持ちさせる。厳しい冬には畑ひとつ分の価値。',
    heavySleeper: '短い眠りでもすっかり回復する。',
    restless: '疲れやすく、眠りも浅い。',
    tough: '大怪我からも半分の時間で立ち直る。',
    frail: '治りが遅い。オオカミには近づけないこと。',
    cheerful: '何事も前向きに捉える。めったに折れない。',
    gloomy: 'つらさを人一倍感じる。早めにベッドを。',
    sociable: '一緒に働く相手とすぐ打ち解ける。',
    private: '自分の殻にこもりがち。打ち解けるには長い冬がいる。',
  },
  terrainLabels: {
    grass: '草地',
    forest: '森',
    stone: '岩壁',
    crystal: '魔力結晶の鉱脈',
    ironVein: '鉄の鉱脈',
  },
  buildingLabels: JA_BUILDINGS,
  designationLabels: {
    chop: '伐採指定',
    mine: '採掘指定',
    deconstruct: '解体指定',
    hunt: '狩猟指定',
    tame: '飼い慣らし指定',
    slaughter: '屠殺指定',
  },
  scenarioLabels: {
    gentle: '守られた谷',
    standard: '開けた平原',
    harsh: '厳しい辺境',
  },
  scenarioDescriptions: {
    gentle: '4人の入植者と8面の畑、豊富な獲物にオオカミは1頭。操作を覚えるのに向く。',
    standard: '設計どおりの植民地。始めるのに足るだけの物資、それ以上はない。',
    harsh: '2人と2面の畑、獲物は少なくオオカミは4頭。最初の冬が試練になる。',
  },
  biomeLabels: {
    meadow: '草原',
    deepwood: '深森',
    crag: '岩尾根',
    manaheath: '晶土',
  },
  biomeDescriptions: {
    meadow: 'バイオーム導入前と同じ生成。どのレバーも曲げていない基準の土地。',
    deepwood: '木もベリーも尽きない代わりに、農地を広げる余地が少ない。',
    crag: '石と鉱石が深く眠る土地。forage は細く、食料は他の手段が要る。',
    manaheath: 'マナが地表に滲む土地。結晶は豊富だが、野生動物は少ない。',
  },
  tribeLabels: {
    lanternfolk: '灯持ち',
    waldkin: '森歩き',
    parched: '渇き衆',
  },
  tribeDescriptions: {
    lanternfolk: '結晶を育て、余剰を商う。近くでは行商の来訪が増える。',
    waldkin: 'マナに頼らず森と獣で暮らす。近くでは移住者が増える。',
    parched: '鉱脈を掘り尽くした流民。近くでは襲撃が重く、頻繁になる。',
  },
  tribeList: (phrases) => phrases.join('・'),
  jobTypeLabels: {
    chop: '伐採',
    mine: '採掘',
    farm: '農作',
    build: '建築',
    haul: '運搬',
    hunt: '狩猟',
    handle: '世話',
    deconstruct: '解体',
    repair: '修理',
    research: '研究',
    craft: '加工',
  },
  techLabels: JA_TECHS,
  titleLabels: JA_TITLES,
  titleColonist: '入植者',
  activityLabels: {
    idle: '手すき',
    eating: '食事中',
    sleeping: '睡眠中',
    walking: '移動中',
    fleeing: '逃走中！',
    brooding: '仕事を拒否',
    wandering: 'ふらつき歩き',
    binge: '食料庫を漁っている',
    fighting: '戦闘中！',
    relaxingHearth: '炉端でひと休み',
    relaxingArmchair: '安楽椅子でひと休み',
    relaxingAlone: 'ひと息ついている',
  },
  animalActivityLabels: {
    idle: 'うろつき',
    grazing: '草を食べている',
    fleeing: '逃走中',
    stalking: '獲物を狙っている',
    attacking: '攻撃中',
    gnawing: '岩をかじっている',
  },
  animalKinds: { tame: '家畜', predator: '肉食獣', wild: '野生' },
  traderKindLabels: { pedlar: '行商人', crystalFactor: '晶商' },
  needWords: { fine: '良好', wanting: '不足', critical: '危険' },

  thoughts: {
    starving: () => '飢えている',
    hungry: () => '空腹',
    wellFed: () => 'よく食べた',
    exhausted: () => '疲労困憊',
    tired: () => '疲れている',
    wellRested: () => 'よく眠れた',
    badlyHurt: () => '重傷',
    inPain: () => '痛みがある',
    sickOfPlace: () => 'この場所にうんざり',
    bored: () => '退屈',
    hadTimeOff: () => '休みを取れた',
    beingHunted: () => '追われている',
    sleepingOnGround: () => '地面で寝ている',
    noBed: () => '自分のベッドがない',
    larderEmpty: () => '食料庫が空',
    larderFull: () => '食料庫が満杯',
    properFloor: () => 'ちゃんとした床の上にいる',
    manaLight: () => '魔力の明かりの下で働ける',
    ateAtTable: () => '食卓で食べた',
    decentMeal: () => 'まともな食事をとった',
    fineStatue: () => '見事な石像がある',
    friendNearby: () => '友人がそばにいる',
    knowsNobody: () => '親しい人がいない',
    grieving: (p) => `${p.name}を悼んでいる`,
    winterDrags: () => '冬が長い',
  },

  alerts: {
    colonyDied: () => '植民地は全滅した。',
    colonistsStarving: (p) => `${p.count}人の入植者が飢えている`,
    noFood: () => '植民地のどこにも食料がない',
    foodLow: (p) => `食料が残り少ない（${p.food}）`,
    colonistsHurt: (p) => `${p.count}人の入植者が重傷を負っている`,
    predatorNear: (p) => `野営地の近くに肉食獣（${jaSpeciesList(p.species)}）`,
    nowhereToStore: (p) =>
      `${jaResourceList(p.resources)}の置き場がない — 落ちた場所に積まれたまま`,
    storageFull: () => '備蓄タイルがすべて満杯 — 次の収穫の行き場がない',
    buildingDamaged: (p) => `${jaBuilding(p.building)}が損傷している（${p.percent}%）`,
    buildingsDamaged: (p) => `${p.count}棟が損傷している（最悪${p.percent}%）`,
    buildingStalled: (p) => `建築が停滞：${jaResourceList(p.resources)}が尽きた`,
    bedsShort: (p) => `${p.count}人にベッドがない — よく休めない`,
    livestockStarving: (p) => `${p.count}頭の家畜が飢えている — 牧草地に何も残っていない`,
    pastureOverCapacity: (p) =>
      `牧草地が定員超過（${p.herd}/${p.capacity}） — 草の回復が追いつかない`,
    jobsAbandoned: (p) => `${p.count}件の仕事が断念された — 到達できない`,
    nothingGrows: (p) => `${JA_SEASONS[p.season as Season]}：作物が育たない`,
    winterClose: () => '冬が近い — 食料を蓄えること',
    furnaceEmpty: (p) =>
      Number(p.count) === 1 ? '魔導炉の結晶が切れている' : `${p.count}基の魔導炉で結晶が切れている`,
    gridDown: (p) =>
      Number(p.count) === 1 ? '魔力グリッドが過負荷 — 需要が供給を超えている' : `${p.count}本の魔力グリッドが過負荷`,
  },

  goalLabels: {
    beds: (p) => `全員にベッドを（${p.have}/${p.want}）`,
    winter: (p) => `冬に備えた蓄え（食料${p.have}/${p.want}）`,
    farm: (p) => `畑を耕す（${p.plots}面）`,
    stone: () => '石を掘り出す',
    wall: () => '囲う価値のあるものを',
    pasture: () => '家畜を放す牧草地を',
    tame: (p) => `自分の家畜を（${p.tame}頭）`,
    filter: () => '倉庫に受け入れ品目を教える',
    research: () => '最初の研究を終える',
    mana: () => 'マナ結晶を掘る',
    light: () => '灯りを点す',
  },
  goalHints: {
    beds: '建設 > ベッド。地面で寝ると休息の回復は半分ほどしかない。',
    winter: '冬には何も育たない。蓄えは残り三つの季節のうちに稼ぐしかない。',
    farm: '建設 > 畑。入植者ひとりに畑一面が回る植民地。それ未満は縮む植民地。',
    stone: '指示 > 採掘で岩壁を。石の壁は建てるのに時間がかかるが、壊すには倍かかる。',
    wall: '建設 > 壁、そこにドアを。動物は取っ手を回せないので、壁とドアが囲いになる。',
    research: '建設 > 研究台を建て、研究パネルでテックを選び、仕事優先度表の列を上げる。',
    pasture: '建設 > 牧草地を草地の上に。広さが頭数の上限を決め、草がそのまま餌になる。',
    tame: '動物 > 飼い慣らしを、シカ・イノシシ・ウサギ・ニワトリに。オオカミは慣れない。',
    filter: '備蓄タイルをクリックして受け入れチップを。壁際に木材置き場、ベッドの隣に食料庫。',
    mana: '指示 > 採掘を、岩の奥の紫の結晶に。灰色の岩壁を掘り進めば露出する。',
    light: '建設 > 魔導炉を魔力灯の隣に。結晶を運び続ければ、灯りが周囲の気分を上げる。',
  },

  status: {
    refusalChop: () => '伐採には森が要る。',
    refusalMine: () => '採掘には岩壁が要る。',
    refusalDeconstruct: () => '解体できるのは完成した建物だけ。',
    refusalBuild: () => 'そこには建てられない：地面が塞がっているか岩盤になっている。',
    refusalLocked: (p) => `${ja.techLabels[p.tech as TechName]}の研究が必要。`,
    refusalStorage: () => '備蓄ゾーンには歩ける更地が要る。',
    refusalPasture: () => '牧草地には草地が要る。',
    refusalTame: () => 'そこに飼い慣らせるものはいない。',
    refusalSlaughter: () => '屠殺できるのは家畜だけ。',
    refusalHunt: () => 'そこに狩れる野生動物はいない。',
    refusalCancel: () => 'そこに取り消せるものはない。',
    assignNoChange: () => '全員すでに最適の持ち場についている。',
    assignDone: () => '腕前に応じて仕事を割り振った。',
    newColony: (p) => `新しい植民地を開始 — ${ja.scenarioLabels[p.scenario as ScenarioName]}。`,
    savedAt: (p) => `tick ${p.tick}でセーブした。`,
    saveFailed: (p) => `セーブに失敗：${p.error}`,
    loadedAt: (p) => `tick ${p.tick}をロードした。`,
    loadFailed: (p) => `ロードに失敗：${p.error}`,
    speciesNone: (p) => `マップに${jaSpecies(p.species)}は残っていない。`,
    speciesFound: (p) => `${jaSpecies(p.species)}の${p.name} — ${p.x}, ${p.y}`,
    pausedAlert: (p) => `一時停止：${ja.alerts[p.alert as AlertKey](p)}`,
  },

  log: {
    legacy: (p) => String(p.text ?? ''),
    colonistArrived: (p) =>
      p.tribe
        ? `${p.name}が植民地の蓄えに惹かれてやってきた — ${ja.tribeLabels[p.tribe as TribeName]}の出という`
        : `${p.name}が植民地の蓄えに惹かれてやってきた`,
    skillLevelUp: (p) => `${p.name}の${JA_SKILLS[p.skill as SkillName]}がレベル${p.level}に達した`,
    seasonArrived: (p) => `${JA_SEASONS[p.season as Season]}が来た`,
    colonistStarving: (p) => `${p.name}が飢えている`,
    colonistCannotFindFood: (p) => `${p.name}は食べ物を見つけられない`,
    breakBrooding: (p) =>
      `${p.name}は我慢の限界だ${p.thought ? `：${ja.thoughts[p.thought as ThoughtKey](p)}` : ''}`,
    breakWandering: (p) =>
      `${p.name}はふらりと歩き去った${p.thought ? `：${ja.thoughts[p.thought as ThoughtKey](p)}` : ''}`,
    breakBinge: (p) =>
      `${p.name}は蓄えを食べ荒らしている${p.thought ? `：${ja.thoughts[p.thought as ThoughtKey](p)}` : ''}`,
    backToWork: (p) => `${p.name}が仕事に戻った`,
    orderedToMove: (p) => `${p.name}に${p.x},${p.y}への移動を指示した`,
    incidentBumperCrop: (p) => `暖かい日が続き、${p.plots}面の畑が一度に実った`,
    incidentBlight: (p) => `病害が${p.plots}面の畑を襲った。作物は台無しだ`,
    incidentBerryGlut: (p) => `森じゅうのベリーが一斉に実った（${p.bushes}株）`,
    incidentWolfPack: (p) => `${p.count}頭のオオカミの群れが森から降りてきた`,
    incidentHerd: (p) =>
      `${ja.speciesCounted(p.species as AnimalSpecies, p.count as number)}の群れが通り過ぎていった`,
    incidentLostSupplies: (p) =>
      `誰かが${JA_RESOURCES[p.resource as ResourceType]}${p.quantity}を近くの道端に置き捨てていった`,
    incidentRaid: (p) => {
      const tribe = p.tribe ? ja.tribeLabels[p.tribe as TribeName] : null;
      if (tribe) {
        return p.count === 1
          ? `${tribe}の襲撃者が森から現れた`
          : `${tribe}の襲撃者${p.count}人が森から現れた`;
      }
      return p.count === 1 ? '襲撃者が森から現れた' : `${p.count}人の襲撃者が森から現れた`;
    },
    raiderCutDownBy: (p) => `襲撃者${p.raider}は${p.colonist}に討ち取られた`,
    raiderCutDownByTurret: (p) => `襲撃者${p.raider}はタレットに撃ち倒された`,
    raidOver: () => '襲撃が終わった',
    raiderRetreats: (p) => `襲撃者${p.raider}は諦めて引き返していく`,
    raiderBreaking: (p) => `襲撃者${p.raider}が${jaBuilding(p.building)}を壊そうとしている`,
    buildingSmashed: (p) => `${p.tile}の${jaBuilding(p.building)}が打ち破られた`,
    furnaceBurnedOut: (p) => `${p.tile}の魔導炉の火が消えた`,
    furnaceStoked: (p) => `${p.tile}の魔導炉に燃料がくべられた`,
    extractorOutOfRock: (p) => `${p.tile}の自動採掘機が掘る岩を失った`,
    // フェーズ10より前の記録には resource が無い。当時は魔力結晶しかありえない
    extractorCutVein: (p) =>
      `${p.tile}の自動採掘機が${JA_RESOURCES[(p.resource as ResourceType) ?? 'manaCrystal']}の鉱脈を掘り当てた`,
    veinCutOpen: (p) =>
      `${p.x}, ${p.y}で${JA_RESOURCES[(p.resource as ResourceType) ?? 'manaCrystal']}の鉱脈が掘り開かれた`,
    buildingRepaired: (p) => `${p.tile}の${jaBuilding(p.building)}が修理された`,
    buildingDismantled: (p) => `${p.tile}の${jaBuilding(p.building)}が解体された`,
    animalTamed: (p) => `${jaSpecies(p.species)}の${p.name}を飼い慣らした`,
    animalTameFailed: (p) => `${jaSpecies(p.species)}の${p.name}は懐かなかった`,
    jobFailed: (p) =>
      `仕事${p.job}（${ja.jobTypeLabels[p.jobType as JobType]}）が失敗：${ja.jobFailReasons[p.reason as JobFailReason]}`,
    colonistStarvedToDeath: (p) => `${p.name}が餓死した`,
    colonistKilledByRaider: (p) => `${p.name}は襲撃者${p.raider}に殺された`,
    colonistKilledByAnimal: (p) => `${p.name}は${jaSpecies(p.species)}に殺された`,
    colonistKilled: (p) => `${p.name}が殺された`,
    colonyDiedOut: () => '植民地は全滅した。',
    boarTurnedOn: (p) => `イノシシの${p.name}が${p.hunter}に牙をむいた`,
    animalTearing: (p) =>
      `${jaSpecies(p.species)}の${p.name}が${jaBuilding(p.building)}を引き裂こうとしている`,
    buildingBrokenOpen: (p) => `${p.tile}の${jaBuilding(p.building)}が食い破られた`,
    animalBorn: (p) => `${jaSpecies(p.species)}の${p.name}が${p.calf}を産んだ`,
    animalHunted: (p) => `${jaSpecies(p.species)}の${p.name}が狩られた`,
    animalSlaughtered: (p) => `${jaSpecies(p.species)}の${p.name}が屠られた`,
    animalStarvedToDeath: (p) => `${jaSpecies(p.species)}の${p.name}が餓死した`,
    animalKilledByPredator: (p) =>
      `${jaSpecies(p.species)}の${p.name}が${jaSpecies(p.predator)}に殺された`,
    wolfSpotted: (p) => `森の際でオオカミが目撃された（${p.name}）`,
    rockeaterExposedVein: (p) => `岩喰いの${p.name}が${p.tile}で魔力結晶の鉱脈をむき出しにした`,
    traderArrived: (p) =>
      `${ja.tribeLabels.lanternfolk}の${ja.traderKindLabels[p.kind as TraderKind]}、${p.name}が交易柱に店を構えた`,
    traderLeft: (p) => `${p.name}は店をたたんで去っていった`,
    tradeSettled: (p) =>
      `${JA_RESOURCES[p.gave as ResourceType]}${p.gaveQuantity}を${JA_RESOURCES[p.took as ResourceType]}${p.tookQuantity}と交換した`,
    researchUnlocked: (p) => `${ja.techLabels[p.tech as TechName]}の研究が完了した`,
    mealsCooked: (p) => `作業台で${p.count}食の料理ができた`,
  },
  jobFailReasons: {
    interrupted: '欲求による中断',
    noWorkSite: '作業場所がない',
    unreachable: '到達できない',
    animalUnreachable: '動物に到達できない',
    itemUnreachable: '資源に到達できない',
    noDestination: '運び先がない',
    blueprintUnreachable: '建設予定地に到達できない',
    destinationGone: '運び先が消えた',
    storageUnreachable: '倉庫に到達できない',
  },

  dayLabel: (day) => `${day}日目`,
  yearLabel: (year) => `${year}年目`,
  seasonDay: (season, day, total) => `${JA_SEASONS[season]} ${day}/${total}`,
  seasonDayTitle: (day, total) => `季節の${day}日目（全${total}日）`,
  tickLabel: (tick) => `tick ${tick}`,
  pauseHint: '一時停止',
  speedHint: (multiplier) => `${multiplier}倍速`,
  speedFastHint: '10倍速 — 1分で1日',
  populationCount: (count) => `入植者${count}人`,
  jobsSummary: (active, queued) => `仕事：進行${active} / 待機${queued}`,
  jobsFailed: (failed) => `失敗${failed}`,
  moodSummary: (mood, word) => `気分 ${mood}（${ja.moodWords[word]}）`,
  moodTitle: '植民地の平均気分 — 理由は入植者の気分バーにカーソルを',
  saveButton: 'セーブ',
  loadButton: 'ロード',
  loadAutosaveButton: '自動セーブをロード',
  autosaveTitle: 'ゲーム内の1日ごとに専用スロットへ自動セーブされる',
  newMapButton: '新しいマップ',
  languageToggleTitle: '言語',
  soundToggleTitle: '効果音のオン/オフ（既定はオフ）',
  worldMapButton: '世界地図',

  worldMapTitle: '世界地図',
  worldMapSelectIntro: '始めるセルを選ぶか、地図に任せる。',
  worldMapViewIntro: 'この植民地が始まった場所。閲覧のみ — 選択は開始時に決まっている。',
  worldMapCloseButton: '閉じる',
  worldMapRandomButton: 'おまかせで始める',
  worldMapStartButton: 'ここで始める',
  worldMapPickPrompt: 'セルをクリックすると、その土地がわかる。',
  worldMapNearbyLabel: '近隣の民',
  worldMapNoTribesNearby: '近くに部族はいない — 静かだが、助けも来ない。',
  worldMapTribeHere: (tribeLabel) => `${tribeLabel}の勢力圏`,
  worldMapTribeNear: (tribeLabel) => `${tribeLabel}が近い`,
  worldMapLegendTitle: 'バイオーム',
  worldMapCurrentCellLabel: 'この植民地',
  worldMapPreWorldMapNote: 'このセーブはワールドマップ導入前のもので、セルの記録がない。',

  ordersGroup: '指示',
  buildGroup: '建設',
  buildCategoryLabels: {
    structure: '構造',
    furniture: '家具',
    mana: '魔力',
    zones: '区域',
  },
  animalsGroup: '動物',
  toolSelect: '選択',
  toolSelectHint: '入植者を選び、クリックで移動させる',
  toolChop: '伐採',
  toolChopHint: '森に伐採を指定する',
  toolMine: '採掘',
  toolMineHint: '岩壁に採掘を指定する',
  toolDeconstruct: '解体',
  toolDeconstructHint: '完成した建物を解体し、資材の半分を取り戻す',
  toolClear: '指定解除',
  toolStorage: '備蓄',
  toolStorageHint: '備蓄ゾーン（無料）',
  toolPasture: '牧草地',
  toolPastureHint: '草地の上の牧草地ゾーン（無料）',
  toolCancel: '取り消し',
  toolCancelHint: '建設予定とゾーンのタイルを取り除く',
  toolHunt: '狩猟',
  toolHuntHint: '野生動物に狩猟の印をつけ、食肉にする',
  toolTame: '飼い慣らし',
  toolTameHint: '野生動物に飼い慣らしの印をつける（オオカミは慣れない）',
  toolSlaughter: '屠殺',
  toolSlaughterHint: '家畜に屠殺の印をつける',
  toolClearMarks: '印を消す',
  costFree: '無料',
  costList: (costs) => costs.map((c) => `${JA_RESOURCES[c.type]}${c.quantity}`).join('、'),
  buildButtonTitle: (label, cost) => `${label} — ${cost}`,
  lockedHint: (techLabel) => `${techLabel}の研究が必要`,
  toolbarHintDrag:
    'ドラッグで範囲にツールを適用。右ドラッグか Shift ドラッグで画面移動、ホイールで拡縮。WASD と矢印キーでも動く。',
  toolbarHintKeys:
    'キー：スペースで一時停止、1/2/3/4 で速度、Esc で選択。c 伐採、m 採掘、x 解体、q 指定解除、b 壁、f 床、r ドア、n ベッド、v 畑、z 備蓄、p 牧草地、e 取り消し、h 狩猟、t 飼い慣らし、k 屠殺。建設のキーはそのカテゴリも開く。',

  panelSelection: '選択中',
  panelColonist: '入植者',
  panelAnimal: '動物',
  panelColonists: '入植者',
  panelAnimals: '動物',
  panelWork: '仕事',
  panelResources: '資源',
  panelLog: '記録',
  panelMap: '地図',
  panelGoals: '次の一手',
  clearTitle: '閉じる',
  collapseTitle: '折りたたむ',
  expandTitle: '開く',

  tileTitle: (x, y) => `タイル ${x}, ${y}`,
  rowSeason: '季節',
  rowTerrain: '地形',
  rowForage: '牧草',
  rowOrder: '指示',
  rowZone: 'ゾーン',
  rowBuilding: '建物',
  rowStatus: '状態',
  rowCost: '費用',
  rowCondition: '耐久',
  rowBerries: 'ベリー',
  rowCrop: '作物',
  rowItems: '資源',
  rowAnimal: '動物',
  rowHunger: '空腹',
  rowDoing: '行動',
  rowAge: '状態',
  rowColonist: '入植者',
  impassableSuffix: '（通行不可）',
  zoneStorageAll: (tiles) => `備蓄 — 何でも受け入れる、${tiles}タイル`,
  zoneStorageNone: (tiles) => `備蓄 — 何も受け入れない、${tiles}タイル`,
  zoneStorageSome: (resources, tiles) => `備蓄 — ${resources}のみ、${tiles}タイル`,
  zonePasture: (herd, capacity, tiles) => `牧草地 — ${tiles}タイルに${herd}/${capacity}頭`,
  resourceList: (ids) => ids.map((id) => JA_RESOURCES[id]).join('・'),
  blueprintWaiting: (cost) => `${cost}を待っている`,
  blueprintReady: '資材は揃った。建築の担い手を待っている',
  conditionHp: (current, max) => `${current} / ${max} hp`,
  berriesRipe: '熟している',
  berriesRipening: (percent) => `熟しつつある（${percent}%）`,
  rowBloom: '開花',
  bloomInFlower: '咲いている',
  bloomOpening: (percent) => `開きつつある（${percent}%）`,
  bloomDormant: (percent) => `${percent}% — 冬まで休眠`,
  cropNotSown: '未播種',
  cropReady: '収穫できる',
  cropDormant: (percent) => `${percent}% — 春まで休眠`,
  cropGrowing: (percent) => `生育中（${percent}%）`,
  itemLine: (quantity, resource) => `${JA_RESOURCES[resource]} ${quantity}`,
  itemClaimedSuffix: '（予約済み）',
  itemMealSuffix: '（調理済み）',
  animalLine: (name, species, kind) =>
    `${name} — ${JA_SPECIES[species]}（${ja.animalKinds[kind]}）`,
  ageYoung: '幼体',
  agePregnant: '妊娠中',
  acceptsLabel: '受け入れ',
  acceptChipOn: (resource) => `${JA_RESOURCES[resource]}をここへ運ぶのをやめる`,
  acceptChipOff: (resource) => `${JA_RESOURCES[resource]}をここへ運ぶ`,

  rowName: '名前',
  rowWhere: '位置',
  rowHealth: '体力',
  rowRest: '休息',
  rowTrait: '特性',
  rowPace: '作業速度',
  rowTitle: '肩書き',
  needLine: (value, word) => `${value} — ${ja.needWords[word]}`,
  skillMastered: (level) => `${level} — 極めた`,
  skillProgress: (level, percent) => `${level}（次のレベルまで${percent}%）`,
  traitLine: (trait) => `${ja.traitLabels[trait]} — ${ja.traitDescriptions[trait]}`,
  paceLine: (rate, level) => `建築で${rate}倍（レベル${level}）`,
  carrying: (quantity, resource) => `${JA_RESOURCES[resource]}${quantity}を運搬中`,

  moodBarTitle: (mood, word) => `気分 ${mood} — ${ja.moodWords[word]}`,
  friendOf: (name) => `${name}の友人`,
  knowsName: (name) => `${name}と顔見知り`,
  affinityTitle: (value, max) => `親密度 ${value} / ${max}`,
  skillTagTitle: (skill, level) => `${JA_SKILLS[skill]} レベル${level}`,

  rowKind: '種別',
  rowGives: '産出',
  rowButchers: '食肉',
  animalName: (name, species) => `${JA_SPECIES[species]}の${name}`,
  givesLine: (amount, intervalTicks) => `${intervalTicks} tickごとに食料${amount}`,
  butchersLine: (amount) => `食料${amount}`,

  colWild: '野生',
  colTame: '家畜',
  colMarked: '指定',
  colWildTitle: '野生の頭数',
  colTameTitle: '飼い慣らした頭数',
  colMarkedTitle: '狩猟・飼い慣らし・屠殺の指定数',
  findTitle: (species) => `${jaSpecies(species)}の居場所を見る`,
  pastureLine: (index, herd, capacity, tiles) =>
    `牧草地${index}：${tiles}タイルに${herd}/${capacity}頭`,
  pastureFullSuffix: ' — 満員。新しい仔は生まれない',
  noPasture: '牧草地がまだない。家畜が落ち着いて繁殖するには牧草地が要る。',

  manaLabel: '魔力',
  manaGrids: (grids) => `${grids}系統`,
  manaShort: (short) => `${short}不足`,
  storedTotal: (total) => `/ 合計${total}`,
  resourceFootnote: '太字は備蓄ゾーン内の量。合計には野積みの山も含む。',

  minimapTitle: 'クリックでカメラを移動',
  keyColonist: '入植者',
  keyPredator: '肉食獣',
  keyTame: '家畜',
  keyWild: '野生',

  workColumnTitle: (jobType) =>
    `${ja.jobTypeLabels[jobType]} — クリックで全員のこの列をまとめて変更`,
  priorityDisabled: '無効',
  priorityTitle: (value) => `優先度${value}`,
  workFootnote:
    '1が最優先、3が最後回し、–はこの仕事をしない。アイコンをクリックすると列全体を変更。',
  assignBySkill: '腕前で割り振る',
  assignFootnote:
    '各入植者を最も得意な2つの仕事の先頭に置き、職人が本業をやるようにする。代償として、指示したばかりの仕事も含めて他のすべてが後回しになる。何も無効にはならず、無効にした列はそのまま。',

  panelTrader: '交易商',
  rowWho: '相手',
  rowTradeKind: '商い',
  rowLeaves: '出発',
  leavesInHours: (hours) => `${hours}時間後`,
  traderSells: (quantity, resource, price) =>
    `販売: ${JA_RESOURCES[resource]}${quantity}（単価${price}）`,
  traderDeal: (give, take) => `取引: ${JA_RESOURCES[give]}を${JA_RESOURCES[take]}に`,
  tradeFootnote:
    '何を渡し、何を受け取るかを決める。持ち込みは通常の運搬仕事なので、他のすべての運搬と取り合いになる。',
  tradeGiveTitle: (give, take) => `${JA_RESOURCES[give]}を渡して${JA_RESOURCES[take]}を受け取る`,
  tradeCallOff: '取引をやめる',

  panelResearch: '研究',
  researchCurrentLabel: '研究中',
  researchNoneSelected: 'テック未選択',
  researchProgressLine: (have, want) => `${have} / ${want}`,
  researchAwaitingDelivery: (need) => `搬入待ち：${need}`,
  researchAvailableLabel: '選択できるテック',
  researchUnlockedLabel: '解禁済み',
  researchNoneUnlocked: 'まだ何も解禁していない',
  researchSelectTitle: (techLabel) => `${techLabel}を研究する`,
  researchCostLine: (points) => `${points}進捗`,
  researchUnlocksLine: (buildings) => `解禁：${buildings}`,
  researchNoUnlocks: '当面は解禁なし',
  researchNeedsDesk: '研究台を建てると、選んだテックに取りかかれる。',

  professionsLabel: '職業:',
  professionTitle: (label) => `選択中の入植者の優先度を${label}にする`,
  professionNoSelection: 'まず入植者を選ぶ',

  goalSummaryLine: (done, total, season) => `${done}/${total} — ${JA_SEASONS[season]}`,
  goalsDead: '植民地は全滅した。',
  goalNext: (label) => ` · 次：${label}`,
  goalsAllDone: ' · すべて達成',

  alertsMore: (count) => `ほか${count}件`,
  alertJumpTitle: '場所を見る',
};

export const STRINGS: Record<Language, Strings> = { en, ja };
