// A 60x60 map does not fit on screen, and until now the only way to find the
// far corner of it was to pan there and look. The minimap is the whole world at
// one pixel per tile: where the woods are, where the rock is, where the wolves
// are, and one click to send the camera there.
//
// It is drawn straight into an ImageData rather than as 3,600 fills, and the
// canvas is 60x60 backing pixels scaled up by CSS - so a redraw is a few
// thousand array writes, cheap enough to do on every tick without thinking
// about it.
import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { isPredator } from '../core/animals';
import type { GameState } from '../core/types';
import { useGameStore } from '../store/gameStore';
import { useStrings } from './language';

type Rgb = [number, number, number];

const TERRAIN: Record<string, Rgb> = {
  grass: [74, 124, 63],
  forest: [40, 84, 45],
  stone: [125, 125, 134],
  // the one violet on the map: a vein has to be findable from the minimap
  crystal: [138, 95, 214],
  // rust against the grey, for the same reason
  ironVein: [172, 102, 58],
};

const BUILDING: Record<string, Rgb> = {
  wall: [186, 152, 104],
  stoneWall: [150, 150, 162],
  floor: [120, 96, 64],
  stoneFloor: [128, 128, 138],
  door: [214, 174, 110],
  bed: [143, 166, 216],
  farmPlot: [122, 82, 50],
  berryBush: [138, 58, 82],
  frostbloom: [168, 200, 226],
  storageZoneMarker: [92, 108, 132],
};

const PASTURE: Rgb = [104, 140, 78];
/** A structure something is chewing on. Red enough to find at 60x60. */
const DAMAGED: Rgb = [198, 84, 60];
const DESIGNATED: Rgb = [232, 152, 60];
const BLUEPRINT: Rgb = [120, 140, 180];
const COLONIST: Rgb = [255, 255, 255];
const PREDATOR: Rgb = [214, 74, 74];
const TAME: Rgb = [232, 196, 76];
const WILD: Rgb = [176, 132, 84];

function put(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  [r, g, b]: Rgb,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const at = (y * width + x) * 4;
  data[at] = r;
  data[at + 1] = g;
  data[at + 2] = b;
  data[at + 3] = 255;
}

/**
 * Turn a pointer position - in CSS pixels from the minimap canvas's own
 * top-left corner - into a tile coordinate. The canvas's CSS display size is
 * independent of the map's tile dimensions (the backing store is one pixel
 * per tile; the browser just scales it), so the ratio has to come from the
 * rect actually on screen rather than from TILE_SIZE or any build constant.
 *
 * Out-of-range points are clamped to the nearest edge tile rather than
 * rejected with null. That choice is for dragging: `setPointerCapture` lets
 * the pointer wander outside the minimap's rect while a drag is in progress
 * (issue #14), and a scrollbar-style clamp keeps the camera sliding to the
 * map edge instead of freezing the moment the cursor leaves the small canvas.
 */
export function tileAtMinimapPoint(
  pointX: number,
  pointY: number,
  rectWidth: number,
  rectHeight: number,
  mapWidth: number,
  mapHeight: number,
): { x: number; y: number } | null {
  if (rectWidth <= 0 || rectHeight <= 0 || mapWidth <= 0 || mapHeight <= 0) return null;
  const clampTile = (value: number, size: number) => Math.min(size - 1, Math.max(0, value));
  const x = clampTile(Math.floor((pointX / rectWidth) * mapWidth), mapWidth);
  const y = clampTile(Math.floor((pointY / rectHeight) * mapHeight), mapHeight);
  return { x, y };
}

/** One pass over the world, painted bottom layer first. */
export function paintMinimap(state: GameState, data: Uint8ClampedArray): void {
  const { width, height } = state;
  for (const tileId in state.tiles) {
    const tile = state.tiles[tileId];
    put(data, width, height, tile.x, tile.y, TERRAIN[tile.terrain] ?? TERRAIN.grass);
  }
  for (const zoneId in state.zones) {
    const zone = state.zones[zoneId];
    if (zone.type !== 'pasture') continue;
    for (const tileId of zone.tileIds) {
      const tile = state.tiles[tileId];
      if (tile) put(data, width, height, tile.x, tile.y, PASTURE);
    }
  }
  for (const buildingId in state.buildings) {
    const building = state.buildings[buildingId];
    const tile = state.tiles[building.tileId];
    if (!tile) continue;
    put(data, width, height, tile.x,
      tile.y,
      building.isBlueprint
        ? BLUEPRINT
        : building.hpCurrent < building.hpMax
          ? DAMAGED // a fence coming down is worth finding on the map, not just in an alert
          : BUILDING[building.type] ?? BLUEPRINT,
    );
  }
  for (const tileId in state.tiles) {
    const tile = state.tiles[tileId];
    if (tile.designation) put(data, width, height, tile.x, tile.y, DESIGNATED);
  }
  // creatures last: on a one-pixel-per-tile map, being covered by the floor
  // you are standing on would hide the thing the player is looking for
  for (const id in state.animals) {
    const animal = state.animals[id];
    put(data, width, height, animal.position.x,
      animal.position.y,
      isPredator(animal) ? PREDATOR : animal.tame ? TAME : WILD,
    );
  }
  for (const id in state.colonists) {
    const colonist = state.colonists[id];
    put(data, width, height, colonist.position.x, colonist.position.y, COLONIST);
  }
}

export function Minimap(): React.JSX.Element {
  const strings = useStrings();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<ImageData | null>(null);
  // Component-local only (CLAUDE.md: GameState stays plain data) - whether a
  // drag is in progress is not something a save file, or anything outside this
  // canvas, ever needs to know.
  const draggingRef = useRef(false);
  const state = useGameStore((s) => s.state);
  const viewport = useGameStore(
    useShallow((s) => [s.viewport?.x ?? 0, s.viewport?.y ?? 0, s.viewport?.w ?? 0, s.viewport?.h ?? 0]),
  );
  const focusOnTile = useGameStore((s) => s.focusOnTile);
  const selectTile = useGameStore((s) => s.selectTile);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    // Re-made when the map size changes: an ImageData is a fixed buffer, and
    // one sized for the previous world would paint the new one at the wrong
    // stride (docs/design-phase6-space.md 3.1).
    let image = imageRef.current;
    if (!image || image.width !== state.width || image.height !== state.height) {
      image = context.createImageData(state.width, state.height);
      imageRef.current = image;
    }
    paintMinimap(state, image.data);
    context.putImageData(image, 0, 0);

    const [vx, vy, vw, vh] = viewport;
    if (vw > 0 && vh > 0) {
      context.strokeStyle = 'rgba(255,255,255,0.85)';
      context.lineWidth = 1;
      context.strokeRect(vx + 0.5, vy + 0.5, Math.max(1, vw - 1), Math.max(1, vh - 1));
    }
  }, [state, viewport]);

  // Reads the pointer's current tile, from the canvas rect at the moment of
  // the event - not cached, since the rect can change under a resize.
  const tileFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return tileAtMinimapPoint(
      event.clientX - box.left,
      event.clientY - box.top,
      box.width,
      box.height,
      state.width,
      state.height,
    );
  };

  // Bare content: the Fold in App.tsx owns the section and heading (13章 段階B).
  return (
    <>
      <canvas
        ref={canvasRef}
        className="minimap"
        width={state.width}
        height={state.height}
        title={strings.minimapTitle}
        // pointerdown/move/up replace what used to be a single onClick, so the
        // camera can follow a drag rather than only jumping once per click
        // (issue #14). setPointerCapture keeps the drag alive even once the
        // cursor leaves this small canvas, matching renderer.ts's map-drag
        // handling (attachInput).
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          draggingRef.current = true;
          const tile = tileFromEvent(event);
          if (tile) focusOnTile(tile);
        }}
        onPointerMove={(event) => {
          if (!draggingRef.current) return;
          const tile = tileFromEvent(event);
          if (tile) focusOnTile(tile);
        }}
        onPointerUp={(event) => {
          if (!draggingRef.current) return;
          draggingRef.current = false;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          // Selection fires once, here, rather than on every pointermove like
          // focusOnTile does: the inspection panel reading a new tile on
          // every pixel of a drag would make it flicker through whatever the
          // drag crossed, instead of settling on the tile the player actually
          // meant to pick. A plain click (down then up without moving) still
          // ends up selecting the one tile it always did.
          const tile = tileFromEvent(event);
          if (tile) selectTile(`${tile.x},${tile.y}`);
        }}
        onPointerCancel={(event) => {
          draggingRef.current = false;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
      />
      <div className="minimap__key">
        <span className="minimap__dot" style={{ background: 'rgb(255,255,255)' }} /> {strings.keyColonist}
        <span className="minimap__dot" style={{ background: 'rgb(214,74,74)' }} /> {strings.keyPredator}
        <span className="minimap__dot" style={{ background: 'rgb(232,196,76)' }} /> {strings.keyTame}
        <span className="minimap__dot" style={{ background: 'rgb(176,132,84)' }} /> {strings.keyWild}
      </div>
    </>
  );
}
