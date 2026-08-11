// Optional audio files, and the rule for matching them to sound names
// (docs/design-phase15-audio.md 4章 / 段階 S-2).
//
// This is deliberately *not* shaped like sprites.ts. A missing sprite is a bug
// and `spriteUrl` throws for it; a missing audio file is the normal state -
// the synthesised tone table (src/ui/sfx.ts) is the floor, and a file only
// ever replaces one. That is what lets the sounds ship before anyone has
// recorded anything, lets a half-finished set (`raid.ogg` real, the rest
// synthesised) be a valid state, and stops a failed decode from turning into
// silence. Silence would be exactly the kind of failure the player cannot see.
//
// Drop files in src/assets/audio/ named after the sound: `raid.ogg`,
// `build.ogg`, ... Numbered variants (`animal_1.ogg`, `animal_2.ogg`) all
// belong to `animal` and are chosen between at play time, so a repeating
// ambient sound does not read as one sample on a loop.

// Eager so the URLs are known synchronously and the build inlines them; the
// glob simply finds nothing when the directory is empty, which is the state
// the repository ships in today.
const modules = import.meta.glob('./audio/*.{ogg,mp3,wav,m4a}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/**
 * `./audio/animal_2.ogg` -> `animal`. The numeric suffix is the variant
 * marker; everything else in the stem is the sound's name, so `bgm_day.ogg`
 * stays `bgm_day` (its `_day` is not a number and so is part of the name).
 */
export function soundNameOf(filePath: string): string {
  const stem = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
  return stem.replace(/_\d+$/, '');
}

/** Every supplied file, grouped by sound name, each group sorted by filename
 *  so the order does not depend on the glob's iteration order. */
export function groupByName(paths: readonly string[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const filePath of [...paths].sort()) {
    const name = soundNameOf(filePath);
    (grouped[name] ??= []).push(filePath);
  }
  return grouped;
}

const byName = groupByName(Object.keys(modules));

/** URLs supplied for this sound, or an empty array when there are none - in
 *  which case the caller synthesises it instead. */
export function audioUrlsFor(name: string): string[] {
  return (byName[name] ?? []).map((filePath) => modules[filePath]);
}

/** Which sounds have at least one file. Used by the loader and by the docs
 *  check that reports what is real and what is still synthesised. */
export function suppliedSoundNames(): string[] {
  return Object.keys(byName).sort();
}
