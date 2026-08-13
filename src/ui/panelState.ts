// Which panels are folded away (docs/design-phase6-space.md 4.3).
//
// **Not in `GameState`.** The design document's chapters 4 and 8 rest on
// `GameState` being exactly what gets saved, so putting a fold state there
// would mean the save format grows a migration every time a panel is added,
// and loading somebody else's colony would rearrange your screen. This is a
// setting about the browser, so it lives in `localStorage` and never touches
// the simulation.
//
// The default is not "everything open" but "everything the colony has a reason
// to show", which is the same rule the goal panel follows: a colony with no
// livestock has nothing to say in an animal panel, and three colonists do not
// need a priority table open at all times.
import { useCallback, useEffect, useState } from 'react';
import type { GameState } from '../core/types';

export type PanelId =
  | 'goals'
  | 'colonists'
  | 'work'
  | 'animals'
  | 'log'
  // [ext] the colony's curated history (issue #28) - a separate panel from
  // 'log' on purpose, see ChroniclePanel.tsx's header comment
  | 'chronicle'
  | 'resources'
  | 'map'
  | 'research'
  // [ext] the tile-selection overlay on the board, bottom-left (13章 段階B)
  | 'selection'
  // [ext] the colonist/animal-selection overlay on the board, bottom-right
  // (段階 U-1: split out of 'selection' so a creature and its tile can show
  // at once - see SelectionFrame.tsx)
  | 'selectionCreature'
  // [ext] whether the two sidebars, when the viewport is too narrow to dock
  // them (layout.ts), are open as a drawer over the board (issue #26). Not
  // covered by `defaultOpenFrom` below - App.tsx calls `usePanelFold`
  // directly with `false`, since a drawer should start closed regardless of
  // what the colony looks like.
  | 'sidebarLeft'
  | 'sidebarRight';

const KEY = 'simworld.panels';

type Stored = Partial<Record<PanelId, boolean>>;

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    // a private-mode browser, a corrupt value, a quota error: a panel layout is
    // never worth failing to start over
    return {};
  }
}

function write(value: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* see read() */
  }
}

/**
 * Should this panel start open, given what the colony currently has?
 *
 * Only consulted for panels the player has never touched. Once they fold one,
 * that choice wins for ever - a screen that keeps reopening a panel you closed
 * is worse than one that never opens it.
 */
export interface ColonyShape {
  colonists: number;
  anyTame: boolean;
  /** [ext] a finished research desk (11章 フェーズ12): the panel is worth
   *  opening the moment there is one to work, not before. */
  hasResearchDesk: boolean;
}

export function defaultOpenFrom(id: PanelId, shape: ColonyShape): boolean {
  switch (id) {
    case 'work':
      // a table of nine columns is a settings screen, not a readout
      return shape.colonists > 3;
    case 'animals':
      return shape.anyTame;
    case 'research':
      return shape.hasResearchDesk;
    case 'log':
    case 'chronicle':
      // both are read-back-later panels, not glance-at-always ones (see 'log'
      // above; 'chronicle' is read even less often, once a season at most)
      return false;
    default:
      return true;
  }
}

/** The same rule, against a whole state. Used by the tests and by the panels
 *  that already hold one. */
export function defaultOpen(id: PanelId, state: GameState): boolean {
  return defaultOpenFrom(id, {
    colonists: Object.keys(state.colonists).length,
    anyTame: Object.values(state.animals).some((a) => a.tame),
    hasResearchDesk: Object.values(state.buildings).some(
      (b) => b.type === 'researchDesk' && !b.isBlueprint,
    ),
  });
}

export interface PanelFold {
  open: boolean;
  toggle: () => void;
}

/**
 * `fallback` is what to do when the player has never touched this panel, and it
 * is passed in rather than derived from the state here on purpose: this hook
 * runs in every panel, and a subscription to the whole `GameState` would
 * re-render all of them five times a second, since every tick produces a fresh
 * state object. The caller picks the one or two numbers it actually needs.
 */
export function usePanelFold(id: PanelId, fallback: boolean): PanelFold {
  const [stored, setStored] = useState<Stored>(read);
  const explicit = stored[id];
  const open = explicit ?? fallback;

  // another tab, or the same page in another window
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === KEY) setStored(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback(() => {
    setStored((previous) => {
      const next = { ...previous, [id]: !(previous[id] ?? fallback) };
      write(next);
      return next;
    });
  }, [id, fallback]);

  return { open, toggle };
}
