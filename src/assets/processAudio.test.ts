// Acceptance tests for tools/process-audio.mjs (docs/design-phase15-audio.md
// 5章's order form + the "後処理ツール" for issue #22). The tool has no
// dependency on the browser or the game state - it is a pure WAV-in,
// WAV-out pipeline - so it is imported directly and exercised here rather
// than through a harness. vite.config.ts's `test.include` is
// `src/**/*.test.ts`, so this file (not anything under tools/) is what
// `npx vitest run` actually picks up; the import below just reaches back
// into tools/ for the functions themselves.
import { describe, expect, it } from 'vitest';
import {
  FADE_OUT_SECONDS,
  SILENCE_THRESHOLD,
  TARGET_PEAK,
  normalizePeak,
  parseWav,
  processMaterial,
  toMono,
  trimLeadingSilence,
  truncateWithFadeOut,
  writeWavFloat32,
  writeWavPcm16Mono,
} from '../../tools/process-audio.mjs';

const SAMPLE_RATE = 44100;

function peakOf(samples: Float32Array): number {
  let peak = 0;
  for (const x of samples) peak = Math.max(peak, Math.abs(x));
  return peak;
}

describe('parseWav / writeWavFloat32 round-trip', () => {
  it('recovers the original sample values from a float32 stereo WAV', () => {
    // Assigning into a Float32Array forces the same float32 rounding the
    // writer applies, so the comparison after the round-trip can be exact
    // instead of approximate.
    const left = new Float32Array([0, 0.25, -0.5, 0.7079, -1, 1]);
    const right = new Float32Array([0, -0.25, 0.5, -0.7079, 1, -1]);

    const wav = writeWavFloat32([left, right], SAMPLE_RATE);
    const parsed = parseWav(wav);

    expect(parsed.sampleRate).toBe(SAMPLE_RATE);
    expect(parsed.numChannels).toBe(2);
    expect(parsed.bitsPerSample).toBe(32);
    expect(parsed.audioFormat).toBe(3); // IEEE float
    expect(Array.from(parsed.channelData[0])).toEqual(Array.from(left));
    expect(Array.from(parsed.channelData[1])).toEqual(Array.from(right));
  });
});

describe('toMono', () => {
  it('averages the channels', () => {
    const left = new Float32Array([1, 0.5, -1, 0]);
    const right = new Float32Array([-1, 0.5, 1, 0.4]);
    const mono = toMono([left, right]);
    // compare through a Float32Array so both sides go through the same
    // float32 rounding - (0 + 0.4) / 2 is exactly 0.2 in float64 but not in
    // float32, and mono's output is float32
    expect(Array.from(mono)).toEqual(Array.from(new Float32Array([0, 0.5, 0, 0.2])));
  });

  it('passes a single channel through unchanged', () => {
    const only = new Float32Array([0.1, -0.2, 0.3]);
    expect(Array.from(toMono([only]))).toEqual(Array.from(only));
  });
});

describe('trimLeadingSilence', () => {
  it('drops a 1000-frame silent lead-in', () => {
    const silence = new Array(1000).fill(0);
    const tone = new Array(200).fill(0.5);
    const samples = new Float32Array([...silence, ...tone]);

    const trimmed = trimLeadingSilence(samples);

    expect(trimmed.length).toBe(200);
    expect(trimmed[0]).toBeCloseTo(0.5, 6);
  });

  it('does not blow up on an all-silent clip, and returns it unchanged', () => {
    const samples = new Float32Array(500).fill(0);
    const trimmed = trimLeadingSilence(samples);
    expect(trimmed.length).toBe(500);
    expect(Array.from(trimmed).every((x) => x === 0)).toBe(true);
  });

  it('respects an explicit threshold', () => {
    const samples = new Float32Array([0.01, 0.01, 0.9, 0.9]);
    // 0.01 is below the default threshold (0.02) so it counts as silence too
    expect(trimLeadingSilence(samples).length).toBe(2);
    // but not below a threshold set lower than it
    expect(trimLeadingSilence(samples, 0.005).length).toBe(4);
  });
});

describe('truncateWithFadeOut', () => {
  it('truncates material longer than the target and fades the tail out', () => {
    // 0.05s (2205 frames) target with the default 0.01s (441 frame) fade
    // window leaves plenty of untouched material before the fade starts.
    const targetSeconds = 0.05;
    const samples = new Float32Array(5000).fill(0.9);

    const result = truncateWithFadeOut(samples, SAMPLE_RATE, targetSeconds);

    expect(result.length).toBe(Math.round(targetSeconds * SAMPLE_RATE));
    // the very end is quieter than the sample right before it - a fade, not a hard cut
    const last = Math.abs(result[result.length - 1]);
    const secondToLast = Math.abs(result[result.length - 2]);
    expect(last).toBeLessThan(secondToLast);
    // a sample well before the fade region is untouched
    expect(result[0]).toBeCloseTo(0.9, 6);
  });

  it('leaves material at or under the target length unstretched', () => {
    const samples = new Float32Array(100).fill(0.3);
    const result = truncateWithFadeOut(
      samples,
      SAMPLE_RATE,
      1 /* seconds, far longer than the input */,
    );
    expect(result.length).toBe(100);
    expect(Array.from(result)).toEqual(Array.from(samples));
  });

  it('the fade window is FADE_OUT_SECONDS long', () => {
    const targetSeconds = 0.02;
    const fadeLength = Math.round(FADE_OUT_SECONDS * SAMPLE_RATE);
    const samples = new Float32Array(5000).fill(1);
    const result = truncateWithFadeOut(samples, SAMPLE_RATE, targetSeconds);
    // just before the fade window starts, the sample is still full amplitude
    const preFadeIndex = result.length - fadeLength - 1;
    expect(result[preFadeIndex]).toBeCloseTo(1, 6);
    // the last sample in the clip is silent (fade reaches zero)
    expect(result[result.length - 1]).toBeCloseTo(0, 6);
  });
});

describe('normalizePeak', () => {
  it('brings a too-quiet clip up to exactly -3 dBFS', () => {
    const samples = new Float32Array([0, 0.001, -0.0015, 0.0008]);
    const result = normalizePeak(samples);
    expect(peakOf(result)).toBeCloseTo(TARGET_PEAK, 3);
  });

  it('brings a too-loud (clipping) clip down to exactly -3 dBFS', () => {
    const samples = new Float32Array([0, 3.5, -4.2, 1.1]);
    const result = normalizePeak(samples);
    expect(peakOf(result)).toBeCloseTo(TARGET_PEAK, 3);
  });

  it('never exceeds the target peak either way', () => {
    for (const peak of [0.0001, 0.5, 1, 10]) {
      const result = normalizePeak(new Float32Array([peak, -peak * 0.3]));
      expect(peakOf(result)).toBeLessThanOrEqual(TARGET_PEAK + 1e-6);
    }
  });

  it('leaves a fully silent clip alone instead of dividing by zero', () => {
    const samples = new Float32Array(10).fill(0);
    const result = normalizePeak(samples);
    expect(Array.from(result).every((x) => x === 0)).toBe(true);
    expect(Array.from(result).every((x) => Number.isFinite(x))).toBe(true);
  });
});

describe('writeWavPcm16Mono header', () => {
  it('writes a 16-bit PCM mono 44100Hz WAV', () => {
    const samples = new Float32Array([0, 0.5, -0.5, TARGET_PEAK, -TARGET_PEAK]);
    const wav = writeWavPcm16Mono(samples, SAMPLE_RATE);
    const parsed = parseWav(wav);

    expect(parsed.audioFormat).toBe(1); // PCM
    expect(parsed.bitsPerSample).toBe(16);
    expect(parsed.numChannels).toBe(1);
    expect(parsed.sampleRate).toBe(SAMPLE_RATE);
    expect(parsed.channelData[0].length).toBe(samples.length);
  });
});

describe('processMaterial (full pipeline)', () => {
  function makeRawStereoWav(frames: Float32Array): Buffer {
    return writeWavFloat32([frames, frames], SAMPLE_RATE);
  }

  it('mono-izes, trims, truncates+fades, normalizes and writes 16-bit PCM mono', () => {
    const silence = new Array(500).fill(0);
    const tone = new Array(3000).fill(0.1); // quiet, so normalization must boost it
    const raw = makeRawStereoWav(new Float32Array([...silence, ...tone]));

    const targetSeconds = 0.02; // shorter than the tone, forces truncation
    const result = processMaterial(raw, targetSeconds);

    expect(result.sampleRate).toBe(SAMPLE_RATE);
    expect(result.samples.length).toBe(Math.round(targetSeconds * SAMPLE_RATE));
    expect(peakOf(result.samples)).toBeCloseTo(TARGET_PEAK, 3);
    expect(result.wav.length).toBe(44 + result.samples.length * 2);

    const reparsed = parseWav(result.wav);
    expect(reparsed.audioFormat).toBe(1);
    expect(reparsed.bitsPerSample).toBe(16);
    expect(reparsed.numChannels).toBe(1);
  });

  it('completes without NaN or a crash on a fully silent input', () => {
    const raw = makeRawStereoWav(new Float32Array(2000).fill(0));
    expect(() => {
      const result = processMaterial(raw, 0.02);
      expect(Array.from(result.samples).every(Number.isFinite)).toBe(true);
      expect(Array.from(result.wav).every(Number.isFinite)).toBe(true);
    }).not.toThrow();
  });

  it('does not stretch material shorter than the target length', () => {
    const tone = new Array(300).fill(0.4); // ~6.8ms at 44100Hz
    const raw = makeRawStereoWav(new Float32Array(tone));
    const result = processMaterial(raw, 1 /* seconds, far longer than the input */);
    expect(result.samples.length).toBe(300);
  });
});

// Sanity check that the two constants referenced throughout stay related the
// way the design doc states them: -3 dBFS as a linear amplitude.
describe('constants', () => {
  it('TARGET_PEAK is -3 dBFS', () => {
    expect(TARGET_PEAK).toBeCloseTo(0.7079, 3);
  });

  it('SILENCE_THRESHOLD is small relative to TARGET_PEAK', () => {
    expect(SILENCE_THRESHOLD).toBeLessThan(TARGET_PEAK);
  });
});
