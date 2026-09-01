/**
 * The React adapter.
 *
 * Deliberately thin. All the behaviour lives in `engine.ts`, which is
 * framework-free and tested headlessly; this file only exposes it to React and
 * keeps a version counter so components re-render when the simulation moves.
 *
 * React reads through selectors and writes through `dispatch`. It never
 * touches GameState directly, and it never imports from src/core — the lint
 * rules enforce both.
 */
import { create } from 'zustand';
import type { GameState, SimEvent } from '../core/state/types.ts';
import type { Command, CommandResult, RejectReason } from '../core/commands/index.ts';
import type { GameEngine } from './engine.ts';

interface GameStore {
  engine: GameEngine | null;
  state: GameState | null;
  /** Bumped on every simulation change; components subscribe to this. */
  revision: number;
  /** Recent events, for toasts and effects. Trimmed to stay bounded. */
  recentEvents: SimEvent[];
  /** The last refusal, so the interface can explain it. */
  lastRejection: RejectReason | null;

  attach: (engine: GameEngine) => void;
  detach: () => void;
  dispatch: (cmd: Command) => CommandResult;
  consumeEvents: () => SimEvent[];
  consumeRejection: () => RejectReason | null;
}

const MAX_BUFFERED_EVENTS = 200;

export const useGameStore = create<GameStore>((set, get) => ({
  engine: null,
  state: null,
  revision: 0,
  recentEvents: [],
  lastRejection: null,

  attach: (engine) => {
    engine.subscribe((state, events) => {
      set((prev) => ({
        // The engine mutates state in place for speed, so the reference is
        // stable and React would never see a change. A shallow shell is cheap
        // and gives every selector a fresh identity to compare against.
        state: { ...state },
        revision: prev.revision + 1,
        recentEvents: events.length
          ? [...prev.recentEvents, ...events].slice(-MAX_BUFFERED_EVENTS)
          : prev.recentEvents,
      }));
    });
    set({ engine, state: { ...engine.getState() }, revision: 0, recentEvents: [] });
  },

  detach: () => {
    get().engine?.stop();
    set({ engine: null, state: null, revision: 0, recentEvents: [] });
  },

  dispatch: (cmd) => {
    const engine = get().engine;
    if (!engine) return { ok: false, reason: 'unknownRoom' };
    const result = engine.dispatch(cmd);
    if (result.ok) {
      set((prev) => ({ state: { ...engine.getState() }, revision: prev.revision + 1 }));
    } else {
      // A refusal used to change nothing and say nothing: the player tapped,
      // the game did not move, and no message explained why.
      set((prev) => ({ lastRejection: result.reason, revision: prev.revision + 1 }));
    }
    return result;
  },

  consumeEvents: () => {
    const events = get().recentEvents;
    if (events.length > 0) set({ recentEvents: [] });
    return events;
  },

  consumeRejection: () => {
    const reason = get().lastRejection;
    if (reason !== null) set({ lastRejection: null });
    return reason;
  },
}));

// ---- selectors -------------------------------------------------------
// Narrow selectors keep React from re-rendering the whole HUD when one
// number moves. Components should always read through these.

export const selectCoins = (s: GameStore) => s.state?.player.coins ?? 0;
export const selectGems = (s: GameStore) => s.state?.player.gems ?? 0;
export const selectLevel = (s: GameStore) => s.state?.player.level ?? 1;
export const selectXp = (s: GameStore) => s.state?.player.xp ?? 0;
export const selectStars = (s: GameStore) => s.state?.hotel.stars ?? 0;
export const selectHotelName = (s: GameStore) => s.state?.hotel.name ?? '';
export const selectRooms = (s: GameStore) => s.state?.hotel.rooms ?? [];
export const selectGuests = (s: GameStore) => s.state?.guests ?? [];
export const selectShift = (s: GameStore) => s.state?.shift ?? null;
export const selectStats = (s: GameStore) => s.state?.stats ?? null;
export const selectDispatch = (s: GameStore) => s.dispatch;
