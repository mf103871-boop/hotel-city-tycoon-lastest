/**
 * Cleaning: one implementation, run by the tick loop and by the offline
 * resolver alike.
 *
 * There used to be two. The live loop applied `cleanRate * coverage * seconds`
 * to every room and subtracted an occupancy-based soiling term; the resolver
 * applied a different figure derived from checkouts and then a separate decay
 * term. Neither was wrong on its own terms and they disagreed, which is why a
 * hotel came back from an absence at a different cleanliness than the same
 * hotel watched for the same span.
 *
 * The uniform spread was also the wrong model. Coverage of 0.5 meant every room
 * cleaned at half rate — so a hotel with too few cleaners had *every* room
 * drift below the income gate together, rather than the cleaners keeping the
 * rooms that matter above it. Staff prioritise; the simulation now does too.
 */
import type { SimData } from '../data-source.ts';
import { isFunctionalRoom, isGuestRoom, roomById } from '../data-source.ts';
import type { GameState, RoomInstance } from '../state/types.ts';
import { cleaningCapacity, cleanableRooms, dirtRateMultiplier } from './cleanliness.ts';

/**
 * How a shuttered hotel decays per hour, before the data's multiplier.
 *
 * Tied to the pace of a shift rather than to the cleaning rate. Deriving it
 * from `cleanRate` took a spotless hotel to filthy in ten minutes, which is a
 * punishment nobody could have designed on purpose.
 */
export const DECAY_PER_HOUR_CLOSED = 0.05;

/**
 * The order cleaners work in.
 *
 *   1. rooms earning nothing because they are below the gate — every second
 *      one of these stays dirty is money the hotel is not making
 *   2. empty rooms, which are about to take an arrival and should be ready
 *   3. dirtiest first among the rest
 *   4. by id, so the order never depends on array order
 *
 * Returns the rooms a cleaner would touch, in the order they would touch them.
 */
export function cleaningOrder(data: SimData, state: GameState): RoomInstance[] {
  const gate = data.economy.cleanliness.incomeGateThreshold;
  return cleanableRooms(data, state)
    .map((room) => {
      const def = roomById(data, room.defId);
      const belowGate = room.cleanliness < gate;
      const awaitingArrival = def !== undefined && isGuestRoom(def) && room.occupants.length === 0;
      const rank = belowGate ? 0 : awaitingArrival ? 1 : 2;
      return { room, rank };
    })
    .sort((a, b) =>
      a.rank - b.rank
      || a.room.cleanliness - b.room.cleanliness
      || (a.room.id < b.room.id ? -1 : a.room.id > b.room.id ? 1 : 0))
    .map((entry) => entry.room);
}

/**
 * Advance every room's cleanliness by `seconds`.
 *
 * `open` is the shift phase question: cleaners are paid by the shift, so a
 * closed hotel has nobody working and decays instead. Grace is neither — the
 * wind-down is not a cleaning window and not a decay window.
 */
export function applyCleaning(
  data: SimData,
  state: GameState,
  seconds: number,
  open: boolean,
  closed: boolean,
): void {
  if (seconds <= 0) return;
  const c = data.economy.cleanliness;
  const dirtMult = dirtRateMultiplier(data, state);

  // Soiling first: occupied rooms accumulate grime whatever else is happening.
  for (const room of state.hotel.rooms) {
    const def = roomById(data, room.defId);
    if (!def || isFunctionalRoom(def)) continue;
    if (room.occupants.length > 0) {
      // Flat per occupied room, exactly as the tick loop charged it. Scaling
      // by occupant count would be a balance change, and this phase is not
      // allowed to make one.
      const soiling = c.dirtRatePerGuestCheckout * 0.02 * seconds * dirtMult;
      room.cleanliness = Math.max(0, room.cleanliness - soiling);
    }
  }

  if (closed) {
    const rot = DECAY_PER_HOUR_CLOSED * (data.closedHotel.dirtRateMultiplier - 1) * (seconds / 3600);
    if (rot > 0) {
      for (const room of state.hotel.rooms) {
        const def = roomById(data, room.defId);
        if (!def || isFunctionalRoom(def)) continue;
        room.cleanliness = Math.max(0, room.cleanliness - rot);
      }
    }
    return;
  }

  if (!open) return;

  /*
   * The cleaning budget, spent in priority order.
   *
   * `cleaningCapacity` is "rooms served", so the budget is that many rooms'
   * worth of scrubbing. Spending it on the rooms that need it most is what
   * makes a housekeeping room feel like staff rather than like a multiplier.
   */
  let budget = cleaningCapacity(data, state) * c.cleanRatePerCleanerPerSec * seconds;
  if (budget <= 0) return;

  for (const room of cleaningOrder(data, state)) {
    if (budget <= 0) break;
    const room_needs = 1 - room.cleanliness;
    if (room_needs <= 0) continue;
    const applied = Math.min(budget, room_needs);
    room.cleanliness = Math.min(1, room.cleanliness + applied);
    budget -= applied;
  }
}
