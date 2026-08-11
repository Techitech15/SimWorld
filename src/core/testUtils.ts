// Shared helpers for the headless simulation tests (section 3: the simulation
// layer depends on neither the DOM nor PixiJS, so it can be driven from Node).
import { createSimContext } from './derived';
import type { SimContext } from './derived';
import { tickOnce } from './simulation';
import { placePastureZone } from './actions';
import { isRock, tileIdOf } from './state';
import { generateWorld } from './worldgen';
import type { WorldOptions } from './worldgen';
import type { BiomeName, GameState, LogEntry, TerrainType, TileId, ZoneId } from './types';

export interface Harness {
  state: GameState;
  ctx: SimContext;
  run: (ticks: number, onTick?: (state: GameState) => void) => GameState;
}

/**
 * A world to run assertions against.
 *
 * Fixed at 60x60 rather than following the shipped default, which is 120x120
 * (docs/design-phase6-space.md 5, stage A-3). Two reasons, and the second is
 * the important one:
 *
 * - four times the tiles is four times the run time, and a suite that takes
 *   twenty minutes stops being run
 * - **every measurement in design-notes.md was taken at 60x60.** A harness that
 *   quietly changed size would invalidate all of them at once without a single
 *   line of the notes being rewritten, which is exactly the failure the "do not
 *   delete past measurements" rule exists to prevent
 *
 * The shipped size is covered where it matters instead: `longrun.test.ts` runs
 * a year at 120x120, `chaos.test.ts` checks the invariants there, and
 * `roundtrip.test.ts` round-trips both sizes in one process.
 */
export function createHarness(
  seed = 42,
  size = 60,
  biome?: BiomeName,
  worldCell?: { x: number; y: number },
): Harness {
  const harness: Harness = {
    state: generateWorld({ seed, width: size, height: size, biome, worldCell }),
    ctx: undefined as unknown as SimContext,
    run(ticks, onTick) {
      for (let i = 0; i < ticks; i++) {
        harness.state = tickOnce(harness.state, harness.ctx);
        onTick?.(harness.state);
      }
      return harness.state;
    },
  };
  harness.ctx = createSimContext(harness.state);
  return harness;
}

/**
 * Every key the log emits during a run, truncation included.
 *
 * `state.log` keeps only its last hundred entries, so anything that reads the
 * log after a long run is measuring the buffer rather than the run - a year of
 * play produces more lines than it holds. Counting the tail on every tick is
 * the other trap and is worse, because it silently counts the same entry
 * thousands of times: it made one measurement here report twenty-five thousand
 * level-ups in a game where four hundred is the ceiling.
 *
 * This records every entry written since the last one it saw, which is exact
 * whether a tick writes one line or several, and the reason it lives here
 * rather than being written out again at each call site. Since phase 9 the log
 * stores keys, so tests assert the event rather than the wording.
 */
export function recordLog(
  harness: Harness,
  ticks: number,
  onTick?: (state: GameState) => void,
): string[] {
  return recordLogEntries(harness, ticks, onTick).map((entry) => entry.key);
}

/**
 * The same recording, keeping each entry's kind.
 *
 * A test that wants "how many incidents were there" should count the marker the
 * log already carries rather than matching the wording: a regex over messages
 * measures the phrasing as much as the event, and quietly stops counting an
 * incident the day somebody rewrites its sentence.
 */
export function recordLogEntries(
  harness: Harness,
  ticks: number,
  onTick?: (state: GameState) => void,
): LogEntry[] {
  const entries: LogEntry[] = [];
  const keyOf = (entry: LogEntry) => `${entry.tick}:${entry.key}:${JSON.stringify(entry.params ?? {})}`;
  let lastKey = '';
  const seed = harness.state.log[harness.state.log.length - 1];
  if (seed) lastKey = keyOf(seed);
  harness.run(ticks, (state) => {
    // the caller's hook runs first: a test that writes its own lines from
    // onTick would otherwise have the last tick's line recorded a tick late,
    // and the final one not at all
    onTick?.(state);
    const log = state.log;
    if (log.length === 0) return;
    if (keyOf(log[log.length - 1]) === lastKey) return;

    // Everything since the last line we saw, not just the newest one. Watching
    // only the tail lost any tick that wrote twice - a raider dying and the
    // raid ending land together, and the death simply vanished from the
    // recording. Searching back for the last line we know about also copes
    // with the buffer having dropped it: then every entry it holds is new.
    let from = 0;
    for (let i = log.length - 1; i >= 0; i--) {
      if (keyOf(log[i]) === lastKey) {
        from = i + 1;
        break;
      }
    }
    for (let i = from; i < log.length; i++) entries.push(log[i]);
    lastKey = keyOf(log[log.length - 1]);
  });
  return entries;
}

/**
 * These two both used to hand back short lists in silence, and a short list is
 * how a test stops testing anything: an action given tiles it cannot use
 * returns the state it was given, and an assertion that nothing changed then
 * passes for a reason unrelated to the thing under test. Two tests were found
 * doing exactly that - one had been asserting a rule that had been false for
 * three iterations. Coming up short is a broken test, so they say so.
 */
function demandTiles(ids: TileId[], wanted: number, what: string): TileId[] {
  if (Number.isFinite(wanted) && ids.length < wanted) {
    throw new Error(
      `asked for ${wanted} ${what} tiles and the map only has ${ids.length}; ` +
        'this test would have run against a shorter list than it thinks',
    );
  }
  return ids;
}

export function tilesWithTerrain(
  state: GameState,
  terrain: TerrainType,
  limit = Infinity,
): TileId[] {
  const ids: TileId[] = [];
  for (const id in state.tiles) {
    if (state.tiles[id].terrain === terrain) {
      ids.push(id);
      if (ids.length >= limit) break;
    }
  }
  return demandTiles(ids, limit, terrain);
}

/** Tiles of a terrain type sorted by distance from the colony centre. */
export function nearestTilesWithTerrain(
  state: GameState,
  terrain: TerrainType,
  from: { x: number; y: number },
  limit: number,
): TileId[] {
  const ids = Object.values(state.tiles)
    .filter((t) => t.terrain === terrain)
    .sort(
      (a, b) =>
        Math.abs(a.x - from.x) +
        Math.abs(a.y - from.y) -
        (Math.abs(b.x - from.x) + Math.abs(b.y - from.y)),
    )
    .slice(0, limit)
    .map((t) => t.id);
  return demandTiles(ids, limit, terrain);
}

/**
 * One pen of solid grass near the camp, and the id of the single zone it made.
 *
 * Five test files had their own copy of this, all of them a fixed rectangle
 * beside the camp. A rectangle with a tree or a bed in it loses those tiles,
 * what is left is no longer contiguous, and the drag quietly produces two or
 * three pens - after which a test that takes "the pasture" gets whichever one
 * came first and passes or fails for reasons that have nothing to do with it.
 * This searches for a block that is actually clear and insists the drag made
 * exactly one pen.
 */
export function placePastureNear(harness: Harness, size: number): ZoneId {
  const centre = Object.values(harness.state.colonists)[0]?.position ?? { x: 30, y: 30 };
  const clear = (x: number, y: number) => {
    const tile = harness.state.tiles[tileIdOf(x, y)];
    return tile?.terrain === 'grass' && !tile.buildingId;
  };

  for (let radius = 3; radius < 16; radius++) {
    for (const [dx, dy] of [
      [radius, -2],
      [-radius - size, -2],
      [-2, radius],
      [-2, -radius - size],
    ]) {
      const x0 = centre.x + dx;
      const y0 = centre.y + dy;
      const ids: TileId[] = [];
      let solid = true;
      for (let y = 0; y < size && solid; y++) {
        for (let x = 0; x < size && solid; x++) {
          if (!clear(x0 + x, y0 + y)) solid = false;
          else ids.push(tileIdOf(x0 + x, y0 + y));
        }
      }
      if (!solid) continue;
      const before = new Set(Object.keys(harness.state.zones));
      harness.state = placePastureZone(harness.state, ids);
      const fresh = Object.keys(harness.state.zones).filter((id) => !before.has(id));
      if (fresh.length !== 1 || harness.state.zones[fresh[0]].tileIds.length !== size * size) {
        throw new Error(
          `a solid ${size}x${size} drag made ${fresh.length} pens; the helper is lying to the test`,
        );
      }
      return fresh[0];
    }
  }
  throw new Error(`no clear ${size}x${size} block of grass near the camp for a pasture`);
}

export function anyColonistId(state: GameState): string {
  return Object.keys(state.colonists)[0];
}

/**
 * The corridor a player has to cut to reach a vein, from the nearest open
 * ground inward. Written for the mana crystal tests and reused unchanged for
 * iron: a vein of anything sits inside a rock face, and designating the vein
 * alone leaves a job nobody can reach - the corridor is how a test actually
 * mines one. Returns the tiles to designate and how many of them carry the
 * given vein terrain.
 */
export function quarryTo(
  state: GameState,
  veinId: TileId,
  veinTerrain: TerrainType,
): { tiles: TileId[]; veins: number } {
  const parent = new Map<TileId, TileId | null>([[veinId, null]]);
  let frontier = [state.tiles[veinId]];
  let reached: TileId | null = null;
  while (frontier.length > 0 && !reached) {
    const next = [];
    for (const tile of frontier) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const step = state.tiles[tileIdOf(tile.x + dx, tile.y + dy)];
        if (!step || parent.has(step.id)) continue;
        parent.set(step.id, tile.id);
        if (!isRock(step.terrain)) {
          reached = tile.id; // the last rock before open ground
          break;
        }
        next.push(step);
      }
      if (reached) break;
    }
    frontier = next;
  }
  if (!reached) throw new Error('this vein has no route to open ground at all');

  const tiles: TileId[] = [];
  for (let at: TileId | null = reached; at; at = parent.get(at) ?? null) tiles.push(at);
  return {
    tiles,
    veins: tiles.filter((id) => state.tiles[id].terrain === veinTerrain).length,
  };
}

/**
 * Turn every work priority off so a test can observe one behaviour (a move
 * order, a single designation) without colonists wandering off to other jobs.
 */
export function idleColony(state: GameState): void {
  for (const id in state.colonists) {
    const colonist = state.colonists[id];
    const workPriorities = { ...colonist.workPriorities };
    for (const jobType of Object.keys(workPriorities) as (keyof typeof workPriorities)[]) {
      workPriorities[jobType] = 0;
    }
    state.colonists[id] = { ...colonist, workPriorities };
  }
}

/**
 * A world for a test to make assertions about.
 *
 * Fixed at 60x60 like `createHarness`, and for the same two reasons - the
 * second of which is the one that matters: **every measurement in
 * design-notes.md was taken at 60x60**. When the shipped default grew to
 * 120x120 (docs/design-phase6-space.md), the tests that built their own world
 * silently moved with it, and the ones calibrated against the terrain around
 * the camp started failing - the camp centre had moved from (30,30) to (60,60),
 * so they were looking at a different part of a different map.
 *
 * Tests that are *about* the shipped size ask for it explicitly instead
 * (`longrun`, `chaos`, `roundtrip`).
 */
export function testWorld(options: WorldOptions = {}): GameState {
  return generateWorld({ width: 60, height: 60, ...options });
}
