// UI icon URLs (section 12): the same PNGs the renderer uses, so the work
// priority table and the resource list stay visually consistent with the map.
import { sprites } from '../assets/sprites';

export const icons = {
  chop: sprites.jobChop,
  mine: sprites.jobMine,
  farm: sprites.jobFarm,
  build: sprites.jobBuild,
  haul: sprites.jobHaul,
  deconstruct: sprites.jobDeconstruct,
  hunt: sprites.jobHunt,
  handle: sprites.jobHandle,
  research: sprites.jobResearch,
  craft: sprites.jobCraft,
  // no dedicated sprite (フェーズ14 段階 M-1: illness needs no art of its
  // own, docs/design-phase14-water-medicine.md) - the health icon already
  // says what this column is about
  treat: sprites.needHealth,
  hunger: sprites.needHunger,
  sleep: sprites.needSleep,
  health: sprites.needHealth,
  mood: sprites.needMood,
  wood: sprites.wood,
  stone: sprites.stoneItem,
  food: sprites.food,
  manaCrystal: sprites.manaCrystal,
  iron: sprites.ironItem,
  herb: sprites.herbItem,
} as const;
