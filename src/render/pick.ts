// What a click on the map lands on. Pure lookup, kept out of the renderer so
// the part that can be checked is checked - the renderer only turns the
// answer into a store call (the same split damage.ts and daylight.ts use).
//
// A tile can hold a colonist, an animal, both, or neither. Colonists win the
// tie: they were the only thing a click could select before this file existed,
// and changing that would silently repoint every existing "click to select"
// habit onto an animal standing on the same tile.
import type { Animal, Colonist, GameState } from '../core/types';

export type Pick = { kind: 'colonist'; colonist: Colonist } | { kind: 'animal'; animal: Animal } | null;

/**
 * What is standing on a tile, for the select tool. Colonist first (existing
 * behaviour), then an animal, then nothing.
 *
 * When several animals share a tile (a herd packed into one pasture cell) the
 * choice is made by id order rather than object insertion order: `Object.keys`
 * on a plain object is stable within a run but its order tracks insertion
 * (creation order), which is not a property a test - or a player clicking the
 * same spot twice - should be able to see shift. Sorting by id gives a result
 * that only changes if the animal itself changes.
 */
export function pickAt(state: GameState, x: number, y: number): Pick {
  for (const id in state.colonists) {
    const colonist = state.colonists[id];
    if (colonist.position.x === x && colonist.position.y === y) {
      return { kind: 'colonist', colonist };
    }
  }
  let found: Animal | null = null;
  for (const id of Object.keys(state.animals).sort()) {
    const animal = state.animals[id];
    if (animal.position.x === x && animal.position.y === y) {
      found = animal;
      break;
    }
  }
  return found ? { kind: 'animal', animal: found } : null;
}
