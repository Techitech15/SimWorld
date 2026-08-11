// What time of day looks like (docs/design-phase7-time.md 3).
//
// The simulation has had a 24-hour clock since TICKS_PER_HOUR existed; this is
// the first time the map shows it. One full-screen tint whose colour and
// opacity are a pure function of the tick - constant cost whatever the map
// size - plus the positions of the lamps that are actually powered, so the
// renderer can lay warm light over the dark and phase 2's payoff is finally
// visible without a word of explanation.
import { LAMP_RADIUS, isPowered } from '../core/mana';
import type { ManaNetworks } from '../core/mana';
import { hourOf } from '../core/daynight';
import type { GameState, Vector2 } from '../core/types';

export interface Shade {
  /** 0xRRGGBB tint of the overlay */
  color: number;
  /** 0 (invisible, broad daylight) .. NIGHT_ALPHA (deep night) */
  alpha: number;
}

/** Dark enough to read as night, light enough to keep playing (3.2). */
export const NIGHT_ALPHA = 0.45;

const NIGHT = { color: 0x0a1230, alpha: NIGHT_ALPHA };
const DAWN = { color: 0xff9a50, alpha: 0.25 };
const DUSK = { color: 0xff8840, alpha: 0.3 };
const DAY = { color: 0xffffff, alpha: 0 };

/**
 * Keyframes over the 24-hour clock, linearly interpolated - so there is no
 * boundary the screen jumps at, which is the acceptance condition N-1 pins.
 * The table in 3.2, with one-hour blends added at each edge so dawn fades out
 * of the night colour instead of snapping to it.
 */
const KEYFRAMES: { hour: number; shade: Shade }[] = [
  { hour: 0, shade: NIGHT },
  { hour: 5, shade: NIGHT },
  { hour: 6, shade: DAWN },
  { hour: 7, shade: DAY },
  { hour: 17, shade: DAY },
  { hour: 19, shade: DUSK },
  { hour: 20, shade: NIGHT },
  { hour: 24, shade: NIGHT },
];

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return (
    (lerpChannel(ar, br, t) << 16) | (lerpChannel(ag, bg, t) << 8) | lerpChannel(ab, bb, t)
  );
}

/** The overlay for this tick: pure, total, and continuous over the day. */
export function shadeAt(tick: number): Shade {
  const hour = hourOf(tick);
  for (let i = 1; i < KEYFRAMES.length; i++) {
    if (hour > KEYFRAMES[i].hour) continue;
    const from = KEYFRAMES[i - 1];
    const to = KEYFRAMES[i];
    const span = to.hour - from.hour;
    const t = span === 0 ? 1 : (hour - from.hour) / span;
    return {
      color: lerpColor(from.shade.color, to.shade.color, t),
      alpha: from.shade.alpha + (to.shade.alpha - from.shade.alpha) * t,
    };
  }
  return NIGHT;
}

export interface LampLight {
  position: Vector2;
  /** tiles, straight from LAMP_RADIUS */
  radius: number;
}

/**
 * Where warm light belongs tonight: every finished lamp whose grid is actually
 * powered. A grid that loses its furnace goes dark here too, which is the
 * acceptance condition N-2 pins - the light is the supply made visible, not a
 * property of the lamp.
 */
export function litLamps(state: GameState, networks: ManaNetworks): LampLight[] {
  const lights: LampLight[] = [];
  for (const id in state.buildings) {
    const building = state.buildings[id];
    if (building.type !== 'manaLamp' || building.isBlueprint) continue;
    if (!isPowered(networks, id)) continue;
    const tile = state.tiles[building.tileId];
    if (!tile) continue;
    lights.push({ position: { x: tile.x, y: tile.y }, radius: LAMP_RADIUS });
  }
  return lights;
}
