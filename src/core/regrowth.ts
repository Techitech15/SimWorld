// Forest regrowth.
//
// Chopping turns a forest tile into grass and nothing ever turned it back, so
// wood was the one resource a colony could exhaust permanently: clear the map
// and there is no more, for ever, on a map that otherwise renews everything
// else. Grass regrows, berries ripen again, wildlife walks back in from the
// edge - the trees were the exception.
//
// The rule is deliberately the simplest one that heals a clearing from its
// edges rather than sprinkling trees at random: a bare tile with a neighbouring
// tree may become a tree. That means a clear-cut in the middle of a wood closes
// slowly from the outside in, and a colony that fells the last tree in sight
// has genuinely lost something until the forest walks back.
import { FOREST_REGROW_CHANCE_PER_DAY, FOREST_REGROW_INTERVAL_TICKS } from './constants';
import { mulberry32 } from './rng';
import { CROP_GROWTH_BY_SEASON, seasonOf } from './season';
import { tileIdOf, updateTile } from './state';
import type { GameState } from './types';

/** Tiles a tree may never grow on, whatever is next door. */
function isClaimed(state: GameState, tileId: string): boolean {
  const tile = state.tiles[tileId];
  if (!tile) return true;
  if (tile.terrain !== 'grass') return true;
  if (tile.buildingId) return true;
  if (tile.itemIds.length > 0) return true; // a stack lying there is a stockpile
  if (tile.designation) return true;
  return false;
}

function hasTreeNeighbour(state: GameState, x: number, y: number): boolean {
  return (
    state.tiles[tileIdOf(x + 1, y)]?.terrain === 'forest' ||
    state.tiles[tileIdOf(x - 1, y)]?.terrain === 'forest' ||
    state.tiles[tileIdOf(x, y + 1)]?.terrain === 'forest' ||
    state.tiles[tileIdOf(x, y - 1)]?.terrain === 'forest'
  );
}

/**
 * Once a day, not every tick: a chance per tile per day is what the rate means,
 * and 3,600 tiles times five ticks a second would be a lot of dice for a change
 * nobody can see happen.
 *
 * Nothing grows in winter, for the same reason the crops do not.
 */
export function regrowForest(state: GameState): void {
  if (state.tick % FOREST_REGROW_INTERVAL_TICKS !== 0) return;
  if (CROP_GROWTH_BY_SEASON[seasonOf(state.tick)] <= 0) return;

  // Heal, do not spread. Without this the rule "a bare tile beside a tree may
  // become a tree" has no fixed point: measured over five years the forest went
  // from 1,033 tiles to 2,253 and the grassland from 1,892 to 672, which would
  // eventually leave the herds nothing to graze on.
  let standing = 0;
  for (const tileId in state.tiles) {
    if (state.tiles[tileId].terrain === 'forest') standing++;
  }
  if (standing >= state.forestCapacity) return;
  let room = state.forestCapacity - standing;

  // ground the player has claimed: no tree grows in a stockpile or a pen
  const claimed = new Set<string>();
  for (const zoneId in state.zones) {
    for (const tileId of state.zones[zoneId].tileIds) claimed.add(tileId);
  }

  const rnd = mulberry32(state.tick + 60077);
  for (const tileId in state.tiles) {
    const tile = state.tiles[tileId];
    if (tile.terrain !== 'grass') continue;
    // roll first, look second: the roll has to happen for every grass tile in a
    // fixed order or the result would depend on how the map was walked
    if (rnd() >= FOREST_REGROW_CHANCE_PER_DAY) continue;
    if (isClaimed(state, tileId)) continue;
    if (!hasTreeNeighbour(state, tile.x, tile.y)) continue;
    if (claimed.has(tileId)) continue;
    // grass and forest are both walkable, so this never moves a wall: no region
    // rebuild and no cached path to invalidate
    updateTile(state, tileId, { terrain: 'forest' });
    if (--room <= 0) return;
  }
}
