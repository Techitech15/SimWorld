// Selector hooks (section 3): components subscribe to the narrowest slice they
// can so a tick that changes one colonist does not re-render the whole UI.
import { useShallow } from 'zustand/react/shallow';
import { countResource } from '../core/storage';
import type { Colonist, ColonistId, ResourceType } from '../core/types';
import { useGameStore } from '../store/gameStore';

export function useTick(): number {
  return useGameStore((s) => s.state.tick);
}

export function useSpeed(): 0 | 1 | 3 {
  return useGameStore((s) => s.state.speed);
}

export function useColonistIds(): ColonistId[] {
  return useGameStore(useShallow((s) => Object.keys(s.state.colonists)));
}

export function useColonist(id: ColonistId | null): Colonist | null {
  return useGameStore((s) => (id ? (s.state.colonists[id] ?? null) : null));
}

export function useResourceTotal(type: ResourceType): number {
  return useGameStore((s) => countResource(s.state, type));
}

export function useJobCounts(): {
  pending: number;
  active: number;
  failed: number;
} {
  return useGameStore(
    useShallow((s) => {
      let pending = 0;
      let active = 0;
      let failed = 0;
      for (const id in s.state.jobs) {
        const job = s.state.jobs[id];
        if (job.state === 'pending') pending++;
        else if (job.state === 'active' || job.state === 'reserved') active++;
        else if (job.state === 'failed') failed++;
      }
      return { pending, active, failed };
    }),
  );
}
