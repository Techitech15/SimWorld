// What the log is for, and what it costs.
//
// The log is a hundred-entry ring, which makes it two different things: a
// panel the player reads, and a trap for anything that tries to measure a long
// run from it. Both halves are worth pinning - the first because a log full of
// weather is a log nobody reads, the second because getting it wrong produced
// two confidently wrong measurements in a row.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_SEASON } from './season';
import { addLog } from './state';
import { createHarness, recordLog, recordLogEntries } from './testUtils';

describe('the event log', () => {
  it('keeps a bounded buffer, whatever happens', () => {
    const harness = createHarness(9911);
    for (let i = 0; i < 500; i++) addLog(harness.state, 'legacy', { text: `line ${i}` });
    expect(harness.state.log.length).toBeLessThanOrEqual(100);
    expect(harness.state.log[harness.state.log.length - 1].params?.text).toBe('line 499');
  });

  it('is recorded exactly by recordLog, truncation and all', () => {
    const harness = createHarness(9913);
    // more entries than the buffer holds, written one per tick; recordLog
    // returns keys, so the payload is checked through recordLogEntries' params
    const written: string[] = [];
    let n = 0;
    const entries = recordLogEntries(harness, 300, (state) => {
      const text = `written ${n++}`;
      written.push(text);
      addLog(state, 'legacy', { text });
    });
    const texts = entries.map((entry) => String(entry.params?.text ?? ''));
    for (const text of written) expect(texts).toContain(text);
    expect(harness.state.log.length).toBe(100); // the buffer did truncate
    expect(entries.length).toBeGreaterThanOrEqual(written.length);
  });

  it('does not count the same entry twice when nothing new happens', () => {
    // the trap: reading the tail every tick counts one entry thousands of times
    const harness = createHarness(9917);
    addLog(harness.state, 'legacy', { text: 'the only line' });
    const lines = recordLog(harness, 400);
    expect(lines.filter((line) => line === 'legacy').length).toBe(0);
  });

  it('spends a year of lines on things a player can act on', () => {
    // Measured: a year used to be four fifths wolves eating rabbits. It is now
    // dozens of lines, not hundreds, and they are colony events - which is the
    // point of a panel somebody is expected to read.
    const harness = createHarness(9919);
    const lines = recordLog(harness, TICKS_PER_SEASON * 4);

    expect(lines.length).toBeGreaterThan(10);
    expect(lines.length).toBeLessThan(200);
    const ambient = lines.filter((key) => key === 'animalKilledByPredator');
    expect(ambient).toEqual([]);
    // and what is there is about the colony: seasons, skills, arrivals, events
    const meaningful = lines.filter((key) =>
      [
        'seasonArrived',
        'skillLevelUp',
        'wolfSpotted',
        'colonistArrived',
        'incidentHerd',
        'incidentBerryGlut',
        'incidentBlight',
        'incidentBumperCrop',
        'incidentLostSupplies',
        'incidentWolfPack',
        'incidentRaid',
      ].includes(key),
    );
    expect(meaningful.length).toBeGreaterThan(lines.length / 2);
  }, 180000);
});
