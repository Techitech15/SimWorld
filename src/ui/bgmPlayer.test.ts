// Acceptance tests for the BGM playback layer's loop-node mechanics
// (docs/design-phase15-audio.md 8章 段階 S-3 condition 3, GitHub issue #22:
// "毎回 start() し直す実装にしないこと - それが継ぎ目の正体になる").
//
// This project's vitest runs with environment: 'node' (vitest.config.ts), so
// there is no real Web Audio API here. attachBgmTrack and applyGains both
// take their AudioContext-like / track-map arguments explicitly rather than
// reading module state, which is what makes them testable against a
// hand-written fake object - no jsdom, no polyfill.
//
// What this file *can* pin: the loop flag and loopStart/loopEnd span the
// whole buffer, a track's nodes are created exactly once, and repeated gain
// updates never call createBufferSource/createGain/.start() again. What it
// cannot pin - and what only a human listening to a real decoded audio file
// can confirm - is whether a *specific* waveform's loop point is actually
// inaudible; that depends on the file's own content, not on this code.
import { describe, expect, it, vi } from 'vitest';
import { applyGains, attachBgmTrack } from './bgmPlayer';
import type { BgmTrackMap } from './bgmPlayer';

/** A minimal stand-in for a decoded AudioBuffer - only `duration` is read. */
function fakeBuffer(duration: number): AudioBuffer {
  return { duration } as unknown as AudioBuffer;
}

/** A minimal stand-in for an AudioContext: spied node factories that hand
 *  back plain objects shaped enough like AudioBufferSourceNode/GainNode for
 *  attachBgmTrack to use, with no real audio behind them. */
function fakeContext() {
  const destination = {} as AudioDestinationNode;
  const createBufferSource = vi.fn(function createBufferSource() {
    return {
      buffer: null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      connect: vi.fn(),
      start: vi.fn(),
    } as unknown as AudioBufferSourceNode;
  });
  const createGain = vi.fn(function createGain() {
    return {
      gain: { value: 0 },
      connect: vi.fn(),
    } as unknown as GainNode;
  });
  return { createBufferSource, createGain, destination };
}

describe('attachBgmTrack', () => {
  it('loops the whole buffer and starts exactly once', () => {
    const ctx = fakeContext();
    const buffer = fakeBuffer(87.5);
    const track = attachBgmTrack(ctx, buffer);

    expect(track.source.loop).toBe(true);
    expect(track.source.loopStart).toBe(0);
    expect(track.source.loopEnd).toBe(buffer.duration);
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
    expect(ctx.createGain).toHaveBeenCalledTimes(1);
    expect(track.source.start).toHaveBeenCalledTimes(1);
    expect(track.source.connect).toHaveBeenCalledWith(track.gain);
    expect(track.gain.connect).toHaveBeenCalledWith(ctx.destination);
  });
});

describe('applyGains', () => {
  it('only ever assigns gain.value - repeated calls never create a node or restart', () => {
    const ctx = fakeContext();
    const day = attachBgmTrack(ctx, fakeBuffer(60));
    const night = attachBgmTrack(ctx, fakeBuffer(90));
    const tracks: BgmTrackMap = new Map([
      ['bgm_day', day],
      ['bgm_night', night],
    ]);
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(2);
    expect(ctx.createGain).toHaveBeenCalledTimes(2);

    applyGains(tracks, { day: 0.3, night: 0.7 });
    applyGains(tracks, { day: 0.9, night: 0.1 });
    applyGains(tracks, { day: 0, night: 0 });

    expect(day.gain.gain.value).toBe(0);
    expect(night.gain.gain.value).toBe(0);
    // three more gain pushes; zero more nodes, zero more starts
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(2);
    expect(ctx.createGain).toHaveBeenCalledTimes(2);
    expect(day.source.start).toHaveBeenCalledTimes(1);
    expect(night.source.start).toHaveBeenCalledTimes(1);
  });

  it('skips a track that has not decoded yet, without throwing', () => {
    const ctx = fakeContext();
    const day = attachBgmTrack(ctx, fakeBuffer(60));
    const tracks: BgmTrackMap = new Map([['bgm_day', day]]);

    expect(() => applyGains(tracks, { day: 0.5, night: 0.5 })).not.toThrow();
    expect(day.gain.gain.value).toBe(0.5);
  });

  it('does nothing at all when no track has decoded (the no-files-yet state)', () => {
    const tracks: BgmTrackMap = new Map();
    expect(() => applyGains(tracks, { day: 1, night: 1 })).not.toThrow();
  });
});
