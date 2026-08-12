// The chronicle's own rules (issue #28): what gets recorded, and what
// survives once it is full. src/core/death.test.ts, arrivals.test.ts, and the
// other call-site tests cover *which* events reach it; this file is about the
// storage and eviction policy itself, in isolation from the simulation.
import { describe, expect, it } from 'vitest';
import { CHRONICLE_MAX, CHRONICLE_PROTECTED, recordChronicle } from './chronicle';
import { createEmptyState } from './state';
import type { GameState } from './types';

/** Record `count` entries of `key` from a state that starts fresh. */
function fill(state: GameState, count: number, key: GameState['chronicle'][number]['key']): void {
  for (let i = 0; i < count; i++) {
    state.tick = i;
    recordChronicle(state, key);
  }
}

describe('recordChronicle', () => {
  it('appends tick, key and params in state.log\'s own shape', () => {
    const state = createEmptyState();
    state.tick = 1234;
    recordChronicle(state, 'colonistArrived', { name: 'Aria' });
    expect(state.chronicle).toEqual([{ tick: 1234, key: 'colonistArrived', params: { name: 'Aria' } }]);
  });

  it('omits params entirely when none are given, like addLog does', () => {
    const state = createEmptyState();
    recordChronicle(state, 'raidOver');
    expect(state.chronicle[0]).toEqual({ tick: state.tick, key: 'raidOver' });
    expect('params' in state.chronicle[0]).toBe(false);
  });

  it('never mutates the array it was given (state stays copy-on-write friendly)', () => {
    const state = createEmptyState();
    const before = state.chronicle;
    recordChronicle(state, 'seasonArrived', { season: 'spring' });
    expect(state.chronicle).not.toBe(before);
    expect(before).toEqual([]);
  });

  it('leaves state.log untouched - the two are independent buffers', () => {
    const state = createEmptyState();
    recordChronicle(state, 'colonistArrived', { name: 'Bram' });
    expect(state.log).toEqual([]);
  });
});

describe('the chronicle cap', () => {
  it('grows without eviction until CHRONICLE_MAX', () => {
    const state = createEmptyState();
    fill(state, CHRONICLE_MAX, 'seasonArrived');
    expect(state.chronicle.length).toBe(CHRONICLE_MAX);
    // nothing has been evicted yet: every tick from 0 is still there
    expect(state.chronicle[0].tick).toBe(0);
    expect(state.chronicle[state.chronicle.length - 1].tick).toBe(CHRONICLE_MAX - 1);
  });

  it('never evicts the first CHRONICLE_PROTECTED entries, no matter how much more arrives', () => {
    const state = createEmptyState();
    // record the colony's very first moments, deliberately mixing minor and
    // major keys so the protection is not just an accident of one tier
    for (let i = 0; i < CHRONICLE_PROTECTED; i++) {
      state.tick = i;
      recordChronicle(state, i % 2 === 0 ? 'seasonArrived' : 'colonistArrived');
    }
    const openingChapter = state.chronicle.slice();

    // now flood it with many times the cap's worth of further history
    for (let i = CHRONICLE_PROTECTED; i < CHRONICLE_MAX * 5; i++) {
      state.tick = i;
      recordChronicle(state, i % 3 === 0 ? 'breakBrooding' : 'colonistKilled');
    }

    expect(state.chronicle.length).toBe(CHRONICLE_MAX);
    expect(state.chronicle.slice(0, CHRONICLE_PROTECTED)).toEqual(openingChapter);
  });

  it('specifically keeps the very first entry the chronicle ever recorded', () => {
    const state = createEmptyState();
    state.tick = 0;
    recordChronicle(state, 'colonistArrived', { name: 'the founder' });
    const firstEntry = state.chronicle[0];

    for (let i = 1; i < CHRONICLE_MAX * 10; i++) {
      state.tick = i;
      recordChronicle(state, 'seasonArrived', { season: 'summer' });
    }

    expect(state.chronicle.length).toBe(CHRONICLE_MAX);
    expect(state.chronicle[0]).toEqual(firstEntry);
  });

  it('thins minor (recurring) entries before touching major ones once full', () => {
    const state = createEmptyState();
    // fill past the protected prologue with alternating minor/major entries
    for (let i = 0; i < CHRONICLE_MAX; i++) {
      state.tick = i;
      recordChronicle(state, i % 2 === 0 ? 'seasonArrived' : 'colonistArrived');
    }
    const majorCountBefore = state.chronicle.filter((e) => e.key === 'colonistArrived').length;
    expect(state.chronicle.length).toBe(CHRONICLE_MAX);

    // one more entry forces an eviction; a minor one should go, not a major one
    state.tick = CHRONICLE_MAX;
    recordChronicle(state, 'researchUnlocked', { tech: 'woodcraft' });

    const majorCountAfter = state.chronicle.filter(
      (e) => e.key === 'colonistArrived' || e.key === 'researchUnlocked',
    ).length;
    expect(state.chronicle.length).toBe(CHRONICLE_MAX);
    // the new major entry was added and no existing major entry was lost
    expect(majorCountAfter).toBe(majorCountBefore + 1);
  });

  it('keeps growing (major-for-major eviction) once no minor entries are left to thin', () => {
    const state = createEmptyState();
    // an all-major history past the protected prologue: nothing minor to thin
    for (let i = 0; i < CHRONICLE_MAX; i++) {
      state.tick = i;
      recordChronicle(state, 'colonistKilled', { name: `c${i}` });
    }
    expect(state.chronicle.length).toBe(CHRONICLE_MAX);
    const oldestBeyondPrologue = state.chronicle[CHRONICLE_PROTECTED];

    state.tick = CHRONICLE_MAX;
    recordChronicle(state, 'colonistKilled', { name: 'newest' });

    expect(state.chronicle.length).toBe(CHRONICLE_MAX);
    // the entry right after the protected prologue was the oldest evictable
    // one and is gone; the protected prologue itself is untouched
    expect(state.chronicle.slice(0, CHRONICLE_PROTECTED)).toEqual(
      Array.from({ length: CHRONICLE_PROTECTED }, (_, i) => ({
        tick: i,
        key: 'colonistKilled',
        params: { name: `c${i}` },
      })),
    );
    expect(state.chronicle).not.toContainEqual(oldestBeyondPrologue);
    expect(state.chronicle[state.chronicle.length - 1]).toEqual({
      tick: CHRONICLE_MAX,
      key: 'colonistKilled',
      params: { name: 'newest' },
    });
  });
});
