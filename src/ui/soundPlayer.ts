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
import { audioUrlsFor } from '../assets/audio';
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
    if (!muted) {
      const ctx = ensureContext();
      void ctx?.resume();
      // first unmute is also the first moment decoding is possible or worth it
      if (ctx) loadSamples(ctx);
    }
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

export function ensureContext(): AudioContext | null {
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

/**
 * Decoded audio files, by sound name (docs/design-phase15-audio.md 4章).
 *
 * A name is present here only once at least one of its files has decoded. The
 * table is a *replacement* for the synthesised tones of that one sound and
 * nothing more: names with no file, and names whose fetch or decode failed,
 * are simply absent and fall through to the oscillators. That is the whole
 * point of the design - a broken file costs the sound its upgrade, never its
 * existence, because a sound that silently stops existing is a failure the
 * player has no way to notice.
 */
const samples = new Map<string, AudioBuffer[]>();
let samplesRequested = false;

/**
 * Decode whatever files were supplied. Called on the first unmute rather than
 * at module load: the AudioContext needed to decode cannot exist before the
 * player's gesture anyway, and a page that never unmutes should never spend
 * anything on audio it will not play.
 */
function loadSamples(ctx: AudioContext): void {
  if (samplesRequested) return;
  samplesRequested = true;
  for (const name of Object.keys(SFX) as SfxName[]) {
    const urls = audioUrlsFor(name);
    if (urls.length === 0) continue;
    for (const url of urls) {
      // Every step is allowed to fail on its own. One unreadable file must not
      // take the rest of the set - or the synthesised floor - down with it.
      void fetch(url)
        .then((response) => response.arrayBuffer())
        .then((bytes) => ctx.decodeAudioData(bytes))
        .then((buffer) => {
          samples.set(name, [...(samples.get(name) ?? []), buffer]);
        })
        .catch(() => {
          /* stays synthesised; see the comment on `samples` */
        });
    }
  }
}

/** Play one supplied file for this sound, if one has decoded. Returns whether
 *  it did, so the caller knows whether the synthesised tones are still owed. */
function playSample(ctx: AudioContext, name: SfxName, gain: number): boolean {
  const buffers = samples.get(name);
  if (!buffers || buffers.length === 0) return false;
  // Variants exist so a repeating ambient sound is not one sample on a loop;
  // with a single file this is just that file.
  const buffer = buffers[Math.floor(Math.random() * buffers.length)];
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const tier = SFX_TIER[name];
  // the same jitter the oscillators get, applied as playback rate - only for
  // ambient, and small enough not to read as a pitch change
  if (tier === 'ambient') source.playbackRate.value = jitter(1, tier);
  const gainNode = ctx.createGain();
  gainNode.gain.value = gain;
  source.connect(gainNode);
  gainNode.connect(ctx.destination);
  source.start();
  activeVoices[tier]++;
  setTimeout(
    () => {
      activeVoices[tier] = Math.max(0, activeVoices[tier] - 1);
    },
    buffer.duration * 1000 + 20,
  );
  return true;
}

/** Render one entry of the SFX table: oscillators with a 5ms attack and an
 *  exponential die-away, nothing else - unless a file was supplied for this
 *  sound, in which case that file is played instead (段階 S-2). */
export function playSfx(name: SfxName, volume: number): void {
  const ctx = ensureContext();
  if (!ctx || ctx.state !== 'running') return;
  const tier = SFX_TIER[name];
  const { gain: tierGain, maxConcurrent } = SFX_TIERS[tier];
  if (activeVoices[tier] >= maxConcurrent) return;

  // A supplied file is already mixed and mastered, so it takes the tier gain
  // and the master volume but not the per-tone volumes of the table it replaces.
  if (playSample(ctx, name, tierGain * volume)) return;

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
