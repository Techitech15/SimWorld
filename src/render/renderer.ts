// Rendering layer (section 3): a PixiJS RAF loop that only ever *reads* the
// store. All input is forwarded to store action functions; nothing here mutates
// GameState directly.
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from '../core/constants';
import { tileIdOf } from '../core/state';
import type { Building, Colonist, GameState, Item, Tile } from '../core/types';
import { getNetworks, useGameStore } from '../store/gameStore';
import { EMPTY_NETWORKS, isPowered } from '../core/mana';
import type { ManaNetworks } from '../core/mana';
import { clampCamera, createCamera, screenToTile, zoomAt } from './camera';
import { damageStep, damageTint } from './damage';
import type { Camera } from './camera';
import { loadTextures } from './textures';
import type { GameTextures } from './textures';

const DIR_DOWN = 0;
const DIR_LEFT = 1;
const DIR_RIGHT = 2;
const DIR_UP = 3;

interface AnimalView {
  sprite: Sprite;
  displayX: number;
  displayY: number;
  facingRight: boolean;
}

interface ColonistView {
  sprite: Sprite;
  carried: Sprite;
  displayX: number;
  displayY: number;
  facing: number;
}

export class GameRenderer {
  private app = new Application();
  private world = new Container();
  private terrainLayer = new Container();
  private buildingLayer = new Container();
  private itemLayer = new Container();
  private animalLayer = new Container();
  private colonistLayer = new Container();
  private overlay = new Graphics();
  private selectionOverlay = new Graphics();

  private textures!: GameTextures;
  private camera!: Camera;

  private terrainSprites: Sprite[] = [];
  private terrainKeys: string[] = [];
  private buildingSprites = new Map<
    string,
    { base: Sprite; blueprint: Sprite | null; key: string }
  >();
  private itemSprites = new Map<string, Sprite>();
  private animalViews = new Map<string, AnimalView>();
  private colonistViews = new Map<string, ColonistView>();

  private lastState: GameState | null = null;
  private overlayKey = '';
  private dragStart: { x: number; y: number } | null = null;
  private dragCurrent: { x: number; y: number } | null = null;
  private panning = false;
  private panLast = { x: 0, y: 0 };
  private keysDown = new Set<string>();
  private host: HTMLElement | null = null;
  private disposers: (() => void)[] = [];
  private started = false;
  private destroyed = false;

  async init(host: HTMLElement): Promise<void> {
    this.host = host;
    if (this.destroyed) return; // destroyed before we even got going

    // An embedded host can still be laid out at zero height on the first frame;
    // starting then would size the canvas to 0x0 and render nothing.
    await waitForSize(host);
    if (this.destroyed) return;

    await this.app.init({
      background: 0x11131a,
      resizeTo: host,
      antialias: false,
      roundPixels: true,
      preference: 'webgl',
    });
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    host.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'none';

    this.textures = await loadTextures();
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    this.camera = createCamera(this.app.renderer.width, this.app.renderer.height);

    this.world.addChild(
      this.terrainLayer,
      this.buildingLayer,
      this.itemLayer,
      this.overlay,
      this.animalLayer,
      this.colonistLayer,
      this.selectionOverlay,
    );
    this.app.stage.addChild(this.world);

    this.buildTerrainSprites();
    this.attachInput();
    this.observeHostSize(host);
    this.app.ticker.add(() => this.renderFrame());
    this.started = true;
  }

  /**
   * `resizeTo` only reacts to window resizes, but an embedded host can change
   * size on its own (a resizable panel, a split view).
   */
  private observeHostSize(host: HTMLElement): void {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (this.destroyed || !this.started) return;
      const { clientWidth, clientHeight } = host;
      if (clientWidth > 0 && clientHeight > 0) this.app.renderer.resize(clientWidth, clientHeight);
    });
    observer.observe(host);
    this.disposers.push(() => observer.disconnect());
  }

  /**
   * Safe to call at any point, including before `init` has resolved - React's
   * StrictMode mounts effects twice in development.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
    if (this.started) this.app.destroy(true, { children: true });
  }

  // --- terrain -------------------------------------------------------------
  private buildTerrainSprites(): void {
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const sprite = new Sprite(this.textures.tiles.grass);
        sprite.x = x * TILE_SIZE;
        sprite.y = y * TILE_SIZE;
        this.terrainLayer.addChild(sprite);
        this.terrainSprites.push(sprite);
        this.terrainKeys.push('');
      }
    }
  }

  private terrainTexture(tile: Tile): Texture {
    switch (tile.terrain) {
      case 'forest':
        // two variants keyed off the tile position so forests are not uniform
        return (tile.x * 7 + tile.y * 13) % 2 === 0
          ? this.textures.tiles.forest1
          : this.textures.tiles.forest2;
      case 'stone':
        return this.textures.tiles.stone;
      case 'crystal':
        return this.textures.tiles.crystal;
      default:
        return this.textures.tiles.grass;
    }
  }

  private syncTerrain(state: GameState): void {
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const index = y * MAP_WIDTH + x;
        const tile = state.tiles[tileIdOf(x, y)];
        const key = tile.terrain;
        if (this.terrainKeys[index] === key) continue;
        this.terrainKeys[index] = key;
        this.terrainSprites[index].texture = this.terrainTexture(tile);
      }
    }
  }

  // --- buildings -----------------------------------------------------------
  private buildingTexture(building: Building, state: GameState): Texture {
    const t = this.textures.tiles;
    switch (building.type) {
      case 'wall':
        return t.wall;
      case 'stoneWall':
        return t.stoneWall;
      case 'floor':
        return t.floor;
      case 'stoneFloor':
        return t.stoneFloor;
      case 'door': {
        const tile = state.tiles[building.tileId];
        const occupied = Object.values(state.colonists).some(
          (c) => c.position.x === tile.x && c.position.y === tile.y,
        );
        return occupied ? t.doorOpen : t.doorClosed;
      }
      case 'bed':
        return t.bed;
      case 'manaFurnace':
        return t.manaFurnace;
      case 'manaConduit':
        // lit when the run it belongs to is actually carrying, so the player can
        // see where the power stops without opening a panel
        return isPowered(this.networks, building.id) ? t.manaConduitLive : t.manaConduit;
      case 'manaLamp':
        return isPowered(this.networks, building.id) ? t.manaLampLit : t.manaLamp;
      case 'hearth':
        return t.hearth;
      case 'manaExtractor':
        return isPowered(this.networks, building.id) ? t.manaExtractorRun : t.manaExtractor;
      case 'berryBush':
        return building.growth >= 1 ? t.berryRipe : t.berryBare;
      case 'farmPlot':
        if (!building.sown) return t.farm0;
        return building.growth >= 1 ? t.farm2 : building.growth > 0.35 ? t.farm1 : t.farm0;
      case 'storageZoneMarker':
        return t.storage;
      default:
        return t.floor;
    }
  }

  /**
   * The mana grids as of this frame. Read rather than stored: a lit conduit is
   * a fact about the network, and the network is derived, so the renderer asks
   * for it the same way the panels do.
   */
  private networks: ManaNetworks = EMPTY_NETWORKS;

  private syncBuildings(state: GameState): void {
    this.networks = getNetworks(state);
    const seen = new Set<string>();
    for (const id in state.buildings) {
      const building = state.buildings[id];
      const tile = state.tiles[building.tileId];
      seen.add(id);
      const texture = this.buildingTexture(building, state);
      // damage is part of the key: without it the sprite keeps the tint it was
      // built with and a wall being chewed through never changes on the map
      const damage = damageStep(building);
      const key = `${texture.uid}:${building.isBlueprint}:${damage}`;
      let view = this.buildingSprites.get(id);
      if (!view) {
        const base = new Sprite(texture);
        base.x = tile.x * TILE_SIZE;
        base.y = tile.y * TILE_SIZE;
        this.buildingLayer.addChild(base);
        view = { base, blueprint: null, key: '' };
        this.buildingSprites.set(id, view);
      }
      if (view.key !== key) {
        view.key = key;
        view.base.texture = texture;
        // a blueprint reads as a ghost of the finished building, tinted towards
        // the blueprint blue so it never looks like a dark hole in the map
        view.base.alpha = building.isBlueprint ? 0.55 : 1;
        view.base.tint = building.isBlueprint ? 0x8fd0ff : damageTint(damage);
        if (building.isBlueprint && !view.blueprint) {
          const frame = new Sprite(this.textures.tiles.wallBlueprint);
          frame.x = tile.x * TILE_SIZE;
          frame.y = tile.y * TILE_SIZE;
          this.buildingLayer.addChild(frame);
          view.blueprint = frame;
        } else if (!building.isBlueprint && view.blueprint) {
          view.blueprint.destroy();
          view.blueprint = null;
        }
      }
    }
    for (const [id, view] of this.buildingSprites) {
      if (seen.has(id)) continue;
      view.base.destroy();
      view.blueprint?.destroy();
      this.buildingSprites.delete(id);
    }
  }

  // --- items ---------------------------------------------------------------
  private itemTexture(item: Item): Texture {
    const t = this.textures.tiles;
    if (item.type === 'wood') return t.wood;
    if (item.type === 'stone') return t.stoneItem;
    if (item.type === 'manaCrystal') return t.manaCrystal;
    return t.food;
  }

  private syncItems(state: GameState): void {
    const seen = new Set<string>();
    for (const id in state.items) {
      const item = state.items[id];
      seen.add(id);
      let sprite = this.itemSprites.get(id);
      if (!sprite) {
        sprite = new Sprite(this.itemTexture(item));
        sprite.anchor.set(0.5);
        sprite.scale.set(0.7);
        this.itemLayer.addChild(sprite);
        this.itemSprites.set(id, sprite);
      }
      sprite.x = item.position.x * TILE_SIZE + TILE_SIZE / 2;
      sprite.y = item.position.y * TILE_SIZE + TILE_SIZE / 2;
    }
    for (const [id, sprite] of this.itemSprites) {
      if (seen.has(id)) continue;
      sprite.destroy();
      this.itemSprites.delete(id);
    }
  }

  // --- animals -------------------------------------------------------------
  private syncAnimals(state: GameState, deltaMs: number): void {
    const seen = new Set<string>();
    for (const id in state.animals) {
      const animal = state.animals[id];
      seen.add(id);
      let view = this.animalViews.get(id);
      if (!view) {
        const sprite = new Sprite(this.textures.animals[animal.species][0]);
        sprite.anchor.set(0.5);
        this.animalLayer.addChild(sprite);
        view = {
          sprite,
          displayX: animal.position.x,
          displayY: animal.position.y,
          facingRight: true,
        };
        this.animalViews.set(id, view);
      }

      const dx = animal.position.x - view.displayX;
      const dy = animal.position.y - view.displayY;
      const moving = Math.abs(dx) > 0.02 || Math.abs(dy) > 0.02;
      const speed = 0.007 * deltaMs;
      view.displayX += Math.abs(dx) < speed ? dx : Math.sign(dx) * speed;
      view.displayY += Math.abs(dy) < speed ? dy : Math.sign(dy) * speed;
      if (Math.abs(dx) > 0.02) view.facingRight = dx > 0;

      const frame = moving ? Math.floor(performance.now() / 220) % 2 : 0;
      view.sprite.texture = this.textures.animals[animal.species][frame];
      view.sprite.x = view.displayX * TILE_SIZE + TILE_SIZE / 2;
      view.sprite.y = view.displayY * TILE_SIZE + TILE_SIZE / 2;
      // the art faces right; mirroring is cheaper than a second set of frames
      view.sprite.scale.x = view.facingRight ? 1 : -1;
      // tamed animals get a warm tint so a herd reads apart from wildlife
      view.sprite.tint = animal.tame ? 0xffe0b0 : 0xffffff;
    }
    for (const [id, view] of this.animalViews) {
      if (seen.has(id)) continue;
      view.sprite.destroy();
      this.animalViews.delete(id);
    }
  }

  // --- colonists -----------------------------------------------------------
  private syncColonists(state: GameState, deltaMs: number): void {
    const seen = new Set<string>();
    for (const id in state.colonists) {
      const colonist = state.colonists[id];
      seen.add(id);
      let view = this.colonistViews.get(id);
      if (!view) {
        const sprite = new Sprite(this.textures.colonistWalk[DIR_DOWN][0]);
        sprite.anchor.set(0.5, 0.5);
        sprite.tint = colonist.color;
        this.colonistLayer.addChild(sprite);
        const carried = new Sprite(this.textures.tiles.wood);
        carried.anchor.set(0.5);
        carried.scale.set(0.45);
        carried.visible = false;
        this.colonistLayer.addChild(carried);
        view = {
          sprite,
          carried,
          displayX: colonist.position.x,
          displayY: colonist.position.y,
          facing: DIR_DOWN,
        };
        this.colonistViews.set(id, view);
      }
      this.updateColonistView(view, colonist, state, deltaMs);
    }
    for (const [id, view] of this.colonistViews) {
      if (seen.has(id)) continue;
      view.sprite.destroy();
      view.carried.destroy();
      this.colonistViews.delete(id);
    }
  }

  private updateColonistView(
    view: ColonistView,
    colonist: Colonist,
    state: GameState,
    deltaMs: number,
  ): void {
    // Tiles are discrete, so interpolate towards the logical position to keep
    // the movement readable at 5 ticks/second.
    const speed = 0.009 * deltaMs;
    const dx = colonist.position.x - view.displayX;
    const dy = colonist.position.y - view.displayY;
    const moving = Math.abs(dx) > 0.02 || Math.abs(dy) > 0.02;
    view.displayX += Math.abs(dx) < speed ? dx : Math.sign(dx) * speed;
    view.displayY += Math.abs(dy) < speed ? dy : Math.sign(dy) * speed;

    if (moving) {
      if (Math.abs(dx) >= Math.abs(dy)) view.facing = dx > 0 ? DIR_RIGHT : DIR_LEFT;
      else view.facing = dy > 0 ? DIR_DOWN : DIR_UP;
    }

    const job = colonist.currentJobId ? state.jobs[colonist.currentJobId] : null;
    const working = !moving && job?.state === 'active' && job.workProgress > 0;
    const sleeping = colonist.activity.kind === 'sleeping';

    if (working) {
      view.sprite.texture = this.textures.colonistWork[Math.floor(state.tick / 3) % 2];
    } else if (moving) {
      view.sprite.texture =
        this.textures.colonistWalk[view.facing][Math.floor(performance.now() / 140) % 4];
    } else {
      view.sprite.texture = this.textures.colonistWalk[view.facing][0];
    }

    view.sprite.x = view.displayX * TILE_SIZE + TILE_SIZE / 2;
    view.sprite.y = view.displayY * TILE_SIZE + TILE_SIZE / 2;
    view.sprite.alpha = sleeping ? 0.65 : 1;
    view.sprite.rotation = sleeping ? Math.PI / 2 : 0;

    if (colonist.carrying) {
      view.carried.visible = true;
      view.carried.texture =
        colonist.carrying.type === 'wood'
          ? this.textures.tiles.wood
          : colonist.carrying.type === 'stone'
            ? this.textures.tiles.stoneItem
            : this.textures.tiles.food;
      view.carried.x = view.sprite.x;
      view.carried.y = view.sprite.y - TILE_SIZE * 0.55;
    } else {
      view.carried.visible = false;
    }
  }

  // --- overlays ------------------------------------------------------------
  private syncDesignationOverlay(state: GameState): void {
    let key = '';
    for (const tileId in state.tiles) {
      const tile = state.tiles[tileId];
      if (tile.designation) key += `${tileId}:${tile.designation};`;
    }
    for (const zoneId in state.zones) {
      const zone = state.zones[zoneId];
      if (zone.type === 'pasture') key += `p:${zone.tileIds.length};`;
    }
    if (key === this.overlayKey) return;
    this.overlayKey = key;

    this.overlay.clear();
    // pasture ground goes under the designation marks
    for (const zoneId in state.zones) {
      const zone = state.zones[zoneId];
      if (zone.type !== 'pasture') continue;
      for (const tileId of zone.tileIds) {
        const tile = state.tiles[tileId];
        if (!tile) continue;
        this.overlay
          .rect(tile.x * TILE_SIZE, tile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
          .fill({ color: 0x6bbf59, alpha: 0.16 });
      }
    }
    for (const tileId in state.tiles) {
      const tile = state.tiles[tileId];
      if (!tile.designation) continue;
      const colour =
        tile.designation === 'chop'
          ? 0xffcf5c
          : tile.designation === 'mine'
            ? 0x8ecae6
            : 0xff8f6b; // deconstruct
      this.overlay
        .rect(tile.x * TILE_SIZE + 1, tile.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2)
        .stroke({ width: 2, color: colour, alpha: 0.95 });
    }
  }

  /** Rings around designated animals; redrawn every frame because they move. */
  private drawAnimalMarkers(state: GameState): void {
    for (const id in state.animals) {
      const animal = state.animals[id];
      const view = this.animalViews.get(id);
      if (!view) continue;

      // Anything on the attack gets a filled warning dot, whether it is a wolf
      // hunting or a boar that has turned on its hunter. A player who cannot
      // see which animal is dangerous cannot react to it.
      if (animal.activity.kind === 'stalking' || animal.activity.kind === 'attacking') {
        this.selectionOverlay
          .circle(view.sprite.x, view.sprite.y - TILE_SIZE * 0.55, 3)
          .fill({ color: 0xd6452f, alpha: 0.95 });
      }

      if (!animal.designation) continue;
      const colour =
        animal.designation === 'hunt'
          ? 0xd6452f
          : animal.designation === 'tame'
            ? 0x6bbf59
            : 0xf2a03d;
      this.selectionOverlay
        .circle(view.sprite.x, view.sprite.y, TILE_SIZE * 0.5)
        .stroke({ width: 2, color: colour, alpha: 0.9 });
    }
  }

  private syncSelectionOverlay(state: GameState): void {
    const { selectedColonistId, selectedAnimalId, selectedTileId, tool } = useGameStore.getState();
    this.selectionOverlay.clear();
    this.drawAnimalMarkers(state);

    // the tile the inspection panel is describing
    const inspected = selectedTileId ? state.tiles[selectedTileId] : undefined;
    if (inspected) {
      this.selectionOverlay
        .rect(inspected.x * TILE_SIZE, inspected.y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
        .stroke({ width: 2, color: 0xffffff, alpha: 0.7 });
    }

    if (selectedColonistId && state.colonists[selectedColonistId]) {
      const view = this.colonistViews.get(selectedColonistId);
      if (view) {
        this.selectionOverlay
          .circle(view.sprite.x, view.sprite.y + 4, TILE_SIZE * 0.55)
          .stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
      }
    }

    // A selected animal gets the same ring a selected colonist does. Without it
    // the animal panel sends the camera to a creature and marks nothing on the
    // map - and since selecting an animal clears the tile selection, there was
    // no mark at all, which is worse than the stale tile it replaced.
    if (selectedAnimalId && state.animals[selectedAnimalId]) {
      const view = this.animalViews.get(selectedAnimalId);
      if (view) {
        this.selectionOverlay
          .circle(view.sprite.x, view.sprite.y + 4, TILE_SIZE * 0.55)
          .stroke({ width: 2, color: 0xffe08a, alpha: 0.95 });
      }
    }

    if (this.dragStart && this.dragCurrent && tool.kind !== 'select') {
      const x0 = Math.min(this.dragStart.x, this.dragCurrent.x);
      const y0 = Math.min(this.dragStart.y, this.dragCurrent.y);
      const x1 = Math.max(this.dragStart.x, this.dragCurrent.x);
      const y1 = Math.max(this.dragStart.y, this.dragCurrent.y);
      this.selectionOverlay
        .rect(x0 * TILE_SIZE, y0 * TILE_SIZE, (x1 - x0 + 1) * TILE_SIZE, (y1 - y0 + 1) * TILE_SIZE)
        .fill({ color: 0xffffff, alpha: 0.12 })
        .stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
    }
  }

  // --- frame ---------------------------------------------------------------
  private renderFrame(): void {
    const deltaMs = this.app.ticker.deltaMS;
    const { state } = useGameStore.getState();

    if (state !== this.lastState) {
      this.lastState = state;
      this.syncTerrain(state);
      this.syncBuildings(state);
      this.syncItems(state);
      this.syncDesignationOverlay(state);
    }
    this.syncAnimals(state, deltaMs);
    this.syncColonists(state, deltaMs);
    this.consumeFocusRequest();
    this.syncSelectionOverlay(state);
    this.applyKeyboardPan(deltaMs);

    clampCamera(this.camera, this.app.renderer.width, this.app.renderer.height);
    this.world.scale.set(this.camera.zoom);
    this.world.x = -this.camera.x * this.camera.zoom;
    this.world.y = -this.camera.y * this.camera.zoom;
    this.reportViewport();
  }

  /**
   * Tell the store which tiles are on screen, so the minimap can outline them.
   * Rounded to whole tiles: at pixel precision a slow pan would be a state
   * change every frame, and the store drops a report that did not change.
   */
  private reportViewport(): void {
    const scale = TILE_SIZE * this.camera.zoom;
    useGameStore.getState().setViewport({
      x: Math.round(this.camera.x / TILE_SIZE),
      y: Math.round(this.camera.y / TILE_SIZE),
      w: Math.round(this.app.renderer.width / scale),
      h: Math.round(this.app.renderer.height / scale),
    });
  }

  private applyKeyboardPan(deltaMs: number): void {
    if (this.keysDown.size === 0) return;
    const step = (600 * deltaMs) / 1000 / this.camera.zoom;
    if (this.keysDown.has('ArrowLeft') || this.keysDown.has('a')) this.camera.x -= step;
    if (this.keysDown.has('ArrowRight') || this.keysDown.has('d')) this.camera.x += step;
    if (this.keysDown.has('ArrowUp') || this.keysDown.has('w')) this.camera.y -= step;
    if (this.keysDown.has('ArrowDown') || this.keysDown.has('s')) this.camera.y += step;
  }

  // --- input ---------------------------------------------------------------
  private attachInput(): void {
    const canvas = this.app.canvas;
    const rect = () => canvas.getBoundingClientRect();

    const toTile = (event: PointerEvent | WheelEvent) => {
      const bounds = rect();
      return screenToTile(this.camera, event.clientX - bounds.left, event.clientY - bounds.top);
    };

    const onPointerDown = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId);
      if (event.button === 1 || event.button === 2 || event.shiftKey) {
        this.panning = true;
        this.panLast = { x: event.clientX, y: event.clientY };
        return;
      }
      if (event.button !== 0) return;
      const tile = toTile(event);
      const { tool } = useGameStore.getState();
      if (tool.kind === 'select') {
        this.handleSelectClick(tile);
        return;
      }
      this.dragStart = tile;
      this.dragCurrent = tile;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (this.panning) {
        this.camera.x -= (event.clientX - this.panLast.x) / this.camera.zoom;
        this.camera.y -= (event.clientY - this.panLast.y) / this.camera.zoom;
        this.panLast = { x: event.clientX, y: event.clientY };
        return;
      }
      if (this.dragStart) this.dragCurrent = toTile(event);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (this.panning) {
        this.panning = false;
        return;
      }
      if (!this.dragStart || !this.dragCurrent) return;
      const tiles = tilesInRect(this.dragStart, this.dragCurrent);
      this.dragStart = null;
      this.dragCurrent = null;
      useGameStore.getState().applyTool(tiles);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = rect();
      zoomAt(
        this.camera,
        event.deltaY < 0 ? 1.12 : 1 / 1.12,
        event.clientX - bounds.left,
        event.clientY - bounds.top,
      );
    };

    const onContextMenu = (event: Event) => event.preventDefault();
    const onKeyDown = (event: KeyboardEvent) => this.keysDown.add(event.key);
    const onKeyUp = (event: KeyboardEvent) => this.keysDown.delete(event.key);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    this.disposers.push(() => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    });
  }

  /**
   * Select tool: click a colonist to select, click elsewhere to order a move.
   * Either way the clicked tile becomes what the inspection panel describes.
   */
  private handleSelectClick(tile: { x: number; y: number }): void {
    const store = useGameStore.getState();
    const state = store.state;
    store.selectTile(tileIdOf(tile.x, tile.y));
    const clicked = Object.values(state.colonists).find(
      (c) => c.position.x === tile.x && c.position.y === tile.y,
    );
    if (clicked) {
      store.selectColonist(clicked.id);
      return;
    }
    if (store.selectedColonistId) {
      store.orderMove(store.selectedColonistId, tile);
      return;
    }
    store.selectColonist(null);
  }

  /** A click on an alert asks for the camera; the next frame is where it lands. */
  private consumeFocusRequest(): void {
    const { focusTarget, focusOnTile } = useGameStore.getState();
    if (!focusTarget) return;
    this.focusOn(focusTarget.x, focusTarget.y);
    focusOnTile(null);
  }

  focusOn(x: number, y: number): void {
    if (!this.host) return;
    this.camera.x = x * TILE_SIZE - this.app.renderer.width / (2 * this.camera.zoom);
    this.camera.y = y * TILE_SIZE - this.app.renderer.height / (2 * this.camera.zoom);
  }
}

/** Resolve once the element has a non-zero box, or after a short grace period. */
function waitForSize(host: HTMLElement, timeoutMs = 2000): Promise<void> {
  if (host.clientWidth > 0 && host.clientHeight > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      observer?.disconnect();
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (host.clientWidth > 0 && host.clientHeight > 0) done();
          });
    observer?.observe(host);
  });
}

function tilesInRect(a: { x: number; y: number }, b: { x: number; y: number }): string[] {
  const tiles: string[] = [];
  const x0 = Math.max(0, Math.min(a.x, b.x));
  const y0 = Math.max(0, Math.min(a.y, b.y));
  const x1 = Math.min(MAP_WIDTH - 1, Math.max(a.x, b.x));
  const y1 = Math.min(MAP_HEIGHT - 1, Math.max(a.y, b.y));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles.push(tileIdOf(x, y));
  return tiles;
}
