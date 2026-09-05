/**
 * Invariants.
 *
 * Everything that must be true of a game state, in one place, checkable
 * against any state at any moment. `validateState` in the save layer answers
 * "is this the right shape"; this answers "does it make sense".
 *
 * They are different questions and the second one is where the bugs of the
 * last eight phases lived. A queue holding eight copies of one guest is
 * perfectly well-shaped. So is a room whose occupant list names somebody who
 * checked out yesterday, a purse that has gone negative, and a stored star
 * rating that disagrees with the formula that produces it.
 *
 * Pure and read-only: it never touches the state it is given.
 */
import type { SimData } from '../data-source.ts';
import { roomById, isFunctionalRoom, catalogueIndex } from '../data-source.ts';
import { slotAllowed } from '../systems/quality.ts';
import type { GameState } from '../state/types.ts';
import { footprintOf, overlaps, contains, plotBounds } from './grid.ts';
import { computeStars } from '../systems/stars.ts';
import { computeDecorPoints } from '../systems/decor.ts';

export interface Violation {
  rule: string;
  detail: string;
}

/**
 * Check everything. Returns an empty array when the state is sound.
 *
 * Ordered roughly by how early a breakage would have happened, so the first
 * violation reported is usually the cause and the rest are consequences.
 */
export function checkInvariants(data: SimData, state: GameState): Violation[] {
  try {
    return check(data, state);
  } catch (e) {
    /*
     * Never throw. This is what a corrupt save is run through to decide
     * whether to quarantine it, so an exception here turns a recoverable save
     * into a lost one — the opposite of what the check is for.
     */
    return [{ rule: 'invariant check crashed', detail: (e as Error).message }];
  }
}

function check(data: SimData, state: GameState): Violation[] {
  const bad: Violation[] = [];
  const fail = (rule: string, detail: string): void => { bad.push({ rule, detail }); };

  // ---- identity ---------------------------------------------------------
  const roomIds = new Set<string>();
  for (const room of state.hotel.rooms) {
    if (roomIds.has(room.id)) fail('unique room ids', `${room.id} appears twice`);
    roomIds.add(room.id);
    if (!roomById(data, room.defId)) fail('room references', `${room.id} points at unknown def ${room.defId}`);
  }
  /*
   * Stored rooms, checked as hard as placed ones.
   *
   * A stored room is restored verbatim: whatever is wrong with it here becomes
   * a room on the plot the moment it is placed. Every access is defensive
   * because this function must never throw — it is what a corrupt save is run
   * through to decide whether to quarantine it, so a crash here turns a
   * recoverable save into a lost one.
   */
  /*
   * One registry for every live decor piece, wherever it sits.
   *
   * `PlacedDecor.id` is documented as unique within the hotel, and nothing
   * checked it. Stored rooms had a fresh Set per room, so a duplicate between
   * two stored rooms went unseen; placed rooms were not checked at all. The
   * cost is real: `REMOVE_DECOR` filters by id, so two pieces sharing one
   * remove together while only one copy comes back — the player loses a
   * piece they paid for.
   *
   * id → where it was first seen. Empty or non-string ids do not enter; the
   * shape checks report those on their own.
   */
  const decorSeen = new Map<string, string>();
  const registerDecorId = (id: unknown, location: string): void => {
    if (typeof id !== 'string' || id.length === 0) return;
    const first = decorSeen.get(id);
    if (first !== undefined) {
      fail('unique decor ids', `${id} appears in ${first} and ${location}`);
      return;
    }
    decorSeen.set(id, location);
  };

  /** `dN` with a safe non-negative integer N, or null. */
  const standardSuffix = (id: unknown): number | null => {
    if (typeof id !== 'string') return null;
    const m = /^d(0|[1-9]\d*)$/.exec(id);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isSafeInteger(n) ? n : null;
  };
  let maxSuffix = -1;
  const noteSuffix = (id: unknown): void => {
    const n = standardSuffix(id);
    if (n !== null && n > maxSuffix) maxSuffix = n;
  };

  for (const stored of (Array.isArray(state.storedRooms) ? state.storedRooms : [])) {
    if (typeof stored !== 'object' || stored === null) {
      fail('stored room shape', 'a stored room is not an object');
      continue;
    }
    if (typeof stored.id !== 'string' || stored.id.length === 0) {
      fail('stored room shape', 'a stored room has no id');
      continue;
    }
    if (roomIds.has(stored.id)) fail('unique room ids', `${stored.id} is both placed and stored`);
    roomIds.add(stored.id);

    if (typeof stored.defId !== 'string' || stored.defId.length === 0) {
      fail('stored room shape', `${stored.id} has no defId`);
      continue;
    }
    const sdef = roomById(data, stored.defId);
    if (!sdef) { fail('stored room references', `${stored.id} points at unknown def ${stored.defId}`); continue; }

    if (!(typeof stored.cleanliness === 'number' && stored.cleanliness >= 0 && stored.cleanliness <= 1)) {
      fail('cleanliness in 0..1', `stored ${stored.id} is at ${String(stored.cleanliness)}`);
    }
    if (!Number.isInteger(stored.builtAtTick) || stored.builtAtTick < 0) {
      fail('stored room shape', `${stored.id} has builtAtTick ${String(stored.builtAtTick)}`);
    } else if (stored.builtAtTick > state.tick) {
      // A room built in the future is a save that has been edited.
      fail('stored room shape', `${stored.id} was built at ${stored.builtAtTick}, after now (${state.tick})`);
    }

    if (!Array.isArray(stored.decor)) { fail('stored room shape', `${stored.id} has no decor list`); continue; }
    const seenSlots = new Set<number>();
    let sum = 0;
    for (const piece of stored.decor) {
      if (typeof piece !== 'object' || piece === null) {
        fail('stored decor shape', `${stored.id} holds a piece that is not an object`);
        continue;
      }
      if (typeof piece.id !== 'string' || piece.id.length === 0) {
        fail('stored decor shape', `${stored.id} holds a piece with no id`);
      } else {
        registerDecorId(piece.id, `stored room ${stored.id} slot ${String(piece.slot)}`);
        noteSuffix(piece.id);
      }

      const ddef = data.decor.find((d) => d.id === piece.defId);
      if (!ddef) { fail('stored decor references', `${stored.id} holds unknown decor ${String(piece.defId)}`); continue; }
      if (!slotAllowed(data, sdef, piece.defId)) {
        fail('decor fits the room', `${piece.defId} does not belong in a ${stored.defId}`);
      }
      if (catalogueIndex(data, stored.defId, piece.defId) < 0) {
        fail('a room holds only what it sells', `stored ${stored.id} (${stored.defId}) holds ${piece.defId}`);
      }
      if (!Number.isInteger(piece.slot) || piece.slot < 0) {
        fail('integer slots', `${stored.id} has a piece in slot ${String(piece.slot)}`);
      } else if (piece.slot >= sdef.decorSlots) {
        fail('slot within the room', `${stored.id} uses slot ${piece.slot} of ${sdef.decorSlots}`);
      } else if (seenSlots.has(piece.slot)) {
        fail('one piece per slot', `${stored.id} has two pieces in slot ${piece.slot}`);
      } else seenSlots.add(piece.slot);
      sum += ddef.decorPoints;
    }
    if (!(typeof stored.decorPoints === 'number' && stored.decorPoints >= 0)) {
      fail('stored room shape', `${stored.id} has decorPoints ${String(stored.decorPoints)}`);
    } else if (stored.decorPoints !== sum) {
      fail('decorPoints is the sum of its pieces',
        `${stored.id} stores ${stored.decorPoints}, the pieces total ${sum}`);
    }
  }

  const guestIds = new Set<string>();
  for (const guest of state.guests) {
    if (guestIds.has(guest.id)) fail('unique guest ids', `${guest.id} appears twice`);
    guestIds.add(guest.id);
  }

  const staffIds = new Set<string>();
  for (const member of state.staff) {
    if (staffIds.has(member.id)) fail('unique staff ids', `${member.id} appears twice`);
    staffIds.add(member.id);
  }

  // ---- geometry ---------------------------------------------------------
  const bounds = plotBounds(data, state);
  for (let i = 0; i < state.hotel.rooms.length; i++) {
    const room = state.hotel.rooms[i]!;
    if (!Number.isInteger(room.x) || !Number.isInteger(room.y)) {
      fail('integer coordinates', `${room.id} sits at ${room.x},${room.y}`);
      continue;
    }
    const rect = footprintOf(data, room);
    if (!contains(bounds, rect)) fail('rooms inside the plot', `${room.id} extends past the plot`);
    for (let j = i + 1; j < state.hotel.rooms.length; j++) {
      const other = state.hotel.rooms[j]!;
      if (overlaps(rect, footprintOf(data, other))) {
        fail('rooms do not overlap', `${room.id} overlaps ${other.id}`);
      }
    }
    const slots = new Set<number>();
    const defIds = new Set<string>();
    for (const piece of room.decor) {
      if (!Number.isInteger(piece.slot)) fail('integer slots', `${room.id} has a piece in slot ${piece.slot}`);
      if (slots.has(piece.slot)) fail('one piece per slot', `${room.id} has two pieces in slot ${piece.slot}`);
      slots.add(piece.slot);
      // A room holds each of its own pieces once, in the place its catalogue
      // gives it. Save version 20 re-sorted every older room under this rule.
      if (defIds.has(piece.defId)) fail('one of each piece per room', `${room.id} holds ${piece.defId} twice`);
      defIds.add(piece.defId);
      const index = catalogueIndex(data, room.defId, piece.defId);
      if (index < 0) fail('a room holds only what it sells', `${room.id} (${room.defId}) holds ${piece.defId}`);
      else if (index !== piece.slot) {
        fail('a piece stands in its own place', `${room.id} holds ${piece.defId} in slot ${piece.slot}, not ${index}`);
      }
      registerDecorId(piece.id, `placed room ${room.id} slot ${String(piece.slot)}`);
      noteSuffix(piece.id);
    }
    const points = computeDecorPoints(data, room);
    if (room.decorPoints !== points) {
      fail('decorPoints is the sum of its pieces', `${room.id} stores ${room.decorPoints}, the pieces total ${points}`);
    }
  }

  /*
   * The counter that mints decor ids has to be ahead of every id it minted.
   *
   * `PLACE_DECOR` does `d${counters.decor++}`. The save layer checked only
   * that the counter was a number, so a live `d0` alongside `counters.decor:
   * 0` passed — and the next placement produced a second `d0`. Legacy ids
   * that are not `dN` stay valid and place no demand on the counter; they are
   * still held to global uniqueness above.
   */
  const counter = state.counters.decor;
  if (typeof counter !== 'number' || !Number.isSafeInteger(counter) || counter < 0) {
    fail('decor counter is a safe non-negative integer', `counters.decor is ${String(counter)}`);
  } else if (maxSuffix >= 0 && counter <= maxSuffix) {
    fail('decor counter is ahead of live ids',
      `counters.decor is ${counter} but d${maxSuffix} is live; the next placement would reuse an id`);
  }

  // ---- ranges -----------------------------------------------------------
  for (const room of state.hotel.rooms) {
    if (room.cleanliness < 0 || room.cleanliness > 1) {
      fail('cleanliness in 0..1', `${room.id} is at ${room.cleanliness}`);
    }
  }
  for (const guest of state.guests) {
    if (guest.satisfaction !== -1 && (guest.satisfaction < 0 || guest.satisfaction > 100)) {
      fail('satisfaction in 0..100', `${guest.id} is at ${guest.satisfaction}`);
    }
  }
  if (state.reputation.score < 0 || state.reputation.score > 100) {
    fail('reputation in 0..100', `reputation is ${state.reputation.score}`);
  }

  // ---- nothing goes negative -------------------------------------------
  if (state.player.coins < 0) fail('no negative currency', `coins are ${state.player.coins}`);
  if (state.player.gems < 0) fail('no negative currency', `gems are ${state.player.gems}`);
  if (state.player.xp < 0) fail('no negative xp', `xp is ${state.player.xp}`);
  for (const [key, value] of Object.entries(state.stats)) {
    if (typeof value === 'number' && value < 0) fail('no negative stats', `stats.${key} is ${value}`);
  }
  for (const [defId, count] of Object.entries(state.ownedDecor)) {
    if (!Number.isInteger(count) || count <= 0) {
      fail('owned counts are whole and positive', `ownedDecor.${defId} is ${count}`);
    }
    // A key that matches no definition is a piece the selectors hide and the
    // player can neither place nor sell: money that has quietly ceased to be.
    if (!data.decor.some((d) => d.id === defId)) {
      fail('owned decor references', `ownedDecor.${defId} matches no decor definition`);
    }
  }

  // ---- guests and rooms agree ------------------------------------------
  const byRoom = new Map(state.hotel.rooms.map((r) => [r.id, r]));
  for (const room of state.hotel.rooms) {
    for (const id of room.occupants) {
      const guest = state.guests.find((g) => g.id === id);
      if (!guest) { fail('no orphan occupants', `${room.id} lists ${id}, who does not exist`); continue; }
      if (guest.roomId !== room.id) {
        fail('guest and room agree', `${id} is listed in ${room.id} but thinks they are in ${guest.roomId}`);
      }
    }
  }
  for (const guest of state.guests) {
    if (guest.roomId === null) continue;
    const room = byRoom.get(guest.roomId);
    if (!room) { fail('guest and room agree', `${guest.id} holds ${guest.roomId}, which does not exist`); continue; }
    if (!room.occupants.includes(guest.id)) {
      fail('guest and room agree', `${guest.id} holds ${guest.roomId} but is not among its occupants`);
    }
  }

  // ---- staff and rooms agree -------------------------------------------
  for (const room of state.hotel.rooms) {
    if (room.staffId === null) continue;
    const member = state.staff.find((s) => s.id === room.staffId);
    if (!member) { fail('no orphan staff', `${room.id} is staffed by ${room.staffId}, who does not exist`); continue; }
    if (member.roomId !== room.id) {
      fail('staff and room agree', `${member.id} works in ${room.id} and thinks they work in ${member.roomId}`);
    }
  }
  for (const member of state.staff) {
    if (member.roomId === null) continue;
    const room = byRoom.get(member.roomId);
    if (!room) { fail('staff and room agree', `${member.id} points at ${member.roomId}, which does not exist`); continue; }
    if (room.staffId !== member.id) {
      fail('staff and room agree', `${member.id} claims ${member.roomId}, which is staffed by ${room.staffId}`);
    }
    const posts = state.hotel.rooms.filter((r) => r.staffId === member.id).length;
    if (posts > 1) fail('one post per person', `${member.id} is standing in ${posts} rooms`);
  }

  // ---- the queue --------------------------------------------------------
  const seen = new Set<string>();
  for (const id of state.lobbyQueue) {
    if (seen.has(id)) fail('one queue entry per guest', `${id} appears twice in the queue`);
    seen.add(id);
    const guest = state.guests.find((g) => g.id === id);
    if (!guest) { fail('no orphan queue entries', `the queue holds ${id}, who does not exist`); continue; }
    if (guest.state !== 'queued') {
      fail('the queue holds queued guests', `${id} is in the queue but is "${guest.state}"`);
    }
  }
  for (const guest of state.guests) {
    if (guest.state === 'queued' && !seen.has(guest.id)) {
      fail('queued guests are in the queue', `${guest.id} is queued and missing from the queue`);
    }
  }

  // ---- the rating is what the formula says ------------------------------
  const stars = computeStars(data, state);
  if (state.hotel.stars !== stars) {
    fail('stored stars match the rating', `the save says ${state.hotel.stars}, the rating computes ${stars}`);
  }

  // ---- the shift phases are ordered -------------------------------------
  if (state.shift.graceEndsAtTick < state.shift.endsAtTick) {
    fail('grace ends after the shift', `grace at ${state.shift.graceEndsAtTick}, shift at ${state.shift.endsAtTick}`);
  }

  // ---- the ledger balances ----------------------------------------------
  for (const [key, value] of Object.entries(state.ledger)) {
    if (!Number.isFinite(value)) fail('ledger entries are numbers', `ledger.${key} is ${value}`);
  }

  // ---- functional rooms carry no guests ---------------------------------
  for (const room of state.hotel.rooms) {
    const def = roomById(data, room.defId);
    if (def && isFunctionalRoom(def) && room.occupants.length > 0) {
      fail('no guests in back-of-house', `${room.id} holds ${room.occupants.length} guest(s)`);
    }
  }

  return bad;
}
