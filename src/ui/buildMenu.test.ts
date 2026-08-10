// Stage C acceptance (design-phase10-ores.md 8章): the build menu is one table,
// every category fits on screen, and the shortcuts derived from it cannot
// collide with each other or with the fixed order/animal keys.
import { describe, expect, it } from 'vitest';
import { BUILDING_COSTS } from '../core/constants';
import type { BuildingType } from '../core/types';
import {
  BUILD_CATEGORIES,
  BUILD_MENU,
  buildMenuCategoryOf,
  buildMenuHint,
  buildMenuLabel,
  initialBuildCategory,
} from './buildMenu';
import { STRINGS } from './strings';

/** The world places these itself; the player never builds one. */
const NOT_PLAYER_BUILT: BuildingType[] = ['berryBush', 'storageZoneMarker', 'frostbloom'];

/** Everything the player can build, straight from the cost table's keys. */
const PLAYER_BUILDABLE = (Object.keys(BUILDING_COSTS) as BuildingType[]).filter(
  (type) => !NOT_PLAYER_BUILT.includes(type),
);

/** Keys the shortcut layer reserves outside the menu (useKeyboardShortcuts.ts). */
const RESERVED_KEYS = ['Escape', 'c', 'm', 'x', 'q', 'e', 'h', 't', 'k', ' ', '1', '2', '3', '4'];

describe('build menu table', () => {
  it('lists every player-buildable building in exactly one category', () => {
    const counts: Partial<Record<BuildingType, number>> = {};
    for (const entry of BUILD_MENU) {
      if (entry.tool.kind !== 'build') continue;
      counts[entry.tool.building] = (counts[entry.tool.building] ?? 0) + 1;
    }
    for (const type of PLAYER_BUILDABLE) expect(counts[type], type).toBe(1);
    // and nothing the player cannot build sneaks a button in
    for (const type of NOT_PLAYER_BUILT) expect(counts[type], type).toBeUndefined();
  });

  it('keeps every category at 7 buttons or fewer', () => {
    // 7 is the furniture category at its stage-B size, the cap the switcher
    // design is built around (design-phase10-ores.md 5.2)
    for (const category of BUILD_CATEGORIES) {
      const size = BUILD_MENU.filter((entry) => entry.category === category).length;
      expect(size, category).toBeGreaterThan(0);
      expect(size, category).toBeLessThanOrEqual(7);
    }
    // every entry sits in a real category (no orphan rows)
    for (const entry of BUILD_MENU) expect(BUILD_CATEGORIES).toContain(entry.category);
  });

  it('derives unique shortcuts that avoid the reserved keys', () => {
    const seen = new Set<string>();
    for (const entry of BUILD_MENU) {
      if (entry.shortcut === undefined) continue;
      expect(seen.has(entry.shortcut), entry.shortcut).toBe(false);
      seen.add(entry.shortcut);
      expect(RESERVED_KEYS).not.toContain(entry.shortcut);
    }
  });

  it('keeps the bindings players already know', () => {
    const byKey = (key: string) => BUILD_MENU.find((entry) => entry.shortcut === key)?.tool;
    expect(byKey('b')).toEqual({ kind: 'build', building: 'wall' });
    expect(byKey('f')).toEqual({ kind: 'build', building: 'floor' });
    expect(byKey('r')).toEqual({ kind: 'build', building: 'door' });
    expect(byKey('n')).toEqual({ kind: 'build', building: 'bed' });
    expect(byKey('v')).toEqual({ kind: 'build', building: 'farmPlot' });
    expect(byKey('z')).toEqual({ kind: 'storage' });
    expect(byKey('p')).toEqual({ kind: 'pasture' });
  });

  it('finds the category a shortcut should open', () => {
    for (const entry of BUILD_MENU) {
      expect(buildMenuCategoryOf(entry.tool)).toBe(entry.category);
    }
    // tools outside the build menu belong to no category
    expect(buildMenuCategoryOf({ kind: 'select' })).toBeUndefined();
    expect(buildMenuCategoryOf({ kind: 'cancel' })).toBeUndefined();
  });

  it('resolves a label and a hint for every entry in both languages', () => {
    for (const strings of [STRINGS.en, STRINGS.ja]) {
      for (const entry of BUILD_MENU) {
        expect(buildMenuLabel(strings, entry).length).toBeGreaterThan(0);
        expect(buildMenuHint(strings, entry).length).toBeGreaterThan(0);
      }
      // the four chips have names too
      for (const category of BUILD_CATEGORIES) {
        expect(strings.buildCategoryLabels[category].length).toBeGreaterThan(0);
      }
    }
  });

  it('defaults to structure when nothing is stored', () => {
    // headless node has no localStorage, which is exactly the fallback path
    expect(initialBuildCategory()).toBe('structure');
  });
});
