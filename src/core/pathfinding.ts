// Grid A* (section 7): 4-directional movement, Manhattan heuristic, uniform
// terrain cost. Path recomputation is only ever triggered by (a) a new
// destination and (b) a terrain change, both handled by the callers below.
import { inBounds, tileIdOf } from './state';
import type { GameState, TileId, Vector2 } from './types';

const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];

export function isWalkable(state: GameState, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return false;
  return state.tiles[tileIdOf(x, y)].walkable;
}

/**
 * Animals cannot work a door handle. A ring of walls with a door in it is
 * therefore a pen: colonists come and go, wolves and livestock do not. This is
 * the only thing that separates animal movement from colonist movement, and it
 * is what finally gives walls a job beyond decoration.
 */
export function isWalkableByAnimal(state: GameState, x: number, y: number): boolean {
  if (!isWalkable(state, x, y)) return false;
  const tile = state.tiles[tileIdOf(x, y)];
  const building = tile.buildingId ? state.buildings[tile.buildingId] : undefined;
  return !building || building.isBlueprint || building.type !== 'door';
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
  const startIdx = start.y * state.width + start.x;
  const goalIdx = goal.y * state.width + goal.x;
  const adjacent = options.adjacent ?? false;

  const isGoal = (idx: number): boolean => {
    if (idx === goalIdx) return !adjacent || isWalkable(state, goal.x, goal.y);
    if (!adjacent) return false;
    const x = idx % state.width;
    const y = (idx / state.width) | 0;
    return Math.abs(x - goal.x) + Math.abs(y - goal.y) === 1;
  };

  if (isGoal(startIdx)) return [];
  if (!isWalkable(state, start.x, start.y)) return null;

  const total = state.width * state.height;
  const gScore = new Float64Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const open = new MinHeap();

  const heuristic = (idx: number) => {
    const x = idx % state.width;
    const y = (idx / state.width) | 0;
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
        path.push({ x: node % state.width, y: (node / state.width) | 0 });
        node = cameFrom[node];
      }
      path.reverse();
      return path;
    }

    const cx = current % state.width;
    const cy = (current / state.width) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (!isWalkable(state, nx, ny)) continue;
      const nIdx = ny * state.width + nx;
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
