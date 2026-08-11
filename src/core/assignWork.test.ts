// Skills changed how fast work goes and never changed who does it.
//
// Every colonist starts at the same middling priority in every column and stays
// there unless the player fills the table in by hand, cell by cell - so a
// colony's best woodcutter is as likely to be hauling as felling, and the
// skills and traits layers do not meet the work table at all. This is the one
// button that joins them.
import { describe, expect, it } from 'vitest';
import { assignWorkBySkill, setDesignation, setJobPriority } from './actions';
import { skillLevel, xpForLevel } from './skills';
import { createHarness, nearestTilesWithTerrain } from './testUtils';
import { JOB_TYPES } from './types';
import type { GameState } from './types';

const only = (state: GameState) => Object.keys(state.colonists)[0];

/** Give one colonist a clean, known set of skills. */
function skilled(state: GameState, id: string, levels: Partial<Record<string, number>>): void {
  const skills = { chop: 0, mine: 0, farm: 0, build: 0, haul: 0, hunt: 0, handle: 0, research: 0, craft: 0 };
  for (const [name, level] of Object.entries(levels)) {
    skills[name as keyof typeof skills] = xpForLevel(level!);
  }
  state.colonists[id] = { ...state.colonists[id], skills };
}

describe('assigning work by skill', () => {
  it('puts each colonist first in line for their best two', () => {
    const harness = createHarness(1301);
    const id = only(harness.state);
    skilled(harness.state, id, { chop: 6, hunt: 4, farm: 1 });

    harness.state = assignWorkBySkill(harness.state);

    const priorities = harness.state.colonists[id].workPriorities;
    expect(priorities.chop).toBe(1);
    expect(priorities.hunt).toBe(1);
    expect(priorities.farm).not.toBe(1); // third best is not "best two"
  });

  it('never switches anything off', () => {
    // a colony that stopped hauling because nobody was good at hauling would be
    // a worse colony than one that hauls slowly
    const harness = createHarness(1303);
    const before: Record<string, Record<string, number>> = {};
    for (const id in harness.state.colonists) {
      before[id] = { ...harness.state.colonists[id].workPriorities };
    }

    harness.state = assignWorkBySkill(harness.state);

    for (const id in harness.state.colonists) {
      for (const jobType of JOB_TYPES) {
        const was = before[id][jobType] ?? 0;
        const now = harness.state.colonists[id].workPriorities[jobType] ?? 0;
        if (was > 0) expect(now).toBeGreaterThan(0);
      }
    }
  });

  it('leaves a column the player has turned off alone', () => {
    // the player disabling hunting was a decision; this is a suggestion
    const harness = createHarness(1307);
    const id = only(harness.state);
    skilled(harness.state, id, { hunt: 8, chop: 5, mine: 3 });
    harness.state = setJobPriority(harness.state, id, 'hunt', 0);

    harness.state = assignWorkBySkill(harness.state);

    const priorities = harness.state.colonists[id].workPriorities;
    expect(priorities.hunt).toBe(0);
    // and the best two of what remains take its place
    expect(priorities.chop).toBe(1);
    expect(priorities.mine).toBe(1);
  });

  it('has no opinion about a colonist who is good at nothing', () => {
    const harness = createHarness(1311);
    const id = only(harness.state);
    skilled(harness.state, id, {});
    const before = { ...harness.state.colonists[id].workPriorities };

    const after = assignWorkBySkill(harness.state);

    expect(after.colonists[id].workPriorities).toEqual(before);
  });

  it('returns the state it was given when there is nothing to change', () => {
    // the same contract every other action follows, so the UI can tell a
    // refused click from one that did something
    const harness = createHarness(1313);
    const once = assignWorkBySkill(harness.state);
    const twice = assignWorkBySkill(once);
    expect(twice).toBe(once);
  });

  it('agrees with what the colonist sheet says they are good at', () => {
    // the button and the panel have to be reading the same thing, or one of
    // them is lying to the player
    const harness = createHarness(1317);
    harness.state = assignWorkBySkill(harness.state);
    for (const id in harness.state.colonists) {
      const colonist = harness.state.colonists[id];
      const first = JOB_TYPES.filter((jobType) => colonist.workPriorities[jobType] === 1);
      for (const jobType of first) {
        const level = skillLevel(colonist, jobType);
        for (const other of JOB_TYPES) {
          if (colonist.workPriorities[other] === 1 || (colonist.workPriorities[other] ?? 0) === 0) {
            continue;
          }
          expect(level).toBeGreaterThanOrEqual(skillLevel(colonist, other));
        }
      }
    }
  });

  it('costs responsiveness to buy specialisation', () => {
    // This started out as a test that the button "gets the work done faster",
    // which is false. Measured over four seeds with forty trees marked and 700
    // ticks to fell them, the colony left 8 and 22 standing with the button
    // against 0 without it: raising somebody's best two columns to first call
    // implicitly demotes every other column, including whatever the player just
    // ordered. That is inherent to a priority table rather than a bug, and it
    // is the trade the button makes - so it is written down here and in the
    // button's own description rather than dressed up as a free win.
    const standing = (assign: boolean) => {
      const harness = createHarness(1331);
      const at = Object.values(harness.state.colonists)[0].position;
      harness.state = setDesignation(
        harness.state,
        nearestTilesWithTerrain(harness.state, 'forest', at, 40),
        'chop',
      );
      if (assign) harness.state = assignWorkBySkill(harness.state);
      harness.run(700);
      return Object.values(harness.state.tiles).filter((t) => t.designation === 'chop').length;
    };
    expect(standing(true)).toBeGreaterThan(standing(false));
  });

  it('sends the ordered work to the colonist best at it', () => {
    // the half that is a win: whoever does end up chopping is the chopper
    const harness = createHarness(1329);
    const ids = Object.keys(harness.state.colonists);
    skilled(harness.state, ids[0], { chop: 8 });
    for (const id of ids.slice(1)) skilled(harness.state, id, { farm: 8 });

    harness.state = assignWorkBySkill(harness.state);
    const at = harness.state.colonists[ids[0]].position;
    harness.state = setDesignation(
      harness.state,
      nearestTilesWithTerrain(harness.state, 'forest', at, 12),
      'chop',
    );

    const chopTicks: Record<string, number> = {};
    harness.run(1200, (state) => {
      for (const id in state.colonists) {
        const jobId = state.colonists[id].currentJobId;
        if (jobId && state.jobs[jobId]?.type === 'chop') {
          chopTicks[id] = (chopTicks[id] ?? 0) + 1;
        }
      }
    });

    const best = chopTicks[ids[0]] ?? 0;
    for (const id of ids.slice(1)) expect(best).toBeGreaterThan(chopTicks[id] ?? 0);
  });
});
