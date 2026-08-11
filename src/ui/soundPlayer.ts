// The part of sound that actually touches the speaker (11章 フェーズ13 段階C,
// layered further in 段階 S-1, GitHub issue #17).
//
// Split from sfx.ts on purpose: everything decidable lives there and runs in
// headless tests; this file is the thin unfalsifiable rind - an AudioContext,
// a mute flag, an oscillator per tone, and the two things that only make
// sense once real audio nodes exist: how many voices of a tier may sound at
// once, and the random pitch jitter that keeps a repeating ambient sound from
// grating (issue 5.3: "ピッチをわずかに散らす...Math.random の使用は
// soundPlayer.ts 側に閉じ込め"). Muted is the *default*: the browser will not
// let a page speak before the player touches it anyway (autoplay policy), so
// the honest first state is silence with a switch in the top bar. Like the
// language and the panel folds, none of this goes near `GameState`.
import { create } from 'zustand';
import { useGameStore } from '../store/gameStore';
import { SFX, SFX_TIER, SFX_TIERS, SfxDirector } from './sfx';
import type { SfxName, SfxTier } from './sfx';

export const SOUND_STORAGE_KEY = 'simworld.sound';

interface SoundStore {
  muted: boolean;
  /** 0..1, a plain master fader over the per-tone volumes in the SFX table */
  volume: number;
  toggleMuted: () => void;
  setVolume: (v: number) => void;
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
  setVolume: (v: number) => {
    // Clamp defensively: a stray keyboard event or a corrupt stored value
    // should not be able to push a negative gain or drive an oscillator's
    // gain node above headroom.
    const volume = Math.min(1, Math.max(0, v));
    writeStored({ muted: get().muted, volume });
    set({ volume });
  },
}));

let context: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  context ??= new AudioContext();
  return context;
}

/**
 * How many voices of each tier are currently sounding (SFX_TIERS[tier].
 * maxConcurrent). This is exactly the "同時発音数の上限" the issue asks for
 * (5.3): it lives here rather than in sfx.ts because it is only meaningful
 * once real, time-limited audio nodes exist - the pure director has no
 * concept of a sound "finishing". A tier at its cap drops the *next* sound
 * silently rather than queuing it, which is the point: at 10x, dropping a
 * few soft ambient notes is inaudible, and never bunching them up is what
 * keeps the tier from ever being able to build into a wall of noise.
 */
const activeVoices: Record<SfxTier, number> = { alarm: 0, event: 0, ambient: 0 };

/**
 * Ambient tones get a small random detune (issue 5.3) so the same repeating
 * sound - several build taps or animal calls in a row - does not read as a
 * mechanical loop. `Math.random` is confined to this file on purpose: sfx.ts
 * is the pure decision layer and stays deterministic and node-testable.
 */
const AMBIENT_PITCH_JITTER = 0.06;

function jitter(hz: number, tier: SfxTier): number {
  if (tier !== 'ambient') return hz;
  return hz * (1 + (Math.random() * 2 - 1) * AMBIENT_PITCH_JITTER);
}

/** Render one entry of the SFX table: oscillators with a 5ms attack and an
 *  exponential die-away, nothing else. The table is the whole sound. */
export function playSfx(name: SfxName, volume: number): void {
  const ctx = ensureContext();
  if (!ctx || ctx.state !== 'running') return;
  const tier = SFX_TIER[name];
  const { gain: tierGain, maxConcurrent } = SFX_TIERS[tier];
  if (activeVoices[tier] >= maxConcurrent) return;

  const spec = SFX[name];
  const t0 = ctx.currentTime;
  let voiceEndsAt = 0;
  for (const tone of spec.tones) {
    const from = jitter(tone.from, tier);
    const osc = ctx.createOscillator();
    osc.type = tone.wave;
    osc.frequency.setValueAtTime(from, t0 + tone.at);
    if (tone.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(jitter(tone.to, tier), t0 + tone.at + tone.duration);
    }
    const gainNode = ctx.createGain();
    const peak = tone.volume * tierGain * volume;
    gainNode.gain.setValueAtTime(0.0001, t0 + tone.at);
    gainNode.gain.linearRampToValueAtTime(peak, t0 + tone.at + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(
      Math.max(peak * 0.01, 0.0001),
      t0 + tone.at + tone.duration,
    );
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(t0 + tone.at);
    osc.stop(t0 + tone.at + tone.duration + 0.02);
    voiceEndsAt = Math.max(voiceEndsAt, tone.at + tone.duration);
  }

  activeVoices[tier]++;
  setTimeout(() => {
    activeVoices[tier] = Math.max(0, activeVoices[tier] - 1);
  }, voiceEndsAt * 1000 + 20);
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
