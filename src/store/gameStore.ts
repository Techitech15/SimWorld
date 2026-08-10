// The single source of truth (section 3).
//
// Writers: (1) the simulation tick, (2) the player action functions below.
// Readers: PixiJS (subscribe) and React (selector subscriptions). Neither
// renderer writes here directly.
import { create } from 'zustand';
import * as actions from '../core/actions';
import { createSimContext, rebuildPathIndex, rebuildRegions } from '../core/derived';
import { refreshNetworks } from '../core/mana';
import { clearTradeDeal, setTradeDeal } from '../core/trade';
import type { ManaNetworks } from '../core/mana';
import type { SimContext } from '../core/derived';
import { tickMany } from '../core/simulation';
import { generateWorld } from '../core/worldgen';
import { DEFAULT_SCENARIO, SCENARIOS } from '../core/scenario';
import type { ScenarioName } from '../core/scenario';
import type {
  AnimalDesignation,
  AnimalId,
  BuildingType,
  ColonistId,
  Designation,
  GameState,
  JobType,
  ResourceType,
  TileId,
  Vector2,
  ZoneId,
} from '../core/types';
import { AUTOSAVE_SLOT, DEFAULT_SLOT, hasSave, loadGame, saveGame } from '../persistence/indexeddb';

/**
 * Derived caches (PathIndex / region labels) live outside the store: they are
 * not game state, are never saved, and must not trigger React re-renders.
 */
let simContext: SimContext;

export function getSimContext(): SimContext {
  return simContext;
}

/**
 * The mana grids as of now. The UI needs them for the same reason the tick
 * does, and they are derived, so they are read through the context rather than
 * put in the store where React would try to diff them.
 */
export function getNetworks(state: GameState): ManaNetworks {
  return refreshNetworks(simContext, state);
}

export type Tool =
  | { kind: 'select' }
  | { kind: 'designate'; designation: Designation }
  | { kind: 'clearDesignation' }
  | { kind: 'build'; building: BuildingType }
  | { kind: 'storage' }
  | { kind: 'pasture' }
  | { kind: 'animal'; designation: AnimalDesignation }
  | { kind: 'clearAnimal' }
  | { kind: 'cancel' };

export interface GameStore {
  state: GameState;
  tool: Tool;
  selectedColonistId: ColonistId | null;
  /**
   * A creature walks, so selecting the tile it stood on when you clicked is
   * stale within a second - measured, all five species had left the tile by the
   * time the panel rendered. Selecting the animal itself is what a moving
   * target needs, exactly as colonists already had.
   */
  selectedAnimalId: AnimalId | null;
  /** the tile the inspection panel is describing, set by any left click on the map */
  selectedTileId: TileId | null;
  /**
   * A one-shot "put the camera here" request. React cannot reach the PixiJS
   * camera directly (section 3: the renderer only ever reads the store), so a
   * click on an alert leaves this behind and the next frame consumes it.
   */
  focusTarget: Vector2 | null;
  /**
   * What the camera can currently see, in tiles. Written by the renderer, read
   * by the minimap - the one place React needs to know where the camera is.
   * `setViewport` drops an unchanged report so a still camera is not a
   * re-render sixty times a second.
   */
  viewport: { x: number; y: number; w: number; h: number } | null;
  statusMessage: string | null;

  // simulation
  advance: (ticks: number) => void;
  setSpeed: (speed: GameState['speed']) => void;

  // ui
  setTool: (tool: Tool) => void;
  selectColonist: (id: ColonistId | null) => void;
  selectAnimal: (id: AnimalId | null) => void;
  selectTile: (id: TileId | null) => void;
  focusOnTile: (at: Vector2 | null) => void;
  setViewport: (viewport: { x: number; y: number; w: number; h: number }) => void;
  setStatus: (message: string | null) => void;

  // player actions (section 3: UI writes to the store, the tick reacts to it)
  setJobPriority: (colonistId: ColonistId, jobType: JobType, priority: number) => void;
  setZoneAccepts: (zoneId: ZoneId, type: ResourceType, allowed: boolean) => void;
  setTradeDeal: (traderId: string, give: ResourceType, take: ResourceType) => void;
  clearTradeDeal: (traderId: string) => void;
  assignWorkBySkill: () => void;
  applyTool: (tileIds: TileId[]) => void;
  orderMove: (colonistId: ColonistId, target: Vector2) => void;
  toggleFarmSowing: (tileId: TileId) => void;

  // persistence
  newGame: (scenario?: ScenarioName, seed?: number) => void;
  save: () => Promise<void>;
  load: (slot?: string) => Promise<void>;
  autosave: () => Promise<void>;
  hasAutosave: boolean;
  refreshAutosave: () => Promise<void>;
}

/**
 * A seed for a map nobody has asked for by number. `generateWorld` keeps its
 * fixed default so tests and saves stay reproducible; the "New map" button is
 * the one caller that genuinely wants a different world each time, and without
 * this it handed back the same one for ever.
 */
function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

/** The single write for a tool, so the store can tell whether it changed anything. */
function applyToolTo(state: GameState, tool: Tool, tileIds: TileId[]): GameState {
  switch (tool.kind) {
    case 'designate':
      return actions.setDesignation(state, tileIds, tool.designation);
    case 'clearDesignation':
      return actions.setDesignation(state, tileIds, null);
    case 'build':
      return actions.placeBuildingBlueprint(state, tool.building, tileIds);
    case 'storage':
      return actions.placeStorageZone(state, tileIds);
    case 'pasture':
      return actions.placePastureZone(state, tileIds);
    case 'animal':
      return actions.designateAnimals(state, tileIds, tool.designation);
    case 'clearAnimal':
      return actions.designateAnimals(state, tileIds, null);
    case 'cancel':
      // one eraser for both: blueprints under the drag, then any zone tiles
      return actions.removeZoneTiles(actions.cancelBlueprint(state, tileIds), tileIds);
    default:
      return state;
  }
}

/** Why a tool refused the whole drag, in the player's terms. */
function refusalFor(tool: Tool): string | null {
  switch (tool.kind) {
    case 'designate':
      if (tool.designation === 'chop') return 'Chopping needs forest.';
      if (tool.designation === 'mine') return 'Mining needs a rock face.';
      return 'Only a finished building can be dismantled.';
    case 'build':
      return 'Nothing can be built there: the ground is taken or is solid rock.';
    case 'storage':
      return 'A storage zone needs clear, walkable ground.';
    case 'pasture':
      return 'A pasture needs grass to graze.';
    case 'animal':
      if (tool.designation === 'tame') return 'Nothing there can be tamed.';
      if (tool.designation === 'slaughter') return 'Only tamed animals can be slaughtered.';
      return 'No wild animal there to hunt.';
    case 'cancel':
      return 'Nothing there to remove.';
    default:
      return null;
  }
}

function initialState(): GameState {
  const state = generateWorld({ seed: randomSeed() });
  simContext = createSimContext(state);
  return state;
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: initialState(),
  tool: { kind: 'select' },
  selectedColonistId: null,
  selectedAnimalId: null,
  selectedTileId: null,
  focusTarget: null,
  viewport: null,
  statusMessage: null,
  hasAutosave: false,

  advance: (ticks) => {
    if (ticks <= 0) return;
    set({ state: tickMany(get().state, simContext, ticks) });
  },

  setSpeed: (speed) => set({ state: actions.setSpeed(get().state, speed) }),

  setTool: (tool) => set({ tool }),
  selectColonist: (selectedColonistId) => set({ selectedColonistId, selectedAnimalId: null }),
  selectAnimal: (selectedAnimalId) => set({ selectedAnimalId, selectedColonistId: null }),
  selectTile: (selectedTileId) => set({ selectedTileId }),
  focusOnTile: (focusTarget) => set({ focusTarget }),
  setViewport: (viewport) => {
    const current = get().viewport;
    if (
      current &&
      current.x === viewport.x &&
      current.y === viewport.y &&
      current.w === viewport.w &&
      current.h === viewport.h
    ) {
      return;
    }
    set({ viewport });
  },
  setStatus: (statusMessage) => set({ statusMessage }),

  setJobPriority: (colonistId, jobType, priority) =>
    set({
      state: actions.setJobPriority(get().state, colonistId, jobType, priority),
    }),

  setZoneAccepts: (zoneId, type, allowed) =>
    set({ state: actions.setZoneAccepts(get().state, zoneId, type, allowed) }),

  setTradeDeal: (traderId, give, take) =>
    set({ state: setTradeDeal(get().state, traderId, give, take) }),

  clearTradeDeal: (traderId) => set({ state: clearTradeDeal(get().state, traderId) }),

  assignWorkBySkill: () => {
    const state = actions.assignWorkBySkill(get().state);
    set(
      state === get().state
        ? { statusMessage: 'Everyone is already on their best work.' }
        : { state, statusMessage: 'Work assigned by skill.' },
    );
  },

  applyTool: (tileIds) => {
    const { tool, state } = get();
    const next = applyToolTo(state, tool, tileIds);
    if (next === state) {
      // Every tool silently ignores tiles it cannot use, so a drag that lands
      // entirely on the wrong ground did nothing and looked like a broken
      // click. Say which rule refused it.
      const why = refusalFor(tool);
      set(why ? { statusMessage: why } : {});
      return;
    }
    set({ state: next, statusMessage: null });
  },

  orderMove: (colonistId, target) =>
    set({
      state: actions.orderMove(get().state, simContext, colonistId, target),
    }),

  toggleFarmSowing: (tileId) => set({ state: actions.toggleFarmSowing(get().state, tileId) }),

  newGame: (scenario, seed) => {
    const chosen = scenario ?? DEFAULT_SCENARIO;
    const state = generateWorld({ seed: seed ?? randomSeed(), scenario: chosen });
    simContext = createSimContext(state);
    set({
      state,
      selectedColonistId: null,
      selectedAnimalId: null,
      selectedTileId: null,
      statusMessage: `New colony started — ${SCENARIOS[chosen].label}.`,
    });
  },

  save: async () => {
    try {
      await saveGame(get().state, DEFAULT_SLOT);
      set({ statusMessage: `Saved at tick ${get().state.tick}.` });
    } catch (error) {
      set({ statusMessage: `Save failed: ${(error as Error).message}` });
    }
  },

  autosave: async () => {
    try {
      await saveGame(get().state, AUTOSAVE_SLOT);
      set({ hasAutosave: true });
    } catch {
      // an autosave that cannot be written is not worth interrupting play over
    }
  },

  refreshAutosave: async () => {
    set({ hasAutosave: await hasSave(AUTOSAVE_SLOT).catch(() => false) });
  },

  load: async (slot = DEFAULT_SLOT) => {
    try {
      const state = await loadGame(slot);
      // section 8: PathIndex is derived, so it is rebuilt from the saved paths
      simContext = createSimContext(state);
      rebuildPathIndex(simContext, state);
      rebuildRegions(simContext, state);
      set({
        state,
        selectedColonistId: null,
        selectedAnimalId: null,
      selectedTileId: null,
        statusMessage: `Loaded tick ${state.tick}.`,
      });
    } catch (error) {
      set({ statusMessage: `Load failed: ${(error as Error).message}` });
    }
  },
}));
