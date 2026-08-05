// Colonist skills.
//
// Until now every colonist was interchangeable: the same work took the same
// number of ticks whoever did it, so the only question the player ever asked
// about a name in the list was "is this one busy". A skill is the smallest
// thing that makes a colonist an individual - practice makes them faster at
// what they keep doing, and they arrive already good at something.
//
// The design stays inside the existing rules: skills are plain numbers on the
// colonist (section 4), experience is granted in the execute stage of the job
// lifecycle (section 6), and nothing here reads or writes anything outside
// `state.colonists`.
import { mulberry32 } from './rng';
import { addLog, updateColonist } from './state';
import { traitMultiplier } from './traits';
import { JOB_TYPES } from './types';
import type { Colonist, GameState, JobType, SkillName } from './types';

/** One skill per column of the work-priority table. */
export const SKILL_NAMES: SkillName[] = JOB_TYPES as SkillName[];

export const SKILL_MAX_LEVEL = 10;
/**
 * Level n is reached at n^2 * this, so early levels come quickly and the last
 * ones are a long game's worth of work. Experience is granted per tick of work
 * actually put in, so a tree (40 ticks) is 40 points.
 */
export const SKILL_XP_PER_LEVEL_BASE = 50;
/** Each level shortens the work by this fraction of a novice's time. */
export const SKILL_SPEED_PER_LEVEL = 0.08;
export const SKILL_XP_PER_WORK_TICK = 1;

export const SKILL_LABELS: Record<SkillName, string> = {
  chop: 'Woodcutting',
  mine: 'Mining',
  farm: 'Growing',
  build: 'Construction',
  haul: 'Hauling',
  hunt: 'Hunting',
  handle: 'Animals',
};

/**
 * Which skill governs a job. `deconstruct` and `repair` run under the
 * construction column, so tearing a wall down or patching it up trains the same
 * skill that put it up.
 */
export function skillFor(workType: JobType): SkillName {
  return workType === 'deconstruct' || workType === 'repair' ? 'build' : workType;
}

export function xpForLevel(level: number): number {
  return level * level * SKILL_XP_PER_LEVEL_BASE;
}

export function levelOf(xp: number): number {
  if (!(xp > 0)) return 0;
  return Math.min(SKILL_MAX_LEVEL, Math.floor(Math.sqrt(xp / SKILL_XP_PER_LEVEL_BASE)));
}

export function skillLevel(colonist: Colonist, workType: JobType): number {
  return levelOf(colonist.skills?.[skillFor(workType)] ?? 0);
}

/**
 * Work put in per tick. A novice does 1 (the old behaviour exactly), a master
 * 1.8, so skill is worth having without making an expert colonist a different
 * game. WORK_TICKS is unchanged: the same job simply fills up faster.
 */
export function workRate(colonist: Colonist, workType: JobType): number {
  const skilled = 1 + skillLevel(colonist, workType) * SKILL_SPEED_PER_LEVEL;
  // a trait bends the whole rate rather than the skill: being industrious is
  // not the same as being practised, and the two compound
  return skilled * traitMultiplier(colonist, 'work');
}

export function emptySkills(): Record<SkillName, number> {
  const skills = {} as Record<SkillName, number>;
  for (const name of SKILL_NAMES) skills[name] = 0;
  return skills;
}

/**
 * A new colonist's background. Two specialities at level 2..4 and nothing else,
 * which is enough for the player to notice that the person who just walked in
 * is a hunter and the one already here is a farmer.
 */
export function rollStartingSkills(seed: number): Record<SkillName, number> {
  const rnd = mulberry32(Math.abs(Math.floor(seed)) + 1);
  const skills = emptySkills();
  const pool = [...SKILL_NAMES];
  for (let i = 0; i < 2 && pool.length > 0; i++) {
    const [pick] = pool.splice(Math.floor(rnd() * pool.length), 1);
    const level = 2 + Math.floor(rnd() * 3);
    // partway into the level, so nobody starts one tick from a level-up message
    skills[pick] = xpForLevel(level) + Math.floor(rnd() * (xpForLevel(level + 1) - xpForLevel(level)));
  }
  return skills;
}

/**
 * Grant experience for one tick of work and announce a level-up. Called from
 * the execute stage, so only work actually performed counts - walking to the
 * tree teaches nobody anything.
 */
export function grantWorkExperience(
  state: GameState,
  colonistId: string,
  workType: JobType,
): void {
  const colonist = state.colonists[colonistId];
  if (!colonist) return;
  const name = skillFor(workType);
  const before = colonist.skills?.[name] ?? 0;
  const cap = xpForLevel(SKILL_MAX_LEVEL);
  if (before >= cap) return;
  const after = Math.min(cap, before + SKILL_XP_PER_WORK_TICK * traitMultiplier(colonist, 'experience'));
  updateColonist(state, colonistId, { skills: { ...colonist.skills, [name]: after } });
  const gained = levelOf(after);
  if (gained > levelOf(before)) {
    addLog(state, `${colonist.name} reached ${SKILL_LABELS[name]} level ${gained}`);
  }
}
