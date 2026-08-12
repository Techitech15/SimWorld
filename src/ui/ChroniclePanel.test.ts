// Pure-logic coverage for the chronicle panel (issue #28, stage 2). This
// suite runs in `environment: 'node'` (no DOM), so React rendering itself is
// untested here - same split `panelState.test.ts` and `AlertPanel.test.ts`
// use: pull the part that has no DOM in it out into a plain function, and
// test that.
import { describe, expect, it } from 'vitest';
import { createHarness } from '../core/testUtils';
import type { ChronicleEntry, GameState, LogKey } from '../core/types';
import { defaultOpen } from './panelState';
import { STRINGS } from './strings';
import { CHRONICLE_DISPLAY_LIMIT, visibleChronicle } from './ChroniclePanel';

/**
 * One representative entry per `LogKey` the chronicle ever records, grouped
 * by the seven kinds issue #28 names (`recordChronicle`'s call sites -
 * chronicle.ts's header comment lists them: a colonist's death, a raid's
 * start and its outcome, a migrant's arrival, a successful taming, a mental
 * break, a season/year turning, a completed research). Death and mental
 * break each have several concrete `LogKey`s; every one of them is listed
 * here so a translator missing just one variant still fails this test.
 */
const CHRONICLE_SAMPLES: Array<{ kind: string; key: LogKey; params?: ChronicleEntry['params'] }> = [
  // a colonist's death
  { kind: 'death', key: 'colonistStarvedToDeath', params: { name: 'Aria' } },
  { kind: 'death', key: 'colonistKilledByRaider', params: { name: 'Bram', raider: 'Ossek' } },
  { kind: 'death', key: 'colonistKilledByAnimal', params: { name: 'Cato', species: 'wolf' } },
  { kind: 'death', key: 'colonistKilled', params: { name: 'Dara' } },
  // a raid's start and its outcome
  { kind: 'raid', key: 'incidentRaid', params: { count: 3, tribe: 'parched' } },
  { kind: 'raid', key: 'raidOver' },
  // a migrant's arrival
  { kind: 'arrival', key: 'colonistArrived', params: { name: 'Elin' } },
  // a successful taming
  { kind: 'taming', key: 'animalTamed', params: { name: 'Fen', species: 'goat' } },
  // a mental break
  { kind: 'mentalBreak', key: 'breakBrooding', params: { name: 'Gio' } },
  { kind: 'mentalBreak', key: 'breakWandering', params: { name: 'Hana' } },
  { kind: 'mentalBreak', key: 'breakBinge', params: { name: 'Ivo' } },
  // a season/year turning
  { kind: 'seasonTurn', key: 'seasonArrived', params: { season: 'spring' } },
  // a completed research
  { kind: 'research', key: 'researchUnlocked', params: { tech: 'woodcraft' } },
];

describe('chronicle translations', () => {
  it('covers all seven kinds of chronicle event in both languages', () => {
    const kinds = new Set(CHRONICLE_SAMPLES.map((s) => s.kind));
    expect(kinds.size).toBe(7);
  });

  for (const language of ['en', 'ja'] as const) {
    for (const sample of CHRONICLE_SAMPLES) {
      it(`renders ${sample.key} (${sample.kind}) in ${language}`, () => {
        const sentence = STRINGS[language].log[sample.key](sample.params ?? {});
        expect(typeof sentence).toBe('string');
        expect(sentence.length).toBeGreaterThan(0);
        // a missed lookup (a species/tribe/tech table with a hole in it, or a
        // template literal reading a param that was never passed) reads as
        // "undefined" landing in the sentence - catch that here rather than
        // relying on someone spotting it in the panel
        expect(sentence).not.toContain('undefined');
      });
    }
  }
});

function entry(tick: number, key: LogKey = 'seasonArrived'): ChronicleEntry {
  return { tick, key, params: key === 'seasonArrived' ? { season: 'spring' } : undefined };
}

describe('visibleChronicle', () => {
  it('shows the newest entry first', () => {
    const entries = [entry(0), entry(100), entry(200)];
    expect(visibleChronicle(entries).map((e) => e.tick)).toEqual([200, 100, 0]);
  });

  it('caps how many entries it hands back, keeping the newest ones', () => {
    const entries = Array.from({ length: CHRONICLE_DISPLAY_LIMIT + 20 }, (_, i) => entry(i));
    const visible = visibleChronicle(entries);
    expect(visible.length).toBe(CHRONICLE_DISPLAY_LIMIT);
    // newest first, and every tick above the cut line is present
    expect(visible[0].tick).toBe(entries.length - 1);
    expect(visible[visible.length - 1].tick).toBe(entries.length - CHRONICLE_DISPLAY_LIMIT);
  });

  it('respects a custom limit', () => {
    const entries = [entry(0), entry(1), entry(2), entry(3)];
    expect(visibleChronicle(entries, 2).map((e) => e.tick)).toEqual([3, 2]);
  });

  it('never re-orders entries that were already in chronicle order', () => {
    // recordChronicle only ever appends, so the input is always ascending by
    // tick (chronicle.ts's appendChronicle) - a fabricated out-of-order array
    // is not a real input, so this only asserts the ascending case
    const entries = [entry(5), entry(9), entry(40), entry(41)];
    const visible = visibleChronicle(entries);
    for (let i = 1; i < visible.length; i++) {
      expect(visible[i].tick).toBeLessThan(visible[i - 1].tick);
    }
  });
});

describe('the chronicle panel starts folded', () => {
  it('defaults closed, like the log it sits beside', () => {
    const harness = createHarness(7301);
    expect(defaultOpen('chronicle', harness.state as GameState)).toBe(false);
  });
});
