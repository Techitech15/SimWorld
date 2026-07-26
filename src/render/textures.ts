// Texture loading. Everything is nearest-neighbour filtered so 32px pixel art
// stays crisp at any zoom level (section 12).
import { Assets, Rectangle, Texture } from 'pixi.js';
import { TILE_SIZE } from '../core/constants';
import { sprites } from '../assets/sprites';
import type { SpriteKey } from '../assets/sprites';

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
  const entries = Object.entries(sprites) as [SpriteKey, string][];
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
