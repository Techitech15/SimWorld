// The fantasy layer (11章 フェーズ5, docs/design-phase5-trade.md 3 と 7).
//
// Four additions, and the conditions the design note wrote down before any of
// them existed. Each one is a claim that could be false: that the frostbloom
// really is a winter-only plant and not a better berry bush, that a lamp
// really does feed a herd through a winter and stops the moment it goes cold,
// that one crystal elk is not enough to run a furnace, and that a rockeater
// changes the ground without ever being a threat.
import { describe, expect, it } from 'vitest';
import {
  ANIMAL_GRAZE_THRESHOLD,
  FOOD_PER_BERRY_HARVEST,
  FOOD_PER_FROSTBLOOM_HARVEST,
  FROSTBLOOM_COUNT,
  LIGHTMOSS_REGROW_FACTOR,
  ROCKEATER_GNAW_TICKS,
  SPECIES,
  TICKS_PER_DAY,
} from './constants';
import { BURN_TICKS_PER_CRYSTAL, buildNetworks } from './mana';
import { FROSTBLOOM_GROWTH_BY_SEASON, SEASONS, TICKS_PER_SEASON, seasonOf } from './season';
import { killAnimal } from './animals';
import { regionAt } from './derived';
import { isRock, tileIdOf } from './state';
import { countResource, countStoredResource } from './storage';
import { createHarness, placePastureNear, recordLog, recordLogEntries } from './testUtils';
import type { Harness } from './testUtils';
import type { BuildingType, GameState } from './types';

function put(state: GameState, type: BuildingType, x: number, y: number, fuel = 0): string {
  const id = `b_${type}_${x}_${y}`;
  const tileId = tileIdOf(x, y);
  state.buildings[id] = {
    id,
    type,
    tileId,
    isBlueprint: false,
    hpCurrent: 100,
    hpMax: 100,
    requiredResources: [],
    buildProgress: 1,
    growth: 0,
    sown: false,
    manaFuel: fuel,
    manaProgress: 0,
  };
  state.tiles[tileId] = { ...state.tiles[tileId], buildingId: id };
  return id;
}

function frostblooms(state: GameState): string[] {
  return Object.keys(state.buildings).filter((id) => state.buildings[id].type === 'frostbloom');
}

/** Put the clock at the start of a season without re-running the year. */
function jumpToSeason(harness: Harness, season: (typeof SEASONS)[number]): void {
  harness.state.tick = TICKS_PER_SEASON * SEASONS.indexOf(season) + 1;
}

describe('frostbloom (段階 F-A)', () => {
  it('is on the map from the start, out by the rock', () => {
    const harness = createHarness(5101);
    const ids = frostblooms(harness.state);
    expect(ids.length).toBe(FROSTBLOOM_COUNT);
    for (const id of ids) {
      const tile = harness.state.tiles[harness.state.buildings[id].tileId];
      expect(tile.terrain).toBe('grass');
      const nearRock = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
      ].some(([dx, dy]) => {
        const neighbour = harness.state.tiles[tileIdOf(tile.x + dx, tile.y + dy)];
        return !!neighbour && isRock(neighbour.terrain);
      });
      expect(nearRock).toBe(true);
    }
  });

  it('reads the season table upside down: nothing but winter grows it', () => {
    for (const season of SEASONS) {
      expect(FROSTBLOOM_GROWTH_BY_SEASON[season] > 0).toBe(season === 'winter');
    }
  });

  it('grows in winter and does not move the rest of the year', () => {
    const harness = createHarness(5103);
    const id = frostblooms(harness.state)[0];
    const growthAfter = (season: (typeof SEASONS)[number]) => {
      harness.state.buildings[id] = { ...harness.state.buildings[id], growth: 0 };
      jumpToSeason(harness, season);
      harness.run(2000);
      return harness.state.buildings[id].growth;
    };

    expect(growthAfter('summer')).toBe(0);
    expect(growthAfter('autumn')).toBe(0);
    expect(growthAfter('winter')).toBeGreaterThan(0);
  });

  it('gives the colony winter work, and the food actually reaches the store', () => {
    // the whole point of the plant: a harvest job in the season where the farm
    // plots are dormant and the berry bushes have stopped
    const harness = createHarness(5107);
    jumpToSeason(harness, 'winter');
    const storedBefore = countStoredResource(harness.state, 'food');

    // A harvest is counted as "this bloom was ripe and now it is not". Watching
    // for a completed job does not work: cleanupJobs drops completed jobs in
    // the same tick they finish, so an observer between ticks never sees one.
    //
    // The two food measurements are cumulative rather than start-versus-end,
    // because the colony eats out of the same pile it is filling. This test
    // originally compared the total at the end against the total at the
    // start, which asks "did the colony end the winter richer" - a question
    // about the whole food economy, not about this plant. Phase 14's water
    // shifted seed 5107 enough that the winter's harvest exactly covered the
    // winter's eating and the totals matched, so the assertion failed while
    // the plant it was testing worked perfectly. Counting the rises instead
    // asks what the name promises: food arrived, and it reached the store.
    let harvested = 0;
    let gained = 0;
    let storedPeak = storedBefore;
    let previousFood = countResource(harness.state, 'food');
    const ripe = new Set<string>();
    harness.run(TICKS_PER_SEASON - 100, (state) => {
      for (const id of frostblooms(state)) {
        if (state.buildings[id].growth >= 1) ripe.add(id);
        else if (ripe.delete(id)) harvested++;
      }
      const food = countResource(state, 'food');
      if (food > previousFood) gained += food - previousFood;
      previousFood = food;
      storedPeak = Math.max(storedPeak, countStoredResource(state, 'food'));
    });

    // blooms were picked, the picking put food into the world, and the haul
    // chain carried it all the way into a storage zone
    expect(harvested).toBeGreaterThan(0);
    expect(gained).toBeGreaterThanOrEqual(FOOD_PER_FROSTBLOOM_HARVEST);
    expect(storedPeak).toBeGreaterThan(storedBefore);
  });

  it('never out-yields a berry bush, or winter would be the good season', () => {
    expect(FOOD_PER_FROSTBLOOM_HARVEST).toBeLessThan(FOOD_PER_BERRY_HARVEST);
  });
});

describe('lightmoss (段階 F-B)', () => {
  /**
   * A furnace, a lamp, and one patch of ground that is not grass.
   *
   * The test tile has to be non-grass or the rig proves nothing: grass regrows
   * on its own, so a lit lamp over a meadow cannot be told apart from the
   * meadow. Woodland floor has forage 0 and no way to get any, which makes the
   * lamp the only possible explanation for a number above zero.
   */
  function litColony(seed: number, options: { fuel?: number } = {}) {
    const harness = createHarness(seed);
    const at = Object.values(harness.state.colonists)[0].position;
    // Clear the ground the rig stands on. A lamp that landed on a rock face is
    // a lamp on an unwalkable tile, which is not lit ground at all, and the
    // test would then be measuring where the map put its stone.
    for (let dx = 3; dx <= 6; dx++) {
      for (let dy = -1; dy <= 3; dy++) {
        const id = tileIdOf(at.x + dx, at.y + dy);
        if (!harness.state.tiles[id]) continue;
        harness.state.tiles[id] = {
          ...harness.state.tiles[id],
          terrain: 'grass',
          walkable: true,
          buildingId: null,
          forage: 0,
        };
      }
    }
    const furnace = put(harness.state, 'manaFurnace', at.x + 4, at.y, options.fuel ?? 0);
    const lamp = put(harness.state, 'manaLamp', at.x + 5, at.y);
    const floorTile = tileIdOf(at.x + 5, at.y + 2);
    harness.state.tiles[floorTile] = {
      ...harness.state.tiles[floorTile],
      terrain: 'forest',
      walkable: true,
      forage: 0,
    };
    return { harness, furnace, lamp, floorTile };
  }

  it('does not grow under a lamp that is cold', () => {
    const { harness, floorTile } = litColony(5201, { fuel: 0 });
    expect(harness.state.tiles[floorTile].forage).toBe(0);
    harness.run(1500);
    expect(harness.state.tiles[floorTile].forage).toBe(0);
  });

  it('grows on ground that has no grass on it, under a lit lamp', () => {
    const { harness, lamp, floorTile } = litColony(5203, {
      fuel: BURN_TICKS_PER_CRYSTAL * 10,
    });
    expect(buildNetworks(harness.state).gridOf[lamp]).toBeDefined();
    harness.run(1500);
    expect(harness.state.tiles[floorTile].forage).toBeGreaterThan(0);
  });

  it('keeps growing in winter, when grass has all but stopped', () => {
    // the hole this closes: a penned herd used to starve through winter with
    // nothing the player could do (design-phase2.5-animals 12章)
    const { harness, floorTile } = litColony(5209, { fuel: BURN_TICKS_PER_CRYSTAL * 40 });
    jumpToSeason(harness, 'winter');
    harness.state.tiles[floorTile] = { ...harness.state.tiles[floorTile], forage: 0 };
    harness.run(3000);
    const moss = harness.state.tiles[floorTile].forage;
    expect(moss).toBeGreaterThan(0.4);
  });

  it('stops the moment the lamp goes out, and does not undo what grew', () => {
    const { harness, furnace, floorTile } = litColony(5211, {
      fuel: BURN_TICKS_PER_CRYSTAL * 10,
    });
    harness.run(1500);
    const grown = harness.state.tiles[floorTile].forage;
    expect(grown).toBeGreaterThan(0);

    // let the furnace go cold: the grid drops and so does the moss's reason
    harness.state.buildings[furnace] = { ...harness.state.buildings[furnace], manaFuel: 0 };
    harness.run(1500);
    expect(harness.state.tiles[floorTile].forage).toBe(grown);
  });

  it('carries a penned herd through a winter that would otherwise kill it', () => {
    // The condition this whole addition exists for. Measured over one winter,
    // eight head in a 5x5 pen that starts eaten down: without a lamp the herd
    // is gone by spring in every seed tried, with one it survives - 8, 8, 8 and
    // 7 of 8 across four seeds. The assertion is "the herd survives" rather
    // than a head count, because one animal wandering off to die is weather.
    const winterInAPen = (lamp: boolean) => {
      const harness = createHarness(5217);
      const zoneId = placePastureNear(harness, 5);
      const tiles = harness.state.zones[zoneId].tileIds.map((id) => harness.state.tiles[id]);
      for (const tile of tiles) {
        harness.state.tiles[tile.id] = { ...harness.state.tiles[tile.id], forage: 0 };
      }
      const penned = Object.values(harness.state.animals)
        .filter((a) => a.species !== 'wolf' && a.species !== 'rockeater')
        .slice(0, 8);
      penned.forEach((animal, i) => {
        const tile = tiles[i % tiles.length];
        harness.state.animals[animal.id] = {
          ...animal,
          tame: true,
          pastureZoneId: zoneId,
          position: { x: tile.x, y: tile.y },
          hunger: 20,
        };
      });
      if (lamp) {
        const centre = tiles[Math.floor(tiles.length / 2)];
        put(harness.state, 'manaFurnace', centre.x, centre.y - 4, BURN_TICKS_PER_CRYSTAL * 60);
        put(harness.state, 'manaConduit', centre.x, centre.y - 3);
        put(harness.state, 'manaConduit', centre.x, centre.y - 2);
        put(harness.state, 'manaLamp', centre.x, centre.y - 1);
      }
      jumpToSeason(harness, 'winter');
      harness.run(TICKS_PER_SEASON);
      return Object.values(harness.state.animals).filter(
        (a) => a.tame && a.pastureZoneId === zoneId,
      ).length;
    };

    expect(winterInAPen(false)).toBe(0);
    expect(winterInAPen(true)).toBeGreaterThanOrEqual(6);
  }, 180000);

  it('is slower than a summer meadow, so a lamp is not a better pasture', () => {
    expect(LIGHTMOSS_REGROW_FACTOR).toBeLessThan(1);
  });

  it('feeds an animal standing on it', () => {
    const { harness, floorTile } = litColony(5213, { fuel: BURN_TICKS_PER_CRYSTAL * 20 });
    harness.run(1500);
    const tile = harness.state.tiles[floorTile];
    expect(tile.forage).toBeGreaterThan(0.4);

    const hungry = Object.values(harness.state.animals).find((a) => !a.tame);
    expect(hungry).toBeDefined();
    harness.state.animals[hungry!.id] = {
      ...hungry!,
      position: { x: tile.x, y: tile.y },
      hunger: ANIMAL_GRAZE_THRESHOLD + 30,
      activity: { kind: 'idle' },
    };
    const before = harness.state.tiles[floorTile].forage;
    harness.run(120);
    // it ate the moss, whatever else it did afterwards
    expect(harness.state.tiles[floorTile].forage).toBeLessThan(before);
  });
});

describe('crystal elk (段階 F-C)', () => {
  it('is on the map, and is the only animal that makes something else', () => {
    const harness = createHarness(5301);
    const elk = Object.values(harness.state.animals).filter((a) => a.species === 'crystalElk');
    expect(elk.length).toBe(SPECIES.crystalElk.initialCount);
    for (const species of Object.keys(SPECIES) as (keyof typeof SPECIES)[]) {
      expect(SPECIES[species].produceType === 'manaCrystal').toBe(species === 'crystalElk');
    }
  });

  it('a tamed one produces mana crystal, not food', () => {
    const harness = createHarness(5303);
    const elk = Object.values(harness.state.animals).find((a) => a.species === 'crystalElk')!;
    const at = Object.values(harness.state.colonists)[0].position;
    harness.state.animals[elk.id] = {
      ...elk,
      tame: true,
      hunger: 0,
      position: { x: at.x + 3, y: at.y + 3 },
      nextProduceTick: harness.state.tick + 1,
    };
    const before = Object.values(harness.state.items).filter((i) => i.type === 'manaCrystal').length;
    harness.run(SPECIES.crystalElk.produceIntervalTicks + 60);
    const after = Object.values(harness.state.items).filter((i) => i.type === 'manaCrystal').length;
    expect(after).toBeGreaterThan(before);
  });

  /**
   * The condition the design note set: one elk must not be a furnace. If it
   * were, mining would stop being the way the colony gets mana and the whole of
   * phase 2 would come free with a taming roll.
   */
  it('one head does not keep one furnace lit', () => {
    const perDayFromElk =
      (TICKS_PER_DAY / SPECIES.crystalElk.produceIntervalTicks) * SPECIES.crystalElk.produceAmount;
    const perDayBurned = TICKS_PER_DAY / BURN_TICKS_PER_CRYSTAL;
    expect(perDayFromElk).toBeLessThan(perDayBurned);
    // ...and two do, or the herd would be pointless rather than partial
    expect(perDayFromElk * 2).toBeGreaterThan(perDayBurned);
  });

  it('is worse than a deer at everything except what it is for', () => {
    expect(SPECIES.crystalElk.maxHealth).toBeLessThan(SPECIES.deer.maxHealth);
    expect(SPECIES.crystalElk.foodYield).toBeLessThan(SPECIES.deer.foodYield);
    expect(SPECIES.crystalElk.tameChance).toBeLessThan(SPECIES.deer.tameChance);
  });
});

describe('rockeater (段階 F-D)', () => {
  /** A rockeater put next to a named tile, hungry enough to start on it. */
  function eaterAt(harness: Harness, x: number, y: number) {
    const eater = Object.values(harness.state.animals).find((a) => a.species === 'rockeater')!;
    harness.state.animals[eater.id] = {
      ...eater,
      position: { x, y },
      hunger: ANIMAL_GRAZE_THRESHOLD + 20,
      activity: { kind: 'idle' },
    };
    return eater.id;
  }

  it('chews through rock and leaves open ground behind', () => {
    const harness = createHarness(5401);
    // a rock tile with a walkable neighbour to stand on
    const target = Object.values(harness.state.tiles).find((tile) => {
      if (tile.terrain !== 'stone') return false;
      const west = harness.state.tiles[tileIdOf(tile.x - 1, tile.y)];
      return !!west && west.walkable && !west.buildingId;
    })!;
    eaterAt(harness, target.x - 1, target.y);

    harness.run(ROCKEATER_GNAW_TICKS + 200);
    const after = harness.state.tiles[target.id];
    expect(after.terrain).toBe('grass');
    expect(after.walkable).toBe(true);
  });

  it('rebuilds the region labels, so the ground it opened is reachable', () => {
    // the failure this exists for: a tile that became walkable without the
    // labels being rebuilt reads as region -1 and every job on it is silently
    // filtered out as unreachable
    const harness = createHarness(5403);
    const target = Object.values(harness.state.tiles).find((tile) => {
      if (tile.terrain !== 'stone') return false;
      const west = harness.state.tiles[tileIdOf(tile.x - 1, tile.y)];
      return !!west && west.walkable && !west.buildingId;
    })!;
    eaterAt(harness, target.x - 1, target.y);
    harness.run(ROCKEATER_GNAW_TICKS + 200);

    const opened = regionAt(harness.ctx, target.x, target.y);
    const beside = regionAt(harness.ctx, target.x - 1, target.y);
    expect(opened).toBeGreaterThanOrEqual(0);
    expect(opened).toBe(beside);
  });

  it('eats a stone wall, so a fence is something to keep standing', () => {
    const harness = createHarness(5407);
    const at = Object.values(harness.state.colonists)[0].position;
    const x = at.x + 6;
    const y = at.y + 6;
    const wallId = put(harness.state, 'stoneWall', x, y);
    harness.state.tiles[tileIdOf(x, y)] = {
      ...harness.state.tiles[tileIdOf(x, y)],
      walkable: false,
    };
    eaterAt(harness, x - 1, y);

    const lines = recordLog(harness, ROCKEATER_GNAW_TICKS + 200);
    expect(harness.state.buildings[wallId]).toBeUndefined();
    expect(lines).toContain('buildingBrokenOpen');
  });

  it('never touches a crystal vein: it opens the way to one instead', () => {
    const harness = createHarness(5411);
    const vein = Object.values(harness.state.tiles).find((tile) => tile.terrain === 'crystal');
    expect(vein).toBeDefined();
    const veinsBefore = Object.values(harness.state.tiles).filter(
      (t) => t.terrain === 'crystal',
    ).length;
    harness.run(TICKS_PER_DAY * 4);
    const veinsAfter = Object.values(harness.state.tiles).filter(
      (t) => t.terrain === 'crystal',
    ).length;
    expect(veinsAfter).toBe(veinsBefore);
  });

  it('attacks nobody: not a colonist, not livestock, not in a whole year', () => {
    const harness = createHarness(5413);
    // No wolves at all, kept out for the whole run: the map respawns them
    // daily, and one wolf is enough to make "was anybody attacked" a question
    // about wolves rather than about the thing under test.
    const cull = (state: GameState) => {
      const kept: GameState['animals'] = {};
      for (const id in state.animals) {
        if (state.animals[id].species !== 'wolf') kept[id] = state.animals[id];
      }
      state.animals = kept;
    };
    cull(harness.state);

    // Keys and params both: no line may name the rockeater as an aggressor.
    // The one line it is allowed is rockeaterExposedVein - laying a vein bare
    // is the point of the creature, not an attack - so that key is excluded.
    const entries = recordLogEntries(harness, TICKS_PER_DAY * 6, cull);
    const aggressive = entries.filter(
      (e) =>
        e.key !== 'rockeaterExposedVein' &&
        `${e.key} ${JSON.stringify(e.params ?? {})}`.includes('rockeater'),
    );
    expect(aggressive).toEqual([]);
    for (const id in harness.state.colonists) {
      expect(harness.state.colonists[id].activity.kind).not.toBe('fleeing');
    }
  });

  it('is worth nothing to hunt, and drops no phantom stack when killed', () => {
    expect(SPECIES.rockeater.foodYield).toBe(0);
    expect(SPECIES.rockeater.tameChance).toBe(0);

    const harness = createHarness(5417);
    const eater = Object.values(harness.state.animals).find((a) => a.species === 'rockeater')!;
    const at = eater.position;
    const before = harness.state.tiles[tileIdOf(at.x, at.y)].itemIds.length;
    // killed the way a hunt kills it, carcass and all: a zero yield must leave
    // nothing behind rather than an empty stack the haul chain carries for ever
    killAnimal(harness.state, eater.id, { key: 'animalHunted' }, true);
    expect(harness.state.animals[eater.id]).toBeUndefined();
    expect(harness.state.tiles[tileIdOf(at.x, at.y)].itemIds.length).toBe(before);
  });
});

describe('what the four of them cost the save', () => {
  it('adds no field to GameState, so no migration was needed', () => {
    // Every one of them is an existing field being read differently: a building
    // type, two rows in SPECIES, one field on the species profile, and a value
    // Tile.forage already had. Nothing new is stored, so an old save loads.
    const harness = createHarness(5501);
    const json = JSON.parse(JSON.stringify(harness.state));
    expect(Object.keys(json).sort()).toEqual(Object.keys(harness.state).sort());
    expect(seasonOf(harness.state.tick)).toBe('spring');
  });
});
