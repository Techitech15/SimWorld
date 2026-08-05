// The inspection panel is pure derivation: whatever is standing on the tile has
// to show up, and nothing is cached, so it can never disagree with the sim.
import { describe, expect, it } from 'vitest';
import { placeBuildingBlueprint, setDesignation } from '../core/actions';
import { createHarness } from '../core/testUtils';
import { tileIdOf } from '../core/state';
import { createAnimal } from '../core/worldgen';
import { describeTile } from './SelectionPanel';

/** Rows are packed as `label: value`; this reads one back out. */
const value = (rows: string[], label: string): string | undefined =>
  rows.find((row) => row.startsWith(`${label}: `))?.slice(label.length + 2);

describe('tile inspection', () => {
  it('describes bare ground, a zone and its contents', () => {
    const harness = createHarness(601);
    const storageId = Object.keys(harness.state.zones).find(
      (id) => harness.state.zones[id].type === 'storage',
    )!;
    const tileId = harness.state.zones[storageId].tileIds[0];

    const rows = describeTile(harness.state, tileId);
    expect(value(rows, 'Terrain')).toBe('Grass');
    expect(value(rows, 'Zone')).toBe('Storage');
    expect(value(rows, 'Building')).toBe('Storage marker');
    expect(value(rows, 'Items')).toMatch(/\d+ (wood|food|stone)/);
  });

  it('shows what a blueprint is still waiting for', () => {
    const harness = createHarness(607);
    const at = Object.values(harness.state.colonists)[0].position;
    const tileId = tileIdOf(at.x + 2, at.y - 6);
    harness.state = placeBuildingBlueprint(harness.state, 'stoneWall', [tileId]);

    const rows = describeTile(harness.state, tileId);
    expect(value(rows, 'Building')).toBe('Stone wall');
    expect(value(rows, 'Status')).toContain('8 stone');
    expect(value(rows, 'Cost')).toBe('8 stone');
  });

  it('describes an animal standing on the tile', () => {
    const harness = createHarness(613);
    harness.state.animals = {};
    const at = Object.values(harness.state.colonists)[0].position;
    const spot = { x: at.x + 5, y: at.y };
    const deer = createAnimal(harness.state, 'deer', spot.x, spot.y);
    harness.state.animals[deer.id] = { ...deer, hunger: 42, health: 51 };

    const rows = describeTile(harness.state, tileIdOf(spot.x, spot.y));
    expect(value(rows, 'Animal')).toContain('Deer (wild)');
    expect(value(rows, 'Condition')).toBe('51 / 60 hp');
    expect(value(rows, 'Hunger')).toBe('42 / 100');
    expect(value(rows, 'Doing')).toBe('idle');
  });

  it('reports designations on the ground and on animals', () => {
    const harness = createHarness(617);
    const at = Object.values(harness.state.colonists)[0].position;
    const forest = Object.values(harness.state.tiles).find((t) => t.terrain === 'forest')!;
    harness.state = setDesignation(harness.state, [forest.id], 'chop');
    expect(value(describeTile(harness.state, forest.id), 'Order')).toBe('marked for chopping');

    harness.state.animals = {};
    const wolf = createAnimal(harness.state, 'wolf', at.x + 6, at.y + 1);
    harness.state.animals[wolf.id] = { ...wolf, designation: 'hunt' };
    const rows = describeTile(harness.state, tileIdOf(at.x + 6, at.y + 1));
    expect(value(rows, 'Animal')).toContain('(predator)');
    expect(value(rows, 'Order')).toBe('marked for hunting');
  });

  it('says nothing at all when no tile is selected', () => {
    const harness = createHarness(619);
    expect(describeTile(harness.state, null)).toEqual([]);
    expect(describeTile(harness.state, 'nope')).toEqual([]);
  });
});
