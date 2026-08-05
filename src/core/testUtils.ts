// Shared helpers for the headless simulation tests (section 3: the simulation
// layer depends on neither the DOM nor PixiJS, so it can be driven from Node).
import { createSimContext } from './derived';
import type { SimContext } from './derived';
import { tickOnce } from './simulation';
import { generateWorld } from './worldgen';
import type { GameState, TerrainType, TileId } from './types';

export interface Harness {
  state: GameState;
  ctx: SimContext;
  run: (ticks: number, onTick?: (state: GameState) => void) => GameState;
}

export function createHarness(seed = 42): Harness {
  const harness: Harness = {
    state: generateWorld({ seed }),
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
 * Every line the log emits during a run, truncation included.
 *
 * `state.log` keeps only its last hundred entries, so anything that reads the
 * log after a long run is measuring the buffer rather than the run - a year of
 * play produces more lines than it holds. Counting the tail on every tick is
 * the other trap and is worse, because it silently counts the same entry
 * thousands of times: it made one measurement here report twenty-five thousand
 * level-ups in a game where four hundred is the ceiling.
 *
 * This watches the last entry and records it when its identity changes, which
 * is exact for the one-entry-per-tick case and the reason it lives here rather
 * than being written out again at each call site.
 */
export function recordLog(
  harness: Harness,
  ticks: number,
  onTick?: (state: GameState) => void,
): string[] {
  const lines: string[] = [];
  let lastKey = '';
  const seed = harness.state.log[harness.state.log.length - 1];
  if (seed) lastKey = `${seed.tick}:${seed.message}`;
  harness.run(ticks, (state) => {
    // the caller's hook runs first: a test that writes its own lines from
    // onTick would otherwise have the last tick's line recorded a tick late,
    // and the final one not at all
    onTick?.(state);
    const last = state.log[state.log.length - 1];
    if (last) {
      const key = `${last.tick}:${last.message}`;
      if (key !== lastKey) {
        lastKey = key;
        lines.push(last.message);
      }
    }
  });
  return lines;
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
  return ids;
}

/** Tiles of a terrain type sorted by distance from the colony centre. */
export function nearestTilesWithTerrain(
  state: GameState,
  terrain: TerrainType,
  from: { x: number; y: number },
  limit: number,
): TileId[] {
  return Object.values(state.tiles)
    .filter((t) => t.terrain === terrain)
    .sort(
      (a, b) =>
        Math.abs(a.x - from.x) +
        Math.abs(a.y - from.y) -
        (Math.abs(b.x - from.x) + Math.abs(b.y - from.y)),
    )
    .slice(0, limit)
    .map((t) => t.id);
}

export function anyColonistId(state: GameState): string {
  return Object.keys(state.colonists)[0];
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
