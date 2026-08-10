// The colonist list shows three skills and no numbers, which is right for a
// list you scan. The detail sheet answers the other question - what is this one
// actually good at, and why is she slow - so what matters is that everything
// about a colonist is reachable from it and that it is honest about the numbers.
import { describe, expect, it } from 'vitest';
import { SKILL_MAX_LEVEL, SKILL_NAMES, emptySkills, xpForLevel } from '../core/skills';
import { createHarness } from '../core/testUtils';
import type { GameState, TraitName } from '../core/types';
import { describeColonist } from './ColonistDetail';
import { STRINGS } from './strings';

const en = STRINGS.en;
const SKILL_LABELS = en.skillLabels;

function value(rows: string[], label: string): string | undefined {
  const row = rows.find((r) => r.startsWith(`${label}: `));
  return row?.slice(label.length + 2);
}

function only(state: GameState): string {
  return Object.keys(state.colonists)[0];
}

describe('the colonist sheet', () => {
  it('says nothing at all when nobody is selected', () => {
    const harness = createHarness(9201);
    expect(describeColonist(harness.state, null, en)).toEqual([]);
    expect(describeColonist(harness.state, 'c99', en)).toEqual([]);
  });

  it('lists every skill, not just the ones worth bragging about', () => {
    const harness = createHarness(9203);
    const id = only(harness.state);
    const rows = describeColonist(harness.state, id, en);
    for (const name of SKILL_NAMES) {
      expect(value(rows, SKILL_LABELS[name])).toBeDefined();
    }
  });

  it('shows how far into a level a colonist is', () => {
    const harness = createHarness(9207);
    const id = only(harness.state);
    // exactly halfway between level 3 and level 4
    const half = xpForLevel(3) + (xpForLevel(4) - xpForLevel(3)) / 2;
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      skills: { ...emptySkills(), chop: half },
    };
    expect(value(describeColonist(harness.state, id, en), SKILL_LABELS.chop)).toBe('3 (50% to 4)');

    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      skills: { ...emptySkills(), chop: xpForLevel(SKILL_MAX_LEVEL) },
    };
    // and stops promising a next level once there is not one
    expect(value(describeColonist(harness.state, id, en), SKILL_LABELS.chop)).toBe(
      `${SKILL_MAX_LEVEL} — mastered`,
    );
  });

  it('spells out what a trait actually does', () => {
    const harness = createHarness(9211);
    const id = only(harness.state);
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      traits: ['tough', 'bigEater'] as TraitName[],
    };
    const rows = describeColonist(harness.state, id, en);
    const traits = rows.filter((r) => r.startsWith('Trait: '));
    expect(traits.length).toBe(2);
    expect(traits.join(' ')).toContain(en.traitDescriptions.tough);
    expect(traits.join(' ')).toContain(en.traitLabels.bigEater);
  });

  it('folds skill and traits into one number the player can feel', () => {
    const harness = createHarness(9217);
    const id = only(harness.state);
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      skills: { ...emptySkills(), build: xpForLevel(5) },
      traits: ['industrious'] as TraitName[],
    };
    const pace = value(describeColonist(harness.state, id, en), 'Pace');
    // 1 + 5 * 0.08 = 1.4, times the industrious 1.15
    expect(pace).toBe('1.61x at construction (level 5)');

    // and a colonist with nothing special about them is not told they are 1.00x
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      skills: emptySkills(),
      traits: [],
    };
    expect(value(describeColonist(harness.state, id, en), 'Pace')).toBeUndefined();
  });

  it('reports what the colonist is doing right now, carried load included', () => {
    const harness = createHarness(9219);
    const id = only(harness.state);
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      activity: { kind: 'sleeping', bedId: null },
    };
    expect(value(describeColonist(harness.state, id, en), 'Doing')).toBe('sleeping');

    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      activity: { kind: 'none' },
      carrying: { type: 'wood', quantity: 25 },
      currentJobId: 'j1',
    };
    harness.state.jobs = {
      j1: {
        ...Object.values(harness.state.jobs)[0],
        id: 'j1',
        type: 'haul',
        workType: 'haul',
      },
    } as GameState['jobs'];
    expect(value(describeColonist(harness.state, id, en), 'Doing')).toBe('haul (carrying 25 wood)');
  });

  it('returns flat strings, so the selector stays shallow-comparable', () => {
    const harness = createHarness(9223);
    const id = only(harness.state);
    const rows = describeColonist(harness.state, id, en);
    for (const row of rows) expect(typeof row).toBe('string');
    // the same state twice is the same rows: nothing rebuilt per call
    expect(describeColonist(harness.state, id, en)).toEqual(rows);
  });
});
