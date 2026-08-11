// Which language the UI speaks (11章 フェーズ9).
//
// Language is a property of the display, not of the game: switching it changes
// no tick, so it lives in localStorage beside the other UI preferences and is
// never saved or migrated. The store is deliberately separate from gameStore -
// a language switch re-renders the translated components without touching the
// simulation subscription.
import { create } from 'zustand';
import { STRINGS } from './strings';
import type { Language, Strings } from './strings';

export const LANGUAGE_STORAGE_KEY = 'simworld.language';

export function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'en' || stored === 'ja') return stored;
  } catch {
    // no storage (headless tests, private mode): fall through to the browser
  }
  // the one line of detection: ja if the browser says so, en otherwise
  const tongue = typeof navigator !== 'undefined' ? (navigator.language ?? '') : '';
  return tongue.startsWith('ja') ? 'ja' : 'en';
}

interface LanguageStore {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const useLanguageStore = create<LanguageStore>((set) => ({
  language: initialLanguage(),
  setLanguage: (language) => {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // a language that cannot be remembered still applies for this visit
    }
    if (typeof document !== 'undefined') document.documentElement.lang = language;
    set({ language });
  },
}));

// keep <html lang> honest from the first paint, not only after a switch
if (typeof document !== 'undefined') {
  document.documentElement.lang = useLanguageStore.getState().language;
}

/** The active dictionary. Components re-render on switch by subscribing here. */
export function useStrings(): Strings {
  return STRINGS[useLanguageStore((s) => s.language)];
}

/** The active dictionary outside React (event handlers reading at call time). */
export function currentStrings(): Strings {
  return STRINGS[useLanguageStore.getState().language];
}
