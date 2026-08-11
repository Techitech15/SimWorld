// Map generation: one 60x60 map with grass / forest / stone (section 9).
import {
  BERRY_BUSH_COUNT,
  DEFAULT_MAP_HEIGHT,
  DEFAULT_MAP_WIDTH,
  FROSTBLOOM_COUNT,
  HERB_COUNT,
  BUILDING_HP,
  COLONIST_COLORS,
  COLONIST_MAX_HEALTH,
  COLONIST_NAMES,
  RESOURCE_TYPES,
  SPECIES,
  STACK_MAX,
} from './constants';
import { mulberry32, valueNoise2D } from './rng';
import { DEFAULT_SCENARIO, SCENARIOS, perArea, scaledCount, scenarioOf } from './scenario';
import type { ScenarioName } from './scenario';
import { BIOMES, DEFAULT_BIOME, biomeOf } from './biome';
import type { BiomeName } from './biome';
import { cellSeed, worldBiomeAt } from './worldmap';
import { rollStartingSkills } from './skills';
import { rollTraits } from './traits';
import { createEmptyState, manhattan, nextId, own, tileIdOf, updateTile, isRock, isWater } from './state';
import { JOB_TYPES } from './types';
import type {
  Animal,
  AnimalSpecies,
  Building,
  BuildingType,
  Colonist,
  GameState,
  Item,
  JobType,
  ResourceType,
  Tile,
  TileId,
  Zone,
} from './types';

export interface WorldOptions {
  seed?: number;
  /** Starting stock dropped into the storage zone; overrides the scenario's. */
  startingResources?: Partial<Record<ResourceType, number>>;
  /** Which opening to generate (src/core/scenario.ts). Defaults to standard. */
  scenario?: ScenarioName;
  /**
   * Which land to generate (src/core/biome.ts, 11章 フェーズ11 段階A). Ignored
   * when `worldCell` is given - stage B derives the biome from the cell
   * instead (design-phase11-worldmap.md 6章). Defaults to meadow, which
   * reproduces the generator's pre-biome behaviour exactly (bar the crystal
   * floor topping up a thin-tail world).
   */
  biome?: BiomeName;
  /**
   * Which world-map cell to generate on (11章 フェーズ11 段階B,
   * docs/design-phase11-worldmap.md). When given, the local map's own seed is
   * derived from `seed` (the world seed) and this cell rather than used
   * directly (2.2章), and `biome` above is overridden with the cell's own
   * biome. Omitted entirely, generation behaves exactly as it did before the
   * world map existed - `seed` generates the map directly and `biome` (or
   * meadow) picks its rules, with `state.worldCell` left `null`.
   */
  worldCell?: { x: number; y: number };
  /** [ext] How big a map to make (docs/design-phase6-space.md 3.1). */
  width?: number;
  height?: number;
}

function makeTile(x: number, y: number, terrain: Tile['terrain']): Tile {
  return {
    id: tileIdOf(x, y),
    x,
    y,
    terrain,
    // deep water is the only terrain that is neither rock nor walkable -
    // shallow water is walkable ground (フェーズ14 段階 W-1 2.1)
    walkable: !isRock(terrain) && terrain !== 'deepWater',
    buildingId: null,
    itemIds: [],
    designation: null,
    // only grass carries grazeable growth; it starts fully grown
    forage: terrain === 'grass' ? 1 : 0,
  };
}

function defaultPriorities(): Record<JobType, number> {
  const table = {} as Record<JobType, number>;
  // research starts at the lowest priority too (design-phase12-research.md
  // 2.2): a colonist should never drift to the desk before the player has
  // built one, picked a tech, and raised this column on purpose
  for (const t of JOB_TYPES) table[t] = t === 'haul' || t === 'research' || t === 'craft' ? 3 : 2;
  return table;
}

export function addBuilding(
  state: GameState,
  type: BuildingType,
  tileId: string,
  options: {
    isBlueprint?: boolean;
    requiredResources?: Building['requiredResources'];
  } = {},
): Building {
  const id = nextId(state, 'b');
  const isBlueprint = options.isBlueprint ?? false;
  const building: Building = {
    id,
    type,
    tileId,
    isBlueprint,
    hpCurrent: isBlueprint ? 1 : BUILDING_HP[type],
    hpMax: BUILDING_HP[type],
    requiredResources: options.requiredResources ?? [],
    buildProgress: 0,
    growth: 0,
    sown: false,
    manaFuel: 0,
    manaProgress: 0,
  };
  own(state, 'buildings');
  state.buildings[id] = building;
  updateTile(state, tileId, { buildingId: id });
  return building;
}

export function addItem(
  state: GameState,
  type: ResourceType,
  quantity: number,
  x: number,
  y: number,
  variant?: 'meal',
): Item {
  const tile = state.tiles[tileIdOf(x, y)];
  own(state, 'items');
  // merge into an existing stack of the same type - and the same variant - on
  // this tile when possible. A meal merged into a raw stack would silently
  // uncook it (design-next 提案3).
  for (const existingId of tile.itemIds) {
    const existing = state.items[existingId];
    if (
      existing.type === type &&
      (existing.variant ?? null) === (variant ?? null) &&
      existing.quantity + quantity <= STACK_MAX
    ) {
      const merged = { ...existing, quantity: existing.quantity + quantity };
      state.items[existingId] = merged;
      return merged;
    }
  }
  const id = nextId(state, 'i');
  const item: Item = {
    id,
    type,
    quantity,
    position: { x, y },
    reservedByJobId: null,
  };
  if (variant) item.variant = variant;
  state.items[id] = item;
  updateTile(state, tile.id, { itemIds: [...tile.itemIds, id] });
  return item;
}

/**
 * Builds the starting colony: a storage zone, a few farm plots, three beds and
 * three colonists in the middle of a clearing.
 */
export function generateWorld(options: WorldOptions = {}): GameState {
  const seed = options.seed ?? 20260726;
  const state = createEmptyState(
    options.width ?? DEFAULT_MAP_WIDTH,
    options.height ?? DEFAULT_MAP_HEIGHT,
  );
  state.scenario = options.scenario ?? DEFAULT_SCENARIO;
  state.worldSeed = seed;
  state.worldCell = options.worldCell ?? null;
  // Stage B (design-phase11-worldmap.md 2.2 / 6章): a chosen cell overrides
  // `biome` with its own derivation, and the local map is generated from
  // `cellSeed` rather than the world seed directly - two cells of the same
  // world read as two different places, and re-picking a cell reproduces the
  // exact map it gave before. With no cell (the pre-worldmap path, and every
  // existing caller that only passes `seed`), nothing changes: `genSeed` is
  // `seed` itself, exactly as it always was.
  state.biome = state.worldCell
    ? worldBiomeAt(seed, state.worldCell.x, state.worldCell.y)
    : (options.biome ?? DEFAULT_BIOME);
  const genSeed = state.worldCell ? cellSeed(seed, state.worldCell.x, state.worldCell.y) : seed;
  const scenario = SCENARIOS[state.scenario];
  const biome = BIOMES[state.biome];
  const forestNoise = valueNoise2D(genSeed);
  const stoneNoise = valueNoise2D(genSeed + 977);
  const crystalNoise = valueNoise2D(genSeed + 4231);
  const ironNoise = valueNoise2D(genSeed + 7211);
  const waterNoise = valueNoise2D(genSeed + 5147);

  const cx = Math.floor(state.width / 2);
  const cy = Math.floor(state.height / 2);

  // plain-rock tiles and the noise value that put them there, kept only long
  // enough for the crystal floor below to pick candidates from - never stored
  // on GameState, since it is scratch data for this one generation pass
  const stoneNoiseByTile = new Map<string, number>();

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const f = forestNoise(x, y, 9);
      const s = stoneNoise(x, y, 7);
      const w = waterNoise(x, y, 15);
      // keep a clearing around the starting camp so the colony has room
      const distToCamp = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      let terrain: Tile['terrain'] = 'grass';
      if (distToCamp > 6) {
        // Water decides before rock or forest (2.4章): a lake never has a rock
        // wall standing in the middle of it. Two thresholds off the same noise
        // field, 0.08 apart, put deep water only at the noise's core and a
        // shallow ring around it - so every lake's shore is walkable ground,
        // which is both where a bank has to be and where herbs (段階 H-1) will
        // grow.
        if (w > biome.waterThreshold + 0.08) terrain = 'deepWater';
        else if (w > biome.waterThreshold) terrain = 'shallowWater';
        else if (s > biome.stoneThreshold) terrain = 'stone';
        else if (f > biome.forestThreshold) terrain = 'forest';
      }
      // Mana crystal sits in the heart of a rock face, never at its edge: a
      // vein the player can reach on the first day would make the phase-2
      // puzzle free, and quarrying towards one is the point (11章). The two
      // depth cutoffs (0.86 / 0.78) are not biome levers - only which of
      // those deep tiles turn into ore is (biome.crystalNoiseThreshold /
      // biome.ironNoiseThreshold), so "how much rock" and "how rich the rock
      // is" stay separate knobs.
      if (terrain === 'stone' && s > 0.86 && crystalNoise(x, y, 13) > biome.crystalNoiseThreshold) {
        terrain = 'crystal';
      } else if (terrain === 'stone' && s > 0.78 && ironNoise(x, y, 11) > biome.ironNoiseThreshold) {
        // Iron sits shallower than crystal and there is more of it, so it is
        // the ore a quarry meets on the way in - and because the crystal check
        // runs first, iron never takes a tile crystal would have had: the deep
        // rock stays the crystal's place (design-phase10-ores.md 2.2).
        terrain = 'ironVein';
      }
      const tile = makeTile(x, y, terrain);
      state.tiles[tile.id] = tile;
      if (terrain === 'stone') stoneNoiseByTile.set(tile.id, s);
    }
  }

  enforceCrystalFloor(state, biome.minCrystalTiles, stoneNoiseByTile);

  // 段階 W-2 (docs/design-phase14-water-medicine.md 3章): rivers first, so a
  // river never has to be threaded back through a stone tile the crystal
  // floor just claimed - then the connectivity floor, which has to run last
  // among the terrain-shaping steps since it is the backstop for whatever
  // shape the noise, the crystal floor and the rivers left behind.
  scatterRivers(state, genSeed, { x: cx, y: cy });
  enforceConnectivity(state, { x: cx, y: cy });

  // what this map supports in woodland: regrowth heals back towards it and no
  // further, so the forest can return but cannot take the grassland. Measured
  // after rivers and the connectivity floor, since both can turn a forest or
  // a stone tile into water - the ceiling should match what the map actually
  // has left, not a pre-water count regrowth could never reach anyway.
  state.forestCapacity = Object.values(state.tiles).filter((t) => t.terrain === 'forest').length;

  // storage zone: 5x4 patch just south of the camp centre
  const storageTiles: string[] = [];
  for (let y = cy + 1; y < cy + 5; y++) {
    for (let x = cx - 2; x < cx + 3; x++) storageTiles.push(tileIdOf(x, y));
  }
  const zone: Zone = { id: 'z1', type: 'storage', tileIds: storageTiles, accepts: [...RESOURCE_TYPES] };
  state.zones[zone.id] = zone;
  state.nextIds = { ...state.nextIds, z: 1 };
  for (const tileId of storageTiles) addBuilding(state, 'storageZoneMarker', tileId);

  // Farm plots: one row north of the camp. Sized so three colonists build a
  // real surplus over spring and summer without the stores running away - the
  // point of the seasons is that the winter buffer has to be earned.
  for (let i = 0; i < scenario.farmPlots; i++) {
    // a row that grows outwards from the camp, so a bigger farm is a wider one
    const x = cx - 2 + (i % 5);
    const y = cy - 4 - Math.floor(i / 5);
    addBuilding(state, 'farmPlot', tileIdOf(x, y));
  }

  // beds
  for (let i = 0; i < 3; i++) addBuilding(state, 'bed', tileIdOf(cx - 4 + i * 2, cy));

  // starting stock, dropped inside the storage zone
  const stock: Partial<Record<ResourceType, number>> = {
    ...scenario.startingResources,
    ...options.startingResources,
  };
  let slot = 0;
  for (const type of ['food', 'wood', 'stone'] as ResourceType[]) {
    let remaining = stock[type] ?? 0;
    while (remaining > 0 && slot < storageTiles.length) {
      const amount = Math.min(STACK_MAX, remaining);
      const pos = storageTiles[slot++];
      const comma = pos.indexOf(',');
      addItem(state, type, amount, Number(pos.slice(0, comma)), Number(pos.slice(comma + 1)));
      remaining -= amount;
    }
  }

  // colonists
  for (let i = 0; i < scenario.colonists; i++) {
    // the founders' backgrounds come out of the local map's seed, so "new map"
    // (or a newly chosen cell) also means a different set of people, not the
    // same three under a new sky
    addColonist(
      state,
      { x: cx - 1 + i, y: cy + 6 },
      { hunger: 20 + i * 5, sleep: 10 + i * 5 , recreation: 0 },
      genSeed * 31 + i * 7919,
    );
  }

  scatterBerryBushes(state, genSeed, { x: cx, y: cy });
  scatterFrostblooms(state, genSeed, { x: cx, y: cy });
  scatterHerbs(state, genSeed, { x: cx, y: cy });
  spawnInitialWildlife(state, genSeed, { x: cx, y: cy });

  return state;
}

/**
 * The floor half of design-next.md 提案1(a), taken over by the biome table
 * (design-phase11-worldmap.md 3.3): if a freshly generated world rolled under
 * its biome's crystal floor, top it up from existing rock rather than leaving
 * a colony that can never reach phase 2 at all.
 *
 * Deterministic and additive only - a world that already clears the floor is
 * untouched, so this can only lift the thin tail of the distribution, never
 * move the median or p90 (design-next.md a-1 / a-2). Candidates are plain
 * `stone` tiles, ranked the same way the natural crystal placement favours
 * deep rock: most rock-locked neighbours first, then the highest stone-noise
 * value, then position for a stable tie-break - so a floor-added vein reads
 * exactly like one the noise would have placed itself, just not at the edge
 * of a rock face.
 */
function enforceCrystalFloor(
  state: GameState,
  floor: number,
  stoneNoiseByTile: Map<string, number>,
): void {
  if (floor <= 0) return;
  let current = 0;
  for (const id in state.tiles) if (state.tiles[id].terrain === 'crystal') current++;
  let needed = floor - current;
  if (needed <= 0) return;

  const candidates: { id: string; depth: number; s: number }[] = [];
  for (const [id, s] of stoneNoiseByTile) {
    const tile = state.tiles[id];
    let depth = 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const neighbour = state.tiles[tileIdOf(tile.x + dx, tile.y + dy)];
      if (neighbour && isRock(neighbour.terrain)) depth++;
    }
    candidates.push({ id, depth, s });
  }
  candidates.sort((a, b) => b.depth - a.depth || b.s - a.s || (a.id < b.id ? -1 : 1));

  for (const candidate of candidates) {
    if (needed <= 0) break;
    updateTile(state, candidate.id, { terrain: 'crystal' });
    needed--;
  }
}

/**
 * Rivers (フェーズ14 段階 W-2, docs/design-phase14-water-medicine.md 3.1). A
 * river's body is always shallow water, never deep, so it is walkable ground
 * by construction and the connectivity floor below never has to fight a river
 * it just drew. Anchors are existing water tiles (a lake's shore) or a random
 * point on the map edge, so a river reads as connecting a lake to another
 * lake or to the edge - and on a biome with no lake at all (crag can roll
 * one), it still falls back to edge-to-edge, which is why `riverCount` is
 * never zero in the biome table.
 *
 * Deterministic: one `mulberry32` stream seeded off `genSeed`, the same shape
 * as `scatterBerryBushes` (`+8123`) and `scatterFrostblooms` (`+6421`) - an
 * offset none of the existing noise fields or scatter passes already use.
 */
function scatterRivers(state: GameState, seed: number, camp: { x: number; y: number }): void {
  const riverCount = biomeOf(state).riverCount;
  if (riverCount <= 0) return;
  const rnd = mulberry32(seed + 9137);

  const inClearing = (x: number, y: number) =>
    Math.max(Math.abs(x - camp.x), Math.abs(y - camp.y)) <= 6;

  function edgePoint(): { x: number; y: number } {
    switch (Math.floor(rnd() * 4)) {
      case 0:
        return { x: Math.floor(rnd() * state.width), y: 0 };
      case 1:
        return { x: Math.floor(rnd() * state.width), y: state.height - 1 };
      case 2:
        return { x: 0, y: Math.floor(rnd() * state.height) };
      default:
        return { x: state.width - 1, y: Math.floor(rnd() * state.height) };
    }
  }

  const waterTiles = Object.values(state.tiles).filter((t) => isWater(t.terrain));
  function anchorPoint(): { x: number; y: number } {
    if (waterTiles.length > 0 && rnd() < 0.6) {
      const t = waterTiles[Math.floor(rnd() * waterTiles.length)];
      return { x: t.x, y: t.y };
    }
    return edgePoint();
  }

  for (let i = 0; i < riverCount; i++) {
    const from = anchorPoint();
    let to = anchorPoint();
    // a river that starts and ends almost on top of itself does not read as
    // one - give it up to four tries to land somewhere far enough away
    for (let retry = 0; retry < 4 && manhattan(from, to) < 10; retry++) to = anchorPoint();
    carveRiver(state, from, to, rnd, inClearing);
  }
}

/** Walks `from` toward `to` with a rightward-biased drift, laying river tiles as it goes. */
function carveRiver(
  state: GameState,
  from: { x: number; y: number },
  to: { x: number; y: number },
  rnd: () => number,
  inClearing: (x: number, y: number) => boolean,
): void {
  let x = from.x;
  let y = from.y;
  // enough steps to cross the map even with drift built in; the walk simply
  // stops early once it reaches `to`
  const maxSteps = (state.width + state.height) * 2;
  for (let step = 0; step < maxSteps; step++) {
    layRiverTile(state, x, y, inClearing);
    // widen to two tiles about a third of the way, so the band is not
    // uniformly one tile wide everywhere
    if (rnd() < 0.35) {
      if (rnd() < 0.5) layRiverTile(state, x + 1, y, inClearing);
      else layRiverTile(state, x, y + 1, inClearing);
    }
    if (x === to.x && y === to.y) break;
    const dx = to.x - x;
    const dy = to.y - y;
    const towardX = Math.abs(dx) >= Math.abs(dy);
    if (rnd() < 0.75) {
      // mostly step toward the target on whichever axis is further off
      if (towardX && dx !== 0) x += Math.sign(dx);
      else if (dy !== 0) y += Math.sign(dy);
      else if (dx !== 0) x += Math.sign(dx);
    } else if (rnd() < 0.5 && dx !== 0) {
      x += Math.sign(dx);
    } else if (dy !== 0) {
      y += Math.sign(dy);
    }
    x = Math.max(0, Math.min(state.width - 1, x));
    y = Math.max(0, Math.min(state.height - 1, y));
  }
}

/** One river tile: shallow water, unless the rule says to leave this one alone. */
function layRiverTile(
  state: GameState,
  x: number,
  y: number,
  inClearing: (x: number, y: number) => boolean,
): void {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return;
  if (inClearing(x, y)) return; // never cut through the starting camp (design doc 3.1)
  const tile = state.tiles[tileIdOf(x, y)];
  if (!tile) return;
  if (tile.terrain === 'crystal' || tile.terrain === 'ironVein') return; // never destroy a vein
  if (isWater(tile.terrain)) return; // already a lake tile; leave it as it was placed
  updateTile(state, tile.id, { terrain: 'shallowWater', walkable: true });
}

/**
 * The connectivity floor (フェーズ14 段階 W-2, docs/design-phase14-water-medicine.md
 * 3.2). Same shape as `enforceCrystalFloor` above: generate first, then top up
 * only if generation happened to fall short. Here "falls short" means less
 * than 90% of the map's walkable land shares the camp's region - crag's
 * pre-existing rock fragmentation (measured: 7/20 seeds under 90%, nothing to
 * do with water) is exactly what this backstops, on top of whatever a lake or
 * river might have split off.
 *
 * Each pass floods the camp's region, finds the largest other region, and
 * breaches the thinnest wall between them (deep water dropped to shallow,
 * plain stone dropped to grass - crystal and ironVein are never candidates,
 * the same rule the rivers above follow). Repeats until the floor is met or
 * the iteration cap is hit, so a pathological map cannot loop forever.
 */
function enforceConnectivity(state: GameState, camp: { x: number; y: number }): void {
  const FLOOR = 0.9;
  const MAX_ITERATIONS = 40;
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const { regions, sizes, campRegion } = floodFillWalkable(state, camp);
    if (campRegion === -1) return; // the camp tile itself is not walkable - nothing sane to do
    let totalWalkable = 0;
    for (const size of Object.values(sizes)) totalWalkable += size;
    if (totalWalkable === 0) return;
    const campSize = sizes[campRegion] ?? 0;
    if (campSize / totalWalkable >= FLOOR) return;

    // the largest other region, ties broken by the lowest label (which is
    // itself assigned in a fixed row-major scan order, so this is
    // deterministic regardless of how many regions exist)
    let targetRegion = -1;
    let targetSize = 0;
    for (const label of Object.keys(sizes).map(Number).sort((a, b) => a - b)) {
      if (label === campRegion) continue;
      if (sizes[label] > targetSize) {
        targetSize = sizes[label];
        targetRegion = label;
      }
    }
    if (targetRegion === -1) return; // nothing left to connect to

    const breach = shortestBreach(state, regions, campRegion, targetRegion);
    if (!breach || breach.length === 0) return; // no crossable wall at all - bail rather than spin

    for (const tileId of breach) {
      const tile = state.tiles[tileId];
      const terrain: Tile['terrain'] = tile.terrain === 'deepWater' ? 'shallowWater' : 'grass';
      updateTile(state, tileId, { terrain, walkable: true });
    }
  }
}

/**
 * A self-contained flood fill over `state.tiles[*].walkable`, the same
 * algorithm `derived.ts`'s `RegionIndex` runs at simulation time - but this
 * file cannot use that one: `SimContext` does not exist yet during
 * generation (`createSimContext` runs after `generateWorld` returns).
 */
function floodFillWalkable(
  state: GameState,
  camp: { x: number; y: number },
): { regions: Int32Array; sizes: Record<number, number>; campRegion: number } {
  const w = state.width;
  const h = state.height;
  const regions = new Int32Array(w * h).fill(-1);
  const sizes: Record<number, number> = {};
  let label = 0;
  const queue = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (regions[start] !== -1) continue;
      if (!state.tiles[tileIdOf(x, y)].walkable) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      regions[start] = label;
      let size = 0;
      while (head < tail) {
        const idx = queue[head++];
        size++;
        const cx = idx % w;
        const cy = (idx / w) | 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nIdx = ny * w + nx;
          if (regions[nIdx] !== -1) continue;
          if (!state.tiles[tileIdOf(nx, ny)].walkable) continue;
          regions[nIdx] = label;
          queue[tail++] = nIdx;
        }
      }
      sizes[label] = size;
      label++;
    }
  }
  const campRegion = regions[camp.y * w + camp.x];
  return { regions, sizes, campRegion };
}

/**
 * The fewest breachable (non-vein) tiles that need to flip to walkable to
 * connect any tile already in `fromRegion` to `toRegion` - a 0-1 BFS (Dial's
 * algorithm with integer buckets, since every edge costs 0 or 1) seeded from
 * every `fromRegion` tile at once. Crystal and ironVein tiles are excluded
 * from the graph entirely, so the search always routes around them rather
 * than ever proposing one as a breach tile.
 *
 * Returns the breach tiles in root-to-target order, or `null` if `toRegion`
 * cannot be reached at all (every route to it is walled by veins).
 */
function shortestBreach(
  state: GameState,
  regions: Int32Array,
  fromRegion: number,
  toRegion: number,
): TileId[] | null {
  const w = state.width;
  const h = state.height;
  const n = w * h;
  const dist = new Array<number>(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const buckets: number[][] = [[]];
  for (let idx = 0; idx < n; idx++) {
    if (regions[idx] === fromRegion) {
      dist[idx] = 0;
      buckets[0].push(idx);
    }
  }

  let found = -1;
  for (let d = 0; d < buckets.length && found === -1; d++) {
    const bucket = buckets[d];
    while (bucket.length > 0) {
      const idx = bucket.pop()!;
      if (dist[idx] !== d) continue; // stale entry from a cheaper update later
      if (regions[idx] === toRegion) {
        found = idx;
        break;
      }
      const x = idx % w;
      const y = (idx / w) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nIdx = ny * w + nx;
        const nTile = state.tiles[tileIdOf(nx, ny)];
        if (nTile.terrain === 'crystal' || nTile.terrain === 'ironVein') continue; // never a breach candidate
        const cost = nTile.walkable ? 0 : 1;
        const nd = d + cost;
        if (nd < dist[nIdx]) {
          dist[nIdx] = nd;
          parent[nIdx] = idx;
          while (buckets.length <= nd) buckets.push([]);
          buckets[nd].push(nIdx);
        }
      }
    }
  }
  if (found === -1) return null;

  const breach: TileId[] = [];
  for (let at = found; parent[at] !== -1; at = parent[at]) {
    const x = at % w;
    const y = (at / w) | 0;
    const tile = state.tiles[tileIdOf(x, y)];
    if (!tile.walkable) breach.push(tile.id);
  }
  return breach;
}

const ANIMAL_NAMES = [
  'Ash',
  'Birch',
  'Clover',
  'Dusk',
  'Ember',
  'Fern',
  'Ginger',
  'Hazel',
  'Ivy',
  'Juniper',
  'Kestrel',
  'Larch',
  'Moss',
  'Nettle',
  'Olive',
  'Pip',
  'Quill',
  'Rowan',
  'Sorrel',
  'Thistle',
];

export function createAnimal(
  state: GameState,
  species: AnimalSpecies,
  x: number,
  y: number,
  options: { tame?: boolean; pastureZoneId?: string | null; bornAtTick?: number } = {},
): Animal {
  const id = nextId(state, 'a');
  const index = Number(id.slice(1));
  const animal: Animal = {
    id,
    species,
    name: `${ANIMAL_NAMES[index % ANIMAL_NAMES.length]}`,
    position: { x, y },
    path: null,
    pathExpiresAtTick: null,
    hunger: 20,
    health: SPECIES[species].maxHealth,
    bornAtTick: options.bornAtTick ?? -SPECIES[species].adultAtTicks, // spawns adult
    tame: options.tame ?? false,
    pastureZoneId: options.pastureZoneId ?? null,
    activity: { kind: 'idle' },
    designation: null,
    reservedByJobId: null,
    gestationUntilTick: null,
    pursuitUntilTick: null,
    huntCooldownUntilTick: null,
    nextProduceTick: null,
  };
  state.animals[id] = animal;
  return animal;
}

/**
 * Wild berries, scattered through the woods. They are placed on forest tiles so
 * foraging means walking out of the clearing, and they start at a random ripeness
 * so the colony does not get one enormous harvest on day one.
 */
function scatterBerryBushes(state: GameState, seed: number, camp: { x: number; y: number }): void {
  const rnd = mulberry32(seed + 8123);
  // Both the target and the number of darts thrown at it scale with the map:
  // a fixed 900 attempts finds 26 spots on 3,600 tiles and would fall short of
  // 104 on 14,400 (docs/design-phase6-space.md 3.2). The biome's density
  // multiplier (11章 フェーズ11 段階A) rides on top of that: deepwood wants
  // more bushes than meadow on the same map, crag fewer, so both the target
  // and the dart count scale with it together, or a thin biome would burn
  // through its attempts before finding enough forest tiles to land on.
  const berryDensityMultiplier = biomeOf(state).berryDensityMultiplier;
  const wanted = Math.max(1, Math.round(perArea(state, BERRY_BUSH_COUNT) * berryDensityMultiplier));
  const attempts = Math.round(perArea(state, 900) * Math.max(1, berryDensityMultiplier) * 1.5);
  let placed = 0;
  for (let attempt = 0; attempt < attempts && placed < wanted; attempt++) {
    const x = Math.floor(rnd() * state.width);
    const y = Math.floor(rnd() * state.height);
    const tile = state.tiles[tileIdOf(x, y)];
    if (!tile || tile.terrain !== 'forest' || tile.buildingId) continue;
    if (Math.abs(x - camp.x) + Math.abs(y - camp.y) < 5) continue;
    const bush = addBuilding(state, 'berryBush', tile.id);
    state.buildings[bush.id] = { ...bush, growth: rnd() };
    placed++;
  }
}

/**
 * Frostbloom (11章 フェーズ5), scattered the same way the berries are but into
 * the open ground beside the rock rather than into the woods. Two reasons: the
 * places a colony walks past in summer and ignores are exactly where it wants
 * something to do in winter, and putting them against the stone means the
 * winter harvest and the mine are in the same part of the map.
 *
 * They start bare rather than at a random ripeness. A bush the player finds
 * half grown in spring is a bush that will sit at that value until the year
 * turns, which reads as broken; starting at zero means the first bloom is
 * always something winter did.
 */
function scatterFrostblooms(state: GameState, seed: number, camp: { x: number; y: number }): void {
  const rnd = mulberry32(seed + 6421);
  const wanted = perArea(state, FROSTBLOOM_COUNT);
  const attempts = perArea(state, 1200);
  let placed = 0;
  for (let attempt = 0; attempt < attempts && placed < wanted; attempt++) {
    const x = Math.floor(rnd() * state.width);
    const y = Math.floor(rnd() * state.height);
    const tile = state.tiles[tileIdOf(x, y)];
    if (!tile || tile.terrain !== 'grass' || tile.buildingId) continue;
    if (Math.abs(x - camp.x) + Math.abs(y - camp.y) < 5) continue;
    const nearRock = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ].some(([dx, dy]) => {
      const neighbour = state.tiles[tileIdOf(x + dx, y + dy)];
      return !!neighbour && isRock(neighbour.terrain);
    });
    if (!nearRock) continue;
    addBuilding(state, 'frostbloom', tile.id);
    placed++;
  }
}

/**
 * Herb (フェーズ14 段階 H-1, docs/design-phase14-water-medicine.md 4章), placed
 * the same way frostbloom is placed against the rock (4.1) - but against the
 * shore instead: grass beside a shallow or deep water tile, rather than grass
 * beside stone. This is what gives the lake layer (段階 W-1) a reason to
 * matter beyond blocking a path: a world with no water grows no herb.
 */
function scatterHerbs(state: GameState, seed: number, camp: { x: number; y: number }): void {
  const rnd = mulberry32(seed + 2609);
  const wanted = perArea(state, HERB_COUNT);
  const attempts = perArea(state, 1200);
  let placed = 0;
  for (let attempt = 0; attempt < attempts && placed < wanted; attempt++) {
    const x = Math.floor(rnd() * state.width);
    const y = Math.floor(rnd() * state.height);
    const tile = state.tiles[tileIdOf(x, y)];
    if (!tile || tile.terrain !== 'grass' || tile.buildingId) continue;
    if (Math.abs(x - camp.x) + Math.abs(y - camp.y) < 5) continue;
    const nearWater = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ].some(([dx, dy]) => {
      const neighbour = state.tiles[tileIdOf(x + dx, y + dy)];
      return !!neighbour && isWater(neighbour.terrain);
    });
    if (!nearWater) continue;
    addBuilding(state, 'herb', tile.id);
    placed++;
  }
}

/**
 * Create a colonist. Names and colours cycle, so a colony that grows past the
 * hand-written list still has everybody visually distinct.
 */
export function addColonist(
  state: GameState,
  position: { x: number; y: number },
  needs: { hunger: number; sleep: number , recreation: 0 } = { hunger: 15, sleep: 15 , recreation: 0 },
  /** what the newcomer already knows; defaults to something the world decides */
  skillSeed: number = state.tick * 7919 + Object.keys(state.colonists).length,
): Colonist {
  const id = nextId(state, 'c');
  const index = Number(id.slice(1)) - 1;
  const colonist: Colonist = {
    id,
    name: COLONIST_NAMES[index % COLONIST_NAMES.length] ?? `Colonist ${index + 1}`,
    color: COLONIST_COLORS[index % COLONIST_COLORS.length] ?? 0xffffff,
    position: { ...position },
    path: null,
    pathTargetTileId: null,
    needs: { ...needs },
    health: COLONIST_MAX_HEALTH,
    currentJobId: null,
    carrying: null,
    activity: { kind: 'none' },
    workPriorities: defaultPriorities(),
    skills: rollStartingSkills(skillSeed),
    traits: rollTraits(skillSeed),
  };
  state.colonists[id] = colonist;
  return colonist;
}

/**
 * Scatter the starting herds. Predators are deliberately absent at world
 * generation: they only arrive from day 2 (docs/design-phase2.5-animals.md 6).
 */
function spawnInitialWildlife(state: GameState, seed: number, camp: { x: number; y: number }): void {
  const rnd = mulberry32(seed + 4241);
  const wildlifeMultiplier = biomeOf(state).wildlifeMultiplier;
  for (const species of [
    'deer',
    'boar',
    'rabbit',
    'chicken',
    'goat',
    // the fantasy layer (11章 フェーズ5): both start on the map from day one,
    // because neither is a threat that needs a grace period
    'crystalElk',
    'rockeater',
  ] as AnimalSpecies[]) {
    // the biome's per-species lever (11章 フェーズ11 段階A) rides on top of
    // the scenario's flat wildlife multiplier; a species the biome does not
    // name is untouched (defaults to 1)
    const multiplier = scenarioOf(state).wildlife * (wildlifeMultiplier[species] ?? 1);
    const wanted = perArea(state, scaledCount(SPECIES[species].initialCount, multiplier));
    for (let i = 0; i < wanted; i++) {
      const spot = findSpawnTile(state, rnd, camp, species === 'chicken' || species === 'rabbit' ? 6 : 12);
      if (spot) createAnimal(state, species, spot.x, spot.y);
    }
  }
}

/** A walkable tile at least `minDistance` away from the camp centre. */
export function findSpawnTile(
  state: GameState,
  rnd: () => number,
  camp: { x: number; y: number },
  minDistance: number,
): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 200; attempt++) {
    const x = Math.floor(rnd() * state.width);
    const y = Math.floor(rnd() * state.height);
    const tile = state.tiles[tileIdOf(x, y)];
    if (!tile?.walkable || tile.buildingId) continue;
    if (Math.abs(x - camp.x) + Math.abs(y - camp.y) < minDistance) continue;
    return { x, y };
  }
  return null;
}
