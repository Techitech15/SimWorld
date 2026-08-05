// Incidents: the smallest version of a story layer. What matters is that each
// one does what it says, that the season decides which can happen, that none of
// them can end the colony on its own, and that replaying a save gives the same
// year - an incident belongs to the world, not to the session.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from './constants';
import { createSimContext } from './derived';
import {
  EVENT_FIRST_TICK,
  INCIDENTS,
  chooseIncident,
  runIncidents,
} from './events';
import { SEASONS, TICKS_PER_SEASON, seasonOf } from './season';
import { tickMany } from './simulation';
import { createHarness } from './testUtils';
import type { GameState, Season } from './types';

/** Run whole days of incident rolls without simulating anything else. */
function rollDays(state: GameState, days: number): string[] {
  const before = state.log.length;
  const startDay = Math.floor(state.tick / TICKS_PER_DAY);
  for (let day = 1; day <= days; day++) {
    state.tick = (startDay + day) * TICKS_PER_DAY;
    runIncidents(state);
  }
  return state.log.slice(before).map((entry) => entry.message);
}

describe('incidents', () => {
  it('leave the first days alone', () => {
    const harness = createHarness(9701);
    harness.state.tick = 0;
    runIncidents(harness.state);
    harness.state.tick = TICKS_PER_DAY;
    runIncidents(harness.state);
    expect(harness.state.log.length).toBe(0);
    expect(EVENT_FIRST_TICK).toBeGreaterThan(TICKS_PER_DAY);
  });

  it('happen sometimes, and most days not at all', () => {
    const harness = createHarness(9707);
    harness.state.tick = EVENT_FIRST_TICK;
    const messages = rollDays(harness.state, 200);
    expect(messages.length).toBeGreaterThan(10);
    expect(messages.length).toBeLessThan(120); // an event, not the weather
  });

  it('only roll on a day boundary', () => {
    const harness = createHarness(9709);
    harness.state.tick = EVENT_FIRST_TICK + 1;
    for (let i = 0; i < 500; i++) {
      harness.state.tick = EVENT_FIRST_TICK + 1 + i;
      if (harness.state.tick % TICKS_PER_DAY === 0) continue;
      runIncidents(harness.state);
    }
    expect(harness.state.log.length).toBe(0);
  });

  it('let the season decide what is possible', () => {
    // nothing grows in winter, so nothing about crops or berries may happen
    for (const season of SEASONS) {
      const possible = INCIDENTS.filter((incident) => incident.weight[season] > 0).map(
        (incident) => incident.name,
      );
      expect(possible.length).toBeGreaterThan(0);
      if (season === 'winter') {
        expect(possible).not.toContain('bumperCrop');
        expect(possible).not.toContain('blight');
        expect(possible).not.toContain('berryGlut');
        expect(possible).toContain('wolfPack');
      }
    }
    // the picker respects those weights across the whole roll range
    for (const season of SEASONS as Season[]) {
      for (let i = 0; i <= 20; i++) {
        const picked = chooseIncident(season, i / 20.0001);
        expect(picked).not.toBeNull();
        expect(picked!.weight[season]).toBeGreaterThan(0);
      }
    }
  });

  it('never wipe out a whole farm at once', () => {
    // a blight that takes everything is a punishment; half is a setback
    const harness = createHarness(9711);
    const plots = Object.values(harness.state.buildings).filter((b) => b.type === 'farmPlot');
    for (const plot of plots) {
      harness.state.buildings[plot.id] = { ...plot, sown: true, growth: 0.9 };
    }
    const blight = INCIDENTS.find((incident) => incident.name === 'blight')!;

    let worst = 0;
    for (let trial = 0; trial < 40; trial++) {
      const state = JSON.parse(JSON.stringify(harness.state)) as GameState;
      let rolls = trial;
      const rnd = () => {
        rolls = (rolls * 1103515245 + 12345) % 2147483648;
        return rolls / 2147483648;
      };
      blight.apply(state, rnd);
      const lost = Object.values(state.buildings).filter(
        (b) => b.type === 'farmPlot' && b.growth === 0,
      ).length;
      worst = Math.max(worst, lost);
    }
    expect(worst).toBeGreaterThan(0); // it does something
    expect(worst).toBeLessThan(plots.length); // but never everything
    expect(worst).toBeLessThanOrEqual(Math.ceil(plots.length / 2));
  });

  it('do what their message claims', () => {
    const harness = createHarness(9713);
    const plots = Object.values(harness.state.buildings).filter((b) => b.type === 'farmPlot');
    for (const plot of plots) {
      harness.state.buildings[plot.id] = { ...plot, sown: true, growth: 0.2 };
    }
    const rnd = () => 0.9;

    const bumper = INCIDENTS.find((i) => i.name === 'bumperCrop')!;
    expect(bumper.apply(harness.state, rnd)).toContain('ripened');
    for (const plot of plots) expect(harness.state.buildings[plot.id].growth).toBe(1);
    // and says nothing when there is nothing to do
    expect(bumper.apply(harness.state, rnd)).toBeNull();

    const wolves = Object.values(harness.state.animals).filter((a) => a.species === 'wolf').length;
    const pack = INCIDENTS.find((i) => i.name === 'wolfPack')!;
    expect(pack.apply(harness.state, rnd)).toContain('wolves');
    expect(
      Object.values(harness.state.animals).filter((a) => a.species === 'wolf').length,
    ).toBeGreaterThan(wolves);

    const food = Object.values(harness.state.items).reduce((sum, i) => sum + i.quantity, 0);
    const supplies = INCIDENTS.find((i) => i.name === 'lostSupplies')!;
    expect(supplies.apply(harness.state, rnd)).toMatch(/wood|food/);
    expect(Object.values(harness.state.items).reduce((sum, i) => sum + i.quantity, 0)).toBeGreaterThan(
      food,
    );
  });

  it('belong to the world, so a reloaded save gets the same year', () => {
    const harness = createHarness(9717);
    harness.run(TICKS_PER_DAY * 6);
    const messages = harness.state.log.map((e) => `${e.tick}:${e.message}`);

    const reloaded = JSON.parse(JSON.stringify(createHarness(9717).state)) as GameState;
    const replayed = tickMany(reloaded, createSimContext(reloaded), TICKS_PER_DAY * 6);
    expect(replayed.log.map((e) => `${e.tick}:${e.message}`)).toEqual(messages);
  });

  it('do not stop the colony surviving a year of them', () => {
    // the balance question: incidents must make the year eventful, not fatal
    const harness = createHarness(9719);
    let lowestPopulation = Object.keys(harness.state.colonists).length;
    // the log keeps only the last hundred entries, so counting incidents from
    // it at the end of a year measures the truncation, not the year
    let seen = 0;
    let incidents = 0;
    harness.run(TICKS_PER_SEASON * 4, (state) => {
      lowestPopulation = Math.min(lowestPopulation, Object.keys(state.colonists).length);
      for (const entry of state.log.slice(seen === 0 ? 0 : -1)) {
        if (/ripened|Blight|berry|wolves|herd|abandoned/.test(entry.message)) incidents++;
      }
      seen = state.log.length;
    });
    expect(lowestPopulation).toBe(3);
    expect(incidents).toBeGreaterThan(3); // the year was eventful
    expect(seasonOf(harness.state.tick)).toBe('spring');
  }, 180000);
});
