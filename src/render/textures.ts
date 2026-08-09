// Texture loading. Everything is nearest-neighbour filtered so 32px pixel art
// stays crisp at any zoom level (section 12).
//
// The sprites are decoded through <img> rather than PixiJS's asset loader on
// purpose: that loader fetches the URL and calls createImageBitmap, and a
// `fetch()` of a data: URI is governed by the page's CSP `connect-src`. Bundled
// builds inline every sprite as a data URI, so under a strict CSP (a sandboxed
// iframe, an embed) the whole map would silently fail to load while the rest of
// the UI kept working. Decoding an <img> only needs `img-src`.
import { ImageSource, Rectangle, Texture } from 'pixi.js';
import { ANIMAL_SPECIES, TILE_SIZE } from '../core/constants';
import type { AnimalSpecies } from '../core/types';
import { sprites } from '../assets/sprites';
import type { SpriteKey } from '../assets/sprites';

export interface GameTextures {
  tiles: Record<SpriteKey, Texture>;
  /** [direction][frame]; direction order matches the sheet: down, left, right, up */
  colonistWalk: Texture[][];
  colonistWork: Texture[];
  /** two-frame walk cycle per species, drawn facing right and mirrored in code */
  animals: Record<AnimalSpecies, Texture[]>;
  /** two-frame raider, same convention as the animals */
  raiders: Texture[];
  /** two-frame trader */
  traders: Texture[];
}

async function decodeImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  // decode() rejects with a useless message in some browsers, so fall back to
  // the load/error events, which say which sprite actually failed.
  try {
    await image.decode();
  } catch {
    await new Promise<void>((resolve, reject) => {
      if (image.complete && image.naturalWidth > 0) {
        resolve();
        return;
      }
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`failed to load sprite: ${url.slice(0, 64)}`));
    });
  }
  if (image.naturalWidth === 0)
    throw new Error(`sprite decoded to an empty image: ${url.slice(0, 64)}`);
  return image;
}

function textureFromImage(image: HTMLImageElement): Texture {
  return new Texture({
    source: new ImageSource({
      resource: image,
      scaleMode: 'nearest',
      alphaMode: 'premultiply-alpha-on-upload',
    }),
  });
}

function slice(sheet: Texture, x: number, y: number): Texture {
  return new Texture({
    source: sheet.source,
    frame: new Rectangle(x, y, TILE_SIZE, TILE_SIZE),
  });
}

export async function loadTextures(): Promise<GameTextures> {
  const entries = Object.entries(sprites) as [SpriteKey, string][];
  const images = await Promise.all(entries.map(([, url]) => decodeImage(url)));

  const tiles = {} as Record<SpriteKey, Texture>;
  entries.forEach(([key], i) => {
    tiles[key] = textureFromImage(images[i]);
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

  const animals = {} as Record<AnimalSpecies, Texture[]>;
  for (const species of ANIMAL_SPECIES) {
    const sheet = tiles[species];
    animals[species] = [slice(sheet, 0, 0), slice(sheet, TILE_SIZE, 0)];
  }

  const raiders = [slice(tiles.raider, 0, 0), slice(tiles.raider, TILE_SIZE, 0)];
  const traders = [slice(tiles.trader, 0, 0), slice(tiles.trader, TILE_SIZE, 0)];

  return { tiles, colonistWalk, colonistWork, animals, raiders, traders };
}
