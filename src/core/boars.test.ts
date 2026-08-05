// Hunting is ranged, so it was free: the prey could not answer back and a hunt
// cost nothing but time. A boar is the exception - eighty health and tusks, and
// it charges the hunter rather than running.
import { describe, expect, it } from 'vitest';
import { designateAnimals } from './actions';
import { BOAR_CHARGE_RANGE, COLONIST_MAX_HEALTH } from './constants';
import { tileIdOf } from './state';
import { createHarness, idleColony } from './testUtils';
import { createAnimal } from './worldgen';
import type { GameState } from './types';

function onlyHunting(state: GameState): void {
  idleColony(state);
  for (const id in state.colonists) {
    const colonist = state.colonists[id];
    state.colonists[id] = {
      ...colonist,
      workPriorities: { ...colonist.workPriorities, hunt: 1 },
    };
  }
}

describe('a hunted boar', () => {
  it('sometimes turns on the hunter, and it costs blood when it does', () => {
    // A charge is a roll per tick while the hunter is close. The roll is a hash
    // of the tick and the animal's id, so replaying the same hunt at the same
    // tick gives the same answer every time - varying the world seed would not
    // be six trials, it would be one trial six times. What has to vary is *when*
    // the hunt happens.
    let charges = 0;
    let everybodyLived = true;

    for (const startTick of [0, 137, 411, 923, 1502, 2311]) {
      const harness = createHarness(1601);
      harness.state.tick = startTick;
      harness.state.animals = {};
      onlyHunting(harness.state);

      const at = Object.values(harness.state.colonists)[0].position;
      const spot = { x: at.x + 3, y: at.y };
      const boar = createAnimal(harness.state, 'boar', spot.x, spot.y);
      harness.state = designateAnimals(harness.state, [tileIdOf(spot.x, spot.y)], 'hunt');

      let charged = false;
      let lowest = COLONIST_MAX_HEALTH;
      harness.run(900, (state) => {
        // keep the experiment to one boar: no wolves, no restocked wildlife
        for (const id in state.animals) {
          if (id !== boar.id) delete state.animals[id];
        }
        const beast = state.animals[boar.id];
        if (beast && (beast.activity.kind === 'stalking' || beast.activity.kind === 'attacking')) {
          charged = true;
        }
        for (const id in state.colonists) lowest = Math.min(lowest, state.colonists[id].health);
      });

      if (charged) {
        charges++;
        expect(harness.state.log.some((e) => e.message.includes('turned on'))).toBe(true);
      }
      void lowest; // whether the charge lands is the next test's job
      // whatever happened, it is a cost and not a death sentence
      for (const id in harness.state.colonists) {
        if (harness.state.colonists[id].health <= 0) everybodyLived = false;
      }
    }

    expect(charges).toBeGreaterThan(0);
    expect(everybodyLived).toBe(true);
  });

  it('draws blood once it reaches the hunter', () => {
    // the charge itself is a dice roll; what it does when it connects is not,
    // so this one starts the boar already committed and next to its target
    const harness = createHarness(1613);
    harness.state.animals = {};
    idleColony(harness.state);
    const colonistId = Object.keys(harness.state.colonists)[0];
    const at = harness.state.colonists[colonistId].position;
    const boar = createAnimal(harness.state, 'boar', at.x + 1, at.y);
    harness.state.animals[boar.id] = {
      ...boar,
      designation: 'hunt',
      activity: { kind: 'stalking', targetKind: 'colonist', targetId: colonistId },
      pursuitUntilTick: harness.state.tick + 300,
    };

    let lowest = COLONIST_MAX_HEALTH;
    harness.run(120, (state) => {
      for (const id in state.animals) {
        if (id !== boar.id) delete state.animals[id];
      }
      const colonist = state.colonists[colonistId];
      if (colonist) lowest = Math.min(lowest, colonist.health);
    });

    expect(lowest).toBeLessThan(COLONIST_MAX_HEALTH);
    expect(harness.state.colonists[colonistId].health).toBeGreaterThan(0);
  });

  it('leaves a boar nobody is hunting alone', () => {
    const harness = createHarness(1607);
    harness.state.animals = {};
    idleColony(harness.state);
    const at = Object.values(harness.state.colonists)[0].position;
    const boar = createAnimal(harness.state, 'boar', at.x + 2, at.y);

    harness.run(600, (state) => {
      for (const id in state.animals) {
        if (id !== boar.id) delete state.animals[id];
      }
      const beast = state.animals[boar.id];
      if (beast) {
        expect(beast.activity.kind).not.toBe('stalking');
        expect(beast.activity.kind).not.toBe('attacking');
      }
    });
    for (const id in harness.state.colonists) {
      expect(harness.state.colonists[id].health).toBe(COLONIST_MAX_HEALTH);
    }
  });

  it('only charges a hunter who is actually close', () => {
    const harness = createHarness(1609);
    harness.state.animals = {};
    onlyHunting(harness.state);
    const at = Object.values(harness.state.colonists)[0].position;
    // far enough that no hunter can be within the charge range at the start
    const spot = { x: at.x + BOAR_CHARGE_RANGE + 12, y: at.y };
    const boar = createAnimal(harness.state, 'boar', spot.x, spot.y);
    harness.state.animals[boar.id] = { ...boar, designation: 'hunt' };

    harness.run(3, (state) => {
      for (const id in state.animals) {
        if (id !== boar.id) delete state.animals[id];
      }
    });
    expect(harness.state.animals[boar.id].activity.kind).not.toBe('stalking');
  });
});
