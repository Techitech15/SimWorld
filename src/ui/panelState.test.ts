// The fold state (11章 フェーズ6, docs/design-phase6-space.md 4.3 / 5 段階B-2).
//
// The condition worth fixing mechanically is the one that would be invisible
// until somebody shared a save: the screen layout must never end up inside
// GameState.
import { beforeEach, describe, expect, it } from 'vitest';

// The suite runs in node, where there is no localStorage. A four-line stub is
// enough and keeps the whole suite off a DOM environment it needs nowhere else.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
};

import { createHarness } from '../core/testUtils';
import { defaultOpen } from './panelState';
import type { PanelId } from './panelState';

describe('the fold state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is not in the save, whatever the player folds', () => {
    const harness = createHarness(7101);
    for (const id of ['goals', 'colonists', 'work', 'animals', 'log'] as PanelId[]) {
      localStorage.setItem('simworld.panels', JSON.stringify({ [id]: false }));
    }
    const json = JSON.stringify(harness.state);
    for (const word of ['simworld.panels', 'panels', 'fold', 'sidebar', 'collapsed']) {
      expect(json.includes(word)).toBe(false);
    }
  });

  it('starts from what the colony has, not from a fixed list', () => {
    const harness = createHarness(7103);
    // three founders and no livestock on day one
    expect(Object.keys(harness.state.colonists).length).toBeLessThanOrEqual(3);
    expect(defaultOpen('work', harness.state)).toBe(false);
    expect(defaultOpen('animals', harness.state)).toBe(false);
    expect(defaultOpen('goals', harness.state)).toBe(true);
    // the board overlays (13章 段階B) start open: they are the glanceable ones
    expect(defaultOpen('resources', harness.state)).toBe(true);
    expect(defaultOpen('map', harness.state)).toBe(true);
    expect(defaultOpen('selection', harness.state)).toBe(true);
    // the bottom-right creature overlay (段階 U-1) starts open too, same as
    // its bottom-left tile sibling
    expect(defaultOpen('selectionCreature', harness.state)).toBe(true);

    // tame something and the animal panel has a reason to be open
    const [id] = Object.keys(harness.state.animals);
    harness.state.animals[id] = { ...harness.state.animals[id], tame: true };
    expect(defaultOpen('animals', harness.state)).toBe(true);
  });

  it('survives a reload, because it is written down outside the game', () => {
    localStorage.setItem('simworld.panels', JSON.stringify({ log: true, work: false }));
    const stored = JSON.parse(localStorage.getItem('simworld.panels')!) as Record<string, boolean>;
    expect(stored.log).toBe(true);
    expect(stored.work).toBe(false);
  });
});
