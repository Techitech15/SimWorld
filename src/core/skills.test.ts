// Skills are the first thing that makes one colonist different from another,
// so the claims worth pinning are behavioural: practice makes the same job
// finish in fewer ticks, and the work a colonist actually does is what they
// get better at.
import { describe, expect, it } from 'vitest';
import { setDesignation } from './actions';
import { WORK_TICKS } from './constants';
import { createSimContext } from './derived';
import { tickMany } from './simulation';
import {
  SKILL_MAX_LEVEL,
  SKILL_NAMES,
  SKILL_SPEED_PER_LEVEL,
  emptySkills,
  levelOf,
  rollStartingSkills,
  skillFor,
  skillLevel,
  workRate,
  xpForLevel,
} from './skills';
import { createHarness, idleColony, nearestTilesWithTerrain, testWorld } from './testUtils';

import type { Colonist, GameState, SkillName } from './types';

function withSkill(state: GameState, name: SkillName, level: number): void {
  for (const id in state.colonists) {
    state.colonists[id] = {
      ...state.colonists[id],
      skills: { ...emptySkills(), [name]: xpForLevel(level) },
    };
  }
}

/** One colonist, one tree, nothing else to do: how many ticks to fell it. */
function ticksToChopOneTree(seed: number, level: number): number {
  const harness = createHarness(seed);
  idleColony(harness.state);
  // a single chopper, so the answer is about one person's speed
  const ids = Object.keys(harness.state.colonists);
  for (const id of ids.slice(1)) delete harness.state.colonists[id];
  const only = ids[0];
  harness.state.colonists[only] = {
    ...harness.state.colonists[only],
    workPriorities: { ...harness.state.colonists[only].workPriorities, chop: 1 },
  };
  withSkill(harness.state, 'chop', level);

  const at = harness.state.colonists[only].position;
  const [tileId] = nearestTilesWithTerrain(harness.state, 'forest', at, 1);
  harness.state = setDesignation(harness.state, [tileId], 'chop');

  let spent = 0;
  harness.run(2000, (state) => {
    if (state.tiles[tileId].terrain === 'forest') spent = state.tick;
  });
  return spent;
}

describe('skills', () => {
  it('turn experience into levels on a curve that ends', () => {
    expect(levelOf(0)).toBe(0);
    expect(levelOf(-5)).toBe(0);
    expect(levelOf(xpForLevel(1))).toBe(1);
    expect(levelOf(xpForLevel(1) - 1)).toBe(0);
    expect(levelOf(xpForLevel(4) + 10)).toBe(4);
    // later levels cost more than earlier ones, and the ladder has a top
    expect(xpForLevel(5) - xpForLevel(4)).toBeGreaterThan(xpForLevel(2) - xpForLevel(1));
    expect(levelOf(xpForLevel(SKILL_MAX_LEVEL) * 10)).toBe(SKILL_MAX_LEVEL);
  });

  it('leave a novice working at exactly the old speed', () => {
    const novice = { skills: emptySkills() } as Colonist;
    expect(workRate(novice, 'chop')).toBe(1);
    const master = { skills: { ...emptySkills(), chop: xpForLevel(SKILL_MAX_LEVEL) } } as Colonist;
    expect(workRate(master, 'chop')).toBeCloseTo(1 + SKILL_MAX_LEVEL * SKILL_SPEED_PER_LEVEL);
  });

  it('put dismantling under construction, because that is its column', () => {
    expect(skillFor('deconstruct')).toBe('build');
    const builder = { skills: { ...emptySkills(), build: xpForLevel(5) } } as Colonist;
    expect(skillLevel(builder, 'deconstruct')).toBe(5);
  });

  it('make a practised colonist finish the same job sooner', () => {
    // same map, same tree, same walk: the only difference is who is holding
    // the axe, so the gap in ticks is the skill and nothing else
    for (const seed of [3301, 3307, 3313]) {
      const novice = ticksToChopOneTree(seed, 0);
      const expert = ticksToChopOneTree(seed, SKILL_MAX_LEVEL);
      expect(novice).toBeGreaterThan(0);
      expect(expert).toBeGreaterThan(0);
      expect(expert).toBeLessThan(novice);
      // the saving is bounded by the work itself: walking there is not faster
      const saved = novice - expert;
      expect(saved).toBeLessThanOrEqual(WORK_TICKS.chop);
    }
  });

  it('grow only from work actually done, and say so when a level lands', () => {
    const harness = createHarness(3319);
    idleColony(harness.state);
    for (const id in harness.state.colonists) {
      harness.state.colonists[id] = {
        ...harness.state.colonists[id],
        workPriorities: { ...harness.state.colonists[id].workPriorities, chop: 1 },
        // one tick short of a level, so the next tick of work has to announce it
        skills: { ...emptySkills(), chop: xpForLevel(1) - 1 },
      };
    }
    const at = Object.values(harness.state.colonists)[0].position;
    harness.state = setDesignation(
      harness.state,
      nearestTilesWithTerrain(harness.state, 'forest', at, 6),
      'chop',
    );

    harness.run(900);

    const levels = Object.values(harness.state.colonists).map((c) => levelOf(c.skills.chop));
    expect(Math.max(...levels)).toBeGreaterThanOrEqual(1);
    expect(
      harness.state.log.some((e) => e.key === 'skillLevelUp' && e.params?.skill === 'chop'),
    ).toBe(true);
    // and nobody got better at things they never touched
    for (const colonist of Object.values(harness.state.colonists)) {
      expect(colonist.skills.mine).toBe(0);
      expect(colonist.skills.handle).toBe(0);
    }
  });

  it('stop at the cap instead of counting forever', () => {
    const harness = createHarness(3323);
    idleColony(harness.state);
    const cap = xpForLevel(SKILL_MAX_LEVEL);
    for (const id in harness.state.colonists) {
      harness.state.colonists[id] = {
        ...harness.state.colonists[id],
        workPriorities: { ...harness.state.colonists[id].workPriorities, chop: 1 },
        skills: { ...emptySkills(), chop: cap - 2 },
      };
    }
    const at = Object.values(harness.state.colonists)[0].position;
    harness.state = setDesignation(
      harness.state,
      nearestTilesWithTerrain(harness.state, 'forest', at, 8),
      'chop',
    );
    harness.run(1200);
    for (const colonist of Object.values(harness.state.colonists)) {
      expect(colonist.skills.chop).toBeLessThanOrEqual(cap);
    }
  });

  it('give the founders backgrounds that differ, and differ by map', () => {
    const state = testWorld({ seed: 3331 });
    const founders = Object.values(state.colonists);
    expect(founders.length).toBe(3);
    for (const colonist of founders) {
      const known = SKILL_NAMES.filter((name) => colonist.skills[name] > 0);
      expect(known.length).toBe(2); // two specialities, nothing else
      for (const name of known) expect(levelOf(colonist.skills[name])).toBeGreaterThanOrEqual(2);
      for (const name of SKILL_NAMES) expect(Number.isFinite(colonist.skills[name])).toBe(true);
    }
    // three identical colonists would be no colony at all
    const signatures = new Set(founders.map((c) => JSON.stringify(c.skills)));
    expect(signatures.size).toBeGreaterThan(1);

    // and the same seed twice is the same three people (determinism, section 9)
    expect(JSON.stringify(Object.values(testWorld({ seed: 3331 }).colonists).map((c) => c.skills)))
      .toBe(JSON.stringify(founders.map((c) => c.skills)));
    expect(JSON.stringify(Object.values(testWorld({ seed: 3337 }).colonists).map((c) => c.skills)))
      .not.toBe(JSON.stringify(founders.map((c) => c.skills)));
  });

  it('never hand out a background outside the ladder', () => {
    for (let seed = 0; seed < 200; seed++) {
      const skills = rollStartingSkills(seed);
      for (const name of SKILL_NAMES) {
        expect(skills[name]).toBeGreaterThanOrEqual(0);
        expect(levelOf(skills[name])).toBeLessThanOrEqual(SKILL_MAX_LEVEL);
      }
    }
  });

  it('survive a save round trip as plain numbers', () => {
    const harness = createHarness(3341);
    harness.run(400);
    const reloaded = JSON.parse(JSON.stringify(harness.state)) as GameState;
    for (const id in reloaded.colonists) {
      expect(reloaded.colonists[id].skills).toEqual(harness.state.colonists[id].skills);
      for (const name of SKILL_NAMES) {
        expect(typeof reloaded.colonists[id].skills[name]).toBe('number');
      }
    }
    // and the colony keeps learning after the reload
    const continued = tickMany(reloaded, createSimContext(reloaded), 600);
    expect(continued.tick).toBe(harness.state.tick + 600);
    const before = Object.values(harness.state.colonists).reduce(
      (sum, c) => sum + SKILL_NAMES.reduce((s, n) => s + c.skills[n], 0),
      0,
    );
    const after = Object.values(continued.colonists).reduce(
      (sum, c) => sum + SKILL_NAMES.reduce((s, n) => s + c.skills[n], 0),
      0,
    );
    expect(after).toBeGreaterThan(before);
  });
});
