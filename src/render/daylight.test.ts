// The day/night overlay's inputs (docs/design-phase7-time.md 3, acceptance
// N-1/N-2). The drawing cannot run headless; the values it draws from can -
// the same split damage.ts uses.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../core/constants';
import { BURN_TICKS_PER_CRYSTAL } from '../core/mana';
import { buildNetworks } from '../core/mana';
import { tileIdOf } from '../core/state';
import { createHarness } from '../core/testUtils';
import { addBuilding } from '../core/worldgen';
import { NIGHT_ALPHA, litLamps, shadeAt } from './daylight';

describe('the shade over the clock (N-1)', () => {
  it('is clear at noon and NIGHT_ALPHA deep at midnight', () => {
    expect(shadeAt(12 * TICKS_PER_HOUR).alpha).toBe(0);
    expect(shadeAt(0).alpha).toBe(NIGHT_ALPHA);
    expect(shadeAt(23 * TICKS_PER_HOUR).alpha).toBe(NIGHT_ALPHA);
  });

  it('never jumps at a boundary: minute steps stay small all day', () => {
    const minute = TICKS_PER_HOUR / 60;
    let previous = shadeAt(0).alpha;
    let darkest = 0;
    for (let tick = minute; tick <= TICKS_PER_DAY; tick += minute) {
      const shade = shadeAt(Math.round(tick));
      expect(Math.abs(shade.alpha - previous)).toBeLessThan(0.01);
      expect(shade.alpha).toBeGreaterThanOrEqual(0);
      darkest = Math.max(darkest, shade.alpha);
      previous = shade.alpha;
    }
    // dark enough to read as night, never darker than the published ceiling
    expect(darkest).toBe(NIGHT_ALPHA);
  });
});

describe('the lamp light (N-2)', () => {
  it('shines only while the grid is powered, and goes out with the fuel', () => {
    const harness = createHarness(15201);
    const furnace = addBuilding(harness.state, 'manaFurnace', tileIdOf(10, 10));
    addBuilding(harness.state, 'manaLamp', tileIdOf(11, 10));

    // cold furnace: a lamp on a dead grid casts nothing
    expect(litLamps(harness.state, buildNetworks(harness.state))).toEqual([]);

    harness.state.buildings[furnace.id] = {
      ...harness.state.buildings[furnace.id],
      manaFuel: BURN_TICKS_PER_CRYSTAL,
    };
    const lights = litLamps(harness.state, buildNetworks(harness.state));
    expect(lights.length).toBe(1);
    expect(lights[0].position).toEqual({ x: 11, y: 10 });
    expect(lights[0].radius).toBeGreaterThan(0);

    // the fuel dies and the light dies with it - the supply made visible
    harness.state.buildings[furnace.id] = {
      ...harness.state.buildings[furnace.id],
      manaFuel: 0,
    };
    expect(litLamps(harness.state, buildNetworks(harness.state))).toEqual([]);
  });
});
