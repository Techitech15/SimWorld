// Type declarations for process-audio.mjs, so tools/process-audio.mjs can be
// imported with types from a .ts file (src/assets/processAudio.test.ts)
// without turning on `allowJs` project-wide. Keep this in sync with the
// exports in process-audio.mjs by hand - there is no build step that does it
// for us.

export declare const TARGET_PEAK: number;
export declare const SILENCE_THRESHOLD: number;
export declare const FADE_OUT_SECONDS: number;
export declare const TARGET_DURATIONS: Record<string, number>;

export interface ParsedWav {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  audioFormat: number;
  channelData: Float32Array[];
}

export declare function parseWav(buffer: Uint8Array): ParsedWav;
export declare function writeWavFloat32(channelData: Float32Array[], sampleRate: number): Buffer;
export declare function writeWavPcm16Mono(samples: Float32Array, sampleRate: number): Buffer;
export declare function toMono(channelData: Float32Array[]): Float32Array;
export declare function trimLeadingSilence(samples: Float32Array, threshold?: number): Float32Array;
export declare function truncateWithFadeOut(
  samples: Float32Array,
  sampleRate: number,
  targetSeconds: number,
  fadeSeconds?: number,
): Float32Array;
export declare function normalizePeak(samples: Float32Array, targetPeak?: number): Float32Array;
export declare function processMaterial(
  rawWavBuffer: Uint8Array,
  targetSeconds: number,
): { sampleRate: number; samples: Float32Array; wav: Buffer };
