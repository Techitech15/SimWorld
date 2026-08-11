// Tools and gear (11章 フェーズ8, docs/design-phase8-equipment.md).
//
// The whole layer is multipliers over numbers that already exist - HUNT_RANGE,
// WORK_TICKS, the raid damage constants - plus one record of individuals on
// GameState. Kind-level performance lives in the EQUIPMENT table (a property
// of the kind, like BUILDING_COSTS), the individual carries only `condition`.
//
// Wearing is one-way: `wornBy` on the equipment, nothing on the colonist.
// "What is this colonist holding" is derived by scanning - the record stays
// small (a colony crafts tools by the handful, not the hundred), and a
// derived answer cannot disagree with the field it derives from.
import { HUNT_RANGE } from './constants';
import { addLog, manhattan, nextId } from './state';
import { advanceTowards } from './movement';
import type { SimContext } from './derived';
import type {
  BuildingId,
  Colonist,
  ColonistId,
  Equipment,
  EquipmentId,
  EquipmentKind,
  EquipmentSlot,
  GameState,
  JobType,
  RequiredResource,
  Vector2,
} from './types';

export interface EquipmentSpec {
  slot: EquipmentSlot;
  cost: RequiredResource[];
  /** uses before it breaks: one use = one completed job / one landed blow */
  uses: number;
  /** multiplier over the work of these columns (composes with skill and mood) */
  workMultiplier?: Partial<Record<JobType, number>>;
  /** replaces HUNT_RANGE while worn */
  huntRange?: number;
  /** multiplier over the wearer's melee damage in a raid (E-6) */
  attackMultiplier?: number;
  /** multiplier over raider damage taken (E-6); below 1 is protection */
  defenseMultiplier?: number;
}

/** 6章の表そのまま（未実測の出発点）。E-6 の剣と鎧は鉄が材料を埋める。 */
export const EQUIPMENT: Record<EquipmentKind, EquipmentSpec> = {
  axe: {
    slot: 'hand',
    cost: [
      { type: 'wood', quantity: 10 },
      { type: 'stone', quantity: 15 },
    ],
    uses: 120,
    workMultiplier: { chop: 0.8 },
  },
  pickaxe: {
    slot: 'hand',
    cost: [
      { type: 'wood', quantity: 10 },
      { type: 'stone', quantity: 20 },
    ],
    uses: 100,
    workMultiplier: { mine: 0.8 },
  },
  huntingBow: {
    slot: 'hand',
    cost: [{ type: 'wood', quantity: 25 }],
    uses: 40,
    // outside BOAR_CHARGE_RANGE (6): the bow is the player's answer to the
    // boar, which was the design's answer to risk-free hunting
    huntRange: 8,
  },
  huntingSpear: {
    slot: 'hand',
    cost: [
      { type: 'wood', quantity: 15 },
      { type: 'stone', quantity: 10 },
    ],
    uses: 60,
    workMultiplier: { hunt: 0.75 },
  },
  sword: {
    slot: 'hand',
    cost: [
      { type: 'wood', quantity: 5 },
      { type: 'iron', quantity: 8 },
    ],
    uses: 60,
    attackMultiplier: 1.5,
  },
  ironArmor: {
    slot: 'body',
    cost: [{ type: 'iron', quantity: 15 }],
    uses: 80,
    defenseMultiplier: 0.6,
  },
};

export const EQUIPMENT_KINDS = Object.keys(EQUIPMENT) as EquipmentKind[];

/** What this colonist is holding/wearing, derived fresh each ask. */
export function wornBy(
  state: GameState,
  colonistId: ColonistId,
): Partial<Record<EquipmentSlot, Equipment>> {
  const worn: Partial<Record<EquipmentSlot, Equipment>> = {};
  for (const id in state.equipment) {
    const piece = state.equipment[id];
    if (piece.wornBy === colonistId) worn[EQUIPMENT[piece.kind].slot] = piece;
  }
  return worn;
}

/** The tool's contribution to one tick of this work; 1 with bare hands. */
export function equipmentWorkMultiplier(
  state: GameState,
  colonistId: ColonistId,
  workType: JobType,
): number {
  const hand = wornBy(state, colonistId).hand;
  if (!hand) return 1;
  const factor = EQUIPMENT[hand.kind].workMultiplier?.[workType];
  // WORK_TICKS shrink by the factor, so the per-tick rate grows by its inverse
  return factor ? 1 / factor : 1;
}

/** How far this colonist can strike prey from (E-3). */
export function huntRangeOf(state: GameState, colonistId: ColonistId): number {
  const hand = wornBy(state, colonistId).hand;
  return hand ? (EQUIPMENT[hand.kind].huntRange ?? HUNT_RANGE) : HUNT_RANGE;
}

/** Melee damage multiplier in a raid (E-6). */
export function attackMultiplierOf(state: GameState, colonistId: ColonistId): number {
  const hand = wornBy(state, colonistId).hand;
  return hand ? (EQUIPMENT[hand.kind].attackMultiplier ?? 1) : 1;
}

/** Damage-taken multiplier in a raid (E-6); 1 unarmoured. */
export function defenseMultiplierOf(state: GameState, colonistId: ColonistId): number {
  const body = wornBy(state, colonistId).body;
  return body ? (EQUIPMENT[body.kind].defenseMultiplier ?? 1) : 1;
}

/** A freshly made piece, lying where it was made. */
export function createEquipment(
  state: GameState,
  kind: EquipmentKind,
  position: Vector2,
): Equipment {
  const id: EquipmentId = nextId(state, 'e');
  const piece: Equipment = { id, kind, wornBy: null, position: { ...position }, condition: 1 };
  state.equipment = { ...state.equipment, [id]: piece };
  return piece;
}

/**
 * One use of the relevant gear: the hand tool for work columns, the sword for
 * a landed blow, the armor for a blow taken (`slot: 'body'`). At zero it
 * breaks - loudly (a log line), and the bench that could replace it is asked
 * to (E-4: a broken tool must never be a silent regression to bare hands).
 */
export function useEquipment(
  state: GameState,
  colonistId: ColonistId,
  slot: EquipmentSlot,
): void {
  const piece = wornBy(state, colonistId)[slot];
  if (!piece) return;
  const condition = piece.condition - 1 / EQUIPMENT[piece.kind].uses;
  if (condition > 1e-9) {
    state.equipment = { ...state.equipment, [piece.id]: { ...piece, condition } };
    return;
  }
  const { [piece.id]: _gone, ...rest } = state.equipment;
  state.equipment = rest;
  addLog(state, 'equipmentBroke', { kind: piece.kind });
  // ask a finished workbench (the record's first) for a replacement
  for (const buildingId in state.buildings) {
    const bench = state.buildings[buildingId];
    if (bench.type !== 'workbench' || bench.isBlueprint) continue;
    orderEquipmentAt(state, buildingId, piece.kind);
    return;
  }
}

/** Queue a piece on a bench (also the click handler's path, src/core/actions.ts). */
export function orderEquipmentAt(
  state: GameState,
  benchId: BuildingId,
  kind: EquipmentKind,
): void {
  const bench = state.buildings[benchId];
  if (!bench || bench.type !== 'workbench' || bench.isBlueprint) return;
  state.buildings = {
    ...state.buildings,
    [benchId]: { ...bench, craftOrders: [...(bench.craftOrders ?? []), kind] },
  };
}

/** Everything a dead colonist wore falls where they stood (E-1の後始末). */
export function dropEquipmentOf(state: GameState, colonistId: ColonistId, at: Vector2): void {
  let next: GameState['equipment'] | null = null;
  for (const id in state.equipment) {
    const piece = state.equipment[id];
    if (piece.wornBy !== colonistId) continue;
    next ??= { ...state.equipment };
    next[id] = { ...piece, wornBy: null, position: { ...at } };
  }
  if (next) state.equipment = next;
}

/**
 * Idle colonists claim gear nobody wears (E-1). Deliberately simple: no
 * reservations, nearest piece for an empty slot, races resolved by arrival -
 * whoever gets there while it is still unworn takes it, anyone else retargets
 * next tick. Only truly idle colonists walk for gear, so this never competes
 * with work or needs.
 */
export function runEquipment(state: GameState, ctx: SimContext): void {
  for (const colonistId in state.colonists) {
    const colonist = state.colonists[colonistId];
    if (colonist.currentJobId || colonist.activity.kind !== 'none') continue;
    const worn = wornBy(state, colonistId);
    const target = nearestUnworn(state, colonist, worn);
    if (!target) continue;
    if (manhattan(colonist.position, target.position!) <= 1) {
      const fresh = state.equipment[target.id];
      // somebody else got there first this very tick: try again next tick
      if (!fresh || fresh.wornBy !== null) continue;
      state.equipment = {
        ...state.equipment,
        [target.id]: { ...fresh, wornBy: colonistId, position: null },
      };
      continue;
    }
    // blocked is fine: they stay idle and try again when the world changes
    advanceTowards(state, ctx, colonistId, target.position!, true);
  }
}

function nearestUnworn(
  state: GameState,
  colonist: Colonist,
  worn: Partial<Record<EquipmentSlot, Equipment>>,
): Equipment | null {
  let best: Equipment | null = null;
  let bestDistance = Infinity;
  for (const id in state.equipment) {
    const piece = state.equipment[id];
    if (piece.wornBy !== null || piece.position === null) continue;
    if (worn[EQUIPMENT[piece.kind].slot]) continue;
    const distance = manhattan(colonist.position, piece.position);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = piece;
    }
  }
  return best;
}
