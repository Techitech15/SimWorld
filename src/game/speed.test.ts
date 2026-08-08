// Speed is a multiplier on how many ticks pass per real 200ms, never on the
// tick length. That is the property everything else in the game leans on: a
// cooldown of fifty ticks and a crop that grows over two thousand mean the same
// thing at every setting, so the fast button changes how long you sit there and
// nothing else.
import { describe, expect, it } from 'vitest';
import { setSpeed } from '../core/actions';
import { TICKS_PER_DAY, TICK_MS } from '../core/constants';
import { createSimContext } from '../core/derived';
import { tickMany } from '../core/simulation';
import { createHarness } from '../core/testUtils';
import type { GameState } from '../core/types';

const SPEEDS: GameState['speed'][] = [0, 1, 3, 10];

describe('the speed setting', () => {
  it('offers a fast enough setting to see a day', () => {
    // a day is 3,000 ticks and the loop advances 5 x speed of them a second,
    // so 3x is over three real minutes a day - long enough that seasons,
    // incidents and skills are things you read about rather than watch
    const fastest = Math.max(...SPEEDS);
    const secondsPerDay = TICKS_PER_DAY / (5 * fastest);
    expect(secondsPerDay).toBeLessThanOrEqual(60);
  });

  it('changes nothing about the world except how fast it arrives', () => {
    // the same number of ticks has to produce the same state whatever speed the
    // player was watching at, or the fast button is a different game
    const slow = createHarness(9801);
    slow.state = setSpeed(slow.state, 1);
    const fast = createHarness(9801);
    fast.state = setSpeed(fast.state, 10);

    slow.run(1200);
    fast.run(1200);

    // speed itself is the only difference allowed
    const strip = (state: GameState) => JSON.stringify({ ...state, speed: 0 });
    expect(strip(fast.state)).toBe(strip(slow.state));
  });

  it('is a plain number on the state, so a save remembers it', () => {
    for (const speed of SPEEDS) {
      const harness = createHarness(9803);
      harness.state = setSpeed(harness.state, speed);
      const reloaded = JSON.parse(JSON.stringify(harness.state)) as GameState;
      expect(reloaded.speed).toBe(speed);
      // and a state loaded at any speed keeps simulating
      const after = tickMany(reloaded, createSimContext(reloaded), 100);
      expect(after.tick).toBe(harness.state.tick + 100);
    }
  });

  it('leaves the tick length alone, which is what keeps the rates comparable', () => {
    expect(TICK_MS).toBe(200);
    const harness = createHarness(9807);
    for (const speed of SPEEDS) {
      harness.state = setSpeed(harness.state, speed);
      expect(harness.state.speed).toBe(speed);
    }
    // setting the speed it already has is not a new state object
    const same = setSpeed(harness.state, harness.state.speed);
    expect(same).toBe(harness.state);
  });

  it('costs little enough that the fastest setting is affordable', () => {
    const harness = createHarness(9811);
    harness.run(600);
    const started = performance.now();
    harness.run(1000);
    const msPerTick = (performance.now() - started) / 1000;
    // 10x asks for 50 ticks a second; that has to stay a small slice of one
    const fractionOfOneCore = (msPerTick * 5 * 10) / 1000;
    expect(fractionOfOneCore).toBeLessThan(0.25);
  });
});
