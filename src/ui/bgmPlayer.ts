// The BGM playback layer (docs/design-phase15-audio.md 6章 / 8章 段階 S-3,
// GitHub issue #22).
//
// Kept separate from soundPlayer.ts rather than appended to it, mirroring the
// sfx.ts / soundPlayer.ts split one level up: BGM has its own store, its own
// decode/loop lifecycle, and mixing two always-on tracks is a different shape
// of code than firing one-shot SFX voices - keeping both in one file would
// make both harder to read. The two layers do share one thing on purpose: the
// AudioContext (ensureContext, exported from soundPlayer.ts for this reason) -
// a page should only ever spin up one, whether or not both faders end up used.
//
// The decision of *how loud* each track should be lives in bgm.ts (pure,
// node-testable); this file is the unfalsifiable rind around it, same as
// soundPlayer.ts is for sfx.ts.
import { create } from 'zustand';
import { audioUrlsFor } from '../assets/audio';
import { useGameStore } from '../store/gameStore';
import { bgmGains } from './bgm';
import type { BgmGains } from './bgm';
import { ensureContext } from './soundPlayer';

export const BGM_STORAGE_KEY = 'simworld.bgm';

interface BgmStore {
  muted: boolean;
  /** 0..1, the BGM's own master fader - independent of the SFX one in
   *  soundPlayer.ts (issue #22 acceptance condition 1: each fader is
   *  independent; turning BGM off while keeping SFX on is the common case). */
  volume: number;
  toggleMuted: () => void;
  setVolume: (v: number) => void;
}

interface StoredBgm {
  muted?: boolean;
  volume?: number;
}

function readStored(): StoredBgm {
  try {
    const raw = localStorage.getItem(BGM_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredBgm) : {};
  } catch {
    // no storage, corrupt value, private mode: sound settings are never worth
    // failing to start over (same reasoning as soundPlayer.ts's readStored)
    return {};
  }
}

function writeStored(value: Required<StoredBgm>): void {
  try {
    localStorage.setItem(BGM_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* see readStored() */
  }
}

export const useBgmStore = create<BgmStore>((set, get) => ({
  // off by default, same reasoning as SFX (soundPlayer.ts): the browser's
  // autoplay policy will not let audio start before a gesture anyway, so the
  // honest first state is silence with a switch (issue #22 acceptance
  // condition 4).
  muted: readStored().muted ?? true,
  volume: readStored().volume ?? 0.5,
  toggleMuted: () => {
    const muted = !get().muted;
    writeStored({ muted, volume: get().volume });
    // unmuting is always a click on the toggle - the user gesture the
    // autoplay policy wants the (shared) AudioContext resumed inside
    if (!muted) {
      const ctx = ensureContext();
      void ctx?.resume();
      // first unmute is also the first moment decoding is possible or worth it
      if (ctx) loadBgmTracks(ctx);
    }
    set({ muted });
  },
  setVolume: (v: number) => {
    // Clamp defensively, same as soundPlayer.ts's setVolume: a stray keyboard
    // event or a corrupt stored value should not be able to push a negative
    // or over-headroom gain.
    const volume = Math.min(1, Math.max(0, v));
    writeStored({ muted: get().muted, volume });
    set({ volume });
  },
}));

type BgmTrackName = 'bgm_day' | 'bgm_night';

/**
 * The pair of audio nodes for one looping track. Created exactly once per
 * track's lifetime (see attachBgmTrack below) - every later volume/crossfade
 * change is a `gain.gain.value` assignment on the node stored here, never a
 * second `AudioBufferSourceNode` or a second `.start()` (issue #22
 * acceptance condition 3: "毎回 start() し直す実装にしないこと - それが継ぎ目の
 * 正体になる" - restarting on every change is exactly what produces the
 * audible seam).
 */
export interface BgmTrack {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export type BgmTrackMap = Map<BgmTrackName, BgmTrack>;

const tracks: BgmTrackMap = new Map();
let tracksRequested = false;

/**
 * Build the node graph for one decoded loop and start it. Takes its context
 * as a parameter rather than reading a module-level one implicitly, so this
 * is testable without a real browser AudioContext - this project's vitest
 * runs with `environment: 'node'` (vitest.config.ts), where no Web Audio API
 * exists, and a test can hand in a minimal hand-written fake object instead.
 *
 * `.loop = true` with `loopStart`/`loopEnd` spanning the whole buffer, and
 * `.start()` called exactly once, ever: everything downstream of this is a
 * gain change on the returned nodes, never a new node - see applyGains.
 */
export function attachBgmTrack(
  ctx: Pick<AudioContext, 'createBufferSource' | 'createGain' | 'destination'>,
  buffer: AudioBuffer,
): BgmTrack {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.loopStart = 0;
  source.loopEnd = buffer.duration;
  const gain = ctx.createGain();
  gain.gain.value = 0; // silent until the first gain push (wireBgm / syncGains)
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
  return { source, gain };
}

/**
 * Decode whatever BGM files were supplied, one attempt per track, ever
 * (`tracksRequested` guards it the same way soundPlayer.ts's `loadSamples`
 * guards itself with `samplesRequested`). Called on the first unmute: the
 * AudioContext cannot exist before the player's gesture anyway, and a page
 * that never unmutes should not spend anything decoding music it will never
 * play.
 *
 * `audioUrlsFor` returning `[]` is the normal, expected state right now (no
 * BGM files exist yet) - it simply means no BGM audio for that track, not a
 * bug, and unlike SFX there is no synthesised fallback to fall back to.
 * Each track's fetch/decode is its own try/catch: one track's failure must
 * never take down the other track or SFX. Only the first URL is used per
 * track - BGM is one continuous loop, not a repeated one-shot, so it does not
 * need SFX's multi-variant treatment.
 */
export function loadBgmTracks(ctx: AudioContext): void {
  if (tracksRequested) return;
  tracksRequested = true;
  const names: BgmTrackName[] = ['bgm_day', 'bgm_night'];
  for (const name of names) {
    const urls = audioUrlsFor(name);
    if (urls.length === 0) continue;
    void fetch(urls[0])
      .then((response) => response.arrayBuffer())
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buffer) => {
        tracks.set(name, attachBgmTrack(ctx, buffer));
        syncGains(); // push the current target gain immediately, not on the next tick
      })
      .catch(() => {
        /* this track stays silent for the rest of the session; see the doc above */
      });
  }
}

/**
 * Push target gains onto whichever tracks have actually decoded. Takes the
 * track map as a parameter (rather than reading module state) so it is
 * directly testable: a test can build its own tracks via attachBgmTrack
 * against a fake context and assert that calling this repeatedly never
 * touches node creation, only `gain.gain.value`.
 *
 * A track that has not decoded yet (no file, or still fetching) is simply
 * absent from the map - skipped, not queued, not thrown for.
 */
export function applyGains(tracks: BgmTrackMap, gains: BgmGains): void {
  const day = tracks.get('bgm_day');
  if (day) day.gain.gain.value = gains.day;
  const night = tracks.get('bgm_night');
  if (night) night.gain.gain.value = gains.night;
}

/** Read the current game state and BGM store, compute the target gains
 *  (bgm.ts), and push them onto whatever tracks exist so far. */
function syncGains(): void {
  const { muted, volume } = useBgmStore.getState();
  applyGains(tracks, bgmGains(useGameStore.getState().state, muted, volume));
}

/**
 * Wire BGM to the running game. Two subscriptions, because two different
 * things can move the target gain: the simulation state (tick, pause) and
 * the BGM store (mute, volume). Sound is wired outside the tick loop for the
 * same reason SFX is (App.tsx) - a volume drag or a pause has to land
 * immediately, not wait for the next tick, and while paused `bgmGains` pins
 * both tracks at 0 regardless of what the BGM store does, so a mute toggle
 * while paused correctly has nothing to change.
 */
export function wireBgm(): () => void {
  syncGains();
  const unsubGame = useGameStore.subscribe(syncGains);
  const unsubBgm = useBgmStore.subscribe(syncGains);
  return () => {
    unsubGame();
    unsubBgm();
  };
}
