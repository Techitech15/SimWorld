// Issue #8: wildlife (and, before the eviction/reload snap was shared,
// raiders and colonists too) appeared to sprint for the first few seconds
// after launch and then settle down. This file pins down the two mechanisms
// that make that impossible now:
//
// 1. `interpolationSpeed` is a hard ceiling on tiles-per-ms - no accumulated
//    backlog of logical movement (from a startup catch-up burst, or from a
//    frame that simply took a long time) can make the *displayed* sprite
//    move faster than the simulation's own walking pace.
// 2. `isTeleport` is the one threshold all three sprite kinds (colonist,
//    animal, raider) use to tell "walked here" from "placed here", so a big
//    displayed jump reads as a snap, never as a glide at implausible speed.
import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../core/constants';
import { interpolationSpeed, isTeleport, TELEPORT_DISTANCE_TILES } from './pace';

/**
 * The same per-axis update the renderer runs in `syncAnimals` / `syncRaiders`
 * / `updateColonistView`: move `display` towards `logical` by at most
 * `speed * deltaMs`, snapping instead when the gap is a teleport.
 */
function stepDisplay(
  display: number,
  logical: number,
  deltaMs: number,
  ticksPerStep: number,
  gameSpeed: number,
  paceMultiplier = 1,
): number {
  const dx = logical - display;
  if (isTeleport(dx, 0)) return logical;
  const speed = interpolationSpeed(ticksPerStep, gameSpeed, paceMultiplier) * deltaMs;
  return display + (Math.abs(dx) < speed ? dx : Math.sign(dx) * speed);
}

describe('interpolationSpeed as a hard ceiling', () => {
  const speeds = [1, 3, 10];
  const ticksPerSteps = [2, 3, 4]; // colonist, deer/boar, chicken/rockeater

  it('never lets a single frame move a sprite faster than its walking pace, regardless of backlog', () => {
    for (const gameSpeed of speeds) {
      for (const ticksPerStep of ticksPerSteps) {
        const ceiling = interpolationSpeed(ticksPerStep, gameSpeed);
        // The logical position sits a couple of tiles ahead of the display -
        // within the teleport threshold, so this is the "glide" regime the
        // complaint was about, not the "snap" regime `isTeleport` owns.
        // Two tiles of backlog is exactly what a stalled first frame plus a
        // couple of normal steps produces before the renderer catches up.
        const logical = 2;
        let display = 0;

        // A synthetic frame list: one huge stall (as if the tab had just
        // started and the first RAF callback arrives late, e.g. while
        // textures were still loading), then ordinary 16.7ms frames.
        const frames = [900, 16.7, 16.7, 16.7, 16.7, 16.7, 16.7, 16.7, 16.7, 16.7, 16.7];
        for (const deltaMs of frames) {
          const before = display;
          display = stepDisplay(display, logical, deltaMs, ticksPerStep, gameSpeed);
          const movedPerMs = Math.abs(display - before) / deltaMs;
          // a small epsilon for float rounding, not for slack in the rule
          expect(movedPerMs).toBeLessThanOrEqual(ceiling + 1e-9);
        }
      }
    }
  });

  it('snaps instead of exceeding the ceiling when backlog is large enough to be a teleport', () => {
    // A catch-up burst can legitimately advance an entity many tiles inside
    // one `advance()` call (see loop.test.ts). If the gap that leaves behind
    // is past the teleport threshold, `isTeleport` takes over and the display
    // jumps once rather than gliding there at an inflated rate - the failure
    // mode this guards against is a *glide* that outruns the ceiling, not an
    // instantaneous snap, which by definition does not have a "rate".
    const ticksPerStep = 2;
    const gameSpeed = 10;
    const logical = 25; // far past TELEPORT_DISTANCE_TILES
    const display = stepDisplay(0, logical, 900, ticksPerStep, gameSpeed);
    expect(display).toBe(logical); // snapped in one step, not gliding across it
  });

  it('reaches the logical position eventually rather than lagging forever', () => {
    const gameSpeed = 1;
    const ticksPerStep = 4; // the slowest species (chicken/rockeater)
    let display = 0;
    const logical = 2; // within the teleport threshold, so it glides
    for (let i = 0; i < 500; i++) {
      display = stepDisplay(display, logical, 16.7, ticksPerStep, gameSpeed);
    }
    expect(display).toBeCloseTo(logical, 5);
  });

  it('is 0 while paused, so a paused frame never advances a sprite', () => {
    expect(interpolationSpeed(2, 0)).toBe(0);
  });

  it('scales linearly with game speed - "3x" is 3x the tiles per ms, not 3x the tile size', () => {
    const at1x = interpolationSpeed(2, 1);
    const at3x = interpolationSpeed(2, 3);
    const at10x = interpolationSpeed(2, 10);
    expect(at3x).toBeCloseTo(at1x * 3, 10);
    expect(at10x).toBeCloseTo(at1x * 10, 10);
  });

  it('matches "one tile in exactly the time the simulation spends walking it"', () => {
    for (const gameSpeed of speeds) {
      for (const ticksPerStep of ticksPerSteps) {
        const msPerTileInSim = (ticksPerStep * TICK_MS) / gameSpeed;
        expect(1 / interpolationSpeed(ticksPerStep, gameSpeed)).toBeCloseTo(msPerTileInSim, 10);
      }
    }
  });
});

describe('isTeleport', () => {
  it('is false right at the threshold and true just past it', () => {
    expect(isTeleport(TELEPORT_DISTANCE_TILES, 0)).toBe(false);
    expect(isTeleport(TELEPORT_DISTANCE_TILES + 0.01, 0)).toBe(true);
    expect(isTeleport(0, TELEPORT_DISTANCE_TILES)).toBe(false);
    expect(isTeleport(0, TELEPORT_DISTANCE_TILES + 0.01)).toBe(true);
  });

  it('is false for an ordinary single-tile step', () => {
    expect(isTeleport(1, 0)).toBe(false);
    expect(isTeleport(0, -1)).toBe(false);
  });

  it('catches a diagonal jump even when only one axis crosses the threshold', () => {
    // an eviction can land somewhere whose distance is mostly on one axis -
    // this only needs *either* axis over the line, not the hypotenuse
    expect(isTeleport(TELEPORT_DISTANCE_TILES + 1, 0.1)).toBe(true);
    expect(isTeleport(0.1, TELEPORT_DISTANCE_TILES + 1)).toBe(true);
  });

  it('is symmetric in sign - direction does not matter, only distance', () => {
    expect(isTeleport(-(TELEPORT_DISTANCE_TILES + 1), 0)).toBe(true);
    expect(isTeleport(0, -(TELEPORT_DISTANCE_TILES + 1))).toBe(true);
  });
});
