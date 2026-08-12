import { useEffect } from 'react';
import type { GameState } from '../core/types';
import type { Tool } from '../store/gameStore';
import { useGameStore } from '../store/gameStore';
import { BUILD_MENU, useBuildCategoryStore } from './buildMenu';
import type { BuildMenuEntry } from './buildMenu';
import { SPEED_STEPS, SPEED_STEP_KEYS } from './speedSteps';

/**
 * Keyboard shortcuts for the things a player does constantly.
 *
 * WASD and the arrow keys already pan the camera (the renderer owns those), so
 * nothing here uses them. Everything is a single key with no modifier: a
 * modified key means the browser's own shortcut and is left alone.
 */
const TOOL_KEYS: Record<string, Tool> = {
  Escape: { kind: 'select' },
  c: { kind: 'designate', designation: 'chop' },
  m: { kind: 'designate', designation: 'mine' },
  x: { kind: 'designate', designation: 'deconstruct' },
  q: { kind: 'clearDesignation' },
  e: { kind: 'cancel' },
  h: { kind: 'animal', designation: 'hunt' },
  t: { kind: 'animal', designation: 'tame' },
  k: { kind: 'animal', designation: 'slaughter' },
};

/**
 * Build and zone keys come off the menu table (buildMenu.ts), so a menu row
 * carries its own shortcut instead of being listed a second time here.
 */
const MENU_KEYS: Record<string, BuildMenuEntry> = Object.fromEntries(
  BUILD_MENU.filter((entry) => entry.shortcut !== undefined).map((entry) => [
    entry.shortcut!,
    entry,
  ]),
);

/**
 * '1'/'2'/'3'/'4' -> the speed value at that index of SPEED_STEPS
 * (speedSteps.ts), so this table and the speed buttons in TopBar.tsx can
 * never disagree about which key sets which speed (issue #27).
 */
const SPEED_KEYS: Record<string, GameState['speed']> = Object.fromEntries(
  SPEED_STEP_KEYS.map((key, index) => [key, SPEED_STEPS[index].value]),
);

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.isContentEditable)) return;

      const store = useGameStore.getState();

      if (event.key === ' ') {
        event.preventDefault();
        // pause and resume, remembering nothing: 1x is the sane thing to
        // come back to and 3x is one more keystroke away
        store.setSpeed(store.state.speed === 0 ? 1 : 0);
        return;
      }
      // a lookup, not `event.key in SPEED_KEYS`: `in` also answers true for
      // 'constructor' and friends off the prototype, and MENU_KEYS below is
      // read the same way
      const speed = SPEED_KEYS[event.key];
      if (speed !== undefined) {
        store.setSpeed(speed);
        return;
      }

      const entry = MENU_KEYS[event.key];
      if (entry) {
        // open the entry's category too, so the armed tool is the one on screen
        useBuildCategoryStore.getState().setCategory(entry.category);
        store.setTool(entry.tool);
        return;
      }

      const tool = TOOL_KEYS[event.key];
      if (!tool) return;
      store.setTool(tool);
      if (tool.kind === 'select') store.selectTile(null);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
