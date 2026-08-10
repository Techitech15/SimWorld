// Incidents.
//
// The world so far only ever does what the rules say every day: crops grow,
// wolves hunt, people arrive when the larder allows. Nothing ever *happens* -
// no year is memorable, and a colony that has solved its food has solved the
// game. This is the smallest version of the design document's story layer: a
// handful of things the world can do to you, weighted by season, rare enough
// that one is an event rather than weather.
//
// Every incident is instantaneous. That is a deliberate constraint rather than
// a simplification: a lasting effect - a blight that suppresses growth for
// three days - would need a field on GameState, a migration, and a rule that
// runs every tick to expire it. An instant effect needs none of those, and the
// colony still has to react to it, which is the part that matters.
import {
  FOOD_PER_HARVEST,
  RAID_FIRST_DAY,
  TICKS_PER_DAY,
  WOOD_PER_TREE,
} from './constants';
import { isUnderAttack, raidSize, spawnRaid } from './raid';
import { perSpan } from './scenario';
import { mulberry32 } from './rng';
import { seasonOf } from './season';
import type { Season } from './season';
import { addLog, updateBuilding } from './state';
import { addItem, createAnimal, findSpawnTile } from './worldgen';
import type { AnimalSpecies, GameState, LogKey, LogParams, Vector2 } from './types';

/** One roll a day, and most days nothing happens. */
export const EVENT_INTERVAL_TICKS = TICKS_PER_DAY;
export const EVENT_CHANCE_PER_DAY = 0.3;
/** Nothing happens in the first days: a colony needs to exist before it is tested. */
export const EVENT_FIRST_TICK = TICKS_PER_DAY * 2;

export type IncidentName =
  | 'bumperCrop'
  | 'blight'
  | 'wolfPack'
  | 'migratingHerd'
  | 'lostSupplies'
  | 'raid'
  | 'berryGlut';

/** What an incident did, as a log key plus its parameters (11章 フェーズ9). */
export interface IncidentReport {
  key: LogKey;
  params?: LogParams;
}

export interface Incident {
  name: IncidentName;
  /** relative likelihood per season; 0 means it cannot happen then */
  weight: Record<Season, number>;
  apply: (state: GameState, rnd: () => number) => IncidentReport | null;
}

function colonyCentre(state: GameState): Vector2 {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const id in state.colonists) {
    sumX += state.colonists[id].position.x;
    sumY += state.colonists[id].position.y;
    count++;
  }
  if (count === 0) return { x: 30, y: 30 };
  return { x: Math.round(sumX / count), y: Math.round(sumY / count) };
}

function sownPlots(state: GameState): string[] {
  const ids: string[] = [];
  for (const id in state.buildings) {
    const building = state.buildings[id];
    if (building.type === 'farmPlot' && !building.isBlueprint && building.sown) ids.push(id);
  }
  return ids;
}

export const INCIDENTS: Incident[] = [
  {
    name: 'bumperCrop',
    weight: { spring: 1, summer: 2, autumn: 3, winter: 0 },
    apply: (state) => {
      const plots = sownPlots(state).filter((id) => state.buildings[id].growth < 1);
      if (plots.length === 0) return null;
      for (const id of plots) updateBuilding(state, id, { growth: 1 });
      return { key: 'incidentBumperCrop', params: { plots: plots.length } };
    },
  },
  {
    name: 'blight',
    weight: { spring: 1, summer: 3, autumn: 1, winter: 0 },
    apply: (state, rnd) => {
      const plots = sownPlots(state).filter((id) => state.buildings[id].growth > 0.1);
      if (plots.length === 0) return null;
      // Never the whole farm: losing everything at once is a punishment,
      // losing half of it is a setback the colony can work through. A coin per
      // plot was not enough - with five plots it takes all five once in thirty
      // two runs - so the count is capped outright.
      const most = Math.max(1, Math.ceil(plots.length / 2));
      const hit = plots.filter(() => rnd() < 0.5).slice(0, most);
      if (hit.length === 0) return null;
      for (const id of hit) updateBuilding(state, id, { growth: 0 });
      return { key: 'incidentBlight', params: { plots: hit.length } };
    },
  },
  {
    name: 'berryGlut',
    weight: { spring: 2, summer: 2, autumn: 2, winter: 0 },
    apply: (state) => {
      const bushes: string[] = [];
      for (const id in state.buildings) {
        const building = state.buildings[id];
        if (building.type === 'berryBush' && building.growth < 1) bushes.push(id);
      }
      if (bushes.length < 4) return null;
      for (const id of bushes) updateBuilding(state, id, { growth: 1 });
      return { key: 'incidentBerryGlut', params: { bushes: bushes.length } };
    },
  },
  {
    name: 'wolfPack',
    weight: { spring: 1, summer: 1, autumn: 2, winter: 4 },
    apply: (state, rnd) => {
      // hungry winter wolves arrive together, over and above what the map keeps
      const camp = colonyCentre(state);
      let arrived = 0;
      for (let i = 0; i < 2; i++) {
        const spot = findSpawnTile(state, rnd, camp, perSpan(state, 22));
        if (!spot) continue;
        createAnimal(state, 'wolf', spot.x, spot.y);
        arrived++;
      }
      if (arrived === 0) return null;
      return { key: 'incidentWolfPack', params: { count: arrived } };
    },
  },
  {
    name: 'migratingHerd',
    weight: { spring: 3, summer: 1, autumn: 3, winter: 0 },
    apply: (state, rnd) => {
      const camp = colonyCentre(state);
      const species: AnimalSpecies = rnd() < 0.5 ? 'deer' : 'rabbit';
      let arrived = 0;
      for (let i = 0; i < 4; i++) {
        const spot = findSpawnTile(state, rnd, camp, perSpan(state, 14));
        if (!spot) continue;
        createAnimal(state, species, spot.x, spot.y);
        arrived++;
      }
      if (arrived === 0) return null;
      return { key: 'incidentHerd', params: { count: arrived, species } };
    },
  },
  {
    name: 'lostSupplies',
    weight: { spring: 1, summer: 1, autumn: 1, winter: 2 },
    apply: (state, rnd) => {
      const camp = colonyCentre(state);
      const spot = findSpawnTile(state, rnd, camp, 3);
      if (!spot) return null;
      const wood = rnd() < 0.5;
      const quantity = wood ? WOOD_PER_TREE : FOOD_PER_HARVEST * 2;
      addItem(state, wood ? 'wood' : 'food', quantity, spot.x, spot.y);
      return { key: 'incidentLostSupplies', params: { quantity, resource: wood ? 'wood' : 'food' } };
    },
  },

  /**
   * The one incident that comes for the colony rather than happening to it
   * (11章 フェーズ4). Held back until day 8: a colony with no walls, no hunter
   * and three people is not a story, it is a wipe.
   */
  {
    name: 'raid',
    // Weighted well above the other incidents. Measured at parity with them,
    // two of three worlds went a whole year without a single raid - and a
    // defence layer nobody ever needs is a set of buildings nobody builds. The
    // gate on day 8 is what keeps that from being punishing.
    weight: { spring: 3, summer: 3.5, autumn: 4, winter: 3.5 },
    apply: (state, rnd) => {
      if (state.tick < RAID_FIRST_DAY * TICKS_PER_DAY) return null;
      if (isUnderAttack(state)) return null;
      const spawned = spawnRaid(state, raidSize(state, rnd), rnd);
      if (spawned.length === 0) return null;
      return { key: 'incidentRaid', params: { count: spawned.length } };
    },
  },
];

/** Pick by season weight. Returns null when nothing can happen this season. */
export function chooseIncident(season: Season, roll: number): Incident | null {
  const total = INCIDENTS.reduce((sum, incident) => sum + incident.weight[season], 0);
  if (total <= 0) return null;
  let cursor = roll * total;
  for (const incident of INCIDENTS) {
    cursor -= incident.weight[season];
    if (cursor < 0) return incident;
  }
  return INCIDENTS[INCIDENTS.length - 1];
}

/**
 * One roll a day. Like everything else the randomness comes from the tick, so
 * replaying a save gives the same year - an incident is part of the world, not
 * of the session that happened to be running.
 */
export function runIncidents(state: GameState): void {
  if (state.tick < EVENT_FIRST_TICK) return;
  if (state.tick % EVENT_INTERVAL_TICKS !== 0) return;
  if (Object.keys(state.colonists).length === 0) return;

  // The world as well as the tick: seeding from the tick alone is reproducible
  // - which is the point - but it also means every colony ever started gets the
  // same good and bad years in the same order, including the same quiet
  // fortnight at the beginning. Measured over 400 days the rate is right
  // either way (122 fires in 400 at three in ten); what the world seed buys is
  // that two colonies do not share a calendar.
  const rnd = mulberry32(state.worldSeed * 31 + state.tick + 51001);
  if (rnd() >= EVENT_CHANCE_PER_DAY) return;

  const incident = chooseIncident(seasonOf(state.tick), rnd());
  if (!incident) return;
  const report = incident.apply(state, rnd);
  if (report) addLog(state, report.key, report.params, 'incident');
}
