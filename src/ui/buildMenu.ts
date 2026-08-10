// The build menu, as one table (design-phase10-ores.md 5章).
//
// Every buildable entry - what tool it arms, which category it sits in, which
// key jumps to it - lives in BUILD_MENU and nowhere else. The toolbar renders
// its buttons from it, the keyboard shortcuts are derived from it, and the
// button hints are composed from it, so adding a building is one row here
// instead of three edits that can drift apart. Display names stay in the
// dictionary (strings.ts): this table carries ids, never text.
//
// The menu is a category switcher, not an accordion: only the selected
// category's buttons are visible, so the visible button count is capped by the
// largest category (7) no matter how many rows the table grows.
import { create } from 'zustand';
import { BUILDING_COSTS } from '../core/constants';
import type { Tool } from '../store/gameStore';
import type { Strings } from './strings';

export const BUILD_CATEGORIES = ['structure', 'furniture', 'mana', 'zones'] as const;
export type BuildCategory = (typeof BUILD_CATEGORIES)[number];

/** The tools the build menu can arm: place a building, or paint a zone. */
export type BuildMenuTool = Extract<Tool, { kind: 'build' | 'storage' | 'pasture' }>;

export interface BuildMenuEntry {
  tool: BuildMenuTool;
  category: BuildCategory;
  /** single letter, no modifier; must be unique across the whole menu */
  shortcut?: string;
}

export const BUILD_MENU: BuildMenuEntry[] = [
  // structure: 5
  { tool: { kind: 'build', building: 'wall' }, category: 'structure', shortcut: 'b' },
  { tool: { kind: 'build', building: 'stoneWall' }, category: 'structure' },
  { tool: { kind: 'build', building: 'floor' }, category: 'structure', shortcut: 'f' },
  { tool: { kind: 'build', building: 'stoneFloor' }, category: 'structure' },
  { tool: { kind: 'build', building: 'door' }, category: 'structure', shortcut: 'r' },
  // furniture: 2 now; stage B adds table/stool/dresser/armchair/statue for 7,
  // which is what sets the visible-button cap
  { tool: { kind: 'build', building: 'bed' }, category: 'furniture', shortcut: 'n' },
  { tool: { kind: 'build', building: 'hearth' }, category: 'furniture' },
  // mana: 5
  { tool: { kind: 'build', building: 'manaFurnace' }, category: 'mana' },
  { tool: { kind: 'build', building: 'manaConduit' }, category: 'mana' },
  { tool: { kind: 'build', building: 'manaLamp' }, category: 'mana' },
  { tool: { kind: 'build', building: 'manaExtractor' }, category: 'mana' },
  { tool: { kind: 'build', building: 'manaTurret' }, category: 'mana' },
  // zones: 3
  { tool: { kind: 'build', building: 'farmPlot' }, category: 'zones', shortcut: 'v' },
  { tool: { kind: 'storage' }, category: 'zones', shortcut: 'z' },
  { tool: { kind: 'pasture' }, category: 'zones', shortcut: 'p' },
];

/** The category a tool lives in, so arming it can bring its buttons on screen. */
export function buildMenuCategoryOf(tool: Tool): BuildCategory | undefined {
  return BUILD_MENU.find((entry) =>
    entry.tool.kind === 'build'
      ? tool.kind === 'build' && tool.building === entry.tool.building
      : tool.kind === entry.tool.kind,
  )?.category;
}

/** Button label, from the one place display names live. */
export function buildMenuLabel(strings: Strings, entry: BuildMenuEntry): string {
  if (entry.tool.kind === 'build') return strings.buildingLabels[entry.tool.building];
  return entry.tool.kind === 'storage' ? strings.toolStorage : strings.toolPasture;
}

/** Hover hint: name and cost for a building, the zone hint for a zone. */
export function buildMenuHint(strings: Strings, entry: BuildMenuEntry): string {
  if (entry.tool.kind === 'build') {
    const costs = BUILDING_COSTS[entry.tool.building];
    const cost = costs.length === 0 ? strings.costFree : strings.costList(costs);
    return strings.buildButtonTitle(buildMenuLabel(strings, entry), cost);
  }
  return entry.tool.kind === 'storage' ? strings.toolStorageHint : strings.toolPastureHint;
}

// ---------------------------------------------------------------------------
// Which category is open. A display preference like the language, not a fact
// about the colony, so it lives in localStorage and is never saved or migrated
// (design-phase10-ores.md 5.2).
// ---------------------------------------------------------------------------

export const BUILD_CATEGORY_STORAGE_KEY = 'simworld.buildCategory';

export function initialBuildCategory(): BuildCategory {
  try {
    const stored = localStorage.getItem(BUILD_CATEGORY_STORAGE_KEY);
    if ((BUILD_CATEGORIES as readonly string[]).includes(stored ?? '')) {
      return stored as BuildCategory;
    }
  } catch {
    // no storage (headless tests, private mode): fall through to the default
  }
  // structure is the most-built category, so it is the one worth defaulting to
  return 'structure';
}

interface BuildCategoryStore {
  category: BuildCategory;
  setCategory: (category: BuildCategory) => void;
}

export const useBuildCategoryStore = create<BuildCategoryStore>((set) => ({
  category: initialBuildCategory(),
  setCategory: (category) => {
    try {
      localStorage.setItem(BUILD_CATEGORY_STORAGE_KEY, category);
    } catch {
      // a choice that cannot be remembered still applies for this visit
    }
    set({ category });
  },
}));
