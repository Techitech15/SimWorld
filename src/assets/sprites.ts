// Sprite URL resolution.
//
// The PNGs are imported through the bundler rather than served from /public so
// that a production build can inline them (vite.config.ts raises
// `assetsInlineLimit` above the size of every sprite). That is what makes the
// single-file build possible, and it also means a missing sprite fails loudly
// at start-up instead of 404-ing at run time.
const modules = import.meta.glob('./**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export function spriteUrl(relativePath: string): string {
  const url = modules[`./${relativePath}`];
  if (!url) throw new Error(`sprite not found: ${relativePath}`);
  return url;
}

export const sprites = {
  grass: spriteUrl('terrain/grass.png'),
  forest1: spriteUrl('terrain/forest_1.png'),
  forest2: spriteUrl('terrain/forest_2.png'),
  stone: spriteUrl('terrain/stone.png'),
  crystal: spriteUrl('terrain/crystal.png'),
  ironVein: spriteUrl('terrain/iron_vein.png'),
  wall: spriteUrl('buildings/wall.png'),
  wallBlueprint: spriteUrl('buildings/wall_blueprint.png'),
  floor: spriteUrl('buildings/floor.png'),
  stoneWall: spriteUrl('buildings/stone_wall.png'),
  stoneFloor: spriteUrl('buildings/stone_floor.png'),
  berryBare: spriteUrl('buildings/berry_bare.png'),
  berryRipe: spriteUrl('buildings/berry_ripe.png'),
  frostbloomBare: spriteUrl('buildings/frostbloom_bare.png'),
  frostbloomBloom: spriteUrl('buildings/frostbloom_bloom.png'),
  doorClosed: spriteUrl('buildings/door_closed.png'),
  doorOpen: spriteUrl('buildings/door_open.png'),
  bed: spriteUrl('buildings/bed.png'),
  farm0: spriteUrl('buildings/farm_0.png'),
  farm1: spriteUrl('buildings/farm_1.png'),
  farm2: spriteUrl('buildings/farm_2.png'),
  storage: spriteUrl('buildings/storage_marker.png'),
  pasture: spriteUrl('buildings/pasture_marker.png'),
  wood: spriteUrl('resources/wood.png'),
  stoneItem: spriteUrl('resources/stone.png'),
  food: spriteUrl('resources/food.png'),
  manaCrystal: spriteUrl('resources/mana_crystal.png'),
  ironItem: spriteUrl('resources/iron.png'),
  manaFurnace: spriteUrl('buildings/mana_furnace.png'),
  manaConduit: spriteUrl('buildings/mana_conduit.png'),
  manaConduitLive: spriteUrl('buildings/mana_conduit_live.png'),
  manaLamp: spriteUrl('buildings/mana_lamp.png'),
  manaLampLit: spriteUrl('buildings/mana_lamp_lit.png'),
  manaExtractor: spriteUrl('buildings/mana_extractor.png'),
  manaExtractorRun: spriteUrl('buildings/mana_extractor_run.png'),
  hearth: spriteUrl('buildings/hearth.png'),
  table: spriteUrl('buildings/table.png'),
  stool: spriteUrl('buildings/stool.png'),
  dresser: spriteUrl('buildings/dresser.png'),
  armchair: spriteUrl('buildings/armchair.png'),
  statue: spriteUrl('buildings/statue.png'),
  manaTurret: spriteUrl('buildings/mana_turret.png'),
  manaTurretLive: spriteUrl('buildings/mana_turret_live.png'),
  raider: spriteUrl('raiders/raider.png'),
  tradingPost: spriteUrl('buildings/trading_post.png'),
  trader: spriteUrl('raiders/trader.png'),
  colonistWalk: spriteUrl('colonist/walk.png'),
  colonistWork: spriteUrl('colonist/work.png'),
  jobChop: spriteUrl('ui/job_chop.png'),
  jobMine: spriteUrl('ui/job_mine.png'),
  jobFarm: spriteUrl('ui/job_farm.png'),
  jobBuild: spriteUrl('ui/job_build.png'),
  jobHaul: spriteUrl('ui/job_haul.png'),
  jobDeconstruct: spriteUrl('ui/job_deconstruct.png'),
  jobHunt: spriteUrl('ui/job_hunt.png'),
  jobHandle: spriteUrl('ui/job_handle.png'),
  needHunger: spriteUrl('ui/need_hunger.png'),
  needSleep: spriteUrl('ui/need_sleep.png'),
  needHealth: spriteUrl('ui/need_health.png'),
  needMood: spriteUrl('ui/need_mood.png'),
  deer: spriteUrl('animals/deer.png'),
  boar: spriteUrl('animals/boar.png'),
  rabbit: spriteUrl('animals/rabbit.png'),
  chicken: spriteUrl('animals/chicken.png'),
  goat: spriteUrl('animals/goat.png'),
  wolf: spriteUrl('animals/wolf.png'),
  crystalElk: spriteUrl('animals/crystal_elk.png'),
  rockeater: spriteUrl('animals/rockeater.png'),
} as const;

export type SpriteKey = keyof typeof sprites;
