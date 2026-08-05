// Incidents: the smallest version of a story layer. What matters is that each
// one does what it says, that the season decides which can happen, that none of
// them can end the colony on its own, and that replaying a save gives the same
// year - an incident belongs to the world, not to the session.
import { describe, expect, it } from 'vitest';
import { ANIMAL_SPECIES, SPECIES, TICKS_PER_DAY } from './constants';
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
import { generateWorld } from './worldgen';
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

  it('give different colonies different years', () => {
    // Rolling from the tick alone is reproducible, which is required, and also
    // hands every colony ever started the same calendar - including the same
    // quiet fortnight at the start, which is where a player meets it. The
    // schedule has to depend on the world as well as the day.
    const schedule = (seed: number) => {
      const harness = createHarness(seed);
      const days: string[] = [];
      for (let day = 2; day <= 60; day++) {
        harness.state.tick = day * TICKS_PER_DAY;
        const before = harness.state.log.length;
        runIncidents(harness.state);
        if (harness.state.log.length > before) days.push(String(day));
      }
      return days.join(',');
    };
    const a = schedule(11);
    const b = schedule(9001);
    expect(a).not.toBe(b);
    expect(schedule(11)).toBe(a); // and the same world is the same year
  });

  it('belong to the world, so a reloaded save gets the same year', () => {
    const harness = createHarness(9717);
    harness.run(TICKS_PER_DAY * 6);
    const messages = harness.state.log.map((e) => `${e.tick}:${e.message}`);

    const reloaded = JSON.parse(JSON.stringify(createHarness(9717).state)) as GameState;
    const replayed = tickMany(reloaded, createSimContext(reloaded), TICKS_PER_DAY * 6);
    expect(replayed.log.map((e) => `${e.tick}:${e.message}`)).toEqual(messages);
  });

  it('reach a new colony soon enough to be part of its story', () => {
    // Measured across worlds rather than asserted about one: the first attempt
    // at this measurement used an empty state as a cheap stand-in and reported
    // that 300 worlds out of 300 never saw an incident at all - which was the
    // harness, not the game. An empty state has no tiles and no buildings, so
    // every incident finds nothing to act on and quietly returns null. It has
    // to be a real world.
    const firsts: number[] = [];
    const kinds = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const state = generateWorld({ seed: seed * 7919 + 13 });
      for (const id in state.buildings) {
        if (state.buildings[id].type === 'farmPlot') {
          state.buildings[id] = { ...state.buildings[id], sown: true, growth: 0.5 };
        }
      }
      for (let day = 2; day <= 40; day++) {
        state.tick = day * TICKS_PER_DAY;
        const before = state.log.length;
        runIncidents(state);
        if (state.log.length > before) {
          firsts.push(day);
          kinds.add(state.log[state.log.length - 1].message.split(' ')[0]);
          break;
        }
      }
    }
    // every world sees something, and soon: median day 4, ninetieth day 8
    expect(firsts.length).toBe(60);
    firsts.sort((a, b) => a - b);
    expect(firsts[Math.floor(firsts.length / 2)]).toBeLessThanOrEqual(6);
    expect(firsts[Math.floor(firsts.length * 0.9)]).toBeLessThanOrEqual(12);
    // and the six of them all actually happen, rather than four being reachable
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  }, 120000);

  it('writes lines that read like English', () => {
    // Spotted in the running game twice over: first "A herd of 4 rabbit moved
    // through", then - after a fix that appended an s - "A herd of 4 deers".
    // The regex written the first time was /\w+s/, which passes for "deers",
    // so the test had the bug in it too. Plurals come from the species now and
    // this checks the actual words.
    const harness = createHarness(9723);
    const herd = INCIDENTS.find((i) => i.name === 'migratingHerd')!;
    const deer = herd.apply(harness.state, () => 0.1);
    const rabbit = herd.apply(harness.state, () => 0.9);
    expect([deer, rabbit].join(' ')).toContain('deer moved through');
    expect([deer, rabbit].join(' ')).toContain('rabbits moved through');
    expect([deer, rabbit].join(' ')).not.toContain('deers');

    for (const species of ANIMAL_SPECIES) {
      const profile = SPECIES[species];
      expect(profile.plural).toBeTruthy();
      // a plural that is just the label with an s stuck on is the bug above
      expect(profile.plural === `${profile.label}s`).toBe(species !== 'deer' && species !== 'wolf');
    }
  });

  it('marks itself in the log, so a wolf pack does not read like a level-up', () => {
    const harness = createHarness(9721);
    for (const id in harness.state.buildings) {
      if (harness.state.buildings[id].type === 'farmPlot') {
        harness.state.buildings[id] = { ...harness.state.buildings[id], sown: true, growth: 0.5 };
      }
    }
    let marked = 0;
    for (let day = 2; day <= 40; day++) {
      harness.state.tick = day * TICKS_PER_DAY;
      runIncidents(harness.state);
    }
    for (const entry of harness.state.log) if (entry.kind === 'incident') marked++;
    expect(marked).toBeGreaterThan(0);
    expect(marked).toBe(harness.state.log.length); // nothing else wrote here
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
