// Grid A* (section 7): 4-directional movement, Manhattan heuristic, uniform
// terrain cost. Path recomputation is only ever triggered by (a) a new
// destination and (b) a terrain change, both handled by the callers below.
import { MAP_HEIGHT, MAP_WIDTH } from './constants';
import { inBounds, tileIdOf } from './state';
import type { GameState, TileId, Vector2 } from './types';

const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];

export function isWalkable(state: GameState, x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  return state.tiles[tileIdOf(x, y)].walkable;
}

/** Binary heap keyed by f-score; grid A* on 3,600 nodes needs nothing fancier. */
class MinHeap {
  private nodes: number[] = [];
  private scores: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, score: number): void {
    this.nodes.push(node);
    this.scores.push(score);
    let i = this.nodes.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.scores[parent] <= this.scores[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.nodes[0];
    const lastNode = this.nodes.pop()!;
    const lastScore = this.scores.pop()!;
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode;
      this.scores[0] = lastScore;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.scores.length && this.scores[l] < this.scores[smallest]) smallest = l;
        if (r < this.scores.length && this.scores[r] < this.scores[smallest]) smallest = r;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.nodes[a], this.nodes[b]] = [this.nodes[b], this.nodes[a]];
    [this.scores[a], this.scores[b]] = [this.scores[b], this.scores[a]];
  }
}

export interface PathOptions {
  /**
   * Stop next to the goal instead of on it. Required for mining (the goal tile
   * is not walkable) and used by every "work on that tile" job.
   */
  adjacent?: boolean;
}

/**
 * Returns the list of steps from (excluding) `start` to the goal, or null when
 * no path exists.
 */
export function findPath(
  state: GameState,
  start: Vector2,
  goal: Vector2,
  options: PathOptions = {},
): Vector2[] | null {
  const startIdx = start.y * MAP_WIDTH + start.x;
  const goalIdx = goal.y * MAP_WIDTH + goal.x;
  const adjacent = options.adjacent ?? false;

  const isGoal = (idx: number): boolean => {
    if (idx === goalIdx) return !adjacent || isWalkable(state, goal.x, goal.y);
    if (!adjacent) return false;
    const x = idx % MAP_WIDTH;
    const y = (idx / MAP_WIDTH) | 0;
    return Math.abs(x - goal.x) + Math.abs(y - goal.y) === 1;
  };

  if (isGoal(startIdx)) return [];
  if (!isWalkable(state, start.x, start.y)) return null;

  const total = MAP_WIDTH * MAP_HEIGHT;
  const gScore = new Float64Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const open = new MinHeap();

  const heuristic = (idx: number) => {
    const x = idx % MAP_WIDTH;
    const y = (idx / MAP_WIDTH) | 0;
    const h = Math.abs(x - goal.x) + Math.abs(y - goal.y);
    return adjacent ? Math.max(0, h - 1) : h;
  };

  gScore[startIdx] = 0;
  open.push(startIdx, heuristic(startIdx));

  while (open.size > 0) {
    const current = open.pop();
    if (closed[current]) continue;
    closed[current] = 1;

    if (isGoal(current)) {
      const path: Vector2[] = [];
      let node = current;
      while (node !== startIdx) {
        path.push({ x: node % MAP_WIDTH, y: (node / MAP_WIDTH) | 0 });
        node = cameFrom[node];
      }
      path.reverse();
      return path;
    }

    const cx = current % MAP_WIDTH;
    const cy = (current / MAP_WIDTH) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (!isWalkable(state, nx, ny)) continue;
      const nIdx = ny * MAP_WIDTH + nx;
      if (closed[nIdx]) continue;
      const tentative = gScore[current] + 1;
      if (tentative >= gScore[nIdx]) continue;
      gScore[nIdx] = tentative;
      cameFrom[nIdx] = current;
      open.push(nIdx, tentative + heuristic(nIdx));
    }
  }
  return null;
}

/** Convenience wrapper used by the job system: path to a tile id. */
export function findPathToTile(
  state: GameState,
  start: Vector2,
  tileId: TileId,
  options: PathOptions = {},
): Vector2[] | null {
  const tile = state.tiles[tileId];
  if (!tile) return null;
  return findPath(state, start, { x: tile.x, y: tile.y }, options);
}
