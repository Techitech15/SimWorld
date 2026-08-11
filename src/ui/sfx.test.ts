// The sound decision layer (11章 フェーズ13 段階C, docs/design-phase13-presentation.md
// 5章; layered further in 段階 S-1, GitHub issue #17).
//
// The conditions worth pinning mechanically, straight from the acceptance
// lists: sounds come only from *differences* between two looks at the state
// (so a colony loaded mid-crisis does not open with a fanfare) - `animal` is
// the one deliberate exception, gated on population + pause instead - the
// same sound never fires twice inside its tier's minimum interval however
// fast the game runs, a critical alert that stays on screen makes its noise
// exactly once, and every `LogKey` has an explicit (possibly `null`) row so a
// new one cannot go silently unheard.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../core/constants';
import { addLog } from '../core/state';
import { createHarness } from '../core/testUtils';
import type { Animal, Building, GameState, LogKey } from '../core/types';
import {
  ANIMAL_MIN_INTERVAL_MS,
  LOG_SFX,
  SFX,
  SFX_MIN_INTERVAL_MS,
  SFX_TIER,
  SFX_TIERS,
  SfxDirector,
  minIntervalFor,
} from './sfx';
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

/** Advance every in-progress blueprint's buildProgress by `delta`, as if some
 *  number of colonists (irrelevant how many - that is the point) had each
 *  put in a tick of work. */
function advanceBuild(state: GameState, delta: number): GameState {
  const buildings = { ...state.buildings };
  for (const id of Object.keys(buildings)) {
    const b = buildings[id];
    if (b.isBlueprint) buildings[id] = { ...b, buildProgress: b.buildProgress + delta };
  }
  return { ...state, tick: state.tick + 1, buildings };
}

let nextAnimalId = 0;
/** A single wild (untamed) animal, minimal but complete - `SfxDirector` only
 *  reads `tame`, but `GameState` has to stay valid the way plain data does. */
function withWildAnimal(state: GameState): GameState {
  const id = `sfxtest-animal-${nextAnimalId++}`;
  const animal: Animal = {
    id,
    species: 'deer',
    name: 'Test Deer',
    position: { x: 0, y: 0 },
    path: null,
    pathExpiresAtTick: null,
    hunger: 0,
    health: 100,
    bornAtTick: state.tick,
    tame: false,
    pastureZoneId: null,
    activity: { kind: 'idle' },
    designation: null,
    reservedByJobId: null,
    gestationUntilTick: null,
    pursuitUntilTick: null,
    huntCooldownUntilTick: null,
    nextProduceTick: null,
  };
  return { ...state, animals: { ...state.animals, [id]: animal } };
}

/** Strip wildlife so tests about other sounds are not incidentally crossed by
 *  the `animal` trigger - a freshly generated world always seeds some. */
function withoutAnimals(state: GameState): GameState {
  return { ...state, animals: {} };
}

/** Starve the colony on paper: no food items anywhere means a critical alert. */
function withoutFood(state: GameState): GameState {
  const items = { ...state.items };
  for (const id of Object.keys(items)) {
    if (items[id].type === 'food') delete items[id];
  }
  return { ...state, tick: state.tick + 1, items };
}

/** Every LogKey as of this writing (mirrors core/types.ts). Duplicated on
 *  purpose rather than imported as a value - LogKey is a type, not a runtime
 *  list - so this is the "count it too" half of the coverage the design asks
 *  for; TypeScript enforces the other half (LOG_SFX is a total Record). */
const ALL_LOG_KEYS: LogKey[] = [
  'legacy',
  'colonistArrived',
  'skillLevelUp',
  'seasonArrived',
  'colonistStarving',
  'colonistCannotFindFood',
  'breakBrooding',
  'breakWandering',
  'breakBinge',
  'backToWork',
  'orderedToMove',
  'incidentBumperCrop',
  'incidentBlight',
  'incidentBerryGlut',
  'incidentWolfPack',
  'incidentHerd',
  'incidentLostSupplies',
  'incidentIllness',
  'incidentRaid',
  'raiderCutDownBy',
  'raiderCutDownByTurret',
  'raidOver',
  'raiderRetreats',
  'raiderBreaking',
  'buildingSmashed',
  'furnaceBurnedOut',
  'furnaceStoked',
  'extractorOutOfRock',
  'extractorCutVein',
  'veinCutOpen',
  'buildingRepaired',
  'buildingDismantled',
  'animalTamed',
  'animalTameFailed',
  'jobFailed',
  'colonistStarvedToDeath',
  'colonistKilledByRaider',
  'colonistKilledByAnimal',
  'colonistKilled',
  'colonyDiedOut',
  'boarTurnedOn',
  'animalTearing',
  'buildingBrokenOpen',
  'animalBorn',
  'animalHunted',
  'animalSlaughtered',
  'animalStarvedToDeath',
  'animalKilledByPredator',
  'wolfSpotted',
  'rockeaterExposedVein',
  'traderArrived',
  'traderLeft',
  'tradeSettled',
  'researchUnlocked',
  'mealsCooked',
  'equipmentCrafted',
  'equipmentBroke',
  'colonistTreated',
];

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
    harness.state = withoutAnimals(harness.state);
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
    expect(director.update(built, 5000)).toEqual(['complete']);
  });

  it('plays the horn, the jingle and the coin from new log lines only', () => {
    const harness = createHarness(13003);
    harness.state = withoutAnimals(harness.state);
    const director = new SfxDirector();
    director.update(harness.state, 0);

    let state = step(harness.state);
    addLog(state, 'incidentRaid', { count: 3, tribe: 'parched' });
    expect(director.update(state, 1000)).toEqual(['raid']);

    state = step(state);
    addLog(state, 'researchUnlocked', { tech: 'ironworking' });
    addLog(state, 'tradeSettled', { gaveQuantity: 3, gave: 'wood', tookQuantity: 1, took: 'iron' });
    const names = director.update(state, 2000);
    expect(names).toContain('research');
    expect(names).toContain('trade');
    expect(names).not.toContain('raid'); // the old raid line is not new any more
  });

  it('sounds a critical alert once, not for every tick it stays true', () => {
    const harness = createHarness(13004);
    harness.state = withoutAnimals(harness.state);
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
    harness.state = withoutAnimals(harness.state);
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

  it('never fires the same sound twice inside its tier minimum interval at 10x', () => {
    const harness = createHarness(13006);
    harness.state = withoutAnimals(harness.state);
    const director = new SfxDirector();
    director.update(harness.state, 0);

    // a day of frames at 10x (200ms of wall clock each, 10 ticks apiece), with
    // a placement attempted every frame - the worst case the thinning exists
    // for. `place` is ambient for gain and timbre but carries its own shorter
    // interval (it answers a click), so the bar here is `minIntervalFor`, not
    // the tier's value.
    const fired: { name: SfxName; at: number }[] = [];
    let state = harness.state;
    let now = 0;
    for (let frame = 0; frame < 300; frame++) {
      now += 200;
      state = blueprint({ ...state, tick: state.tick + 9 });
      for (const name of director.update(state, now)) fired.push({ name, at: now });
    }
    expect(fired.length).toBeGreaterThan(0);
    expect(fired.every((f) => f.name === 'place')).toBe(true);
    const stamps = fired.map((f) => f.at);
    for (let i = 1; i < stamps.length; i++) {
      expect(stamps[i] - stamps[i - 1]).toBeGreaterThanOrEqual(minIntervalFor('place'));
    }
  });

  it('does not let ambient sounds flood a busy colony run at 10x for a day', () => {
    // the same shape as the previous test, but driving several ambient
    // triggers at once (place, build, notify via seasonArrived) - the point
    // is that *no* ambient sound, not just one, can break its interval, and
    // that a day of this at 10x produces a sane number of plays rather than
    // one per frame
    const harness = createHarness(13007);
    const director = new SfxDirector();
    director.update(harness.state, 0);

    const fired: { name: SfxName; at: number }[] = [];
    let state = harness.state;
    let now = 0;
    for (let frame = 0; frame < 300; frame++) {
      now += 200;
      state = blueprint({ ...state, tick: state.tick + 6 });
      state = advanceBuild(state, 0.01);
      state = step(state, 2);
      addLog(state, 'seasonArrived', { season: 'summer' });
      for (const name of director.update(state, now)) fired.push({ name, at: now });
    }
    const byName = new Map<SfxName, number[]>();
    for (const f of fired) byName.set(f.name, [...(byName.get(f.name) ?? []), f.at]);
    for (const [name, stamps] of byName) {
      expect(SFX_TIER[name]).toBe('ambient');
      // each ambient sound is held to *its own* interval: the tier's value
      // unless it overrides it (place answers a click, animal paces itself)
      for (let i = 1; i < stamps.length; i++) {
        expect(stamps[i] - stamps[i - 1]).toBeGreaterThanOrEqual(minIntervalFor(name));
      }
    }
    // Nothing exceeds what its own interval permits over the 60 real seconds
    // this loop covers. The ceiling is derived rather than a flat number,
    // because the sounds do not share one cadence: `build` and `notify` sit at
    // the tier's 4s (~15 plays), while `place` answers clicks at 400ms and is
    // allowed far more - this loop places a blueprint on *every* frame, which
    // is five deliberate placements a second sustained for a minute and not
    // something a hand does.
    const windowMs = 300 * 200;
    for (const [name, stamps] of byName) {
      expect(stamps.length).toBeLessThanOrEqual(Math.floor(windowMs / minIntervalFor(name)) + 1);
    }
    // and the sounds that are world noise rather than click feedback stay rare
    for (const [name, stamps] of byName) {
      if (name === 'place') continue;
      expect(stamps.length).toBeLessThan(20);
    }
  });

  it('does not thin the alarm tier away when trouble keeps happening', () => {
    // two raids, spaced well apart in wall time - the alarm tier's interval
    // (300ms) is short exactly so a second real raid is never swallowed by
    // the memory of the first one
    const harness = createHarness(13008);
    harness.state = withoutAnimals(harness.state);
    const director = new SfxDirector();
    director.update(harness.state, 0);

    let state = step(harness.state);
    addLog(state, 'incidentRaid', { count: 3, tribe: 'parched' });
    expect(director.update(state, 1000)).toEqual(['raid']);

    // a second raid a few ticks later (well inside CONTINUITY_TICKS, so this
    // is still "play the player watched happen", not a load) once real wall
    // time has cleared the alarm tier's own short interval
    state = step(state, 10);
    addLog(state, 'incidentRaid', { count: 4, tribe: 'parched' });
    expect(director.update(state, 1000 + SFX_TIERS.alarm.minIntervalMs + 1)).toEqual(['raid']);
  });

  it('fires build when total progress across all sites goes up, once per interval no matter how many builders', () => {
    const harness = createHarness(13009);
    const director = new SfxDirector();
    director.update(harness.state, 0);

    let state = blueprint(harness.state);
    state = blueprint(state);
    director.update(state, 0); // baseline with two fresh blueprints at 0 progress

    // three "colonists" worth of progress land on the same frame - still one sum
    state = advanceBuild(state, 0.02);
    expect(director.update(state, 1000)).toEqual(['build']);

    // more progress a moment later, inside the ambient interval: thinned
    state = advanceBuild(state, 0.02);
    expect(director.update(state, 1500)).toEqual([]);

    // and past the interval, it is heard again
    state = advanceBuild(state, 0.02);
    expect(director.update(state, 1000 + SFX_TIERS.ambient.minIntervalMs + 1)).toEqual(['build']);
  });

  it('calls out wildlife only while the game is actually running', () => {
    const harness = createHarness(13010);
    const director = new SfxDirector();
    const withAnimal = withWildAnimal(harness.state);
    director.update(withAnimal, 0); // baseline

    // paused: no call, however long is waited
    const paused = step({ ...withAnimal, speed: 0 });
    expect(director.update(paused, ANIMAL_MIN_INTERVAL_MS + 1)).toEqual([]);
    expect(director.update(step(paused), ANIMAL_MIN_INTERVAL_MS * 2)).toEqual([]);

    // unpaused, the same population is heard from
    const running = step({ ...paused, speed: 1 });
    expect(director.update(running, ANIMAL_MIN_INTERVAL_MS * 2 + 1)).toEqual(['animal']);
  });

  it('waits its own long interval between animal calls, not the shared ambient one', () => {
    const harness = createHarness(13011);
    const director = new SfxDirector();
    const withAnimal = withWildAnimal(harness.state);
    director.update(withAnimal, 0);

    expect(director.update(step(withAnimal), 1000)).toEqual(['animal']);
    // well past the ambient tier's own interval, but not past animal's dedicated one
    expect(SFX_TIERS.ambient.minIntervalMs).toBeLessThan(ANIMAL_MIN_INTERVAL_MS);
    expect(director.update(step(withAnimal, 2), 1000 + SFX_TIERS.ambient.minIntervalMs + 1)).toEqual(
      [],
    );
    expect(
      director.update(step(withAnimal, 3), 1000 + ANIMAL_MIN_INTERVAL_MS + 1),
    ).toEqual(['animal']);
  });

  it('has an explicit sound (or explicit silence) for every LogKey', () => {
    // Partial<Record<...>> would let a new LogKey go unheard with no compile
    // error; LOG_SFX is a total Record, and this pins the count too, so a key
    // added to types.ts without a matching row here (and here) is visible in
    // both a type error and a failing test.
    const tableKeys = Object.keys(LOG_SFX).sort();
    expect(tableKeys).toEqual([...ALL_LOG_KEYS].sort());
    expect(tableKeys.length).toBe(58);
    for (const key of ALL_LOG_KEYS) {
      const name = LOG_SFX[key];
      if (name !== null) expect(SFX[name]).toBeDefined();
    }
  });

  it('has a parameter row, and a tier, for every sound it can name', () => {
    // the table is the asset; a name without a recipe would fail silently
    const director = new SfxDirector();
    void director;
    for (const [name, spec] of Object.entries(SFX) as [SfxName, (typeof SFX)[SfxName]][]) {
      expect(['alarm', 'event', 'ambient']).toContain(spec.tier);
      expect(spec.tier).toBe(SFX_TIER[name]);
      expect(spec.tones.length).toBeGreaterThan(0);
      for (const tone of spec.tones) {
        expect(tone.duration).toBeGreaterThan(0);
        expect(tone.from).toBeGreaterThan(0);
        expect(tone.volume).toBeGreaterThan(0);
        expect(tone.volume).toBeLessThanOrEqual(1);
      }
    }
    // gain and interval strictly fall off from alarm to ambient (5.3 of the issue)
    expect(SFX_TIERS.alarm.gain).toBeGreaterThan(SFX_TIERS.event.gain);
    expect(SFX_TIERS.event.gain).toBeGreaterThan(SFX_TIERS.ambient.gain);
    expect(SFX_TIERS.alarm.minIntervalMs).toBeLessThan(SFX_TIERS.event.minIntervalMs);
    expect(SFX_TIERS.event.minIntervalMs).toBeLessThan(SFX_TIERS.ambient.minIntervalMs);
    expect(SFX_MIN_INTERVAL_MS).toBe(SFX_TIERS.event.minIntervalMs);
  });

  it('runs a full in-game day at 10x through the real simulation without ever breaking an interval', () => {
    // the closest thing to the acceptance condition's own wording ("10倍速で
    // 1日回しても...最短間隔を割らない"), driven by the actual tick loop
    // rather than hand-built diffs, over every sound at once
    const harness = createHarness(13012);
    harness.state = withWildAnimal(harness.state);
    const director = new SfxDirector();
    director.update(harness.state, 0);

    const fired: { name: SfxName; at: number }[] = [];
    let now = 0;
    // 10x speed: 10 ticks of simulation per animation frame, a frame every ~100ms
    const frames = TICKS_PER_DAY / 10;
    for (let frame = 0; frame < frames; frame++) {
      harness.run(10);
      now += 100;
      for (const name of director.update(harness.state, now)) fired.push({ name, at: now });
    }
    const byName = new Map<SfxName, number[]>();
    for (const f of fired) byName.set(f.name, [...(byName.get(f.name) ?? []), f.at]);
    for (const [name, stamps] of byName) {
      const minInterval =
        name === 'animal' ? ANIMAL_MIN_INTERVAL_MS : SFX_TIERS[SFX_TIER[name]].minIntervalMs;
      for (let i = 1; i < stamps.length; i++) {
        expect(stamps[i] - stamps[i - 1]).toBeGreaterThanOrEqual(minInterval);
      }
    }
  });
});
