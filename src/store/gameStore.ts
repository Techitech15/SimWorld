// The single source of truth (section 3).
//
// Writers: (1) the simulation tick, (2) the player action functions below.
// Readers: PixiJS (subscribe) and React (selector subscriptions). Neither
// renderer writes here directly.
import { create } from 'zustand';
import * as actions from '../core/actions';
import { createSimContext, rebuildPathIndex, rebuildRegions } from '../core/derived';
import type { SimContext } from '../core/derived';
import { tickMany } from '../core/simulation';
import { generateWorld } from '../core/worldgen';
import type {
  AnimalDesignation,
  BuildingType,
  ColonistId,
  Designation,
  GameState,
  JobType,
  TileId,
  Vector2,
} from '../core/types';
import { DEFAULT_SLOT, loadGame, saveGame } from '../persistence/indexeddb';

/**
 * Derived caches (PathIndex / region labels) live outside the store: they are
 * not game state, are never saved, and must not trigger React re-renders.
 */
let simContext: SimContext;

export function getSimContext(): SimContext {
  return simContext;
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
  /** the tile the inspection panel is describing, set by any left click on the map */
  selectedTileId: TileId | null;
  statusMessage: string | null;

  // simulation
  advance: (ticks: number) => void;
  setSpeed: (speed: GameState['speed']) => void;

  // ui
  setTool: (tool: Tool) => void;
  selectColonist: (id: ColonistId | null) => void;
  selectTile: (id: TileId | null) => void;
  setStatus: (message: string | null) => void;

  // player actions (section 3: UI writes to the store, the tick reacts to it)
  setJobPriority: (colonistId: ColonistId, jobType: JobType, priority: number) => void;
  applyTool: (tileIds: TileId[]) => void;
  orderMove: (colonistId: ColonistId, target: Vector2) => void;
  toggleFarmSowing: (tileId: TileId) => void;

  // persistence
  newGame: (seed?: number) => void;
  save: () => Promise<void>;
  load: () => Promise<void>;
}

function initialState(): GameState {
  const state = generateWorld();
  simContext = createSimContext(state);
  return state;
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: initialState(),
  tool: { kind: 'select' },
  selectedColonistId: null,
  selectedTileId: null,
  statusMessage: null,

  advance: (ticks) => {
    if (ticks <= 0) return;
    set({ state: tickMany(get().state, simContext, ticks) });
  },

  setSpeed: (speed) => set({ state: actions.setSpeed(get().state, speed) }),

  setTool: (tool) => set({ tool }),
  selectColonist: (selectedColonistId) => set({ selectedColonistId }),
  selectTile: (selectedTileId) => set({ selectedTileId }),
  setStatus: (statusMessage) => set({ statusMessage }),

  setJobPriority: (colonistId, jobType, priority) =>
    set({
      state: actions.setJobPriority(get().state, colonistId, jobType, priority),
    }),

  applyTool: (tileIds) => {
    const { tool, state } = get();
    switch (tool.kind) {
      case 'designate':
        set({
          state: actions.setDesignation(state, tileIds, tool.designation),
        });
        break;
      case 'clearDesignation':
        set({ state: actions.setDesignation(state, tileIds, null) });
        break;
      case 'build':
        set({
          state: actions.placeBuildingBlueprint(state, tool.building, tileIds),
        });
        break;
      case 'storage':
        set({ state: actions.placeStorageZone(state, tileIds) });
        break;
      case 'pasture':
        set({ state: actions.placePastureZone(state, tileIds) });
        break;
      case 'animal':
        set({ state: actions.designateAnimals(state, tileIds, tool.designation) });
        break;
      case 'clearAnimal':
        set({ state: actions.designateAnimals(state, tileIds, null) });
        break;
      case 'cancel':
        // one eraser for both: blueprints under the drag, then any zone tiles
        set({ state: actions.removeZoneTiles(actions.cancelBlueprint(state, tileIds), tileIds) });
        break;
      default:
        break;
    }
  },

  orderMove: (colonistId, target) =>
    set({
      state: actions.orderMove(get().state, simContext, colonistId, target),
    }),

  toggleFarmSowing: (tileId) => set({ state: actions.toggleFarmSowing(get().state, tileId) }),

  newGame: (seed) => {
    const state = generateWorld(seed !== undefined ? { seed } : {});
    simContext = createSimContext(state);
    set({
      state,
      selectedColonistId: null,
      selectedTileId: null,
      statusMessage: 'New colony started.',
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

  load: async () => {
    try {
      const state = await loadGame(DEFAULT_SLOT);
      // section 8: PathIndex is derived, so it is rebuilt from the saved paths
      simContext = createSimContext(state);
      rebuildPathIndex(simContext, state);
      rebuildRegions(simContext, state);
      set({
        state,
        selectedColonistId: null,
      selectedTileId: null,
        statusMessage: `Loaded tick ${state.tick}.`,
      });
    } catch (error) {
      set({ statusMessage: `Load failed: ${(error as Error).message}` });
    }
  },
}));
