// Raids (design document 11章 フェーズ4).
//
// Everything dangerous so far could be walked away from. A wolf takes what it
// can catch and loses interest; a colonist's answer to it is to run, and the
// player's answer is to send a hunter. Raiders are the first thing that comes
// *for the colony*: they cross the map, they break what is in the way, and they
// do not lose interest until they have had enough.
//
// That forces the two things this phase is for. Somebody has to stand and
// fight, which is the first time a colonist does anything but flee; and the
// mana network finally has something to defend, which is why the turret could
// not have come before phase 2.
//
// The militia is not a new screen. Whoever has the hunting column enabled is
// who goes - the people already told to deal with dangerous animals.
import {
  COLONIST_ATTACK_INTERVAL_TICKS,
  COLONIST_MELEE_DAMAGE,
  DEFEND_RANGE,
  FLEE_DURATION_TICKS,
  MAP_HEIGHT,
  MAP_WIDTH,
  RAIDER_ATTACK_INTERVAL_TICKS,
  RAIDER_DAMAGE,
  RAIDER_HEALTH,
  RAIDER_STRUCTURE_DAMAGE,
  RAID_DURATION_TICKS,
  RAID_LEAVE_GRACE_TICKS,
  TICKS_PER_STEP,
  TURRET_DAMAGE,
  TURRET_INTERVAL_TICKS,
  TURRET_RANGE,
} from './constants';
import type { SimContext } from './derived';
import { killColonist } from './death';
import { isPowered, refreshNetworks } from './mana';
import { chase, chaseRaider } from './movement';
import { fleeStep } from './animals';
import { isWalkable } from './pathfinding';
import { mulberry32 } from './rng';
import { skillLevel } from './skills';
import { addLog, nextId, tileIdOf, updateBuilding, updateColonist, updateTile } from './state';
import type { Colonist, GameState, Raider, RaiderId, Vector2 } from './types';

const RAIDER_NAMES = [
  'Gash',
  'Vole',
  'Kestrel',
  'Bram',
  'Ivy',
  'Crow',
  'Rook',
  'Fen',
  'Sable',
  'Thorn',
];

export function raiderCount(state: GameState): number {
  return Object.keys(state.raiders ?? {}).length;
}

export function isUnderAttack(state: GameState): boolean {
  for (const id in state.raiders ?? {}) {
    if (state.raiders[id].activity.kind !== 'leaving') return true;
  }
  return false;
}

/** Where the colony is, for the raiders to walk at. */
function colonyCentre(state: GameState): Vector2 {
  let x = 0;
  let y = 0;
  let count = 0;
  for (const id in state.colonists) {
    x += state.colonists[id].position.x;
    y += state.colonists[id].position.y;
    count++;
  }
  if (count === 0) return { x: Math.floor(MAP_WIDTH / 2), y: Math.floor(MAP_HEIGHT / 2) };
  return { x: Math.round(x / count), y: Math.round(y / count) };
}

/**
 * Put a band of raiders on an edge of the map.
 *
 * They arrive together on one side rather than surrounding the place: a raid
 * the player can see coming from one direction is a raid they can answer, and
 * the answer is what phase 4 is for.
 */
export function spawnRaid(state: GameState, count: number, rnd: () => number): RaiderId[] {
  const side = Math.floor(rnd() * 4);
  const spawned: RaiderId[] = [];
  for (let i = 0; i < count; i++) {
    let x: number;
    let y: number;
    const along = Math.floor(rnd() * (side < 2 ? MAP_HEIGHT : MAP_WIDTH));
    if (side === 0) [x, y] = [0, along];
    else if (side === 1) [x, y] = [MAP_WIDTH - 1, along];
    else if (side === 2) [x, y] = [along, 0];
    else [x, y] = [along, MAP_HEIGHT - 1];

    // walk inwards to the first tile they can actually stand on
    let steps = 0;
    while (!isWalkable(state, x, y) && steps < MAP_WIDTH) {
      x += side === 0 ? 1 : side === 1 ? -1 : 0;
      y += side === 2 ? 1 : side === 3 ? -1 : 0;
      steps++;
    }
    if (!isWalkable(state, x, y)) continue;

    const id = nextId(state, 'r');
    const raider: Raider = {
      id,
      name: RAIDER_NAMES[Math.floor(rnd() * RAIDER_NAMES.length)],
      position: { x, y },
      path: null,
      pathExpiresAtTick: null,
      health: RAIDER_HEALTH,
      activity: { kind: 'advancing' },
      leavesAtTick: state.tick + RAID_DURATION_TICKS,
    };
    state.raiders = { ...state.raiders, [id]: raider };
    spawned.push(id);
  }
  return spawned;
}

function updateRaider(state: GameState, id: RaiderId, patch: Partial<Raider>): void {
  const raider = state.raiders[id];
  if (!raider) return;
  state.raiders = { ...state.raiders, [id]: { ...raider, ...patch } };
}

function removeRaider(state: GameState, id: RaiderId): void {
  const { [id]: _gone, ...rest } = state.raiders;
  state.raiders = rest;
}

/** Nearest colonist, or null if the colony is empty or everyone is out of reach. */
function nearestColonist(state: GameState, from: Vector2): Colonist | null {
  let best: Colonist | null = null;
  let bestDistance = Infinity;
  for (const id in state.colonists) {
    const colonist = state.colonists[id];
    const distance =
      Math.abs(colonist.position.x - from.x) + Math.abs(colonist.position.y - from.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = colonist;
    }
  }
  return best;
}

/** A structure in the way, so a walled colony is not simply impassable. */
function blockingBuilding(state: GameState, at: Vector2, towards: Vector2): string | null {
  const dx = Math.sign(towards.x - at.x);
  const dy = Math.sign(towards.y - at.y);
  for (const [sx, sy] of [
    [dx, 0],
    [0, dy],
  ]) {
    if (sx === 0 && sy === 0) continue;
    const tile = state.tiles[tileIdOf(at.x + sx, at.y + sy)];
    if (tile && tile.buildingId && !tile.walkable) return tile.buildingId;
  }
  return null;
}

export function damageRaider(
  state: GameState,
  raiderId: RaiderId,
  amount: number,
  by: string,
): void {
  const raider = state.raiders[raiderId];
  if (!raider) return;
  const health = raider.health - amount;
  if (health > 0) {
    updateRaider(state, raiderId, { health });
    return;
  }
  removeRaider(state, raiderId);
  addLog(state, `${raider.name} the raider was cut down by ${by}`, 'incident');
  // anybody who was swinging at them has nothing to swing at
  for (const id in state.colonists) {
    const activity = state.colonists[id].activity;
    if (activity.kind === 'fighting' && activity.raiderId === raiderId) {
      updateColonist(state, id, { activity: { kind: 'none' } });
    }
  }
  if (!isUnderAttack(state)) addLog(state, 'the raid is over', 'incident');
}

/** One tick of every raider on the map. */
export function runRaiders(state: GameState, ctx: SimContext): void {
  for (const id in state.raiders) {
    let raider = state.raiders[id];

    if (state.tick >= raider.leavesAtTick && raider.activity.kind !== 'leaving') {
      updateRaider(state, id, { activity: { kind: 'leaving' } });
      addLog(state, `${raider.name} the raider gives up and turns back`, 'incident');
      // Re-read: the local copy still says 'advancing', and the branch below
      // tests it. Without this they announced giving up on every tick for the
      // rest of the raid - measured at 1,891 announcements in one year - while
      // continuing to attack.
      raider = state.raiders[id];
    }

    if (raider.activity.kind === 'leaving') {
      // walk off the way they came; vanish at the edge
      const centre = colonyCentre(state);
      const away = fleeStep(state, raider.position, centre);
      if (state.tick % TICKS_PER_STEP === 0 && away) {
        updateRaider(state, id, { position: away });
      }
      const at = state.raiders[id].position;
      // Off the edge, or out of patience. The grace period is what stops a
      // raider who cannot find a way out - walled in, or hemmed by rock - from
      // standing on the map for the rest of the game: measured, one raid left
      // stragglers wandering for nearly five thousand ticks.
      const gone =
        at.x <= 0 ||
        at.y <= 0 ||
        at.x >= MAP_WIDTH - 1 ||
        at.y >= MAP_HEIGHT - 1 ||
        state.tick > raider.leavesAtTick + RAID_LEAVE_GRACE_TICKS;
      if (gone) {
        removeRaider(state, id);
        if (!isUnderAttack(state)) addLog(state, 'the raid is over', 'incident');
      }
      continue;
    }

    const target = nearestColonist(state, raider.position);
    if (!target) {
      updateRaider(state, id, { activity: { kind: 'leaving' } });
      continue;
    }

    const distance =
      Math.abs(target.position.x - raider.position.x) +
      Math.abs(target.position.y - raider.position.y);

    if (distance <= 1) {
      updateRaider(state, id, { activity: { kind: 'attacking', targetId: target.id } });
      if (state.tick % RAIDER_ATTACK_INTERVAL_TICKS === 0) {
        strikeColonist(state, target.id, RAIDER_DAMAGE, raider);
      }
      continue;
    }

    // something solid between them and the colony gets taken apart
    const wall = blockingBuilding(state, raider.position, target.position);
    if (wall && state.buildings[wall]) {
      updateRaider(state, id, { activity: { kind: 'breaking', buildingId: wall } });
      if (state.tick % RAIDER_ATTACK_INTERVAL_TICKS === 0) {
        breakStructure(state, ctx, wall, raider);
      }
      continue;
    }

    updateRaider(state, id, { activity: { kind: 'advancing' } });
    chaseRaider(state, ctx, id, target.position);
  }
}

function strikeColonist(
  state: GameState,
  colonistId: string,
  amount: number,
  raider: Raider,
): void {
  const colonist = state.colonists[colonistId];
  if (!colonist) return;
  const health = colonist.health - amount;
  if (health <= 0) {
    killColonist(state, colonistId, `was killed by ${raider.name} the raider`);
    return;
  }
  // A defender keeps their feet. Anyone else runs, exactly as they would from a
  // wolf - the difference is that this one follows.
  const fights = colonist.activity.kind === 'fighting' || defends(colonist);
  updateColonist(state, colonistId, {
    health,
    activity: fights
      ? { kind: 'fighting', raiderId: raider.id }
      : { kind: 'fleeing', fromId: raider.id, untilTick: state.tick + FLEE_DURATION_TICKS },
  });
}

function breakStructure(
  state: GameState,
  ctx: SimContext,
  buildingId: string,
  raider: Raider,
): void {
  const building = state.buildings[buildingId];
  if (!building) return;
  const hpCurrent = building.hpCurrent - RAIDER_STRUCTURE_DAMAGE;
  if (hpCurrent > 0) {
    updateBuilding(state, buildingId, { hpCurrent });
    if (building.hpCurrent === building.hpMax) {
      addLog(state, `${raider.name} the raider is breaking through the ${building.type}`);
    }
    return;
  }
  const tile = state.tiles[building.tileId];
  const { [buildingId]: _gone, ...rest } = state.buildings;
  state.buildings = rest;
  updateTile(state, tile.id, { buildingId: null, designation: null, walkable: true });
  ctx.regionsDirty = true;
  addLog(state, `the ${building.type} at ${tile.id} was smashed open`, 'incident');
}

/** Is this colonist one of the ones who goes to meet a raider? */
export function defends(colonist: Colonist): boolean {
  return (colonist.workPriorities?.hunt ?? 0) > 0;
}

/**
 * The colonists' half of a fight: whoever is on hunting duty goes to meet the
 * nearest raider, and everybody else keeps out of the way.
 */
export function runDefenders(state: GameState, ctx: SimContext): void {
  if (!isUnderAttack(state)) return;
  const centre = colonyCentre(state);

  for (const colonistId in state.colonists) {
    const colonist = state.colonists[colonistId];
    if (colonist.activity.kind === 'fighting') {
      const raider = state.raiders[colonist.activity.raiderId];
      if (!raider) {
        updateColonist(state, colonistId, { activity: { kind: 'none' } });
        continue;
      }
      const distance =
        Math.abs(raider.position.x - colonist.position.x) +
        Math.abs(raider.position.y - colonist.position.y);
      if (distance > 1) {
        chase(state, ctx, colonistId, raider.position, 1);
        continue;
      }
      if (state.tick % COLONIST_ATTACK_INTERVAL_TICKS === 0) {
        // a practised hunter hits harder: the same skill that brings down a boar
        const damage = COLONIST_MELEE_DAMAGE * (1 + skillLevel(colonist, 'hunt') * 0.1);
        damageRaider(state, raider.id, damage, colonist.name);
      }
      continue;
    }

    if (!defends(colonist)) continue;
    // do not pull somebody out of bed or away from a meal to fight
    if (colonist.activity.kind !== 'none' && colonist.activity.kind !== 'moving') continue;

    let nearest: Raider | null = null;
    let bestDistance = Infinity;
    for (const raiderId in state.raiders) {
      const raider = state.raiders[raiderId];
      if (raider.activity.kind === 'leaving') continue;
      const distance =
        Math.abs(raider.position.x - centre.x) + Math.abs(raider.position.y - centre.y);
      if (distance <= DEFEND_RANGE && distance < bestDistance) {
        bestDistance = distance;
        nearest = raider;
      }
    }
    if (!nearest) continue;
    updateColonist(state, colonistId, { activity: { kind: 'fighting', raiderId: nearest.id } });
  }
}

/** Turrets: the mana network's answer, and the reason it had to come first. */
export function runTurrets(state: GameState, ctx: SimContext): void {
  if (state.tick % TURRET_INTERVAL_TICKS !== 0) return;
  if (!isUnderAttack(state)) return;
  const networks = refreshNetworks(ctx, state);

  for (const buildingId in state.buildings) {
    const building = state.buildings[buildingId];
    if (building.type !== 'manaTurret' || building.isBlueprint) continue;
    if (!isPowered(networks, buildingId)) continue;
    const tile = state.tiles[building.tileId];

    let target: Raider | null = null;
    let bestDistance = Infinity;
    for (const raiderId in state.raiders) {
      const raider = state.raiders[raiderId];
      const distance =
        Math.abs(raider.position.x - tile.x) + Math.abs(raider.position.y - tile.y);
      if (distance <= TURRET_RANGE && distance < bestDistance) {
        bestDistance = distance;
        target = raider;
      }
    }
    if (target) damageRaider(state, target.id, TURRET_DAMAGE, 'the turret');
  }
}

/** How many raiders a colony of this size and age has attracted. */
export function raidSize(state: GameState, rnd: () => number): number {
  const population = Object.keys(state.colonists).length;
  return Math.max(1, Math.min(5, Math.round(population / 2 + rnd() * 1.5)));
}

export function raidSeed(state: GameState): () => number {
  return mulberry32(Math.abs(Math.floor(state.worldSeed)) * 17 + state.tick + 90001);
}
