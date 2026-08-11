// The part of sound that actually touches the speaker (11章 フェーズ13 段階C).
//
// Split from sfx.ts on purpose: everything decidable lives there and runs in
// headless tests; this file is the thin unfalsifiable rind - an AudioContext,
// a mute flag, an oscillator per tone. Muted is the *default*: the browser
// will not let a page speak before the player touches it anyway (autoplay
// policy), so the honest first state is silence with a switch in the top bar.
// Like the language and the panel folds, none of this goes near `GameState`.
import { create } from 'zustand';
import { useGameStore } from '../store/gameStore';
import { SFX, SfxDirector } from './sfx';
import type { SfxName } from './sfx';

export const SOUND_STORAGE_KEY = 'simworld.sound';

interface SoundStore {
  muted: boolean;
  /** 0..1, a plain master fader over the per-tone volumes in the SFX table */
  volume: number;
  toggleMuted: () => void;
}

interface StoredSound {
  muted?: boolean;
  volume?: number;
}

function readStored(): StoredSound {
  try {
    const raw = localStorage.getItem(SOUND_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSound) : {};
  } catch {
    // no storage, corrupt value, private mode: sound settings are never worth
    // failing to start over
    return {};
  }
}

function writeStored(value: Required<StoredSound>): void {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* see readStored() */
  }
}

export const useSoundStore = create<SoundStore>((set, get) => ({
  muted: readStored().muted ?? true,
  volume: readStored().volume ?? 0.5,
  toggleMuted: () => {
    const muted = !get().muted;
    writeStored({ muted, volume: get().volume });
    // unmuting is always a click on the toggle, which is exactly the user
    // gesture the autoplay policy wants the AudioContext created inside
    if (!muted) void ensureContext()?.resume();
    set({ muted });
  },
}));

let context: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  context ??= new AudioContext();
  return context;
}

/** Render one entry of the SFX table: oscillators with a 5ms attack and an
 *  exponential die-away, nothing else. The table is the whole sound. */
export function playSfx(name: SfxName, volume: number): void {
  const ctx = ensureContext();
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime;
  for (const tone of SFX[name]) {
    const osc = ctx.createOscillator();
    osc.type = tone.wave;
    osc.frequency.setValueAtTime(tone.from, t0 + tone.at);
    if (tone.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(tone.to, t0 + tone.at + tone.duration);
    }
    const gain = ctx.createGain();
    const peak = tone.volume * volume;
    gain.gain.setValueAtTime(0.0001, t0 + tone.at);
    gain.gain.linearRampToValueAtTime(peak, t0 + tone.at + 0.005);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(peak * 0.01, 0.0001),
      t0 + tone.at + tone.duration,
    );
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0 + tone.at);
    osc.stop(t0 + tone.at + tone.duration + 0.02);
  }
}

/**
 * Wire the director to the running game. Subscribes to the store, feeds every
 * state change through the diff, and plays whatever comes back - unless muted,
 * in which case the director still *sees* everything (so unmuting does not
 * replay a backlog) and only the speaker is skipped.
 */
export function wireSfx(): () => void {
  const director = new SfxDirector();
  director.update(useGameStore.getState().state, performance.now());
  return useGameStore.subscribe((s) => {
    const names = director.update(s.state, performance.now());
    if (names.length === 0) return;
    const { muted, volume } = useSoundStore.getState();
    if (muted) return;
    for (const name of names) playSfx(name, volume);
  });
}
