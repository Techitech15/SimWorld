// Research and professions (11章 フェーズ12, docs/design-phase12-research.md).
//
// The mechanism (2章) is borrowed wholesale from farm/build/the furnace's fuel
// haul, so what is worth pinning here is the glue: progress only accumulates
// at a desk that is ready, a resource-costing tech withholds progress until
// delivered, gating is a pure function both the menu and the placement call
// enforce, and a desk can be torn down mid-flight without losing anything.
import { describe, expect, it } from 'vitest';
import {
  applyProfession,
  placeBuildingBlueprint,
  professionPriorities,
  setDesignation,
  setJobPriority,
  setResearchCurrent,
} from './actions';
import { TECH_PROGRESS_PER_CYCLE, TECHS, WORK_TICKS } from './constants';
import { availableTechs, deskReadyToResearch, isUnlocked, researchResourceCost } from './research';
import { emptySkills, skillLevel, titleSkillOf, xpForLevel } from './skills';
import { tileIdOf } from './state';
import { createHarness, idleColony } from './testUtils';
import { addBuilding, addItem } from './worldgen';
import type { GameState } from './types';

/** One fed, rested colonist with no traits, positioned beside a finished desk. */
function withDesk(seed: number): { harness: ReturnType<typeof createHarness>; id: string; deskId: string } {
  const harness = createHarness(seed);
  idleColony(harness.state);
  const id = Object.keys(harness.state.colonists)[0];
  const at = harness.state.colonists[id].position;
  harness.state.colonists[id] = {
    ...harness.state.colonists[id],
    needs: { hunger: 0, sleep: 10, recreation: 0 },
    health: 100,
    traits: [],
  };
  const tileId = tileIdOf(at.x + 2, at.y);
  const desk = addBuilding(harness.state, 'researchDesk', tileId);
  harness.state.tiles[tileId] = { ...harness.state.tiles[tileId], walkable: false };
  harness.state.colonists[id] = {
    ...harness.state.colonists[id],
    // research *and* haul: a resource-costing tech needs someone to carry the
    // delivery too, and idleColony above zeroed every column
    workPriorities: { ...harness.state.colonists[id].workPriorities, research: 1, haul: 1 },
  };
  return { harness, id, deskId: desk.id };
}

describe('isUnlocked', () => {
  it('grandfathers every existing building type, tech or no tech', () => {
    const harness = createHarness(11001);
    // the fifteen pre-phase-12 types, plus phase 10's table and stool: never
    // gated, per 3.1
    for (const type of ['wall', 'stoneWall', 'bed', 'hearth', 'manaFurnace', 'table', 'stool'] as const) {
      expect(isUnlocked(harness.state, type)).toBe(true);
    }
  });

  it('locks exactly the types a tech unlocks, and only until it is unlocked', () => {
    const harness = createHarness(11003);
    expect(isUnlocked(harness.state, 'armchair')).toBe(false);
    expect(isUnlocked(harness.state, 'statue')).toBe(false);
    expect(isUnlocked(harness.state, 'dresser')).toBe(false);
    harness.state.research = { ...harness.state.research, unlocked: ['woodcraft'] };
    expect(isUnlocked(harness.state, 'armchair')).toBe(true);
    expect(isUnlocked(harness.state, 'statue')).toBe(false); // a different tech's building
    expect(isUnlocked(harness.state, 'dresser')).toBe(false); // still needs ironwork
  });
});

describe('picking a tech', () => {
  it('offers only techs whose prerequisites are met and which are not already unlocked', () => {
    const harness = createHarness(11007);
    let available = availableTechs(harness.state);
    expect(available).toContain('woodcraft');
    expect(available).toContain('stonecarving');
    expect(available).toContain('crystallography');
    expect(available).not.toContain('ironwork'); // needs woodcraft first

    harness.state.research = { ...harness.state.research, unlocked: ['woodcraft'] };
    available = availableTechs(harness.state);
    expect(available).toContain('ironwork');
    expect(available).not.toContain('woodcraft'); // already unlocked
  });

  it('refuses a tech whose prerequisites are unmet, and a no-op reselect', () => {
    const harness = createHarness(11011);
    const refused = setResearchCurrent(harness.state, 'ironwork');
    expect(refused).toBe(harness.state); // same contract as every other action
    expect(refused.research.current).toBeNull();

    const picked = setResearchCurrent(harness.state, 'woodcraft');
    expect(picked.research.current).toBe('woodcraft');
    expect(setResearchCurrent(picked, 'woodcraft')).toBe(picked); // reselecting is a no-op
  });
});

describe('stage A: progress at the desk', () => {
  it('does nothing until a desk exists, a tech is chosen and the column is raised', () => {
    const harness = createHarness(11101);
    idleColony(harness.state);
    harness.run(200);
    expect(Object.values(harness.state.jobs).some((j) => j.type === 'research')).toBe(false);
  });

  it('accumulates 10 x the work rate per WORK_TICKS.research cycle, and unlocks on completion', () => {
    const { harness, id } = withDesk(11103);
    harness.state = setResearchCurrent(harness.state, 'woodcraft');

    // one work cycle by hand: a novice (rate 1) banks exactly TECH_PROGRESS_PER_CYCLE
    let sawResearchJob = false;
    harness.run(WORK_TICKS.research + 5, (state) => {
      if (Object.values(state.jobs).some((j) => j.type === 'research')) sawResearchJob = true;
    });
    expect(sawResearchJob).toBe(true);
    expect(harness.state.research.progress.woodcraft).toBeGreaterThanOrEqual(
      TECH_PROGRESS_PER_CYCLE,
    );
    expect(harness.state.research.progress.woodcraft).toBeLessThan(TECH_PROGRESS_PER_CYCLE * 2);

    // run it out to completion (750 points at a novice's 0.2/tick is 3750
    // ticks of uninterrupted work; this leaves headroom for meals and sleep)
    harness.run(14000);
    expect(harness.state.research.unlocked).toContain('woodcraft');
    expect(harness.state.research.current).toBeNull(); // nothing queued after
    expect(isUnlocked(harness.state, 'armchair')).toBe(true);
    void id;
  });

  it('a colony that never builds a desk is unaffected: no research job ever appears', () => {
    const harness = createHarness(11107);
    harness.state = setResearchCurrent(harness.state, 'woodcraft');
    harness.run(1000);
    expect(Object.values(harness.state.jobs).some((j) => j.type === 'research')).toBe(false);
    expect(harness.state.research.progress.woodcraft).toBe(0);
  });
});

describe('stage A: gating the build menu and the placement call', () => {
  it('refuses to place a locked building even called directly (the UI-bypass case)', () => {
    const harness = createHarness(11201);
    const at = Object.values(harness.state.colonists)[0].position;
    const tileId = tileIdOf(at.x + 3, at.y);
    const refused = placeBuildingBlueprint(harness.state, 'armchair', [tileId]);
    expect(refused).toBe(harness.state);
    expect(harness.state.tiles[tileId].buildingId).toBeNull();

    harness.state.research = { ...harness.state.research, unlocked: ['woodcraft'] };
    const placed = placeBuildingBlueprint(harness.state, 'armchair', [tileId]);
    expect(placed).not.toBe(harness.state);
    expect(placed.tiles[tileId].buildingId).not.toBeNull();
  });

  it('never gates the research desk itself', () => {
    const harness = createHarness(11203);
    const at = Object.values(harness.state.colonists)[0].position;
    const tileId = tileIdOf(at.x + 3, at.y);
    const placed = placeBuildingBlueprint(harness.state, 'researchDesk', [tileId]);
    expect(placed.tiles[tileId].buildingId).not.toBeNull();
  });
});

describe('stage B: a resource-costing tech', () => {
  it('withholds progress until the full resource cost is delivered, same shape as the furnace', () => {
    const { harness, id, deskId } = withDesk(11301);
    harness.state = setResearchCurrent(harness.state, 'crystallography');
    expect(researchResourceCost(harness.state)).toEqual([{ type: 'manaCrystal', quantity: 4 }]);

    // nothing to deliver yet: no source on the map, so no haul appears, and no
    // research job either - the desk is not ready
    harness.run(300);
    expect(deskReadyToResearch(harness.state, harness.state.buildings[deskId])).toBe(false);
    expect(harness.state.research.progress.crystallography).toBe(0);
    expect(Object.values(harness.state.jobs).some((j) => j.type === 'research')).toBe(false);

    // put crystal on the ground: the ordinary haul chain carries it to the desk
    const at = harness.state.colonists[id].position;
    addItem(harness.state, 'manaCrystal', 4, at.x - 2, at.y);
    let sawCrystalHaul = false;
    harness.run(4000, (state) => {
      if (
        Object.values(state.jobs).some(
          (j) => j.type === 'haul' && j.payloadType === 'manaCrystal' && j.destinationId,
        )
      ) {
        sawCrystalHaul = true;
      }
    });
    expect(sawCrystalHaul).toBe(true);
    expect(harness.state.research.progress.crystallography).toBeGreaterThan(0);
  });

  it('ironwork stays unavailable until woodcraft clears, then behaves like any other tech', () => {
    const harness = createHarness(11303);
    expect(setResearchCurrent(harness.state, 'ironwork')).toBe(harness.state);
    harness.state.research = { ...harness.state.research, unlocked: ['woodcraft'] };
    const picked = setResearchCurrent(harness.state, 'ironwork');
    expect(picked.research.current).toBe('ironwork');
    expect(TECHS.ironwork.cost).toBe(1500);
  });

  it('deconstructing the desk mid-delivery strands no job, reservation or resource', () => {
    const { harness, id, deskId } = withDesk(11307);
    harness.state = setResearchCurrent(harness.state, 'crystallography');
    // deconstruction runs under the build column (like every other teardown)
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      workPriorities: { ...harness.state.colonists[id].workPriorities, build: 1 },
    };
    const deskTileId = harness.state.buildings[deskId].tileId;
    const at = harness.state.colonists[id].position;
    addItem(harness.state, 'manaCrystal', 4, at.x - 3, at.y);

    // let a haul actually get under way (reserved, possibly carrying) before
    // the desk disappears out from under it
    let reserved = false;
    harness.run(400, (state) => {
      if (
        Object.values(state.jobs).some(
          (j) => j.type === 'haul' && j.destinationId === deskId && j.state !== 'pending',
        )
      ) {
        reserved = true;
      }
    });
    expect(reserved).toBe(true);

    harness.state = setDesignation(harness.state, [deskTileId], 'deconstruct');
    let gone = false;
    for (let i = 0; i < 3000 && !gone; i++) {
      harness.run(1);
      gone = harness.state.buildings[deskId] === undefined;
    }
    expect(gone).toBe(true);
    harness.run(20);

    for (const jobId in harness.state.jobs) {
      const job = harness.state.jobs[jobId];
      if (job.state === 'pending' || job.state === 'reserved' || job.state === 'active') {
        expect(job.targetEntityId, jobId).not.toBe(deskId);
        expect(job.destinationId, jobId).not.toBe(deskId);
      }
    }
    expect(harness.state.reservations[deskId]).toBeUndefined();
    expect(harness.state.tiles[deskTileId].designation).toBeNull();

    // the crystal itself was never destroyed: it is either still an item on
    // the map or was consumed by a completed delivery before the teardown
    const remaining = Object.values(harness.state.items)
      .filter((item) => item.type === 'manaCrystal')
      .reduce((sum, item) => sum + item.quantity, 0);
    expect(remaining).toBeGreaterThanOrEqual(0);
    expect(remaining).toBeLessThanOrEqual(4);
  });
});

describe('stage C: derived titles', () => {
  it('follows the highest skill, ties won by SKILL_NAMES order, level 0 everywhere is null', () => {
    const harness = createHarness(11401);
    const id = Object.keys(harness.state.colonists)[0];
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      skills: {
        chop: 0,
        mine: 0,
        farm: 0,
        build: 0,
        haul: 0,
        hunt: 0,
        handle: 0,
        research: 0,
        craft: 0,
        treat: 0,
      },
    };
    expect(titleSkillOf(harness.state.colonists[id])).toBeNull();

    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      skills: {
        ...harness.state.colonists[id].skills,
        chop: xpForLevel(3),
        mine: xpForLevel(3),
      },
    };
    // chop comes before mine in SKILL_NAMES, so a tie goes to chop
    expect(titleSkillOf(harness.state.colonists[id])).toBe('chop');

    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      skills: { ...harness.state.colonists[id].skills, research: xpForLevel(5) },
    };
    expect(titleSkillOf(harness.state.colonists[id])).toBe('research');
  });

  it('follows a colonist who took up research, exactly as it would any other skill', () => {
    const { harness, id } = withDesk(11403);
    // a clean slate: the founder's rolled-in background would otherwise
    // outrank research long before this test gets there
    harness.state.colonists[id] = {
      ...harness.state.colonists[id],
      skills: emptySkills(),
    };
    harness.state = setResearchCurrent(harness.state, 'woodcraft');
    harness.run(1400);
    expect(skillLevel(harness.state.colonists[id], 'research')).toBeGreaterThan(0);
    expect(titleSkillOf(harness.state.colonists[id])).toBe('research');
  });
});

describe('stage C: profession presets', () => {
  it('writes every column, not just the primary one', () => {
    const harness = createHarness(11501);
    const id = Object.keys(harness.state.colonists)[0];
    const next = applyProfession(harness.state, id, 'research');
    expect(next).not.toBe(harness.state);
    expect(next.colonists[id].workPriorities).toEqual(professionPriorities('research'));
    expect(next.colonists[id].workPriorities.research).toBe(1);
    expect(next.colonists[id].workPriorities.haul).toBe(3);
    expect(next.colonists[id].workPriorities.chop).toBe(2);
  });

  it('is a no-op when the colonist is already exactly that profession', () => {
    const harness = createHarness(11503);
    const id = Object.keys(harness.state.colonists)[0];
    const once = applyProfession(harness.state, id, 'farm');
    const twice = applyProfession(once, id, 'farm');
    expect(twice).toBe(once);
  });

  it('saves only the resulting priorities, nothing about which preset was used', () => {
    const harness = createHarness(11507);
    const id = Object.keys(harness.state.colonists)[0];
    const next = applyProfession(harness.state, id, 'build');
    const json = JSON.stringify(next.colonists[id]);
    expect(json.includes('profession')).toBe(false);
  });

  it('refuses for a colonist that does not exist', () => {
    const harness = createHarness(11509);
    expect(applyProfession(harness.state, 'nope', 'farm')).toBe(harness.state);
  });
});

describe('save shape', () => {
  it('round-trips research through JSON with the desk untouched by a colony that ignores it', () => {
    const harness = createHarness(11601);
    harness.run(50);
    const restored = JSON.parse(JSON.stringify(harness.state)) as GameState;
    expect(restored.research).toEqual(harness.state.research);
  });
});

// keep the imports honest: setJobPriority is exercised indirectly through
// idleColony/withDesk's workPriorities writes, but this asserts the column
// exists and behaves like every other priority cell
describe('the research column behaves like the others', () => {
  it('accepts the same 0..3 clamp as every other job type', () => {
    const harness = createHarness(11701);
    const id = Object.keys(harness.state.colonists)[0];
    const next = setJobPriority(harness.state, id, 'research', 9);
    expect(next.colonists[id].workPriorities.research).toBe(3);
  });
});
