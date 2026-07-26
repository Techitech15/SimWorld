// Texture loading. Everything is nearest-neighbour filtered so 32px pixel art
// stays crisp at any zoom level (section 12).
import { Assets, Rectangle, Texture } from 'pixi.js';
import { TILE_SIZE } from '../core/constants';

const BASE = `${import.meta.env.BASE_URL ?? '/'}assets/sprites`;

export const SPRITE_URLS = {
  grass: `${BASE}/terrain/grass.png`,
  forest1: `${BASE}/terrain/forest_1.png`,
  forest2: `${BASE}/terrain/forest_2.png`,
  stone: `${BASE}/terrain/stone.png`,
  wall: `${BASE}/buildings/wall.png`,
  wallBlueprint: `${BASE}/buildings/wall_blueprint.png`,
  floor: `${BASE}/buildings/floor.png`,
  doorClosed: `${BASE}/buildings/door_closed.png`,
  doorOpen: `${BASE}/buildings/door_open.png`,
  bed: `${BASE}/buildings/bed.png`,
  farm0: `${BASE}/buildings/farm_0.png`,
  farm1: `${BASE}/buildings/farm_1.png`,
  farm2: `${BASE}/buildings/farm_2.png`,
  storage: `${BASE}/buildings/storage_marker.png`,
  wood: `${BASE}/resources/wood.png`,
  stoneItem: `${BASE}/resources/stone.png`,
  food: `${BASE}/resources/food.png`,
  colonistWalk: `${BASE}/colonist/walk.png`,
  colonistWork: `${BASE}/colonist/work.png`,
} as const;

export type SpriteKey = keyof typeof SPRITE_URLS;

export interface GameTextures {
  tiles: Record<SpriteKey, Texture>;
  /** [direction][frame]; direction order matches the sheet: down, left, right, up */
  colonistWalk: Texture[][];
  colonistWork: Texture[];
}

function slice(sheet: Texture, x: number, y: number): Texture {
  return new Texture({
    source: sheet.source,
    frame: new Rectangle(x, y, TILE_SIZE, TILE_SIZE),
  });
}

export async function loadTextures(): Promise<GameTextures> {
  const entries = Object.entries(SPRITE_URLS) as [SpriteKey, string][];
  const loaded = await Promise.all(entries.map(([, url]) => Assets.load<Texture>(url)));

  const tiles = {} as Record<SpriteKey, Texture>;
  entries.forEach(([key], i) => {
    const texture = loaded[i];
    texture.source.scaleMode = 'nearest';
    tiles[key] = texture;
  });

  const walkSheet = tiles.colonistWalk;
  const colonistWalk: Texture[][] = [];
  for (let dir = 0; dir < 4; dir++) {
    const row: Texture[] = [];
    for (let frame = 0; frame < 4; frame++) {
      row.push(slice(walkSheet, frame * TILE_SIZE, dir * TILE_SIZE));
    }
    colonistWalk.push(row);
  }

  const workSheet = tiles.colonistWork;
  const colonistWork = [slice(workSheet, 0, 0), slice(workSheet, TILE_SIZE, 0)];

  return { tiles, colonistWalk, colonistWork };
}
