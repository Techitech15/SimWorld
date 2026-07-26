// Camera state: pan with drag / arrow keys, zoom with the wheel (section 10,
// week 2). Lives in the rendering layer only - the camera is not game state.
import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from '../core/constants';

export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 3;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export function createCamera(viewportWidth: number, viewportHeight: number): Camera {
  const zoom = 1;
  return {
    x: (MAP_WIDTH * TILE_SIZE) / 2 - viewportWidth / (2 * zoom),
    y: (MAP_HEIGHT * TILE_SIZE) / 2 - viewportHeight / (2 * zoom),
    zoom,
  };
}

export function clampCamera(camera: Camera, viewportWidth: number, viewportHeight: number): void {
  const worldWidth = MAP_WIDTH * TILE_SIZE;
  const worldHeight = MAP_HEIGHT * TILE_SIZE;
  const visibleWidth = viewportWidth / camera.zoom;
  const visibleHeight = viewportHeight / camera.zoom;
  const maxX = Math.max(0, worldWidth - visibleWidth);
  const maxY = Math.max(0, worldHeight - visibleHeight);
  camera.x = Math.min(Math.max(camera.x, -visibleWidth * 0.1), maxX + visibleWidth * 0.1);
  camera.y = Math.min(Math.max(camera.y, -visibleHeight * 0.1), maxY + visibleHeight * 0.1);
}

/** Zoom around a screen-space anchor so the tile under the cursor stays put. */
export function zoomAt(camera: Camera, factor: number, screenX: number, screenY: number): void {
  const worldX = camera.x + screenX / camera.zoom;
  const worldY = camera.y + screenY / camera.zoom;
  camera.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor));
  camera.x = worldX - screenX / camera.zoom;
  camera.y = worldY - screenY / camera.zoom;
}

export function screenToTile(
  camera: Camera,
  screenX: number,
  screenY: number,
): { x: number; y: number } {
  return {
    x: Math.floor((camera.x + screenX / camera.zoom) / TILE_SIZE),
    y: Math.floor((camera.y + screenY / camera.zoom) / TILE_SIZE),
  };
}
