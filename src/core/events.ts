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
  ILLNESS_ONSET_TICKS,
  RAID_FIRST_DAY,
  RAID_WARNING_TICKS,
  TICKS_PER_DAY,
  WOOD_PER_TREE,
} from './constants';
import { MOOD_BASE, colonyMood } from './mood';
import { isUnderAttack, raidSize } from './raid';
import { perSpan } from './scenario';
import { mulberry32 } from './rng';
import { seasonOf } from './season';
import type { Season } from './season';
import { addLog, updateBuilding, updateColonist } from './state';
import { tribalInfluence } from './tribes';
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
  | 'berryGlut'
  | 'illness';

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
   * Illness (11章 フェーズ14 段階 M-1, docs/design-phase14-water-medicine.md
   * 5章). No new probability machine: it is another row in this same table,
   * picked by the same season-weighted roll as everything else here. Its own
   * weight climbs in winter, the season every other health cost in the game
   * already leans on (`winterDrags`, the forage curve, frostbloom). The
   * *rate* the season weight is scaled against - how likely a struggling
   * colony is to catch it at all - is `illnessWeightMultiplier` below, which
   * reads the mood and hunger the colony already has rather than rolling a
   * second time for them (design doc: "頻度は既存の乗数（季節・気分・空腹）
   * を引く").
   *
   * One already-healthy colonist is picked uniformly - not the unhappiest or
   * hungriest one - which is what keeps this from reading as a second, quieter
   * mood system: who is picked is chance, only whether anyone is picked at all
   * answers to the colony's condition.
   */
  {
    name: 'illness',
    weight: { spring: 1, summer: 0.6, autumn: 1, winter: 1.6 },
    apply: (state, rnd) => {
      const eligible = Object.keys(state.colonists).filter(
        (id) => (state.colonists[id].illnessTicks ?? 0) <= 0,
      );
      if (eligible.length === 0) return null;
      const patientId = eligible[Math.floor(rnd() * eligible.length)];
      updateColonist(state, patientId, { illnessTicks: ILLNESS_ONSET_TICKS });
      return { key: 'incidentIllness', params: { name: state.colonists[patientId].name } };
    },
  },

  /**
   * The one incident that comes for the colony rather than happening to it
   * (11章 フェーズ4). Held back until day 8: a colony with no walls, no hunter
   * and three people is not a story, it is a wipe.
   *
   * Since 段階 R-1 (issue #29) this only *schedules* the raid on
   * `state.pendingRaid` - it never spawns a raider itself. The size is rolled
   * and frozen right here, the moment the warning goes out, so what the
   * player is warned about is exactly what shows up (CLAUDE.md: 予告と実際の
   * 食い違いは最悪の裏切り). `raid.ts`'s `runPendingRaid` is what turns the
   * schedule into raiders once `atTick` arrives, and that is also where the
   * `incidentRaid` log line and chronicle entry are written - not here, since
   * nothing has actually happened to the colony yet when this fires.
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
      // Do not double-book a second raid on top of a warning that is already
      // running: one incoming raid at a time, exactly as `isUnderAttack`
      // already keeps one *active* raid at a time above.
      if (state.pendingRaid) return null;
      // Raiders are the Parched's raid (11章 段階C, design-phase11-worldmap.md
      // 4.1章) whether or not this world happens to be near their territory -
      // proximity only bends the size, not who they are.
      const tribal = tribalInfluence(state);
      const size = raidSize(state, rnd, tribal.parched.raidSizeMultiplier);
      state.pendingRaid = { atTick: state.tick + RAID_WARNING_TICKS, size, tribe: 'parched' };
      // No report: the warning itself is not a log line (CLAUDE.md 「予告まで
      // 入れると密度が変わる」 for the chronicle applies to the log too here) -
      // it surfaces only as the `raidWarning` alert (src/core/alerts.ts) until
      // the raid actually arrives.
      return null;
    },
  },
];

/**
 * How likely the colony is to catch something, on top of the season
 * (フェーズ14 段階 M-1). Reuses two numbers the game already keeps -
 * `colonyMood` and each colonist's own `needs.hunger` - rather than adding a
 * third roll: a colony eating well and sleeping soundly sits at 1 (no more
 * likely than the season weight alone says), and a hungry or miserable one
 * climbs from there. Population is folded in too - more people is more
 * chances for one of them to fall ill, the same reasoning the design doc's
 * "1人あたり20日に1回" starting point is stated in.
 */
function illnessWeightMultiplier(state: GameState): number {
  const colonists = Object.values(state.colonists);
  if (colonists.length === 0) return 0;
  const avgHunger = colonists.reduce((sum, c) => sum + c.needs.hunger, 0) / colonists.length;
  const mood = colonyMood(state);
  const hungerFactor = 1 + Math.max(0, avgHunger - 30) / 70;
  const moodFactor = 1 + Math.max(0, MOOD_BASE - mood) / 50;
  return colonists.length * hungerFactor * moodFactor;
}

/**
 * Pick by season weight. Returns null when nothing can happen this season.
 *
 * `weightMultiplier` bends one or more incidents' weight before the roll -
 * the Parched-proximity lever on `raid` (11章 段階C, design-phase11-worldmap.md
 * 7章: shorter interval near their territory). Omitted, every incident keeps
 * its plain season weight, exactly as before this existed.
 */
export function chooseIncident(
  season: Season,
  roll: number,
  weightMultiplier: Partial<Record<IncidentName, number>> = {},
): Incident | null {
  const weightOf = (incident: Incident) => incident.weight[season] * (weightMultiplier[incident.name] ?? 1);
  const total = INCIDENTS.reduce((sum, incident) => sum + weightOf(incident), 0);
  if (total <= 0) return null;
  let cursor = roll * total;
  for (const incident of INCIDENTS) {
    cursor -= weightOf(incident);
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

  const tribal = tribalInfluence(state);
  const incident = chooseIncident(seasonOf(state.tick), rnd(), {
    raid: tribal.parched.raidWeightMultiplier,
    illness: illnessWeightMultiplier(state),
  });
  if (!incident) return;
  const report = incident.apply(state, rnd);
  // A picked 'raid' always returns null here - it only ever schedules
  // `state.pendingRaid` (see the incident's own comment above). Its log line
  // and chronicle entry are written later, in raid.ts's `runPendingRaid`, at
  // the tick raiders actually arrive - which is also the only place any
  // incident's start is recorded in the chronicle (issue #28); the rest (a
  // bumper crop, a blight, a wolf pack) are weather, not a story beat.
  if (!report) return;
  addLog(state, report.key, report.params, 'incident');
}
