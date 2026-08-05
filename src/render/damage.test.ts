// The tint a damaged wall gets on the map. Pure arithmetic, kept out of the
// renderer so the part that can be checked is checked: the renderer itself only
// puts the number on a sprite.
import { describe, expect, it } from 'vitest';
import { BUILDING_HP } from '../core/constants';
import type { Building } from '../core/types';
import { DAMAGE_STEPS, damageStep, damageTint } from './damage';

function wall(hpCurrent: number, isBlueprint = false): Building {
  return {
    id: 'b1',
    type: 'wall',
    tileId: '1,1',
    isBlueprint,
    hpCurrent,
    hpMax: BUILDING_HP.wall,
    requiredResources: [],
    buildProgress: 1,
    growth: 0,
    sown: false,
  };
}

describe('damage tint', () => {
  it('leaves a whole building exactly as it was', () => {
    expect(damageStep(wall(BUILDING_HP.wall))).toBe(0);
    expect(damageTint(0)).toBe(0xffffff);
    // over-repaired or odd data must not tip it into looking damaged
    expect(damageStep(wall(BUILDING_HP.wall * 2))).toBe(0);
  });

  it('shows the first bite, rather than waiting for a quarter of the wall', () => {
    // one point of damage on a 120hp wall is 0.8%, which floors to step 0 -
    // and a wall being chewed that looks untouched is the bug this guards
    expect(damageStep(wall(BUILDING_HP.wall - 1))).toBe(1);
    expect(damageTint(1)).not.toBe(0xffffff);
  });

  it('deepens as the wall goes, and stops at the bottom', () => {
    const steps = [0.9, 0.6, 0.3, 0.05].map((left) => damageStep(wall(BUILDING_HP.wall * left)));
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1]);
    }
    expect(Math.max(...steps)).toBe(DAMAGE_STEPS - 1);
    expect(damageStep(wall(0))).toBe(DAMAGE_STEPS - 1);
    expect(damageStep(wall(-50))).toBe(DAMAGE_STEPS - 1);
  });

  it('keeps red and drops the rest, so the tint darkens towards a bruise', () => {
    let lastGreen = 256;
    for (let step = 0; step < DAMAGE_STEPS; step++) {
      const tint = damageTint(step);
      expect((tint >> 16) & 0xff).toBe(255); // red never falls
      const green = (tint >> 8) & 0xff;
      expect(green).toBeLessThan(lastGreen);
      lastGreen = green;
      expect(tint).toBeLessThanOrEqual(0xffffff);
      expect(tint).toBeGreaterThanOrEqual(0);
    }
  });

  it('says nothing about a blueprint, which has its own colour', () => {
    // a blueprint sits at 1hp of its eventual max by construction; tinting it
    // for damage would paint every plan on the map bright red
    expect(damageStep(wall(1, true))).toBe(0);
  });

  it('gives a handful of distinct values, not one per hit point', () => {
    const seen = new Set<number>();
    for (let hp = 0; hp <= BUILDING_HP.wall; hp++) seen.add(damageStep(wall(hp)));
    expect(seen.size).toBe(DAMAGE_STEPS);
  });
});
