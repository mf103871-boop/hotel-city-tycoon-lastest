/**
 * Persistence.
 *
 * Two rules govern this file. First, the storage backend is pluggable, so the
 * save logic can be tested without a browser. Second, migrations are a chain
 * that is never broken and never deleted: a save written by version 1 must
 * still load in version 40, because someone will come back after a year away
 * and expect their hotel to be there.
 *
 * A save that cannot be migrated is quarantined, not overwritten. Losing a
 * player's progress is worse than failing to start.
 */
import type { GameState } from '../core/state/types.ts';
import type { SimData } from '../core/data-source.ts';
import { checkInvariants } from '../core/state/invariants.ts';
import { SCHEMA_VERSION } from '../core/state/types.ts';

export const SAVE_KEY = 'hct:save';
export const QUARANTINE_KEY = 'hct:save:quarantine';

// ---------------------------------------------------------------- storage

export interface SaveStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** In-memory backend. Used by tests and as a last-resort fallback. */
export class MemoryStorage implements SaveStorage {
  private readonly map = new Map<string, string>();
  async get(key: string): Promise<string | null> { return this.map.get(key) ?? null; }
  async set(key: string, value: string): Promise<void> { this.map.set(key, value); }
  async remove(key: string): Promise<void> { this.map.delete(key); }
}

/**
 * IndexedDB backend.
 *
 * Chosen over localStorage for two reasons: it is asynchronous, so a large
 * save never blocks a frame, and it has no practical size ceiling.
 */
export class IndexedDbStorage implements SaveStorage {
  private readonly dbName: string;
  private readonly storeName = 'kv';
  private db: IDBDatabase | null = null;

  constructor(dbName = 'hotel-city-tycoon') {
    this.dbName = dbName;
  }

  private open(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(this.storeName)) {
          req.result.createObjectStore(this.storeName);
        }
      };
      req.onsuccess = () => { this.db = req.result; resolve(req.result); };
      req.onerror = () => reject(req.error);
    });
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = fn(db.transaction(this.storeName, mode).objectStore(this.storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(key: string): Promise<string | null> {
    const value = await this.tx<unknown>('readonly', (s) => s.get(key) as IDBRequest<unknown>);
    return typeof value === 'string' ? value : null;
  }
  async set(key: string, value: string): Promise<void> {
    await this.tx('readwrite', (s) => s.put(value, key) as IDBRequest<unknown>);
  }
  async remove(key: string): Promise<void> {
    await this.tx('readwrite', (s) => s.delete(key) as IDBRequest<unknown>);
  }
}

/** Picks the best backend available. Never throws. */
export function defaultStorage(): SaveStorage {
  try {
    if (typeof indexedDB !== 'undefined') return new IndexedDbStorage();
  } catch {
    // fall through
  }
  return new MemoryStorage();
}

// ---------------------------------------------------------------- envelope

export interface SaveEnvelope {
  /** Format version of the envelope itself. */
  format: 1;
  /** Schema version of the state inside. */
  version: number;
  savedAtMs: number;
  state: GameState;
}

// ---------------------------------------------------------------- migrations

/**
 * One entry per version step. Never delete one, never renumber one.
 *
 * The chain is currently trivial because P2 defined version 1. It exists now
 * rather than later precisely because writing migrations is cheap while the
 * shape is fresh and expensive once four phases have changed it.
 */
export type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Record<number, Migration> = {
  /**
   * 1 → 2: the objectives checklist arrived.
   *
   * An existing player keeps their hotel and starts the checklist from the
   * beginning, which is the right outcome: the objectives are a guide, and
   * re-earning the early rewards is a small gift rather than a loss.
   */
  1: (state) => ({ ...state, completedObjectives: [] }),

  /**
   * 2 → 3: the inspector's temporary rating boost.
   *
   * An existing hotel starts with no boost active and nobody revealed, which
   * is the same position a new game begins from.
   */
  2: (state) => ({ ...state, starBoost: { amount: 0, untilTick: 0 }, revealedGuests: [] }),

  /** 3 → 4: permanent upgrades. An existing hotel owns none, as a new one does. */
  3: (state) => ({ ...state, upgrades: {} }),

  /**
   * 4 → 5: the rotating shop and the daily gift.
   *
   * An existing player has taken nothing and has no streak — the same place a
   * new game starts, so nobody is penalised for having played first.
   */
  4: (state) => ({ ...state, shopTaken: {}, gift: { lastClaimedDay: -1, streak: 0 } }),

  /**
   * 5 → 6: rival hotels.
   *
   * `startedAtMs` falls back to now, so an existing hotel is treated as newly
   * opened for the purpose of how far the city has grown. That is generous
   * rather than accurate, and generous is the right way to be wrong here.
   */
  5: (state) => ({
    ...state,
    visitedToday: { day: -1, ids: [] },
    startedAtMs: typeof state['startedAtMs'] === 'number' ? state['startedAtMs'] : Date.now(),
  }),

  /**
   * 6 → 7: shifts opened.
   *
   * An existing player is credited with one, because they plainly have opened
   * their hotel — starting them at zero would take back a milestone they had
   * already earned.
   */
  6: (state) => {
    const stats = { ...(state['stats'] as Record<string, unknown>) };
    stats['shiftsOpened'] = typeof stats['shiftsOpened'] === 'number' ? stats['shiftsOpened'] : 1;
    return { ...state, stats };
  },

  /**
   * 7 → 8: the shift grace window and the drag cooldown.
   *
   * `graceEndsAtTick` is set to the shift's own end. An existing save is
   * therefore migrated into "no grace remaining", which is the conservative
   * reading: it never hands a returning player a window they did not pay for,
   * and a shift they open after this point gets the full grace like anyone
   * else. `lastDragTick` starts at -1 so the first drag is never on cooldown.
   */
  7: (state) => {
    const shift = { ...(state['shift'] as Record<string, unknown>) };
    const ends = typeof shift['endsAtTick'] === 'number' ? shift['endsAtTick'] : 0;
    shift['graceEndsAtTick'] = typeof shift['graceEndsAtTick'] === 'number' ? shift['graceEndsAtTick'] : ends;
    // A guest in flight at migration time is credited as having checked in if
    // they hold a room. Anyone mid-walk is treated as never admitted, which at
    // worst lets one existing passer-by be rescued once.
    const guests = Array.isArray(state['guests'])
      ? (state['guests'] as Array<Record<string, unknown>>).map((g) => ({
          ...g,
          everCheckedIn: typeof g['everCheckedIn'] === 'boolean'
            ? g['everCheckedIn']
            : g['state'] === 'staying' || g['state'] === 'usingAmenity',
        }))
      : state['guests'];
    return {
      ...state, shift, guests,
      lastDragTick: typeof state['lastDragTick'] === 'number' ? state['lastDragTick'] : -1,
    };
  },

  /**
   * 8 → 9: decor ownership.
   *
   * An existing player starts with an empty store rather than being
   * compensated for shop purchases that vanished. Guessing at what they bought
   * from `shopTaken` would mean inventing items from a record that only says
   * an offer was taken, not what became of it.
   */
  8: (state) => ({
    ...state,
    ownedDecor: typeof state['ownedDecor'] === 'object' && state['ownedDecor'] !== null
      ? state['ownedDecor']
      : {},
  }),

  /**
   * 9 → 10: room storage, starting empty.
   *
   * Nothing to reconstruct: before this version a room could only be built or
   * sold, so no player has a room in limbo waiting to be restored.
   */
  9: (state) => ({
    ...state,
    storedRooms: Array.isArray(state['storedRooms']) ? state['storedRooms'] : [],
  }),

  /**
   * 10 → 11: satisfaction, reviews and reputation.
   *
   * Reputation starts at the neutral value from the data rather than being
   * inferred: there is no record of how past guests felt, because nothing ever
   * asked them. Guests in flight are given a blank score sheet and full
   * patience, so the first stay that completes after the upgrade is judged on
   * its own merits rather than on a wait nobody measured.
   */
  10: (state) => {
    const guests = Array.isArray(state['guests'])
      ? (state['guests'] as Array<Record<string, unknown>>).map((g) => ({
          ...g,
          patienceTotalTicks: typeof g['patienceTotalTicks'] === 'number' ? g['patienceTotalTicks'] : 600,
          waitedTicks: typeof g['waitedTicks'] === 'number' ? g['waitedTicks'] : 0,
          satisfaction: typeof g['satisfaction'] === 'number' ? g['satisfaction'] : -1,
          satisfactionLog: Array.isArray(g['satisfactionLog']) ? g['satisfactionLog'] : [],
          desireMet: typeof g['desireMet'] === 'boolean' ? g['desireMet'] : false,
          sawIncident: typeof g['sawIncident'] === 'boolean' ? g['sawIncident'] : false,
          ratedQuality: typeof g['ratedQuality'] === 'number' ? g['ratedQuality'] : -1,
          ratedCleanliness: typeof g['ratedCleanliness'] === 'number' ? g['ratedCleanliness'] : -1,
          review: typeof g['review'] === 'number' ? g['review'] : -1,
          leaveReason: g['leaveReason'] ?? null,
        }))
      : state['guests'];
    return {
      ...state, guests,
      reputation: (state['reputation'] as unknown) ?? { score: 60, reviews: [] },
      lastServiceRating: typeof state['lastServiceRating'] === 'number' ? state['lastServiceRating'] : 1,
      unmetDesires: (state['unmetDesires'] as unknown) ?? {},
    };
  },

  /**
   * 11 → 12: the coin ledger, starting empty.
   *
   * Not reconstructed from `coinsEarned` and `coinsSpent`. Those are two
   * totals with no breakdown, and splitting them into categories would mean
   * inventing a history the save does not contain.
   */
  11: (state) => ({
    ...state,
    ledger: typeof state['ledger'] === 'object' && state['ledger'] !== null ? state['ledger'] : {},
  }),

  /**
   * 12 → 13: the star bonus day.
   *
   * Starts at -1, so a returning player is owed today's bonus rather than
   * being told they have already had it. Nobody has ever been paid one, so
   * there is no history to preserve.
   */
  12: (state) => ({
    ...state,
    lastStarBonusDay: typeof state['lastStarBonusDay'] === 'number' ? state['lastStarBonusDay'] : -1,
  }),

  /**
   * 13 → 14: the original catalogue (3B).
   *
   * The game moved to Hotel City's own shape: 52 levels, one guest type plus
   * the inspector, and the seven original staff roles. Every room id
   * survived — only names and numbers changed — so hotels, decor and coins
   * carry over untouched. What cannot carry over is mapped, never deleted
   * wholesale:
   *
   * - A player past level 52 is set to 52 with XP at the new cap. The levels
   *   they lived are not owed back; the ceiling simply moved to where the
   *   original always had it.
   * - Guests of the five removed types become standard guests mid-stay. They
   *   keep their room, their timer and their bill.
   * - A guest still wishing for the wellness the spa no longer offers has the
   *   wish cleared rather than left forever unanswerable.
   * - Staff holding a removed role are let go. Their wage was already zero,
   *   so nothing owed is lost; the rooms they served are covered by the
   *   seven roles that remain.
   */
  13: (state) => {
    const REMOVED_TYPES = new Set(['tourist', 'family', 'business', 'vip', 'celebrity']);
    const REMOVED_ROLES = new Set(['barista', 'attendant', 'therapist', 'launderer', 'engineer', 'concierge']);
    const LEVEL_CAP = 52;
    const XP_CAP = 6_280_000; // xpTotal at level 52 in the 3B curve

    const player = { ...(state['player'] as Record<string, unknown>) };
    if (typeof player['level'] === 'number' && player['level'] > LEVEL_CAP) player['level'] = LEVEL_CAP;
    if (typeof player['xp'] === 'number' && player['xp'] > XP_CAP) player['xp'] = XP_CAP;

    const guests = Array.isArray(state['guests'])
      ? (state['guests'] as Array<Record<string, unknown>>).map((g) => ({
          ...g,
          typeId: REMOVED_TYPES.has(g['typeId'] as string) ? 'standard' : g['typeId'],
          desire: g['desire'] === 'wellness' ? null : g['desire'],
        }))
      : state['guests'];

    const staff = Array.isArray(state['staff'])
      ? (state['staff'] as Array<Record<string, unknown>>).filter(
          (m) => !REMOVED_ROLES.has(m['roleId'] as string),
        )
      : state['staff'];

    return { ...state, player, guests, staff };
  },

  /**
   * 14 → 15: poke tracking (decision 3a).
   *
   * Starts at day -1 with a count of zero — the same place a new game
   * starts, so a returning player has today's pokes in full.
   */
  14: (state) => {
    // The poke rng stream is new; an older save's cursor block does not have
    // it, and an undefined cursor turns every draw into the same number.
    const rng = { ...(state['rng'] as Record<string, unknown>) };
    if (typeof rng['poke'] !== 'number' || !Number.isFinite(rng['poke'])) rng['poke'] = 0;
    return {
      ...state,
      rng,
      pokes: (state['pokes'] as unknown) ?? { day: -1, count: 0 },
    };
  },

  /**
   * 15 → 16: the gift sheds its streak (decision 15a) and the cafe, arcade
   * and disco shed their staff (staffless, as the original listed them).
   *
   * - The gift keeps its claimed-day so nobody double-claims today; the item
   *   week starts fresh, which can only be generous.
   * - Anyone employed in the three staffless rooms steps OUT of the room and
   *   stays employed, free to be assigned somewhere that still has a slot.
   */
  15: (state) => {
    const oldGift = state['gift'] as { lastClaimedDay?: number } | undefined;
    const hotel = state['hotel'] as { rooms?: Array<Record<string, unknown>> } | undefined;
    const slotless = new Set(['cafe', 'arcade', 'spa']);
    const rooms = hotel?.rooms ?? [];
    const slotlessIds = new Set(
      rooms.filter((r) => slotless.has(r['defId'] as string)).map((r) => r['id'] as string),
    );
    const staff = Array.isArray(state['staff'])
      ? (state['staff'] as Array<Record<string, unknown>>).map((m) =>
          slotlessIds.has(m['roomId'] as string) ? { ...m, roomId: null } : m)
      : state['staff'];
    const newRooms = rooms.map((r) => (slotlessIds.has(r['id'] as string) ? { ...r, staffId: null } : r));
    return {
      ...state,
      ...(hotel ? { hotel: { ...hotel, rooms: newRooms } } : {}),
      staff,
      gift: { lastClaimedDay: oldGift?.lastClaimedDay ?? -1, lastItemWeek: -1 },
    };
  },

  /**
   * 16 → 17: the last original incidents (4C).
   *
   * Every room learns it can be haunted (it is not, yet), the hotel learns
   * about the weather (calm), and the ghostbuster's tally starts at zero.
   */
  16: (state) => {
    const hotel = state['hotel'] as { rooms?: Array<Record<string, unknown>> } | undefined;
    const rooms = (hotel?.rooms ?? []).map((r) => ({ hasGhost: false, ...r }));
    const stats = { ghostsCleared: 0, ...(state['stats'] as Record<string, unknown>) };
    return {
      ...state,
      ...(hotel ? { hotel: { ...hotel, rooms } } : {}),
      stats,
      climate: (state['climate'] as unknown) ?? null,
    };
  },
};

export function migrate(raw: Record<string, unknown>, from: number, to: number): Record<string, unknown> {
  let state = raw;
  for (let v = from; v < to; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`No migration from save version ${v} to ${v + 1}`);
    state = step(state);
  }
  return state;
}

// ---------------------------------------------------------------- integrity

export type SaveOutcome =
  | { ok: true; bytes: number }
  | { ok: false; reason: 'quota' | 'unavailable' | 'serialise'; detail: string };

export type LoadOutcome =
  | { ok: true; state: GameState; migratedFrom: number | null; savedAtMs: number }
  | { ok: false; reason: 'empty' | 'corrupt' | 'unmigratable' | 'fromFuture' | 'unavailable'; detail?: string };

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === 'string';
const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Is this parsed JSON even shaped like a save file?
 *
 * `JSON.parse` happily returns null, a number, a boolean, a string or an
 * array — all valid JSON documents, none of them an envelope. Reading a field
 * off any of them throws, and a throw out of `load()` is a rejected Promise
 * where the caller wanted a corrupt result.
 */
const isEnvelopeShaped = (v: unknown): v is Record<string, unknown> => obj(v);

/**
 * Full structural validation.
 *
 * The first version of this only checked the top level, which meant a save
 * with `player: {}` loaded happily and then produced NaN coins in the HUD
 * several screens later. A save either satisfies the whole shape or it does
 * not load — a crash at startup is recoverable, a corrupted economy is not.
 *
 * Returns the problems it found, so the failure can be logged rather than
 * guessed at.
 */
export function validateState(value: unknown): string[] {
  const problems: string[] = [];
  const fail = (m: string) => problems.push(m);

  if (!obj(value)) return ['state is not an object'];
  const s = value as Record<string, unknown>;

  if (!num(s.schemaVersion)) fail('schemaVersion is not a number');
  if (!num(s.seed)) fail('seed is not a number');
  if (!num(s.tick)) fail('tick is not a number');
  if (!num(s.epochMs)) fail('epochMs is not a number');

  if (!obj(s.rng)) fail('rng cursors missing');
  else for (const stream of ['guestSpawn', 'guestType', 'guestDesire', 'roomPick', 'events', 'staffGrade']) {
    if (!num(s.rng[stream])) fail(`rng cursor "${stream}" is not a number`);
  }

  if (!obj(s.player)) fail('player missing');
  else for (const field of ['level', 'xp', 'coins', 'gems']) {
    if (!num(s.player[field])) fail(`player.${field} is not a number`);
  }

  /**
   * Check a decor list without trusting anything inside it.
   *
   * `decor: [null]` used to reach `piece.defId` and throw a TypeError, which
   * turned a corrupt-but-recoverable save into a crash on the way in — the one
   * outcome this whole function exists to prevent.
   */
  const checkDecor = (list: unknown, where: string): void => {
    if (!Array.isArray(list)) { fail(`${where} has no decor array`); return; }
    list.forEach((piece, j) => {
      if (!obj(piece)) { fail(`${where} decor ${j} is not an object`); return; }
      const p = piece as Record<string, unknown>;
      if (!str(p['id']) || (p['id'] as string).length === 0) fail(`${where} decor ${j} has no id`);
      if (!str(p['defId']) || (p['defId'] as string).length === 0) fail(`${where} decor ${j} has no defId`);
      if (!Number.isInteger(p['slot']) || (p['slot'] as number) < 0) {
        fail(`${where} decor ${j} has no valid slot`);
      }
    });
  };

  if (!obj(s.hotel)) fail('hotel missing');
  else {
    if (!str(s.hotel.name)) fail('hotel.name is not a string');
    if (!str(s.hotel.plotId)) fail('hotel.plotId is not a string');
    if (!num(s.hotel.stars)) fail('hotel.stars is not a number');
    if (!Array.isArray(s.hotel.rooms)) fail('hotel.rooms is not an array');
    else s.hotel.rooms.forEach((room, i) => {
      if (!obj(room)) { fail(`room ${i} is not an object`); return; }
      // An empty string is a string. A room with no id cannot be referenced
      // by a guest, a staff member or a stored-room uniqueness check, so it is
      // as broken as a missing field and has to fail the same way.
      if (!str(room.id) || room.id.length === 0) fail(`room ${i} has no id`);
      if (!str(room.defId) || room.defId.length === 0) fail(`room ${i} has no defId`);
      if (!num(room.x) || !num(room.y)) fail(`room ${i} has no position`);
      if (!num(room.cleanliness)) fail(`room ${i} has no cleanliness`);
      if (typeof room.hasPest !== 'boolean' || typeof room.hasFire !== 'boolean' || typeof room.hasGhost !== 'boolean') fail(`room ${i} has no hazard flags`);
      checkDecor(room.decor, `room ${i}`);
      if (!Array.isArray(room.occupants)) fail(`room ${i} has no occupants array`);
    });
  }

  if (!obj(s.shift)) fail('shift missing');
  else {
    if (!num(s.shift.endsAtTick)) fail('shift.endsAtTick is not a number');
    if (!num(s.shift.graceEndsAtTick)) fail('shift.graceEndsAtTick is not a number');
    // The grace window closes at or after the shift does. A save claiming
    // otherwise would put the hotel in a phase the state machine cannot name.
    else if (num(s.shift.endsAtTick) && s.shift.graceEndsAtTick < s.shift.endsAtTick) {
      fail('shift.graceEndsAtTick is before shift.endsAtTick');
    }
  }
  if (!num(s.lastDragTick)) fail('lastDragTick is not a number');

  if (!obj(s.reputation)) fail('reputation missing');
  else {
    const rep = s.reputation as Record<string, unknown>;
    if (!num(rep['score'])) fail('reputation.score is not a number');
    if (!Array.isArray(rep['reviews'])) fail('reputation.reviews is not an array');
  }
  if (!num(s.lastServiceRating)) fail('lastServiceRating is not a number');
  if (!obj(s.unmetDesires)) fail('unmetDesires missing');
  if (!obj(s.ledger)) fail('ledger missing');
  if (!num(s.lastStarBonusDay)) fail('lastStarBonusDay is not a number');

  if (!Array.isArray(s.storedRooms)) fail('storedRooms is not an array');
  else (s.storedRooms as unknown[]).forEach((entry, i) => {
    /*
     * Nothing about the entry is assumed.
     *
     * `storedRooms: [null]` threw on the first property read. So did `[0]`,
     * `[false]`, `['bad']` and `[[]]` — a save that a player could recover
     * from became an exception at boot, and the caller saw a rejected Promise
     * instead of a corrupt result.
     */
    if (!obj(entry)) { fail(`stored room ${i} is not an object`); return; }
    const stored = entry as Record<string, unknown>;
    // Restored verbatim, so a bad field here becomes a room on the plot with
    // an undefined value in it.
    if (!str(stored['id']) || (stored['id'] as string).length === 0) fail(`stored room ${i} has no id`);
    if (!str(stored['defId']) || (stored['defId'] as string).length === 0) fail(`stored room ${i} has no defId`);
    checkDecor(stored['decor'], `stored room ${i}`);
    if (!num(stored['decorPoints'])) fail(`stored room ${i} has no decorPoints`);
    if (!num(stored['cleanliness'])) fail(`stored room ${i} has no cleanliness`);
    if (!num(stored['builtAtTick'])) fail(`stored room ${i} has no builtAtTick`);
  });

  if (!obj(s.ownedDecor)) fail('ownedDecor missing');
  else for (const [defId, count] of Object.entries(s.ownedDecor as Record<string, unknown>)) {
    // A negative or fractional count would mean the ledger had been written by
    // something other than the two functions that own it.
    if (!num(count) || (count as number) < 0 || !Number.isInteger(count)) {
      fail(`ownedDecor.${defId} is not a whole non-negative number`);
    }
  }

  if (!Array.isArray(s.guests)) fail('guests is not an array');
  if (!Array.isArray(s.staff)) fail('staff is not an array');
  if (!Array.isArray(s.lobbyQueue)) fail('lobbyQueue is not an array');

  if (!obj(s.stats)) fail('stats missing');
  else for (const field of ['guestsServed', 'coinsEarned', 'coinsSpent', 'shiftsOpened']) {
    if (!num(s.stats[field])) fail(`stats.${field} is not a number`);
  }

  if (!obj(s.counters)) fail('counters missing');
  else for (const field of ['room', 'guest', 'staff', 'decor']) {
    if (!num(s.counters[field])) fail(`counters.${field} is not a number`);
  }

  if (!obj(s.eventCooldowns)) fail('eventCooldowns missing');
  if (!obj(s.eventClearCounts)) fail('eventClearCounts missing');
  if (!Array.isArray(s.completedObjectives)) fail('completedObjectives is not an array');
  if (!obj(s.starBoost)) fail('starBoost missing');
  else if (!num((s.starBoost as Record<string, unknown>).amount)) fail('starBoost.amount is not a number');
  if (!Array.isArray(s.revealedGuests)) fail('revealedGuests is not an array');
  if (!obj(s.upgrades)) fail('upgrades missing');
  if (!obj(s.shopTaken)) fail('shopTaken missing');
  if (!obj(s.gift)) fail('gift missing');
  else if (!num((s.gift as Record<string, unknown>).lastItemWeek)) fail('gift.lastItemWeek is not a number');
  if (s.climate !== null && s.climate !== undefined) {
    if (typeof s.climate !== 'object') fail('climate is neither null nor a record');
    else {
      const c = s.climate as Record<string, unknown>;
      if (typeof c.eventId !== 'string' || !num(c.untilTick)) fail('climate is missing its event or clock');
    }
  }

  if (!obj(s.visitedToday)) fail('visitedToday missing');
  else {
    const visited = s.visitedToday as Record<string, unknown>;
    if (!num(visited.day)) fail('visitedToday.day is not a number');
    if (!Array.isArray(visited.ids)) fail('visitedToday.ids is not an array');
  }

  if (!num(s.startedAtMs)) fail('startedAtMs is not a number');

  return problems;
}

export function looksLikeState(value: unknown): value is GameState {
  return validateState(value).length === 0;
}

// ---------------------------------------------------------------- manager

export class SaveManager {
  private readonly storage: SaveStorage;
  /**
   * Optional, and the semantic check only runs when it is here.
   *
   * Passing it makes `load` reject a save whose stored rooms point at
   * definitions that no longer exist. Without it the manager still works and
   * still validates structure, so existing callers are unaffected.
   */
  private readonly data: SimData | null;

  constructor(storage: SaveStorage = defaultStorage(), data: SimData | null = null) {
    this.storage = storage;
    this.data = data;
  }

  /**
   * Write the save, reporting what happened rather than throwing.
   *
   * Every caller used to fire this and forget it. A browser out of storage —
   * or in private mode, where IndexedDB can be a quota of zero — simply
   * stopped saving, and the player kept playing a game that was no longer
   * being recorded. They would find out on their next visit.
   */
  async save(state: GameState, nowMs: number): Promise<SaveOutcome> {
    const envelope: SaveEnvelope = {
      format: 1,
      version: SCHEMA_VERSION,
      savedAtMs: nowMs,
      state,
    };
    let payload: string;
    try {
      payload = JSON.stringify(envelope);
    } catch (e) {
      return { ok: false, reason: 'serialise', detail: (e as Error).message };
    }

    try {
      await this.storage.set(SAVE_KEY, payload);
      return { ok: true, bytes: payload.length };
    } catch (e) {
      const message = (e as Error).message ?? String(e);
      // Quota is worth naming separately: it is the failure a real player
      // hits, and the only one they can do something about.
      const quota = /quota|storage|exceeded|full/i.test(message)
        || (e as { name?: string }).name === 'QuotaExceededError';
      return { ok: false, reason: quota ? 'quota' : 'unavailable', detail: message };
    }
  }

  async load(): Promise<LoadOutcome> {
    // Reading can fail outright — a private window may have no usable store at
    // all. That has to arrive as an outcome, not an exception: throwing here
    // took the whole boot down before the game had drawn anything.
    let raw: string | null;
    try {
      raw = await this.storage.get(SAVE_KEY);
    } catch (e) {
      return { ok: false, reason: 'unavailable', detail: (e as Error).message };
    }
    if (raw === null) return { ok: false, reason: 'empty' };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      await this.quarantine(raw);
      return { ok: false, reason: 'corrupt', detail: (e as Error).message };
    }

    /*
     * The root has to be an object before anything reads a field off it.
     *
     * `typeof null === 'object'`, so a file whose entire contents are the four
     * characters `null` sailed past the old check and threw on `env.version` —
     * a TypeError out of `load()`, which is a rejected Promise where the
     * caller expected a corrupt result it could recover from. Numbers,
     * booleans, strings and arrays reached the same place by other routes.
     */
    if (!isEnvelopeShaped(parsed)) {
      await this.quarantine(raw);
      return { ok: false, reason: 'corrupt', detail: 'the file is not a save envelope' };
    }
    const env = parsed as Partial<SaveEnvelope>;
    if (typeof env.version !== 'number' || !obj(env.state)) {
      await this.quarantine(raw);
      return { ok: false, reason: 'corrupt', detail: 'missing envelope fields' };
    }

    if (env.version > SCHEMA_VERSION) {
      // A newer client wrote this. Refuse rather than mangle it.
      return { ok: false, reason: 'fromFuture', detail: `save is version ${env.version}, this build reads ${SCHEMA_VERSION}` };
    }

    let state: unknown = env.state;
    const migratedFrom = env.version < SCHEMA_VERSION ? env.version : null;
    if (migratedFrom !== null) {
      try {
        state = migrate(env.state as unknown as Record<string, unknown>, env.version, SCHEMA_VERSION);
      } catch (e) {
        await this.quarantine(raw);
        return { ok: false, reason: 'unmigratable', detail: (e as Error).message };
      }
    }

    // Structural and semantic together. The semantic half used to be missing
    // here, so a save whose stored room pointed at a definition that no longer
    // exists loaded without complaint and was never quarantined.
    const problem = this.problemsWith(state);
    if (problem !== null) {
      // The raw text goes to quarantine byte for byte, and SAVE_KEY is left
      // alone — the save may be recoverable and it is the only evidence.
      await this.quarantine(raw);
      return { ok: false, reason: 'corrupt', detail: problem };
    }

    const validated = state as GameState;
    validated.schemaVersion = SCHEMA_VERSION;
    // The wall-clock moment this save was written. Without it the engine has
    // no way to know how long the player was away, and cold boot resolved a
    // zero-length absence no matter how long the app had been shut.
    const savedAtMs = typeof env.savedAtMs === 'number' && Number.isFinite(env.savedAtMs)
      ? env.savedAtMs
      : validated.epochMs;
    return { ok: true, state: validated, migratedFrom, savedAtMs };
  }

  /**
   * The one gate every incoming state passes through.
   *
   * Structural first, then semantic. `validateState` says the save has the
   * right shape; it cannot say a stored room points at a definition that no
   * longer exists, or that its decorPoints disagree with the pieces in it. A
   * save like that passes structure, loads, and then puts a room on the plot
   * with undefined fields in it.
   *
   * `load` and `importFromJson` both call this. They used to differ: the
   * semantic half lived only in `importFromJson`, so a corrupt save already on
   * disk was loaded happily while the same bytes handed over as a file were
   * refused.
   *
   * Returns null when the state is sound.
   */
  private problemsWith(state: unknown): string | null {
    // Structural first, and the value is not cast until it has passed. Casting
    // an unvalidated object to GameState is how a bad shape reaches code that
    // assumes a good one.
    const structural = validateState(state);
    if (structural.length > 0) return structural.join('; ');
    if (!this.data) return null;
    const violations = checkInvariants(this.data, state as GameState);
    if (violations.length === 0) return null;
    return violations.map((v) => `${v.rule}: ${v.detail}`).join('; ');
  }

  /** Keep the bad save rather than destroying it — it may be recoverable. */
  private async quarantine(raw: string): Promise<void> {
    try {
      await this.storage.set(QUARANTINE_KEY, raw);
    } catch {
      // Quarantine is best effort; never let it block startup.
    }
  }

  async clear(): Promise<void> {
    await this.storage.remove(SAVE_KEY);
  }

  // ---------------------------------------------------------------- transfer

  /** A file the player can keep. Pretty-printed so it is inspectable. */
  exportToJson(state: GameState, nowMs: number): string {
    const envelope: SaveEnvelope = { format: 1, version: SCHEMA_VERSION, savedAtMs: nowMs, state };
    return JSON.stringify(envelope, null, 2);
  }

  /** Accepts an exported file. Same validation path as a normal load. */
  async importFromJson(json: string): Promise<LoadOutcome> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      return { ok: false, reason: 'corrupt', detail: (e as Error).message };
    }
    // Same guard as `load`. An imported file is no more trustworthy than one
    // already on disk, and `null` is a perfectly valid JSON document.
    if (!isEnvelopeShaped(parsed)) {
      return { ok: false, reason: 'corrupt', detail: 'the file is not a save envelope' };
    }
    const env = parsed as Partial<SaveEnvelope>;
    if (typeof env.version !== 'number' || !obj(env.state)) {
      return { ok: false, reason: 'corrupt', detail: 'not a Hotel City Tycoon save file' };
    }
    if (env.version > SCHEMA_VERSION) {
      return { ok: false, reason: 'fromFuture', detail: `file is version ${env.version}` };
    }
    let state: unknown = env.state;
    if (env.version < SCHEMA_VERSION) {
      try {
        state = migrate(env.state as unknown as Record<string, unknown>, env.version, SCHEMA_VERSION);
      } catch (e) {
        return { ok: false, reason: 'unmigratable', detail: (e as Error).message };
      }
    }
    /*
     * The same gate `load` uses, and nothing else.
     *
     * A refused import touches nothing: SAVE_KEY keeps the player's existing
     * save and QUARANTINE_KEY is not written. Quarantine is for a corrupt save
     * found inside our own storage — an outside file that was refused was
     * never ours to keep.
     */
    const problem = this.problemsWith(state);
    if (problem !== null) {
      return { ok: false, reason: 'corrupt', detail: problem };
    }

    const validated = state as GameState;
    validated.schemaVersion = SCHEMA_VERSION;

    const savedAtMs = typeof env.savedAtMs === 'number' && Number.isFinite(env.savedAtMs)
      ? env.savedAtMs
      : validated.epochMs;
    return {
      ok: true, state: validated, savedAtMs,
      migratedFrom: env.version < SCHEMA_VERSION ? env.version : null,
    };
  }
}
