// The research tree (11章 フェーズ12, docs/design-phase12-research.md).
//
// The mechanism is entirely borrowed: the desk is one more row in the building
// table, the `research` job is `farm`'s shape (walk to a building, bank
// WORK_TICKS of progress), and a resource-costing tech reuses the blueprint's
// own `requiredResources` field on the desk rather than inventing a second
// place to track a delivery (the same move the mana furnace's fuel haul made).
// This module is the small amount of glue those borrowed parts still need:
// what is unlocked, what is selectable, and whether a desk is ready to work.
import { TECH_NAMES, TECHS } from './constants';
import type {
  Building,
  BuildingType,
  GameState,
  RequiredResource,
  ResearchState,
  TechName,
} from './types';

/** The state a colony that has never touched a desk starts with. */
export function emptyResearch(): ResearchState {
  const progress = {} as Record<TechName, number>;
  for (const name of TECH_NAMES) progress[name] = 0;
  return { current: null, progress, unlocked: [] };
}

/**
 * Which tech, if any, stands between the world and this building type.
 * Built once from `TECHS` so the two can never drift apart (the same reason
 * `veinYieldOf` reads a table instead of a hand-written switch).
 */
const TECH_FOR_BUILDING: Partial<Record<BuildingType, TechName>> = {};
for (const name of Object.keys(TECHS) as TechName[]) {
  for (const type of TECHS[name].unlocks) TECH_FOR_BUILDING[type] = name;
}

export function techForBuilding(type: BuildingType): TechName | undefined {
  return TECH_FOR_BUILDING[type];
}

/**
 * Is this building type free to place? Grandfathered types (everything not
 * named in any tech's `unlocks`) are always unlocked - 3.1's promise that an
 * existing save never finds a wall it can no longer build. Both the build
 * menu and `placeBuildingBlueprint` call this, so a UI bypass reads the same
 * rule the engine enforces.
 */
export function isUnlocked(state: GameState, type: BuildingType): boolean {
  const tech = TECH_FOR_BUILDING[type];
  return !tech || state.research.unlocked.includes(tech);
}

/** Techs whose prerequisites are met and which are not already unlocked. */
export function availableTechs(state: GameState): TechName[] {
  return (Object.keys(TECHS) as TechName[]).filter((name) => {
    if (state.research.unlocked.includes(name)) return false;
    return TECHS[name].prerequisites.every((req) => state.research.unlocked.includes(req));
  });
}

/** What the currently selected tech still asks the desk to be handed, if anything. */
export function researchResourceCost(state: GameState): RequiredResource[] {
  const current = state.research.current;
  if (!current) return [];
  return TECHS[current].resourceCost ?? [];
}

/**
 * Has this desk been handed everything the current tech's resource cost
 * asks for? True trivially when the tech has none (woodcraft, stonecarving,
 * ironwork). The delivered amount lives on `building.requiredResources`,
 * added by the job generator the same way a blueprint's own materials are -
 * this just reads whether every line has reached zero.
 */
export function deskReadyToResearch(state: GameState, building: Building): boolean {
  const need = researchResourceCost(state);
  if (need.length === 0) return true;
  return need.every(
    (line) => (building.requiredResources.find((r) => r.type === line.type)?.quantity ?? 0) <= 0,
  );
}
