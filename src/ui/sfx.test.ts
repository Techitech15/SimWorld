// The sound decision layer (11章 フェーズ13 段階C, docs/design-phase13-presentation.md 5章).
//
// The three conditions worth pinning mechanically, straight from the design's
// acceptance list: sounds come only from *differences* between two looks at the
// state (so a colony loaded mid-crisis does not open with a fanfare), the same
// sound never fires twice inside its minimum interval however fast the game
// runs, and a critical alert that stays on screen makes its noise exactly once.
import { describe, expect, it } from 'vitest';
import { addLog } from '../core/state';
import { createHarness } from '../core/testUtils';
import type { Building, GameState } from '../core/types';
import { SFX, SFX_MIN_INTERVAL_MS, SfxDirector } from './sfx';
import type { SfxName } from './sfx';

/** A fresh state object one tick later - the shape every real frame produces. */
function step(state: GameState, ticks = 1): GameState {
  return { ...state, tick: state.tick + ticks };
}

let nextId = 0;
function blueprint(state: GameState, isBlueprint = true): GameState {
  const id = `sfxtest-${nextId++}`;
  const building: Building = {
    id,
    type: 'wall',
    tileId: Object.keys(state.tiles)[0],
    isBlueprint,
    hpCurrent: 10,
    hpMax: 10,
    requiredResources: [],
    buildProgress: 0,
    growth: 0,
    sown: false,
    manaFuel: 0,
    manaProgress: 0,
  };
  return { ...state, tick: state.tick + 1, buildings: { ...state.buildings, [id]: building } };
}

/** Starve the colony on paper: no food items anywhere means a critical alert. */
function withoutFood(state: GameState): GameState {
  const items = { ...state.items };
  for (const id of Object.keys(items)) {
    if (items[id].type === 'food') delete items[id];
  }
  return { ...state, tick: state.tick + 1, items };
}

describe('the sfx director', () => {
  it('says nothing on its first look, even at a colony mid-crisis', () => {
    const harness = createHarness(13001);
    let state = withoutFood(harness.state);
    addLog(state, 'incidentRaid', { count: 3, tribe: 'parched' });
    const director = new SfxDirector();
    expect(director.update(state, 0)).toEqual([]);
    // and an unchanged state stays silent
    expect(director.update(state, 1000)).toEqual([]);
  });

  it('clicks when a blueprint is placed and chimes when one finishes', () => {
    const harness = createHarness(13002);
    const director = new SfxDirector();
    director.update(harness.state, 0);

    const placed = blueprint(harness.state);
    expect(director.update(placed, 1000)).toEqual(['place']);

    const id = Object.keys(placed.buildings).find((k) => k.startsWith('sfxtest'))!;
    const built = {
      ...placed,
      tick: placed.tick + 1,
      buildings: {
        ...placed.buildings,
        [id]: { ...placed.buildings[id], isBlueprint: false },
      },
    };
    expect(director.update(built, 2000)).toEqual(['complete']);
  });

  it('plays the horn, the jingle and the coin from new log lines only', () => {
    const harness = createHarness(13003);
    const director = new SfxDirector();
    director.update(harness.state, 0);

    let state = step(harness.state);
    addLog(state, 'incidentRaid', { count: 3, tribe: 'parched' });
    expect(director.update(state, 1000)).toEqual(['raidHorn']);

    state = step(state);
    addLog(state, 'researchUnlocked', { tech: 'ironworking' });
    addLog(state, 'tradeSettled', { gaveQuantity: 3, gave: 'wood', tookQuantity: 1, took: 'iron' });
    const names = director.update(state, 2000);
    expect(names).toContain('research');
    expect(names).toContain('trade');
    expect(names).not.toContain('raidHorn'); // the old raid line is not new any more
  });

  it('sounds a critical alert once, not for every tick it stays true', () => {
    const harness = createHarness(13004);
    const director = new SfxDirector();
    director.update(harness.state, 0);

    let state = withoutFood(harness.state);
    expect(director.update(state, 1000)).toEqual(['alert']);
    // the larder is still empty; the alarm has had its say
    state = step(state);
    expect(director.update(state, 2000)).toEqual([]);
    state = step(state);
    expect(director.update(state, 3000)).toEqual([]);
  });

  it('stays silent across a load, which jumps the clock', () => {
    const harness = createHarness(13005);
    const director = new SfxDirector();
    director.update(harness.state, 0);

    // a save from much later in the same colony's life: new log lines, more
    // buildings, a different tick - none of it happened in front of the player
    let later = blueprint(harness.state, false);
    later = { ...later, tick: later.tick + 10_000 };
    addLog(later, 'incidentRaid', { count: 5, tribe: 'parched' });
    expect(director.update(later, 1000)).toEqual([]);
    // but play continuing from the loaded state is narrated again
    const placed = blueprint(later);
    expect(director.update(placed, 2000)).toEqual(['place']);
  });

  it('never fires the same sound twice inside the minimum interval at 10x', () => {
    const harness = createHarness(13006);
    const director = new SfxDirector();
    director.update(harness.state, 0);

    // a day of frames at 10x (200ms of wall clock each, 10 ticks apiece), with
    // a placement attempted every frame - the worst case the thinning exists for
    const fired: { name: SfxName; at: number }[] = [];
    let state = harness.state;
    let now = 0;
    for (let frame = 0; frame < 300; frame++) {
      now += 200;
      state = blueprint({ ...state, tick: state.tick + 9 });
      for (const name of director.update(state, now)) fired.push({ name, at: now });
    }
    expect(fired.length).toBeGreaterThan(0);
    const byName = new Map<SfxName, number[]>();
    for (const f of fired) byName.set(f.name, [...(byName.get(f.name) ?? []), f.at]);
    for (const stamps of byName.values()) {
      for (let i = 1; i < stamps.length; i++) {
        expect(stamps[i] - stamps[i - 1]).toBeGreaterThanOrEqual(SFX_MIN_INTERVAL_MS);
      }
    }
  });

  it('has a parameter row for every sound it can name', () => {
    // the table is the asset; a name without a recipe would fail silently
    const director = new SfxDirector();
    void director;
    for (const specs of Object.values(SFX)) {
      expect(specs.length).toBeGreaterThan(0);
      for (const tone of specs) {
        expect(tone.duration).toBeGreaterThan(0);
        expect(tone.from).toBeGreaterThan(0);
        expect(tone.volume).toBeGreaterThan(0);
        expect(tone.volume).toBeLessThanOrEqual(1);
      }
    }
  });
});
