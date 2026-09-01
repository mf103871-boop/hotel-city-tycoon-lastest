/**
 * Objective conditions.
 *
 * These live in the core, not the bridge, because the command that pays the
 * reward has to measure completion itself. An earlier version took a progress
 * number from the caller and only checked it was 1 — which meant the UI could
 * claim any reward at any time. Trusting a value from the client is how reward
 * exploits begin, and the fix is for the core to never need to be told.
 */
import type { SimData } from '../data-source.ts';
import { roomById } from '../data-source.ts';
import type { GameState } from '../state/types.ts';
import { decorFill } from './decor.ts';
import { averageCleanliness } from './cleanliness.ts';
import { amenityCoverage } from './quality.ts';

/**
 * How far along a condition is, 0..1.
 *
 * A fraction rather than a boolean: "serve 50 guests" with a bar is an
 * invitation, and the same objective as an unlit checkbox is a wall.
 */
export function objectiveProgress(
  data: SimData,
  state: GameState,
  check: Record<string, unknown> & { kind: string },
): number {
  switch (check.kind) {
    case 'hotelOpen':
      // Counted, not sampled. Asking whether the hotel is open *right now*
      // meant a player who opens a shift and comes back tomorrow — the shift
      // long expired — read zero however many times they had done it.
      return Math.min(1, state.stats.shiftsOpened / Number(check.min ?? 1));

    case 'level':
      return Math.min(1, state.player.level / Number(check.min ?? 1));

    case 'stars':
      return Math.min(1, state.hotel.stars / Number(check.min ?? 1));

    case 'guestsServed':
      return Math.min(1, state.stats.guestsServed / Number(check.min ?? 1));

    case 'plotBlocks': {
      const plot = data.plots.find((p) => p.id === state.hotel.plotId);
      return Math.min(1, (plot?.blocks ?? 0) / Number(check.min ?? 1));
    }

    case 'roomCount': {
      const category = check.category as string | undefined;
      const defId = check.defId as string | undefined;
      let count = 0;
      for (const room of state.hotel.rooms) {
        if (defId) {
          if (room.defId === defId) count++;
          continue;
        }
        const def = roomById(data, room.defId);
        if (def && def.category === category) count++;
      }
      return Math.min(1, count / Number(check.min ?? 1));
    }

    case 'anyRoomFill': {
      let best = 0;
      for (const room of state.hotel.rooms) {
        const def = roomById(data, room.defId);
        if (!def || def.decorTarget <= 0) continue;
        best = Math.max(best, decorFill(def, room));
      }
      return Math.min(1, best / Number(check.min ?? 1));
    }

    case 'cleanliness':
      // `spotless` — an objective literally named for a clean hotel — was
      // wired to `anyRoomFill`, which measures the decor meter. It paid
      // 190,000 coins for a well-furnished room, not a clean one.
      return Math.min(1, averageCleanliness(data, state) / Number(check.min ?? 1));

    case 'reputation':
      return Math.min(1, state.reputation.score / Number(check.min ?? 1));

    case 'amenityCoverage':
      return Math.min(1, amenityCoverage(data, state) / Number(check.min ?? 1));

    default:
      /*
       * An unrecognised condition is NOT satisfied.
       *
       * It used to return 1, on the reasoning that a typo should not strand
       * later objectives behind it. But nothing is gated on an objective here
       * — an unclaimed one withholds only its own reward — so the only thing
       * that reasoning bought was paying out for conditions nobody wrote.
       * The schema now rejects unknown kinds at load, so this is unreachable
       * through the data; it exists for a save or a build that disagrees.
       */
      return 0;
  }
}

export function isObjectiveComplete(
  data: SimData,
  state: GameState,
  objectiveId: string,
): boolean {
  const def = data.objectives.find((o) => o.id === objectiveId);
  if (!def) return false;
  return objectiveProgress(data, state, def.check) >= 1;
}
