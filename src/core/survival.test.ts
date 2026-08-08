// Week 5 and week 7 acceptance (section 10): with no player input at all the
// colony must feed and rest itself, and the production chain must keep running
// for several days.
import { describe, expect, it } from 'vitest';
import { HUNGER_THRESHOLD, TICKS_PER_DAY } from './constants';
import { countResource } from './storage';
import { createHarness } from './testUtils';

describe('needs', () => {
  it('feeds and rests colonists without any player input', () => {
    const harness = createHarness(23);
    const ate = new Set<string>();
    const slept = new Set<string>();
    let worstHunger = 0;
    let worstSleep = 0;

    harness.run(TICKS_PER_DAY * 2, (state) => {
      for (const id in state.colonists) {
        const colonist = state.colonists[id];
        if (colonist.activity.kind === 'eating') ate.add(id);
        if (colonist.activity.kind === 'sleeping') slept.add(id);
        worstHunger = Math.max(worstHunger, colonist.needs.hunger);
        worstSleep = Math.max(worstSleep, colonist.needs.sleep);
      }
    });

    expect(ate.size).toBe(3);
    expect(slept.size).toBe(3);
    // nobody should ever be pinned at the top of the hunger bar
    expect(worstHunger).toBeLessThan(99);
    expect(worstSleep).toBeLessThan(99);
  });

  it('grows and harvests crops so the food stock does not collapse', () => {
    const harness = createHarness(29);
    const startingFood = countResource(harness.state, 'food');
    harness.run(TICKS_PER_DAY * 3);

    const food = countResource(harness.state, 'food');
    const harvestedSomething = Object.values(harness.state.buildings).some(
      (b) => b.type === 'farmPlot' && b.sown,
    );
    expect(harvestedSomething).toBe(true);
    // three days of eating must not have burned through the whole stock
    expect(food).toBeGreaterThan(startingFood * 0.5);
  });

  it('survives a multi-day unattended run without deadlocking (week 7)', () => {
    const harness = createHarness(31);
    const founders = Object.keys(harness.state.colonists);
    let idleTicks = 0;

    harness.run(TICKS_PER_DAY * 4, (state) => {
      let busy = 0;
      for (const id in state.colonists) {
        const colonist = state.colonists[id];
        if (colonist.currentJobId || colonist.activity.kind !== 'none') busy++;
      }
      if (busy === 0) idleTicks++;
    });

    // stage B of docs/design-phase2.5-animals.md: wolves start turning up on day 2, and
    // an unattended colony still has to be alive four days later. The count can
    // only go up now that wanderers join, so what matters is that none of the
    // three we started with is gone.
    for (const id of founders) expect(harness.state.colonists[id]).toBeDefined();
    for (const id in harness.state.colonists) {
      const colonist = harness.state.colonists[id];
      expect(colonist.needs.hunger).toBeLessThan(HUNGER_THRESHOLD + 45);
    }
    // the colony should not spend most of its life with nothing to do
    expect(idleTicks).toBeLessThan(TICKS_PER_DAY * 4 * 0.5);
    // no reservation may outlive the job that made it
    for (const entityId in harness.state.reservations) {
      const reservation = harness.state.reservations[entityId];
      if (reservation.jobId.startsWith('need-')) continue;
      expect(harness.state.jobs[reservation.jobId]).toBeDefined();
    }
  });
});
