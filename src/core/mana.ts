// The mana layer (design document 11章 フェーズ2).
//
// Phase 2 exists to develop the optimisation puzzle: the colony gains a second
// constraint that is not "do you have the materials" but "can you keep it
// supplied". A furnace burns crystal to put mana on a network; a conduit is how
// the network reaches anywhere; a lamp spends what the furnace makes.
//
// Two decisions shape everything here.
//
// **The network is derived, never stored.** It is exactly the shape the region
// labels already have - a connected-component labelling that only changes when
// a building appears or disappears - so it lives in SimContext beside them,
// gets rebuilt on a dirty flag, and never enters a save. A stored network is a
// network that can disagree with the buildings it claims to connect.
//
// **Output and draw are per type, not per building.** The design document lists
// them as fields on `Building`; they are tables here for the same reason build
// costs are tables: they are properties of the kind of thing rather than of one
// instance, and a saved copy of a rule is a copy that can drift from the rule.
// The one genuinely per-building number - how much fuel is left in this furnace
// - *is* on the building, and is saved.
import { TICKS_PER_DAY, veinYieldOf } from './constants';
import type { SimContext } from './derived';
import { addLog, isRock, updateBuilding, updateTile } from './state';
import { addItem } from './worldgen';
import type { Building, BuildingId, BuildingType, GameState, Tile, TileId } from './types';

/** Mana a working furnace puts on its network. */
export const MANA_OUTPUT: Partial<Record<BuildingType, number>> = {
  manaFurnace: 10,
};

/** Mana a building draws while it is running. */
export const MANA_DRAW: Partial<Record<BuildingType, number>> = {
  manaLamp: 3,
  // most of a furnace. One furnace runs one extractor, or three lamps - that
  // choice is the phase-2 puzzle in its smallest form
  manaExtractor: 8,
  // the turret is why the network was worth building (11章 フェーズ4). It draws
  // less than the extractor so a colony can defend itself without shutting the
  // quarry down - but two turrets and an extractor will not fit on one furnace.
  manaTurret: 6,
};

/**
 * Ticks of powered running to cut one rock tile.
 *
 * A colonist does it in 60 ticks of work, but has to walk there, is interrupted
 * by meals and sleep, and could have been doing something else. The extractor
 * is far slower per rock and never stops - and it costs a furnace's whole
 * output plus the crystal to keep that furnace lit. What the player is buying
 * is not speed, it is labour.
 */
export const EXTRACTOR_TICKS_PER_ROCK = 500;

/**
 * One crystal burns for this long. Two thirds of a day, so a single furnace
 * needs feeding more than once a day and a colony that stops hauling notices
 * before the next morning.
 */
export const BURN_TICKS_PER_CRYSTAL = Math.round(TICKS_PER_DAY * 0.66);

/** Crystals a furnace takes in one delivery. */
export const FURNACE_FUEL_BATCH = 3;

/** Below this many ticks of burn, a furnace asks for more. */
export const FURNACE_REFUEL_AT = BURN_TICKS_PER_CRYSTAL;

/** The most fuel a furnace will hold. */
export const FURNACE_FUEL_MAX = BURN_TICKS_PER_CRYSTAL * FURNACE_FUEL_BATCH;

/** How far from a lamp its light reaches, in tiles. */
export const LAMP_RADIUS = 6;

/**
 * Is this building part of the network?
 *
 * Derived from the same tables that give the numbers, rather than listed by
 * hand: anything that supplies or draws is on the grid, and the conduit is the
 * one member that does neither. The hand-written version of this was the first
 * thing to break when the extractor was added - it was on the map, drawing
 * nothing, connected to nothing, and silent about it. A membership rule that
 * has to be updated separately from the thing it describes will be forgotten.
 */
export function isManaBuilding(type: BuildingType): boolean {
  return type === 'manaConduit' || type in MANA_OUTPUT || type in MANA_DRAW;
}

export function manaOutputOf(building: Building): number {
  if (building.isBlueprint) return 0;
  // an unfuelled furnace is a cold furnace: it is on the network and supplies
  // nothing, which is the state the player has to notice and fix
  if (!(building.manaFuel > 0)) return 0;
  return MANA_OUTPUT[building.type] ?? 0;
}

export function manaDrawOf(building: Building): number {
  if (building.isBlueprint) return 0;
  return MANA_DRAW[building.type] ?? 0;
}

/**
 * One connected run of mana buildings, and what it adds up to.
 *
 * `powered` is all-or-nothing on purpose. A network that browns out partially
 * would need a rule for who gets cut first, and the player would be reading a
 * per-building state to find out what happened; a fuse that trips is one fact
 * they can see and act on - build another furnace, or take something off the
 * line.
 */
export interface ManaGrid {
  id: number;
  buildingIds: BuildingId[];
  supply: number;
  demand: number;
  powered: boolean;
}

export interface ManaNetworks {
  /** buildingId -> the grid it belongs to */
  gridOf: Record<BuildingId, number>;
  grids: ManaGrid[];
}

export const EMPTY_NETWORKS: ManaNetworks = { gridOf: {}, grids: [] };

function tileKey(x: number, y: number): TileId {
  return `${x},${y}`;
}

/**
 * Label every run of touching mana buildings, then total each run. Cost is
 * proportional to the number of mana buildings, not to the map, so a colony
 * with no furnace pays almost nothing for having the layer available.
 */
export function buildNetworks(state: GameState): ManaNetworks {
  const byTile: Record<TileId, BuildingId> = {};
  const members: BuildingId[] = [];
  for (const id in state.buildings) {
    const building = state.buildings[id];
    if (!isManaBuilding(building.type) || building.isBlueprint) continue;
    byTile[building.tileId] = id;
    members.push(id);
  }
  if (members.length === 0) return EMPTY_NETWORKS;

  const gridOf: Record<BuildingId, number> = {};
  const grids: ManaGrid[] = [];
  for (const start of members) {
    if (gridOf[start] !== undefined) continue;
    const id = grids.length;
    const buildingIds: BuildingId[] = [];
    let supply = 0;
    let demand = 0;
    const queue = [start];
    gridOf[start] = id;
    while (queue.length > 0) {
      const current = queue.pop()!;
      const building = state.buildings[current];
      buildingIds.push(current);
      supply += manaOutputOf(building);
      demand += manaDrawOf(building);
      const tile = state.tiles[building.tileId];
      if (!tile) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const neighbour = byTile[tileKey(tile.x + dx, tile.y + dy)];
        if (neighbour === undefined || gridOf[neighbour] !== undefined) continue;
        gridOf[neighbour] = id;
        queue.push(neighbour);
      }
    }
    grids.push({ id, buildingIds, supply, demand, powered: demand === 0 || supply >= demand });
  }
  return { gridOf, grids };
}

/**
 * Bring the grids up to date if a building has changed since they were last
 * worked out.
 *
 * This lives here rather than in derived.ts, with SimContext imported as a type
 * only, so the dependency runs one way: derived.ts knows what a network is,
 * mana.ts does not need derived.ts to exist at run time. The two modules
 * importing each other's values worked until the first one to initialise
 * reached for the other's constant.
 */
export function refreshNetworks(ctx: SimContext, state: GameState): ManaNetworks {
  if (ctx.networksDirty || ctx.networksFrom !== state) {
    ctx.networks = buildNetworks(state);
    ctx.networksDirty = false;
    ctx.networksFrom = state;
  }
  return ctx.networks;
}

/** A mana building appeared, was finished, or was destroyed. */
export function invalidateNetworks(ctx: SimContext): void {
  ctx.networksDirty = true;
}

export function gridFor(networks: ManaNetworks, buildingId: BuildingId): ManaGrid | undefined {
  const id = networks.gridOf[buildingId];
  return id === undefined ? undefined : networks.grids[id];
}

/** Is this building currently getting the mana it draws? */
export function isPowered(networks: ManaNetworks, buildingId: BuildingId): boolean {
  const grid = gridFor(networks, buildingId);
  return !!grid && grid.powered && grid.demand > 0;
}

/** The colony's mana at a glance, for the resource panel. */
export function manaSummary(networks: ManaNetworks): {
  grids: number;
  supply: number;
  demand: number;
  short: number;
} {
  let supply = 0;
  let demand = 0;
  let short = 0;
  for (const grid of networks.grids) {
    supply += grid.supply;
    demand += grid.demand;
    if (!grid.powered) short++;
  }
  return { grids: networks.grids.length, supply, demand, short };
}

/**
 * One tick of the mana layer: burn fuel where it is being spent.
 *
 * A furnace only burns when something on its grid is drawing. An idle network
 * costs nothing, so a player who builds ahead of demand is not punished for
 * planning - and a lamp switched off by a fuse stops eating crystal too, which
 * is what makes running short recoverable rather than a spiral.
 */
export function runMana(state: GameState, ctx: SimContext): TileId[] {
  const networks = refreshNetworks(ctx, state);
  if (networks.grids.length === 0) return [];

  // Cutting rock out changes walkability, which the caller has to tell the
  // derived caches about. It is handed back rather than done here so this
  // module keeps only a *type* dependency on derived.ts - the two importing
  // each other's values is the cycle that broke once already.
  const changed = runExtractors(state, networks);

  for (const grid of networks.grids) {
    if (grid.demand <= 0 || !grid.powered) continue;
    for (const id of grid.buildingIds) {
      const building = state.buildings[id];
      if (!building || !((MANA_OUTPUT[building.type] ?? 0) > 0)) continue;
      if (!(building.manaFuel > 0)) continue;
      const manaFuel = building.manaFuel - 1;
      updateBuilding(state, id, { manaFuel });
      if (manaFuel === 0) {
        addLog(state, 'furnaceBurnedOut', { tile: building.tileId });
        // its supply just left the grid
        invalidateNetworks(ctx);
      }
    }
  }
  return changed;
}

/**
 * How far an extractor reaches. Nearest rock first, so it eats outwards.
 *
 * This started as adjacency only, on the theory that a machine reaching across
 * the map would remove the decision of where to put it. Four tiles is what
 * adjacency actually buys - 80 stone - against 30 stone, 15 wood, a furnace and
 * the crystal to keep it lit, after which the thing is dead weight the player
 * has to dismantle. Nobody would build it twice. Three tiles of reach gives it
 * up to two dozen faces to work, which is a machine worth paying for, while
 * still making "which rock face do I park it against" a real question.
 */
export const EXTRACTOR_RADIUS = 3;

/** The rock an extractor is working on: the nearest solid face within reach. */
export function extractorTarget(state: GameState, building: Building): Tile | null {
  const here = state.tiles[building.tileId];
  if (!here) return null;
  let best: Tile | null = null;
  let bestDistance = Infinity;
  for (let dy = -EXTRACTOR_RADIUS; dy <= EXTRACTOR_RADIUS; dy++) {
    for (let dx = -EXTRACTOR_RADIUS; dx <= EXTRACTOR_RADIUS; dx++) {
      const distance = Math.abs(dx) + Math.abs(dy);
      if (distance === 0 || distance > EXTRACTOR_RADIUS || distance >= bestDistance) continue;
      const tile = state.tiles[tileKey(here.x + dx, here.y + dy)];
      if (!tile || !isRock(tile.terrain)) continue;
      best = tile;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Run every powered extractor for one tick.
 *
 * Returns the tiles whose walkability changed, because cutting rock out is the
 * same event as a colonist mining it: regions go stale and cached paths through
 * it do not.
 */
function runExtractors(state: GameState, networks: ManaNetworks): TileId[] {
  const changed: TileId[] = [];
  for (const id in state.buildings) {
    const building = state.buildings[id];
    if (building.type !== 'manaExtractor' || building.isBlueprint) continue;
    if (!isPowered(networks, id)) continue;

    const target = extractorTarget(state, building);
    if (!target) {
      // nothing left to cut. Say so once, rather than leaving the player to
      // notice that a building they paid for is quietly drawing mana for nothing
      if (building.manaProgress !== -1) {
        updateBuilding(state, id, { manaProgress: -1 });
        addLog(state, 'extractorOutOfRock', { tile: building.tileId });
      }
      continue;
    }

    const progress = Math.max(0, building.manaProgress) + 1;
    if (progress < EXTRACTOR_TICKS_PER_ROCK) {
      updateBuilding(state, id, { manaProgress: progress });
      continue;
    }

    updateBuilding(state, id, { manaProgress: 0 });
    // the same VEIN_YIELD the mine job reads: the machine and the colonist
    // agree about what a face is worth by construction
    const yielded = veinYieldOf(target.terrain);
    updateTile(state, target.id, { terrain: 'grass', designation: null, walkable: true });
    // the yield lands on the machine's own tile, where the haul chain finds it
    const at = state.tiles[building.tileId];
    addItem(state, yielded.resource, yielded.quantity, at.x, at.y);
    if (yielded.resource !== 'stone') {
      addLog(state, 'extractorCutVein', { tile: building.tileId, resource: yielded.resource });
    }
    changed.push(target.id);
  }
  return changed;
}

/** Does this furnace want a delivery? Used by the job generator. */
export function wantsFuel(building: Building): boolean {
  return (
    !building.isBlueprint &&
    building.type === 'manaFurnace' &&
    (building.manaFuel ?? 0) <= FURNACE_REFUEL_AT - BURN_TICKS_PER_CRYSTAL
  );
}

/**
 * Take a delivery of crystal into the furnace, and say how many it could not
 * hold. The caller puts the rest back on the ground: crystal is the scarcest
 * thing on the map, and quietly deleting the overflow would be the game taking
 * it away for a mistake the player cannot see.
 */
export function refuel(state: GameState, buildingId: BuildingId, crystals: number): number {
  const building = state.buildings[buildingId];
  if (!building) return crystals;
  const room = Math.max(0, FURNACE_FUEL_MAX - (building.manaFuel ?? 0));
  const accepted = Math.min(crystals, Math.floor(room / BURN_TICKS_PER_CRYSTAL));
  if (accepted > 0) {
    updateBuilding(state, buildingId, {
      manaFuel: (building.manaFuel ?? 0) + accepted * BURN_TICKS_PER_CRYSTAL,
    });
  }
  return crystals - accepted;
}
