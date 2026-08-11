// The clock stops when something critical *appears*. Re-pausing on a condition
// that was already true would make the game unplayable, so the rule is about
// the difference between two looks, not the state of one.
import { describe, expect, it } from 'vitest';
import { createHarness } from '../core/testUtils';
import { TICK_MS } from '../core/constants';
import { advanceTicks, criticalAlerts, newlyCritical } from './loop';
import type { GameState } from '../core/types';

function starve(state: GameState): void {
  for (const id of Object.keys(state.items)) {
    if (state.items[id].type !== 'food') continue;
    const { [id]: _removed, ...rest } = state.items;
    state.items = rest;
  }
}

// Issue #8 named "wildlife sprints for a few seconds after launch" as the
// symptom, and the initial hypothesis was the accumulator's catch-up burst -
// a slow first frame processing many ticks at once. `advanceTicks` is the
// exact arithmetic behind that burst, pulled out of the RAF callback so the
// burst size can be measured directly instead of inferred from source.
//
// SHIPPED_SPEEDS mirrors the multipliers actually offered to players
// (src/game/speed.test.ts) - 0 (paused) is handled by the caller before
// `advanceTicks` is ever called, so it is not exercised here.
const SHIPPED_SPEEDS = [1, 3, 10];

describe('advanceTicks (the catch-up accumulator)', () => {
  // the RAF loop caps a single frame's elapsed time at 1000ms before calling
  // this function (src/game/loop.ts's `MAX_FRAME_MS`) - the largest `dt` this
  // ever actually receives in practice.
  const MAX_FRAME_MS_IN_PRACTICE = 1000;

  it('never returns more ticks than MAX_CATCHUP_TICKS, for any dt up to the frame cap and any starting accumulator', () => {
    // The guard is `ticks < maxCatchupTicks`, counting simulated ticks - not
    // loop iterations - so this must hold regardless of how few crossings it
    // took to get there (at speed 10 the cap is reached in 3 crossings, not
    // 30). This is the invariant the earlier, wrong version of this function
    // broke by guarding on iteration count instead.
    for (const speed of SHIPPED_SPEEDS) {
      for (let dt = 0; dt <= MAX_FRAME_MS_IN_PRACTICE; dt += 37) {
        for (let accumulator = 0; accumulator < TICK_MS; accumulator += 23) {
          const { ticks } = advanceTicks(accumulator, dt, speed);
          expect(ticks).toBeLessThanOrEqual(30);
        }
      }
    }
  });

  it('the cap actually binds at speed 10 under a full-length stall: exactly 30 ticks, not 3*10 by coincidence', () => {
    // At speed 10 a 1000ms stall crosses 5 tick boundaries (1000/200), which
    // would be 50 ticks uncapped - the cap must cut this off at the 3rd
    // crossing (3*10=30). The 4th and 5th crossings' worth of time (400ms) is
    // discarded, not carried forward - see the "discards the backlog" tests
    // below for why.
    const uncapped = advanceTicks(0, MAX_FRAME_MS_IN_PRACTICE, 10, Number.POSITIVE_INFINITY);
    expect(uncapped.ticks).toBe(50); // confirms 5 crossings would otherwise occur
    const capped = advanceTicks(0, MAX_FRAME_MS_IN_PRACTICE, 10);
    expect(capped.ticks).toBe(30);
    expect(capped.accumulator).toBe(0); // the 400ms beyond the cap is forgiven, not owed
  });

  it('does not cap at 1x or 3x within one full-length stall - the cap is specific to high speed', () => {
    // 1000ms / 200ms = 5 crossings; at 1x/3x that is 5/15 ticks, both under 30.
    expect(advanceTicks(0, MAX_FRAME_MS_IN_PRACTICE, 1).ticks).toBe(5);
    expect(advanceTicks(0, MAX_FRAME_MS_IN_PRACTICE, 3).ticks).toBe(15);
  });

  it('produces the correct long-run tick rate across many ordinary (uncapped) frames', () => {
    // 60 frames at ~16.7ms is ~1 real second; at speed N that should be
    // N*(1000/200) = 5*N ticks, however the 200ms boundaries happen to fall
    // across frames. Ordinary frame lengths never approach the cap, so this
    // is purely a check on the accumulator arithmetic.
    for (const speed of SHIPPED_SPEEDS) {
      let accumulator = 0;
      let totalTicks = 0;
      let elapsed = 0;
      for (let frame = 0; frame < 60; frame++) {
        const dt = 1000 / 60;
        elapsed += dt;
        const result = advanceTicks(accumulator, dt, speed);
        accumulator = result.accumulator;
        totalTicks += result.ticks;
      }
      const expected = speed * Math.floor(elapsed / TICK_MS);
      expect(totalTicks).toBe(expected);
    }
  });

  it('never lets the accumulator grow past one tick length when frames stay under the cap', () => {
    // if this failed, ticks would silently start lagging further and further
    // behind real time every frame instead of catching up within one step -
    // true as long as the per-frame dt does not itself trigger the catch-up
    // cap (see the next test for what happens when it does).
    let accumulator = 0;
    for (let frame = 0; frame < 1000; frame++) {
      const dt = 16.7 + (frame % 7); // jittery frame pacing, not a fixed 60fps
      const result = advanceTicks(accumulator, dt, 3);
      accumulator = result.accumulator;
      expect(accumulator).toBeLessThan(TICK_MS);
      expect(accumulator).toBeGreaterThanOrEqual(0);
    }
  });

  it('reports zero ticks and keeps the remainder when a frame is shorter than one tick', () => {
    const result = advanceTicks(0, 16.7, 1);
    expect(result.ticks).toBe(0);
    expect(result.accumulator).toBeCloseTo(16.7, 10);
  });

  it('does not let the accumulator diverge under sustained max-length stalls at speed 10', () => {
    // A backgrounded tab can have requestAnimationFrame throttled to roughly
    // once per second for as long as it stays hidden - every one of those
    // calls arrives at the MAX_FRAME_MS cap. Before the discard-on-cap fix,
    // each such frame only spent 600ms of its 1000ms (30 ticks / speed 10 =
    // 3 crossings) and carried the other 400ms forward, so the accumulator
    // grew by 400ms every frame with no ceiling - 2000 such frames left
    // 800,000ms of backlog. With the fix, a capped frame keeps only the
    // sub-tick remainder, so however long the background period lasts the
    // accumulator never exceeds one tick length.
    let accumulator = 0;
    for (let frame = 0; frame < 5000; frame++) {
      const result = advanceTicks(accumulator, MAX_FRAME_MS_IN_PRACTICE, 10);
      accumulator = result.accumulator;
      expect(accumulator).toBeLessThan(TICK_MS);
    }
  });

  it('still keeps the exact fractional remainder on frames that do not hit the cap', () => {
    // The discard only applies to the branch that hits maxCatchupTicks - an
    // ordinary frame (even a somewhat late one, as long as it stays under
    // the cap) must keep its precise leftover milliseconds, or the average
    // tick rate would drift from real time even in the common case.
    let accumulator = 0;
    for (let frame = 0; frame < 500; frame++) {
      const dt = 40 + (frame % 5) * 3; // an occasional multi-tick frame, never near the cap
      const before = accumulator;
      const result = advanceTicks(accumulator, dt, 3);
      accumulator = result.accumulator;
      // reconstruct what the leftover must be from first principles and
      // compare - this only holds when the cap was not hit (asserted below)
      expect(result.ticks).toBeLessThan(30);
      const consumedTicks = result.ticks / 3;
      expect(accumulator).toBeCloseTo(before + dt - consumedTicks * TICK_MS, 10);
    }
  });

  it('recovers to normal-speed pace within one frame of ordinary pacing resuming, at speed 10', () => {
    // Reproduces the exact scenario the previous (buggy) version of this
    // function left broken: a long background-throttled stall (2000 calls
    // at the MAX_FRAME_MS cap - the same shape that built 800,000ms of
    // backlog before the fix), then ordinary 16.7ms frames resume. Before
    // the fix this took 1372 frames (~22.9s at 60fps) of running pegged at
    // the 30-tick cap (1800 ticks/sec, 36x the correct 50 ticks/sec at speed
    // 10 - the same shape as issue #8's "briefly far too fast" symptom) before
    // a normal frame finally dropped below the cap. After the fix, the very
    // first ordinary frame after the stall is already back to normal: it is
    // far too short (16.7ms) to cross even one 200ms tick boundary.
    let accumulator = 0;
    for (let frame = 0; frame < 2000; frame++) {
      const result = advanceTicks(accumulator, MAX_FRAME_MS_IN_PRACTICE, 10);
      accumulator = result.accumulator;
    }

    let framesUntilRecovered = 0;
    for (; framesUntilRecovered < 10; framesUntilRecovered++) {
      const result = advanceTicks(accumulator, 1000 / 60, 10);
      accumulator = result.accumulator;
      if (result.ticks < 30) break; // no longer pegged at the catch-up cap
    }
    expect(framesUntilRecovered).toBe(0); // recovered on the very first ordinary frame
  });
});

describe('auto-pause', () => {
  it('finds nothing critical in a healthy colony', () => {
    const harness = createHarness(1501);
    harness.state.animals = {};
    expect(criticalAlerts(harness.state).size).toBe(0);
  });

  it('raises the empty larder and then the starving colonists', () => {
    const harness = createHarness(1503);
    harness.state.animals = {};
    starve(harness.state);
    const emptyLarder = criticalAlerts(harness.state);
    expect([...emptyLarder.values()].map((a) => a.key)).toContain('noFood');

    for (const id in harness.state.colonists) {
      harness.state.colonists[id] = {
        ...harness.state.colonists[id],
        needs: { hunger: 100, sleep: 0 , recreation: 0 },
      };
    }
    const worse = criticalAlerts(harness.state);
    expect(newlyCritical(emptyLarder, worse)).toEqual([
      { key: 'colonistsStarving', params: { count: 3 } },
    ]);
  });

  it('says nothing new while the same condition persists', () => {
    const harness = createHarness(1507);
    harness.state.animals = {};
    starve(harness.state);
    const first = criticalAlerts(harness.state);
    const second = criticalAlerts(harness.state);
    expect(newlyCritical(first, second)).toEqual([]);
  });
});
