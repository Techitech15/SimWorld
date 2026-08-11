// docs/design-phase15-audio.md 段階 S-2. The only decidable part of the audio
// file layer is the naming rule - decoding and playback need a browser - so
// that is what is pinned here. `import.meta.glob` is a build-time transform
// and resolves to nothing under vitest's node environment, which is itself the
// case worth stating: with no files present, nothing throws and every sound
// falls through to the synthesised table.
import { describe, expect, it } from 'vitest';
import { audioUrlsFor, groupByName, soundNameOf, suppliedSoundNames } from './audio';

describe('matching audio files to sound names', () => {
  it('takes the name from the filename and strips a numeric variant suffix', () => {
    expect(soundNameOf('./audio/raid.ogg')).toBe('raid');
    expect(soundNameOf('./audio/animal_2.ogg')).toBe('animal');
    expect(soundNameOf('./audio/build_10.mp3')).toBe('build');
  });

  it('keeps a non-numeric suffix, so bgm_day is its own sound and not "bgm"', () => {
    // the one place the rule could bite: `_day` reads like a variant marker to
    // a human but must not be stripped, or the two BGM tracks would collapse
    // into variants of each other and play at random
    expect(soundNameOf('./audio/bgm_day.ogg')).toBe('bgm_day');
    expect(soundNameOf('./audio/bgm_night.ogg')).toBe('bgm_night');
  });

  it('groups variants together and sorts them, so the order is not the glob order', () => {
    const grouped = groupByName([
      './audio/animal_2.ogg',
      './audio/raid.ogg',
      './audio/animal_1.ogg',
      './audio/animal_10.ogg',
    ]);
    expect(Object.keys(grouped).sort()).toEqual(['animal', 'raid']);
    expect(grouped.animal).toEqual([
      './audio/animal_1.ogg',
      './audio/animal_10.ogg',
      './audio/animal_2.ogg',
    ]);
    expect(grouped.raid).toEqual(['./audio/raid.ogg']);
  });

  it('reports no files rather than throwing when none are supplied', () => {
    // sprites.ts throws for a missing sprite because a missing sprite is a
    // bug; a missing sound is the normal state and must stay quiet about it
    expect(() => audioUrlsFor('raid')).not.toThrow();
    expect(audioUrlsFor('definitely-not-a-sound')).toEqual([]);
    expect(Array.isArray(suppliedSoundNames())).toBe(true);
  });
});
