// How a damaged structure looks on the map.
//
// Damage had two places it showed up - an alert, and a red pixel on the minimap
// - and neither of them is where the player is looking. The wall itself has to
// say it, on the map, where the wolf is standing next to it.
//
// The tint is quantised into four steps rather than tracking hit points
// continuously. The renderer only rebuilds a sprite when its key changes, and a
// key that moved on every point of damage would rebuild the sprite on every
// bite for a difference nobody can see.
import type { Building } from '../core/types';

export const DAMAGE_STEPS = 4;

/** 0 = whole, 3 = nearly gone. */
export function damageStep(building: Building): number {
  if (building.isBlueprint || building.hpMax <= 0) return 0;
  const lost = 1 - building.hpCurrent / building.hpMax;
  if (lost <= 0) return 0;
  return Math.min(DAMAGE_STEPS - 1, Math.max(1, Math.floor(lost * DAMAGE_STEPS)));
}

/**
 * White for a whole building, deepening towards a bruised red as it goes. Kept
 * as a tint rather than a separate cracked sprite so it works for every
 * building type without drawing nine more textures.
 */
export function damageTint(step: number): number {
  if (step <= 0) return 0xffffff;
  const t = Math.min(1, step / (DAMAGE_STEPS - 1));
  // white -> (255, 110, 90): red stays, green and blue fall away
  const g = Math.round(255 - (255 - 110) * t);
  const b = Math.round(255 - (255 - 90) * t);
  return (255 << 16) | (g << 8) | b;
}
