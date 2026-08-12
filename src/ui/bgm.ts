// The day/night mix and target gains for BGM (docs/design-phase15-audio.md 6章
// / 8章 段階 S-3, GitHub issue #22).
//
// Split from bgmPlayer.ts the same way sfx.ts is split from soundPlayer.ts:
// this file decides *how loud* each of the two BGM tracks should be right
// now, as a pure function of GameState (plus the BGM store's own mute/volume,
// passed in rather than read from a store, so this stays a pure function of
// its arguments) - no AudioContext, no Math.random, importable under plain
// node. The actual crossfading - ramping real GainNode values towards these
// numbers - is bgmPlayer.ts's job.
//
// The day/night mix is derived from daylight.ts's own tint alpha rather than
// computed fresh from the hour: daylight.ts already turns the clock into a
// continuous 0..NIGHT_ALPHA value with no jump across dawn/dusk (its own
// acceptance condition), and reusing it means there is exactly one place in
// the codebase that decides what "how far into night" means - a BGM crossfade
// that disagreed with the screen's own darkness would read as a bug even
// though nothing was technically wrong.
import { NIGHT_ALPHA, shadeAt } from '../render/daylight';
import type { GameState } from '../core/types';

export interface BgmMix {
  day: number;
  night: number;
}

/** Continuous day/night crossfade weight, derived from daylight.ts's own tint
 *  alpha so the music never disagrees with what the screen is doing (and so
 *  there is only one place that decides what "how far into night" means). */
export function bgmMixAt(tick: number): BgmMix {
  const { alpha } = shadeAt(tick);
  const night = Math.min(1, Math.max(0, alpha / NIGHT_ALPHA));
  return { day: 1 - night, night };
}

export interface BgmGains {
  day: number;
  night: number;
}

/** The gain each BGM track should be at right now: 0 for both while paused
 *  (state.speed === 0, same rule the cloud shadows / wind use) or while the
 *  BGM slider says muted/zero, otherwise the crossfade weights above scaled
 *  by the BGM volume. `muted` and `volume` are passed in rather than read
 *  from a store because this file must stay a pure function of its
 *  arguments - the BGM mute/volume state lives in bgmPlayer.ts, independent
 *  of the SFX mute/volume in soundPlayer.ts (issue #22 acceptance condition
 *  1: each fader is independent). */
export function bgmGains(state: GameState, muted: boolean, volume: number): BgmGains {
  if (state.speed === 0 || muted || volume <= 0) return { day: 0, night: 0 };
  const mix = bgmMixAt(state.tick);
  return { day: mix.day * volume, night: mix.night * volume };
}
