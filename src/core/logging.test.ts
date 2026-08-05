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
import { createHarness, recordLog } from './testUtils';

describe('the event log', () => {
  it('keeps a bounded buffer, whatever happens', () => {
    const harness = createHarness(9911);
    for (let i = 0; i < 500; i++) addLog(harness.state, `line ${i}`);
    expect(harness.state.log.length).toBeLessThanOrEqual(100);
    expect(harness.state.log[harness.state.log.length - 1].message).toBe('line 499');
  });

  it('is recorded exactly by recordLog, truncation and all', () => {
    const harness = createHarness(9913);
    // more lines than the buffer holds, written one per tick
    const written: string[] = [];
    let n = 0;
    const lines = recordLog(harness, 300, (state) => {
      const message = `written ${n++}`;
      written.push(message);
      addLog(state, message);
    });
    for (const message of written) expect(lines).toContain(message);
    expect(harness.state.log.length).toBe(100); // the buffer did truncate
    expect(lines.length).toBeGreaterThanOrEqual(written.length);
  });

  it('does not count the same entry twice when nothing new happens', () => {
    // the trap: reading the tail every tick counts one entry thousands of times
    const harness = createHarness(9917);
    addLog(harness.state, 'the only line');
    const lines = recordLog(harness, 400);
    expect(lines.filter((line) => line === 'the only line').length).toBe(0);
  });

  it('spends a year of lines on things a player can act on', () => {
    // Measured: a year used to be four fifths wolves eating rabbits. It is now
    // dozens of lines, not hundreds, and they are colony events - which is the
    // point of a panel somebody is expected to read.
    const harness = createHarness(9919);
    const lines = recordLog(harness, TICKS_PER_SEASON * 4);

    expect(lines.length).toBeGreaterThan(10);
    expect(lines.length).toBeLessThan(200);
    const ambient = lines.filter((line) => /killed by a/.test(line));
    expect(ambient).toEqual([]);
    // and what is there is about the colony: seasons, skills, arrivals, events
    const meaningful = lines.filter((line) =>
      /has arrived|reached|wolf was spotted|herd|berry|Blight|ripened|abandoned|pack/.test(line),
    );
    expect(meaningful.length).toBeGreaterThan(lines.length / 2);
  }, 180000);
});
