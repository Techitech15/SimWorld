// Map-size selection (design-phase6-space.md 3.5, acceptance A-4): each shipped
// size really generates at its own dimensions and survives a save round trip.
// The proposed third size (Wilds 180x180) is deliberately absent: measured at
// 27.9 ms/tick against the ~6 ms the design extrapolated, 10x speed cannot
// carry it (design-notes.md「マップサイズ」).
import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_SIZE, MAP_SIZES, MAP_SIZE_NAMES } from './constants';
import { createSaveFile, migrateSave } from '../persistence/saveFile';
import { generateWorld } from './worldgen';

describe('the map sizes', () => {
  it('generates each size at its real dimensions, and each is a different board', () => {
    for (const name of MAP_SIZE_NAMES) {
      const side = MAP_SIZES[name];
      const state = generateWorld({ seed: 6101, width: side, height: side });
      expect(state.width).toBe(side);
      expect(state.height).toBe(side);
      expect(Object.keys(state.tiles).length).toBe(side * side);
      // colonists spawn inside the board, wherever its middle is
      for (const colonist of Object.values(state.colonists)) {
        expect(colonist.position.x).toBeGreaterThanOrEqual(0);
        expect(colonist.position.x).toBeLessThan(side);
      }
    }
    expect(MAP_SIZES.vale).not.toBe(MAP_SIZES.frontier);
  });

  it('round-trips a save at every size', () => {
    for (const name of MAP_SIZE_NAMES) {
      const side = MAP_SIZES[name];
      const state = generateWorld({ seed: 6103, width: side, height: side });
      const restored = migrateSave(
        JSON.parse(JSON.stringify(createSaveFile(state))) as ReturnType<typeof createSaveFile>,
      );
      expect(restored.state.width).toBe(side);
      expect(restored.state.height).toBe(side);
      expect(Object.keys(restored.state.tiles).length).toBe(side * side);
    }
  });

  it('defaults to the shipped 120x120 board', () => {
    expect(MAP_SIZES[DEFAULT_MAP_SIZE]).toBe(120);
  });
});
