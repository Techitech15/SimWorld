// Turns raw Stable Audio 3 output into shippable effect-sound files.
//
// This is the second half of tools/generate-audio.ps1: that script asks the
// model for 44.1kHz stereo float32 WAV (its native output, and NOT what the
// spec wants). This script reads that raw material, applies the passes the
// spec (docs/design-phase15-audio.md 5章) requires, and writes 16-bit PCM
// mono WAV into src/assets/audio/, from where src/assets/audio.ts picks it up
// by filename.
//
// No dependencies are added for this - WAV is a simple enough container to
// parse and write by hand, and every function below is a pure transform on
// Float32Array sample data so it can be unit-tested without touching a real
// file (see src/assets/processAudio.test.ts).
//
//   node tools/process-audio.mjs [inputDir]
//
// inputDir defaults to tools/generate-audio.ps1's own default OutDir. A
// missing or empty input directory is not an error: this repository ships
// and runs correctly with zero audio files (src/ui/sfx.ts's synthesised
// tones are the floor), so "no material yet" is just reported and the script
// exits cleanly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_INPUT_DIR = 'C:\\Dev\\StableAudio3\\outputs\\simworld';
const OUT_DIR = path.resolve(HERE, '..', 'src', 'assets', 'audio');

// -3 dBFS, linear amplitude. 5.1 of the design doc: "ピークを -3 dBFS 以下に正規化".
export const TARGET_PEAK = 10 ** (-3 / 20);

// Amplitude below this counts as silence when looking for where the sound
// actually starts. Linear scale, deliberately low: it only needs to skip true
// dead air, not the quiet tail of a fade-in.
export const SILENCE_THRESHOLD = 0.02;

// Length of the tail fade applied when a clip is truncated to its target
// length, so the cut does not click.
export const FADE_OUT_SECONDS = 0.01;

// Target output length in seconds, keyed by the sound's name (== the raw
// filename generate-audio.ps1 writes, minus ".wav"). From the order form in
// docs/design-phase15-audio.md 5章.
export const TARGET_DURATIONS = {
  raid: 1.2,
  alert: 0.5,
  death: 1.5,
  breakdown: 0.9,
  complete: 0.5,
  research: 0.9,
  trade: 0.45,
  arrival: 0.9,
  illness: 0.7,
  place: 0.15,
  build_1: 0.25,
  build_2: 0.25,
  build_3: 0.25,
  animal_1: 0.6,
  animal_2: 0.6,
  animal_3: 0.6,
  notify: 0.4,

  // BGM is never truncated. Infinity makes truncateWithFadeOut return the
  // material untouched, which is the point: every other sound gets a 10ms tail
  // fade so the cut does not click, but a track that loops must not have one -
  // the fade would be a dip in level every time round, which is exactly the
  // audible seam the issue asks us to avoid. Everything else still applies
  // (mono for size, leading silence trimmed, peak at -3 dBFS).
  bgm_day: Infinity,
  bgm_night: Infinity,
};

// --- WAV parsing -------------------------------------------------------

function readTag(view, offset) {
  let tag = '';
  for (let i = 0; i < 4; i++) tag += String.fromCharCode(view.getUint8(offset + i));
  return tag;
}

function sampleReader(view, audioFormat, bitsPerSample) {
  if (audioFormat === 3 && bitsPerSample === 32) return (o) => view.getFloat32(o, true);
  if (audioFormat === 3 && bitsPerSample === 64) return (o) => view.getFloat64(o, true);
  if (audioFormat === 1 && bitsPerSample === 16) return (o) => view.getInt16(o, true) / 32768;
  if (audioFormat === 1 && bitsPerSample === 8) return (o) => (view.getUint8(o) - 128) / 128;
  if (audioFormat === 1 && bitsPerSample === 32) return (o) => view.getInt32(o, true) / 2147483648;
  if (audioFormat === 1 && bitsPerSample === 24) {
    return (o) => {
      const b0 = view.getUint8(o);
      const b1 = view.getUint8(o + 1);
      const b2 = view.getUint8(o + 2);
      let v = b0 | (b1 << 8) | (b2 << 16);
      if (v & 0x800000) v -= 0x1000000; // sign-extend 24-bit
      return v / 8388608;
    };
  }
  throw new Error(
    `unsupported WAV sample format (audioFormat=${audioFormat}, bitsPerSample=${bitsPerSample})`,
  );
}

/**
 * Parses a WAV file (Buffer or Uint8Array) into per-channel Float32Array
 * sample data, each roughly in [-1, 1]. Understands PCM (format 1, 8/16/24/32
 * bit) and IEEE float (format 3, 32/64 bit), which covers both Stable Audio's
 * raw output (float32 stereo) and this script's own 16-bit PCM output - so
 * writeWavFloat32/writeWavPcm16Mono round-trip through this reader.
 *
 * Chunks between "fmt " and "data" (Stable Audio's output carries "fact" and
 * "PEAK" chunks) are skipped rather than assumed absent.
 */
export function parseWav(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.byteLength < 12 || readTag(view, 0) !== 'RIFF' || readTag(view, 8) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }
  let offset = 12;
  let fmt = null;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= view.byteLength) {
    const id = readTag(view, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        audioFormat: view.getUint16(body, true),
        numChannels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        blockAlign: view.getUint16(body + 12, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      dataOffset = body;
      dataSize = size;
    }
    offset = body + size + (size % 2); // chunks are padded to an even byte count
  }
  if (!fmt) throw new Error('WAV file has no fmt chunk');
  if (dataOffset < 0) throw new Error('WAV file has no data chunk');
  // A truncated file (or a data-chunk size that lied) must not read past the buffer.
  dataSize = Math.min(dataSize, view.byteLength - dataOffset);

  const { audioFormat, numChannels, sampleRate, bitsPerSample, blockAlign } = fmt;
  const bytesPerSample = bitsPerSample / 8;
  const frameCount = Math.floor(dataSize / blockAlign);
  const channelData = Array.from({ length: numChannels }, () => new Float32Array(frameCount));
  const readSample = sampleReader(view, audioFormat, bitsPerSample);

  for (let frame = 0; frame < frameCount; frame++) {
    const frameOffset = dataOffset + frame * blockAlign;
    for (let ch = 0; ch < numChannels; ch++) {
      channelData[ch][frame] = readSample(frameOffset + ch * bytesPerSample);
    }
  }
  return { sampleRate, numChannels, bitsPerSample, audioFormat, channelData };
}

// --- WAV writing ---------------------------------------------------------

function writeWavHeader(buffer, { audioFormat, numChannels, sampleRate, bitsPerSample, dataSize }) {
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // fmt chunk size, canonical (no extension)
  buffer.writeUInt16LE(audioFormat, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);
}

/**
 * Writes interleaved IEEE float32 WAV from per-channel sample arrays. Only
 * used to build test fixtures (round-tripping through parseWav) - the
 * pipeline's own output always goes through writeWavPcm16Mono.
 */
export function writeWavFloat32(channelData, sampleRate) {
  const numChannels = channelData.length;
  const frameCount = channelData[0]?.length ?? 0;
  const bitsPerSample = 32;
  const dataSize = frameCount * numChannels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);
  writeWavHeader(buffer, { audioFormat: 3, numChannels, sampleRate, bitsPerSample, dataSize });
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame++) {
    for (let ch = 0; ch < numChannels; ch++) {
      buffer.writeFloatLE(channelData[ch][frame], offset);
      offset += 4;
    }
  }
  return buffer;
}

/** Writes 16-bit PCM mono WAV - the shippable format this pipeline produces. */
export function writeWavPcm16Mono(samples, sampleRate) {
  const bitsPerSample = 16;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  writeWavHeader(buffer, { audioFormat: 1, numChannels: 1, sampleRate, bitsPerSample, dataSize });
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const intSample = Math.round(clamped * (clamped < 0 ? 32768 : 32767));
    buffer.writeInt16LE(intSample, offset);
    offset += 2;
  }
  return buffer;
}

// --- processing passes, in the order process(...) applies them -----------

/** Step 1: average all channels down to one. */
export function toMono(channelData) {
  if (channelData.length === 1) return Float32Array.from(channelData[0]);
  const frameCount = channelData[0].length;
  const out = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    for (const channel of channelData) sum += channel[i];
    out[i] = sum / channelData.length;
  }
  return out;
}

/**
 * Step 2: drop everything before the first sample whose amplitude clears
 * `threshold`, so shipped sounds do not carry a silent lead-in.
 *
 * If nothing ever clears the threshold, the material is silent throughout;
 * that is returned unchanged rather than trimmed to zero length, so a fully
 * silent input still produces a valid (if useless) WAV instead of an empty one.
 */
export function trimLeadingSilence(samples, threshold = SILENCE_THRESHOLD) {
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > threshold) return samples.slice(i);
  }
  return Float32Array.from(samples);
}

/**
 * Step 3: cut to `targetSeconds`, fading the tail out over the last
 * `fadeSeconds` so the cut does not click. Material already at or under the
 * target length is returned unchanged - the spec asks for a ceiling, not a
 * stretch.
 */
export function truncateWithFadeOut(
  samples,
  sampleRate,
  targetSeconds,
  fadeSeconds = FADE_OUT_SECONDS,
) {
  const targetLength = Math.round(targetSeconds * sampleRate);
  if (samples.length <= targetLength) return Float32Array.from(samples);

  const truncated = samples.slice(0, targetLength);
  const fadeLength = Math.max(1, Math.min(Math.round(fadeSeconds * sampleRate), truncated.length));
  for (let i = 0; i < fadeLength; i++) {
    const idx = truncated.length - fadeLength + i;
    const gain = 1 - (i + 1) / fadeLength; // ramps from just-under-1 down to exactly 0 at the last sample
    truncated[idx] *= gain;
  }
  return truncated;
}

/**
 * Step 4: scale so the peak amplitude equals `targetPeak` exactly, never
 * above it. A fully silent clip has a peak of 0, which would divide by zero -
 * that case is left unscaled instead.
 */
export function normalizePeak(samples, targetPeak = TARGET_PEAK) {
  let peak = 0;
  for (const x of samples) peak = Math.max(peak, Math.abs(x));
  if (peak === 0) return Float32Array.from(samples);
  const scale = targetPeak / peak;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * scale;
  return out;
}

/** Runs every pass on one raw WAV buffer and returns the shippable result. */
export function processMaterial(rawWavBuffer, targetSeconds) {
  const { sampleRate, channelData } = parseWav(rawWavBuffer);
  const mono = toMono(channelData);
  const trimmed = trimLeadingSilence(mono);
  const truncated = truncateWithFadeOut(trimmed, sampleRate, targetSeconds);
  const normalized = normalizePeak(truncated);
  const wav = writeWavPcm16Mono(normalized, sampleRate);
  return { sampleRate, samples: normalized, wav };
}

function peakOf(samples) {
  let peak = 0;
  for (const x of samples) peak = Math.max(peak, Math.abs(x));
  return peak;
}

// --- CLI -------------------------------------------------------------------

function main() {
  const inputDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_INPUT_DIR;

  if (!fs.existsSync(inputDir)) {
    console.log(`no material: input directory does not exist (${inputDir})`);
    console.log(
      'run tools/generate-audio.ps1 first, or pass a directory: node tools/process-audio.mjs <dir>',
    );
    return;
  }

  const files = fs
    .readdirSync(inputDir)
    .filter((name) => name.toLowerCase().endsWith('.wav'))
    .sort();
  if (files.length === 0) {
    console.log(`no material: ${inputDir} has no .wav files`);
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let processedCount = 0;
  for (const file of files) {
    const name = file.replace(/\.wav$/i, '');
    const targetSeconds = TARGET_DURATIONS[name];
    if (targetSeconds === undefined) {
      console.log(`  skip ${file}: not in the target-length table`);
      continue;
    }

    let raw;
    try {
      raw = fs.readFileSync(path.join(inputDir, file));
    } catch (err) {
      console.log(`  skip ${file}: could not read (${err.message})`);
      continue;
    }

    let result;
    try {
      result = processMaterial(raw, targetSeconds);
    } catch (err) {
      console.log(`  skip ${file}: ${err.message}`);
      continue;
    }

    const outPath = path.join(OUT_DIR, `${name}.wav`);
    fs.writeFileSync(outPath, result.wav);
    const durationS = result.samples.length / result.sampleRate;
    console.log(
      `  ${name}.wav: ${durationS.toFixed(3)}s, peak ${peakOf(result.samples).toFixed(4)}, ${result.wav.length} bytes`,
    );
    processedCount++;
  }

  console.log(`processed ${processedCount} file(s) into ${path.relative(process.cwd(), OUT_DIR)}`);
}

// Only run the CLI when this file is executed directly (`node
// tools/process-audio.mjs`), not when imported for its pure functions (as
// src/assets/processAudio.test.ts does).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
