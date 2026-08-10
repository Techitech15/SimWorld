// The minimap is the only view of the whole 60x60 map, so what it is worth is
// exactly whether the thing you are looking for shows up on it. These tests
// paint a real world and read the pixels back.
import { describe, expect, it } from 'vitest';
import { placePastureZone, setDesignation } from '../core/actions';
import { tileIdOf } from '../core/state';
import { createHarness, nearestTilesWithTerrain } from '../core/testUtils';
import { addBuilding, createAnimal } from '../core/worldgen';
import type { GameState } from '../core/types';
import { paintMinimap } from './Minimap';

function paint(state: GameState): Uint8ClampedArray {
  const data = new Uint8ClampedArray(state.width * state.height * 4);
  paintMinimap(state, data);
  return data;
}

/** Dimensions come from the state under test, never from a build constant. */
function pixel(
  state: GameState,
  data: Uint8ClampedArray,
  x: number,
  y: number,
): [number, number, number, number] {
  const at = (y * state.width + x) * 4;
  return [data[at], data[at + 1], data[at + 2], data[at + 3]];
}

describe('minimap', () => {
  it('paints every tile of the world, leaving no holes', () => {
    const harness = createHarness(5101);
    const data = paint(harness.state);
    for (let y = 0; y < harness.state.height; y++) {
      for (let x = 0; x < harness.state.width; x++) {
        expect(pixel(harness.state, data, x, y)[3]).toBe(255);
      }
    }
  });

  it('gives every terrain its own colour', () => {
    const harness = createHarness(5107);
    const data = paint(harness.state);
    // bare ground only: anything standing on a tile is drawn over it, which is
    // the whole point of the layering
    const occupied = new Set<string>();
    for (const id in harness.state.animals) {
      const at = harness.state.animals[id].position;
      occupied.add(tileIdOf(at.x, at.y));
    }
    for (const id in harness.state.colonists) {
      const at = harness.state.colonists[id].position;
      occupied.add(tileIdOf(at.x, at.y));
    }
    const seen = new Map<string, string>();
    for (const tileId in harness.state.tiles) {
      const tile = harness.state.tiles[tileId];
      if (tile.buildingId || tile.designation || occupied.has(tileId)) continue;
      const key = pixel(harness.state, data, tile.x, tile.y).slice(0, 3).join(',');
      const already = seen.get(tile.terrain);
      if (already) expect(key).toBe(already);
      else seen.set(tile.terrain, key);
    }
    // Every terrain the map actually contains gets a colour, and no two share
    // one. Counting them rather than naming a number is what stops a fourth
    // terrain from arriving invisible: mana crystal was drawn correctly and
    // this assertion still failed, because it was testing the count.
    const present = new Set(Object.values(harness.state.tiles).map((tile) => tile.terrain));
    expect(seen.size).toBe(present.size);
    expect(seen.size).toBeGreaterThanOrEqual(3);
    expect(new Set(seen.values()).size).toBe(seen.size); // all different colours
  });

  it('shows a colonist over whatever they are standing on', () => {
    const harness = createHarness(5113);
    const at = Object.values(harness.state.colonists)[0].position;
    const bare = paint(harness.state);
    const under = pixel(harness.state, bare, at.x, at.y);
    expect(under.slice(0, 3)).toEqual([255, 255, 255]);

    // and the ground shows again once they walk off it
    harness.state.colonists = {};
    const empty = paint(harness.state);
    expect(pixel(harness.state, empty, at.x, at.y).slice(0, 3)).not.toEqual([255, 255, 255]);
  });

  it('marks a wolf differently from the herd it is stalking', () => {
    const harness = createHarness(5119);
    harness.state.animals = {};
    const at = Object.values(harness.state.colonists)[0].position;
    const wolf = createAnimal(harness.state, 'wolf', at.x + 8, at.y + 8);
    const deer = createAnimal(harness.state, 'deer', at.x + 9, at.y + 8);
    const cow = createAnimal(harness.state, 'chicken', at.x + 10, at.y + 8, { tame: true });

    const data = paint(harness.state);
    const wolfPixel = pixel(harness.state, data, wolf.position.x, wolf.position.y).slice(0, 3);
    const deerPixel = pixel(harness.state, data, deer.position.x, deer.position.y).slice(0, 3);
    const tamePixel = pixel(harness.state, data, cow.position.x, cow.position.y).slice(0, 3);
    expect(wolfPixel).not.toEqual(deerPixel);
    expect(tamePixel).not.toEqual(deerPixel);
    expect(wolfPixel).not.toEqual(tamePixel);
  });

  it('shows what the player has ordered and what is only planned', () => {
    const harness = createHarness(5123);
    const at = Object.values(harness.state.colonists)[0].position;
    const [tileId] = nearestTilesWithTerrain(harness.state, 'forest', at, 1);
    const before = paint(harness.state);
    const tile = harness.state.tiles[tileId];
    harness.state = setDesignation(harness.state, [tileId], 'chop');
    const after = paint(harness.state);
    expect(pixel(harness.state, after, tile.x, tile.y)).not.toEqual(pixel(harness.state, before, tile.x, tile.y));
  });

  it('draws a pasture as ground the herd may use, not as a building', () => {
    const harness = createHarness(5129);
    const at = Object.values(harness.state.colonists)[0].position;
    const ids: string[] = [];
    for (let d = 0; d < 3; d++) {
      const tile = harness.state.tiles[tileIdOf(at.x + 5 + d, at.y - 4)];
      if (tile?.terrain === 'grass' && !tile.buildingId) ids.push(tile.id);
    }
    expect(ids.length).toBeGreaterThan(0);
    const before = paint(harness.state);
    harness.state = placePastureZone(harness.state, ids);
    const after = paint(harness.state);
    const tile = harness.state.tiles[ids[0]];
    expect(pixel(harness.state, after, tile.x, tile.y)).not.toEqual(pixel(harness.state, before, tile.x, tile.y));
    // still green ground: the pen is grass the animals graze, not a structure
    const [r, g, b] = pixel(harness.state, after, tile.x, tile.y);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('marks a structure something is chewing on', () => {
    const harness = createHarness(5137);
    const at = Object.values(harness.state.colonists)[0].position;
    const wall = addBuilding(harness.state, 'wall', tileIdOf(at.x + 3, at.y - 3));
    const whole = pixel(harness.state, paint(harness.state), at.x + 3, at.y - 3);

    harness.state.buildings[wall.id] = { ...wall, hpCurrent: wall.hpMax - 1 };
    const chewed = pixel(harness.state, paint(harness.state), at.x + 3, at.y - 3);
    expect(chewed).not.toEqual(whole);
    // reddest of the three channels: findable on a 60x60 map at a glance
    expect(chewed[0]).toBeGreaterThan(chewed[1]);
    expect(chewed[0]).toBeGreaterThan(chewed[2]);
  });

  it('costs one pass over the world, however long the game has run', () => {
    const harness = createHarness(5131);
    harness.run(600);
    const data = new Uint8ClampedArray(harness.state.width * harness.state.height * 4);
    const started = performance.now();
    for (let i = 0; i < 20; i++) paintMinimap(harness.state, data);
    const perPaint = (performance.now() - started) / 20;
    // the frame budget is 200ms; a repaint has to be nowhere near it
    expect(perPaint).toBeLessThan(20);
  });
});
