/**
 * Cleanliness, cleaner capacity and pest infestation.
 *
 * The income gate lives here: a room below the threshold, or infested, earns
 * nothing at all. That is deliberately harsh — it is the pressure that makes
 * housekeeping rooms worth buying.
 */
import type { SimData } from '../data-source.ts';
import { isFunctionalRoom, roomById } from '../data-source.ts';
import type { GameState, RoomInstance } from '../state/types.ts';
import { upgradeMultiplier } from './upgrades.ts';

/** How good the person in this room is at the job. */
export function staffEfficiency(data: SimData, state: GameState, staffId: string | null): number {
  if (!staffId) return 0;
  const staff = state.staff.find((s) => s.id === staffId);
  if (!staff) return 0;
  const base = data.staffGrades.find((g) => g.id === staff.gradeId)?.efficiency ?? 1;
  return base * upgradeMultiplier(data, state, 'staffEfficiency');
}

/**
 * How many rooms the hotel's housekeeping staff can keep clean.
 *
 * Scaled by who is doing it. Grades declared an efficiency from the first data
 * file and nothing read it, so a gold cleaner cost sixty percent more in wages
 * and cleaned exactly as much as a bronze one.
 */
export function cleaningCapacity(data: SimData, state: GameState): number {
  let capacity = 0;
  let bonus = 0;
  for (const room of state.hotel.rooms) {
    const def = roomById(data, room.defId);
    if (!def || !isFunctionalRoom(def)) continue;
    // 4B temp model: an unstaffed closet is worked by a temp at base rate;
    // hiring the permanent only removes the temp wage.
    const efficiency = room.staffId ? staffEfficiency(data, state, room.staffId) : 1;
    if (efficiency <= 0) continue;
    if (def.function.kind === 'cleaning') {
      capacity += Number(def.function.roomsServed ?? 0) * efficiency;
    }
    if (def.function.kind === 'cleaningBoost') {
      bonus += Number(def.function.roomsServedBonus ?? 0) * efficiency;
    }
  }
  return capacity > 0 ? capacity + bonus : 0;
}

/**
 * Does this room's declared effect actually apply?
 *
 * A room that declares a `staffRole` and a staff slot needs somebody in it.
 * Maintenance halved the fire chance and Business raised arrivals whether or
 * not anyone was employed there, so two of the six functional rooms were
 * bought once and then worked for free forever while the other four had to be
 * staffed. One rule, applied in one place.
 */
export function effectActive(data: SimData, _state: GameState, room: RoomInstance): boolean {
  // 4B: every declared slot is covered — by the permanent if hired, by the
  // temp if not (shiftWages charges for it) — so a room's effect is always
  // on. The function survives as the one place a future staffing rule would
  // change, and so existing callers keep one seam.
  return roomById(data, room.defId) !== undefined;
}

/** Rooms that actually need cleaning — guest and commercial, not closets. */
export function cleanableRooms(data: SimData, state: GameState): RoomInstance[] {
  return state.hotel.rooms.filter((room) => {
    const def = roomById(data, room.defId);
    return def ? def.category !== 'functional' : false;
  });
}

/**
 * Fraction of the cleaning workload that is actually covered.
 * Below 1 means rooms decay faster than staff can keep up.
 */
export function cleaningCoverage(data: SimData, state: GameState): number {
  const need = cleanableRooms(data, state).length;
  if (need === 0) return 1;
  return Math.min(1, cleaningCapacity(data, state) / need);
}

/** Multiplier applied to how fast rooms get dirty, from laundry rooms. */
export function dirtRateMultiplier(data: SimData, state: GameState): number {
  let mult = 1;
  for (const room of state.hotel.rooms) {
    const def = roomById(data, room.defId);
    if (!def || !isFunctionalRoom(def)) continue;
    if (def.function.kind === 'cleaningBoost' && room.staffId) {
      mult *= Number(def.function.dirtRateMultiplier ?? 1);
    }
  }
  return mult;
}

/** True when the room is too dirty, infested or burning to earn anything. */
export function incomeBlocked(data: SimData, room: RoomInstance): boolean {
  const { incomeGateThreshold, pestBlocksIncome } = data.economy.cleanliness;
  // Whether a hazard stops the room earning belongs to the hazard, in
  // events.json. `economy.cleanliness.pestBlocksIncome` says the same thing in
  // a second place; they are and-ed rather than one silently winning, so a
  // contradiction between the two files fails closed instead of picking a
  // side at random.
  const eventBlocks = (id: string): boolean => data.events.find((e) => e.id === id)?.blocksIncome ?? true;
  if (room.hasFire && eventBlocks('fire')) return true;
  if (room.hasPest && pestBlocksIncome && eventBlocks('pest')) return true;
  // 4C: a haunted room earns nothing until the ghostbuster comes.
  if (room.hasGhost && eventBlocks('ghost')) return true;
  return room.cleanliness < incomeGateThreshold;
}

/** Average cleanliness across cleanable rooms. Feeds the star rating. */
export function averageCleanliness(data: SimData, state: GameState): number {
  const rooms = cleanableRooms(data, state);
  if (rooms.length === 0) return 1;
  let total = 0;
  for (const room of rooms) total += room.cleanliness;
  return total / rooms.length;
}

/** Apply `seconds` of cleaning and decay to one room. Pure. */
export function advanceCleanliness(
  data: SimData,
  room: RoomInstance,
  seconds: number,
  coverage: number,
  checkouts: number,
  dirtMult: number,
): number {
  const c = data.economy.cleanliness;
  const cleaned = c.cleanRatePerCleanerPerSec * coverage * seconds;
  const dirtied = c.dirtRatePerGuestCheckout * checkouts * dirtMult;
  return Math.max(0, Math.min(1, room.cleanliness + cleaned - dirtied));
}
