// UI icon URLs (section 12): the same PNGs the renderer uses, so the work
// priority table and the resource list stay visually consistent with the map.
const BASE = `${import.meta.env.BASE_URL ?? '/'}assets/sprites`;

export const icons = {
  chop: `${BASE}/ui/job_chop.png`,
  mine: `${BASE}/ui/job_mine.png`,
  farm: `${BASE}/ui/job_farm.png`,
  build: `${BASE}/ui/job_build.png`,
  haul: `${BASE}/ui/job_haul.png`,
  hunger: `${BASE}/ui/need_hunger.png`,
  sleep: `${BASE}/ui/need_sleep.png`,
  wood: `${BASE}/resources/wood.png`,
  stone: `${BASE}/resources/stone.png`,
  food: `${BASE}/resources/food.png`,
} as const;
