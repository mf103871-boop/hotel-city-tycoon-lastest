/**
 * Building a fresh save.
 */
import type { SimData } from '../data-source.ts';
import { roomDef, isGuestRoom } from '../data-source.ts';
import { createCursors } from '../rng/index.ts';
import { SCHEMA_VERSION } from './types.ts';
import type { GameState, RoomInstance } from './types.ts';

export interface NewGameOptions {
  seed: number;
  /** Wall-clock ms at creation. Injected — the core never reads a clock. */
  epochMs: number;
  hotelName?: string;
}

export function createInitialState(data: SimData, opts: NewGameOptions): GameState {
  const start = data.economy.start;

  const state: GameState = {
    schemaVersion: SCHEMA_VERSION,
    seed: opts.seed,
    rng: createCursors(),
    tick: 0,
    epochMs: opts.epochMs,
    player: {
      level: start.level,
      xp: 0,
      coins: start.coins,
      gems: start.gems,
    },
    hotel: {
      name: opts.hotelName ?? 'Hotel City',
      plotId: data.plots.find((p) => p.blocks === start.plotBlocks)?.id ?? data.plots[0]?.id ?? 'plot_12',
      stars: start.stars,
      rooms: [],
    },
    shift: { activeShiftId: null, endsAtTick: 0, graceEndsAtTick: 0, paidCost: 0 },
    guests: [],
    lobbyQueue: [],
    staff: [],
    stats: {
      guestsServed: 0, coinsEarned: 0, coinsSpent: 0,
      pestsCleared: 0, firesCleared: 0, ghostsCleared: 0, guestsLost: 0, shiftsOpened: 0,
    },
    counters: { room: 0, guest: 0, staff: 0, decor: 0 },
    eventCooldowns: {},
    eventClearCounts: {},
    climate: null,
    completedObjectives: [],
    starBoost: { amount: 0, untilTick: 0 },
    revealedGuests: [],
    upgrades: {},
    shopTaken: {},
    gift: { lastClaimedDay: -1, lastItemWeek: -1 },
    visitedToday: { day: -1, ids: [] },
    lastDragTick: -1,
    ownedDecor: {},
    storedRooms: [],
    reputation: { score: data.economy.satisfaction.reputationStart, reviews: [] },
    lastServiceRating: 1,
    unmetDesires: {},
    ledger: {},
    lastStarBonusDay: -1,
    pokes: { day: -1, count: 0 },
    startedAtMs: opts.epochMs,
  };

  // Lay the starting rooms out left to right along the ground floor, wrapping
  // to the next row when the plot runs out of width.
  const plot = data.plots.find((p) => p.id === state.hotel.plotId);
  const width = plot?.grid.w ?? 4;
  let cursorX = 0;
  let cursorY = 0;
  for (const defId of start.prebuiltRooms) {
    const def = roomDef(data, defId);
    if (cursorX + def.blocks.w > width) {
      cursorX = 0;
      cursorY += 1;
    }
    state.hotel.rooms.push(makeRoom(state, defId, cursorX, cursorY));
    cursorX += def.blocks.w;
  }

  // Staff the rooms that cannot function without someone in them.
  for (const room of state.hotel.rooms) {
    const def = roomDef(data, room.defId);
    const roleId = 'staffRole' in def ? def.staffRole : null;
    if (!roleId) continue;
    const staffId = `s${state.counters.staff++}`;
    state.staff.push({ id: staffId, roleId, gradeId: 'bronze', roomId: room.id });
    room.staffId = staffId;
  }

  return state;
}

export function makeRoom(state: GameState, defId: string, x: number, y: number): RoomInstance {
  return {
    id: `r${state.counters.room++}`,
    defId,
    x,
    y,
    decor: [],
    decorPoints: 0,
    cleanliness: 1,
    hasPest: false,
    hasGhost: false,
    hasFire: false,
    occupants: [],
    staffId: null,
    builtAtTick: state.tick,
  };
}

/** Total blocks the current rooms occupy. */
export function usedBlocks(data: SimData, state: GameState): number {
  let used = 0;
  for (const room of state.hotel.rooms) {
    const def = roomDef(data, room.defId);
    used += def.blocks.w * def.blocks.h;
  }
  return used;
}

/** Bed count across all guest rooms. */
export function totalBeds(data: SimData, state: GameState): number {
  let beds = 0;
  for (const room of state.hotel.rooms) {
    const def = roomDef(data, room.defId);
    if (isGuestRoom(def)) beds += def.beds;
  }
  return beds;
}
