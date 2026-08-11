import { useEffect } from 'react';
import type { Tool } from '../store/gameStore';
import { useGameStore } from '../store/gameStore';
import { BUILD_MENU, useBuildCategoryStore } from './buildMenu';
import type { BuildMenuEntry } from './buildMenu';

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
      if (event.key === '1' || event.key === '2' || event.key === '3' || event.key === '4') {
        store.setSpeed(({ '1': 0, '2': 1, '3': 3, '4': 10 } as const)[event.key]);
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
