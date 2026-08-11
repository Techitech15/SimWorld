// What the select tool lands on (docs/design.md, issue #13). The lookup is
// pure; only the store call it feeds stays in the renderer, so this is where
// the actual decision is checked.
import { describe, expect, it } from 'vitest';
import { testWorld } from '../core/testUtils';
import { pickAt } from './pick';

describe('pickAt', () => {
  it('finds a colonist standing alone on a tile', () => {
    const state = testWorld({ seed: 1 });
    const colonist = Object.values(state.colonists)[0];
    const at = { x: 5, y: 5 };
    state.colonists[colonist.id] = { ...colonist, position: at };

    const result = pickAt(state, at.x, at.y);
    expect(result).toEqual({ kind: 'colonist', colonist: state.colonists[colonist.id] });
  });

  it('finds an animal standing alone on a tile', () => {
    const state = testWorld({ seed: 1 });
    const animal = Object.values(state.animals)[0];
    const at = { x: 6, y: 6 };
    // move every colonist off this tile so only the animal is there
    for (const id in state.colonists) {
      state.colonists[id] = { ...state.colonists[id], position: { x: 0, y: 0 } };
    }
    state.animals[animal.id] = { ...animal, position: at };

    const result = pickAt(state, at.x, at.y);
    expect(result).toEqual({ kind: 'animal', animal: state.animals[animal.id] });
  });

  it('picks the colonist when a colonist and an animal share a tile', () => {
    const state = testWorld({ seed: 1 });
    const colonist = Object.values(state.colonists)[0];
    const animal = Object.values(state.animals)[0];
    const at = { x: 7, y: 7 };
    state.colonists[colonist.id] = { ...colonist, position: at };
    state.animals[animal.id] = { ...animal, position: at };

    const result = pickAt(state, at.x, at.y);
    expect(result).toEqual({ kind: 'colonist', colonist: state.colonists[colonist.id] });
  });

  it('returns null for an empty tile', () => {
    const state = testWorld({ seed: 1 });
    for (const id in state.colonists) {
      state.colonists[id] = { ...state.colonists[id], position: { x: 0, y: 0 } };
    }
    for (const id in state.animals) {
      state.animals[id] = { ...state.animals[id], position: { x: 0, y: 0 } };
    }

    expect(pickAt(state, 40, 40)).toBeNull();
  });

  it('picks one animal deterministically when several share a tile', () => {
    const state = testWorld({ seed: 1 });
    const animals = Object.values(state.animals);
    expect(animals.length).toBeGreaterThanOrEqual(2);
    const at = { x: 8, y: 8 };
    for (const id in state.colonists) {
      state.colonists[id] = { ...state.colonists[id], position: { x: 0, y: 0 } };
    }
    for (const animal of animals.slice(0, 2)) {
      state.animals[animal.id] = { ...animal, position: at };
    }

    const expectedId = animals.slice(0, 2).map((a) => a.id).sort()[0];
    const first = pickAt(state, at.x, at.y);
    const second = pickAt(state, at.x, at.y);
    expect(first?.kind).toBe('animal');
    expect(first).toEqual(second);
    expect((first as { kind: 'animal'; animal: { id: string } }).animal.id).toBe(expectedId);
  });
});
