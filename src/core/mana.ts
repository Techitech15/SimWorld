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
import { TICKS_PER_DAY } from './constants';
import type { SimContext } from './derived';
import { addLog, updateBuilding } from './state';
import type { Building, BuildingId, BuildingType, GameState, TileId } from './types';

/** Mana a working furnace puts on its network. */
export const MANA_OUTPUT: Partial<Record<BuildingType, number>> = {
  manaFurnace: 10,
};

/** Mana a building draws while it is running. */
export const MANA_DRAW: Partial<Record<BuildingType, number>> = {
  manaLamp: 3,
};

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

export function isManaBuilding(type: BuildingType): boolean {
  return type === 'manaFurnace' || type === 'manaConduit' || type === 'manaLamp';
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
export function runMana(state: GameState, ctx: SimContext): void {
  const networks = refreshNetworks(ctx, state);
  if (networks.grids.length === 0) return;

  for (const grid of networks.grids) {
    if (grid.demand <= 0 || !grid.powered) continue;
    for (const id of grid.buildingIds) {
      const building = state.buildings[id];
      if (!building || !((MANA_OUTPUT[building.type] ?? 0) > 0)) continue;
      if (!(building.manaFuel > 0)) continue;
      const manaFuel = building.manaFuel - 1;
      updateBuilding(state, id, { manaFuel });
      if (manaFuel === 0) {
        addLog(state, `the mana furnace at ${building.tileId} has burned out`);
        // its supply just left the grid
        invalidateNetworks(ctx);
      }
    }
  }
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
