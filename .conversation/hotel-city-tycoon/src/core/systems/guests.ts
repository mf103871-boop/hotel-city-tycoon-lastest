/**
 * Guests: arrival, queueing, check-in, stay, checkout.
 *
 * This is the loop the whole game hangs off. A guest walks up, takes a room if
 * one is free and clean, stays for a while, and pays on the way out. Everything
 * else in the game exists to make that transaction happen more often or pay
 * more when it does.
 */
import type { SimData, GuestRoomDef } from '../data-source.ts';
import { isGuestRoom, isCommercialRoom, isFunctionalRoom, roomDef, roomById } from '../data-source.ts';
import type { GameState, GuestInstance, RoomInstance, SimEvent } from '../state/types.ts';
import type { Rng } from '../rng/index.ts';
import { decorMultiplier } from './decor.ts';
import { incomeBlocked, staffEfficiency, effectActive } from './cleanliness.ts';
import { climateMultiplier } from './events.ts';
import { upgradeMultiplier } from './upgrades.ts';
import { seasonIncomeMultiplier, seasonArrivalMultiplier } from './liveops.ts';
import { arrivalMultiplier, incomeMultiplier, effectiveStars } from './stars.ts';
import { grantXp } from './progression.ts';
import { earn, isOpen, shiftIncomeMultiplier } from './economy.ts';
import { scoreStay, tipRatio, recordReview } from './satisfaction.ts';

/**
 * Extra income while a notable guest is in the building.
 *
 * `rewardMultiplierWhileStaying` has been in the event data since P1 and
 * nothing read it, so a VIP checking in changed nothing about the hotel.
 */
export function presenceMultiplier(data: SimData, state: GameState): number {
  let mult = 1;
  for (const event of data.events) {
    const target = event.trigger['guestTypeId'] as string | undefined;
    const bonus = Number(event['rewardMultiplierWhileStaying'] ?? 0);
    if (!target || !bonus) continue;
    const present = state.guests.some(
      (g) => g.typeId === target && (g.state === 'staying' || g.state === 'usingAmenity'),
    );
    if (present) mult *= bonus;
  }
  return mult;
}

/** Arrival boost from business centres, capped by their stack limit. */
export function arrivalBoost(data: SimData, state: GameState): number {
  let mult = 1;
  const stacks: Record<string, number> = {};
  for (const room of state.hotel.rooms) {
    const def = roomById(data, room.defId);
    if (!def || !isFunctionalRoom(def) || def.function.kind !== 'arrivalBoost') continue;
    if (!effectActive(data, state, room)) continue;
    const max = Number(def.function.stacksMax ?? 1);
    stacks[def.id] = (stacks[def.id] ?? 0) + 1;
    if ((stacks[def.id] ?? 0) > max) continue;
    mult *= Number(def.function.arrivalRateMultiplier ?? 1);
  }
  return mult;
}

/**
 * How many guests can wait at reception.
 *
 * The lobby declares its own capacity and that number was ignored in favour of
 * a single global figure, so building a bigger reception did nothing. The
 * lobby's own number wins; the economy value is the fallback for a hotel that
 * somehow has no lobby.
 */
export function queueCapacity(data: SimData, state: GameState): number {
  let capacity = 0;
  for (const room of state.hotel.rooms) {
    const def = roomById(data, room.defId);
    if (!def || !isFunctionalRoom(def) || def.function.kind !== 'entrance') continue;
    capacity += Number(def.function.queueCapacity ?? 0);
  }
  return capacity > 0 ? capacity : data.economy.guests.maxLobbyQueue;
}

/** Guests arriving per minute, all modifiers applied. */
export function arrivalsPerMinute(data: SimData, state: GameState): number {
  const g = data.economy.guests;
  let guestRooms = 0;
  for (const room of state.hotel.rooms) {
    const def = roomById(data, room.defId);
    if (def && isGuestRoom(def)) guestRooms += def.beds;
  }
  const base = g.baseArrivalPerMinute + g.arrivalRoomCountBonus * guestRooms;
  return base * arrivalMultiplier(data, effectiveStars(data, state)) * arrivalBoost(data, state)
    * upgradeMultiplier(data, state, 'arrivalRate')
    * seasonArrivalMultiplier(data, state.epochMs);
}

/** Guest types the player has unlocked, excluding specials handled elsewhere. */
export function availableGuestTypes(data: SimData, state: GameState) {
  return data.guestTypes.filter((t) => t.unlockLevel <= state.player.level);
}

/** A free, earning-capable guest room this guest is willing to take. */
export function findRoomFor(
  data: SimData,
  state: GameState,
  guest: GuestInstance,
  _rng?: Rng,
): RoomInstance | null {
  const type = data.guestTypes.find((t) => t.id === guest.typeId);
  if (!type) return null;

  const candidates = state.hotel.rooms.filter((room) => {
    const def = roomById(data, room.defId);
    if (!def || !isGuestRoom(def)) return false;
    if (def.tier < type.minTier || def.tier > type.maxTier) return false;
    if (room.occupants.length >= def.beds) return false;
    return !incomeBlocked(data, room);
  });
  if (candidates.length === 0) return null;

  /*
   * Deterministic and explicable, in this order:
   *
   *   1. the highest tier the guest will accept — upgrading has to pay
   *   2. among equals, the room with the most free beds — so a hotel fills
   *      evenly instead of cramming one suite while others sit empty
   *   3. among those, the cleanest — a guest sent to the better room is a
   *      guest more likely to leave a good review
   *   4. by id, so the answer never depends on array order
   *
   * This used to end in `rng.pick` across every top-tier room, which meant the
   * most expensive room was always chosen and which of them was a coin flip.
   * Capacity did not enter into it at all.
   */
  const scored = candidates.map((room) => {
    const def = roomDef(data, room.defId) as GuestRoomDef;
    return { room, tier: def.tier, free: def.beds - room.occupants.length };
  });
  scored.sort((a, b) =>
    b.tier - a.tier
    || b.free - a.free
    || b.room.cleanliness - a.room.cleanliness
    || (a.room.id < b.room.id ? -1 : a.room.id > b.room.id ? 1 : 0));
  return scored[0]?.room ?? null;
}

/**
 * A staffed amenity with room, matching what this guest came wanting.
 *
 * Commercial rooms cost up to 190,000 coins and earned nothing at all until
 * now: the `usingAmenity` state existed in the type union and no code path
 * ever entered it, so eight room types were decoration.
 */
export function findAmenityFor(
  data: SimData,
  state: GameState,
  guest: GuestInstance,
  rng: Rng,
): RoomInstance | null {
  if (!guest.desire) return null;

  const candidates = state.hotel.rooms.filter((room) => {
    const def = roomById(data, room.defId);
    if (!def || !isCommercialRoom(def)) return false;
    if (def.desireTag !== guest.desire) return false;
    // 4B: no closed-for-staffing state. A slot without a permanent hire is
    // covered by the temp (whose wage shiftWages already charges), and the
    // cafe, arcade and disco have no slot at all — exactly the original.
    // Capacity is whole seats, so efficiency alone gets eaten by the floor: a
    // silver barista at 1.2 on a four-seat cafe gives 4.8 → 4, which is 25%
    // more wage for nothing. Seats round rather than floor, and the rest of
    // the efficiency is paid out as faster service below, so any grade above
    // bronze always buys something.
    const capacity = def.capacity * upgradeMultiplier(data, state, 'amenityCapacity');
    if (room.occupants.length >= Math.max(1, Math.round(capacity))) return false;
    return !incomeBlocked(data, room);
  });

  return rng.pick('roomPick', candidates);
}

/** Coins and XP a guest pays for using an amenity. */
export function amenityPayout(
  data: SimData,
  state: GameState,
  guest: GuestInstance,
  room: RoomInstance,
): { coins: number; xp: number } {
  const def = roomById(data, room.defId);
  if (!def || !isCommercialRoom(def)) return { coins: 0, xp: 0 };
  const type = data.guestTypes.find((t) => t.id === guest.typeId);
  const payMult = type?.payMultiplier ?? 1;
  const coins = def.incomePerCustomer * payMult
    * climateMultiplier(data, state)
    * decorMultiplier(data, def, room)
    * incomeMultiplier(data, effectiveStars(data, state))
    * presenceMultiplier(data, state)
    * upgradeMultiplier(data, state, 'income')
    * shiftIncomeMultiplier(data, state)
    * seasonIncomeMultiplier(data, state.epochMs);
  return { coins: Math.round(coins), xp: Math.round(def.xpPerCustomer * payMult) };
}

/** Move a guest from their room into an amenity they wanted. */
export function enterAmenity(
  data: SimData,
  state: GameState,
  guest: GuestInstance,
  room: RoomInstance,
): void {
  const def = roomById(data, room.defId);
  if (!def || !isCommercialRoom(def)) return;
  guest.state = 'usingAmenity';
  guest.desireMet = true;
  guest.roomId = room.id;
  guest.stateSinceTick = state.tick;
  // A better member of staff serves faster. This is where efficiency actually
  // lands: it is throughput, in the same way reception is, rather than a
  // fractional seat that rounding throws away.
  // Hired staff serve at their (neutralised) efficiency; a temp or a
  // staffless amenity serves at base speed.
  const efficiency = room.staffId
    ? Math.max(0.1, staffEfficiency(data, state, room.staffId))
    : 1;
  guest.finishesAtTick = state.tick
    + Math.max(1, Math.round((def.serviceDurationSec / efficiency) * data.economy.simulation.ticksPerSecond));
  room.occupants.push(guest.id);
}

/** Guest finishes at the amenity, pays, and leaves the hotel. */
export function leaveAmenity(
  data: SimData,
  state: GameState,
  guest: GuestInstance,
  out: SimEvent[],
): void {
  const room = state.hotel.rooms.find((r) => r.id === guest.roomId);
  if (!room) {
    guest.state = 'leaving';
    guest.stateSinceTick = state.tick;
    return;
  }
  room.occupants = room.occupants.filter((id) => id !== guest.id);

  if (!incomeBlocked(data, room)) {
    const { coins, xp } = amenityPayout(data, state, guest, room);
    earn(state, coins, 'amenityRevenue');
    grantXp(data, state, xp, out);
    out.push({ type: 'guestCheckedOut', guestId: guest.id, roomId: room.id, coins, xp });
  }

  const c = data.economy.cleanliness;
  room.cleanliness = Math.max(0, room.cleanliness - c.dirtRatePerGuestCheckout * 0.5);
  guest.state = 'leaving';
  guest.roomId = null;
  guest.stateSinceTick = state.tick;
  guest.desire = null;
}

/** Coins and XP a guest pays on checkout. */
export function checkoutPayout(
  data: SimData,
  state: GameState,
  guest: GuestInstance,
  room: RoomInstance,
): { coins: number; xp: number } {
  const def = roomById(data, room.defId);
  if (!def || !isGuestRoom(def)) return { coins: 0, xp: 0 };
  const type = data.guestTypes.find((t) => t.id === guest.typeId);
  const payMult = type?.payMultiplier ?? 1;
  const coins = def.incomePerGuest * payMult
    * climateMultiplier(data, state)
    * decorMultiplier(data, def, room)
    * incomeMultiplier(data, effectiveStars(data, state))
    * presenceMultiplier(data, state)
    * upgradeMultiplier(data, state, 'income')
    // Short shifts pay more per guest than long ones. This is the trade that
    // stops the 48 hour shift being the only sensible choice.
    * shiftIncomeMultiplier(data, state)
    * seasonIncomeMultiplier(data, state.epochMs);
  return { coins: Math.round(coins), xp: Math.round(def.xpPerGuest * payMult) };
}

/** Spawn one guest at the hotel entrance. */
export function spawnGuest(data: SimData, state: GameState, rng: Rng, out: SimEvent[]): void {
  const types = availableGuestTypes(data, state);
  const type = rng.weighted('guestType', types, (t) => t.spawnWeight);
  if (!type) return;

  const desireTags = data.rooms
    .filter(isCommercialRoom)
    .map((r) => r.desireTag)
    .filter((tag, i, arr) => arr.indexOf(tag) === i);

  // A beginner with no amenities at all is told, over and over, that guests
  // wanted things they cannot possibly have built yet. A small share still
  // asks, because that is the signal telling them what to build next; the rest
  // are simply happy with a bed.
  const sat = data.economy.satisfaction;
  const early = state.player.level <= sat.desireChanceEarlyUntilLevel;
  const chance = early ? type.desireChance * sat.desireChanceEarlyScale : type.desireChance;
  const wantsSomething = rng.chance('guestDesire', chance);
  const desire = wantsSomething ? rng.pick('guestDesire', desireTags) : null;

  const guest: GuestInstance = {
    id: `g${state.counters.guest++}`,
    typeId: type.id,
    state: 'arriving',
    roomId: null,
    stateSinceTick: state.tick,
    finishesAtTick: 0,
    desire,
    patienceUntilTick: state.tick + Math.round(type.patienceSec * data.economy.simulation.ticksPerSecond),
    patienceTotalTicks: Math.round(type.patienceSec * data.economy.simulation.ticksPerSecond),
    waitedTicks: 0,
    satisfaction: -1,
    satisfactionLog: [],
    desireMet: false,
    sawIncident: false,
    ratedQuality: -1,
    ratedCleanliness: -1,
    review: -1,
    leaveReason: null,
    everCheckedIn: false,
  };
  state.guests.push(guest);
  out.push({ type: 'guestArrived', guestId: guest.id, typeId: type.id });
}

/**
 * Who is on the desk, and how well they work.
 *
 * Returns 0 when nobody is on and the data says a shift needs somebody. The
 * lobby has declared `staffRole: receptionist` since the first data file and
 * nothing consulted it: reception was instantaneous, so the grade you were
 * dealt was cosmetic and a gold receptionist cost 60% more in wages for
 * nothing at all.
 */
export function receptionEfficiency(data: SimData, state: GameState): number {
  let best = 0;
  let hasDesk = false;
  for (const room of state.hotel.rooms) {
    const def = roomById(data, room.defId);
    if (!def || !isFunctionalRoom(def) || def.function.kind !== 'entrance') continue;
    hasDesk = true;
    const eff = staffEfficiency(data, state, room.staffId);
    if (eff > best) best = eff;
  }
  if (best > 0) return best;
  if (!hasDesk || data.economy.guests.requireReceptionist) return 0;
  // A hotel with nobody on the desk still lets people in, badly. Blocking
  // instead would be a soft-lock for anyone who loses their receptionist.
  return data.economy.guests.tempReceptionistEfficiency;
}

/** How long one check-in takes, in ticks. */
export function checkInTicks(data: SimData, state: GameState): number {
  const eff = receptionEfficiency(data, state);
  if (eff <= 0) return Infinity;
  const seconds = data.economy.guests.checkInSec / eff;
  return Math.max(1, Math.round(seconds * data.economy.simulation.ticksPerSecond));
}

/**
 * Start checking one guest in, or queue them, or turn them away.
 *
 * The bed is reserved the moment reception starts, not when they finish, or
 * two guests would be sent to the same bed while the first was still at the
 * desk.
 */
export function tryCheckIn(
  data: SimData,
  state: GameState,
  guest: GuestInstance,
  rng: Rng,
  out: SimEvent[],
): void {
  // Somebody is already at the desk. Reception serves one at a time; that is
  // what makes a better receptionist worth paying for.
  if (state.guests.some((g) => g.state === 'checkingIn')) {
    if (guest.state === 'arriving') queueOrTurnAway(data, state, guest, out);
    return;
  }

  const room = findRoomFor(data, state, guest, rng);
  if (!room) { queueOrTurnAway(data, state, guest, out); return; }

  const ticks = checkInTicks(data, state);
  if (!Number.isFinite(ticks)) {
    // Nobody on the desk and the data says that stops the hotel.
    queueOrTurnAway(data, state, guest, out);
    return;
  }

  // How well reception coped with this guest, 0..1. A gold receptionist works
  // at 1.45 and is clamped to 1; a stand-in at 0.4 gives a visibly worse stay,
  // which is what makes staffing the desk a decision with a consequence.
  state.lastServiceRating = Math.max(0, Math.min(1, receptionEfficiency(data, state)));

  guest.state = 'checkingIn';
  guest.roomId = room.id;
  guest.stateSinceTick = state.tick;
  guest.finishesAtTick = state.tick + ticks;
  room.occupants.push(guest.id);
}

/** Reception finishes with a guest; they go up to the room they were given. */
export function completeCheckIn(
  data: SimData,
  state: GameState,
  guest: GuestInstance,
  out: SimEvent[],
): void {
  const room = state.hotel.rooms.find((r) => r.id === guest.roomId);
  if (!room) {
    guest.state = 'leaving';
    guest.roomId = null;
    guest.stateSinceTick = state.tick;
    return;
  }
  const def = roomById(data, room.defId);
  if (!def || !isGuestRoom(def)) {
    room.occupants = room.occupants.filter((id) => id !== guest.id);
    guest.state = 'leaving';
    guest.roomId = null;
    guest.stateSinceTick = state.tick;
    return;
  }

  const type = data.guestTypes.find((t) => t.id === guest.typeId);
  const stay = def.stayDurationSec * (type?.stayMultiplier ?? 1);

  guest.state = 'staying';
  guest.everCheckedIn = true;
  guest.stateSinceTick = state.tick;
  guest.finishesAtTick = state.tick + Math.round(stay * data.economy.simulation.ticksPerSecond);
  out.push({ type: 'guestCheckedIn', guestId: guest.id, roomId: room.id });
}

/**
 * No room right now: wait in the lobby, or leave.
 *
 * `walkAwayIfNoRoom` decides what happens when the lobby is full too. It has
 * been in the data since P1 and nothing read it; the behaviour it describes —
 * walking away — was hardcoded, so turning it off did nothing.
 */
function queueOrTurnAway(
  data: SimData,
  state: GameState,
  guest: GuestInstance,
  out: SimEvent[],
): void {
  if (guest.state === 'queued') return; // already waiting; reconcileQueue owns the list
  if (state.lobbyQueue.length < queueCapacity(data, state)) {
    guest.state = 'queued';
    guest.stateSinceTick = state.tick;
    state.lobbyQueue.push(guest.id);
    return;
  }
  if (!data.economy.guests.walkAwayIfNoRoom) {
    // They keep waiting outside until their patience runs out.
    return;
  }
  guest.state = 'leaving';
  guest.stateSinceTick = state.tick;
  guest.leaveReason = 'noRoom';
  state.stats.guestsLost++;
  out.push({ type: 'guestLeftAngry', guestId: guest.id, reason: 'noRoom' });
}

/** Guest leaves, pays, and dirties the room a little. */
export function checkOut(
  data: SimData,
  state: GameState,
  guest: GuestInstance,
  out: SimEvent[],
  rng?: Rng,
): void {
  const room = state.hotel.rooms.find((r) => r.id === guest.roomId);
  if (!room) {
    guest.state = 'leaving';
    return;
  }

  room.occupants = room.occupants.filter((id) => id !== guest.id);

  // A guest who slept in a burning or infested room noticed.
  if (room.hasFire || room.hasPest) guest.sawIncident = true;

  // Scored once, here, from the stay that actually happened. Offline
  // settlement calls this same function, so an unwatched stay is judged by the
  // same yardstick as a watched one.
  const satisfaction = scoreStay(data, state, guest, room);

  if (incomeBlocked(data, room)) {
    const reason = room.hasFire ? 'fire' : room.hasPest ? 'pest' : room.hasGhost ? 'ghost' : 'dirty';
    out.push({ type: 'incomeBlocked', roomId: room.id, reason });
  } else {
    const base = checkoutPayout(data, state, guest, room);
    // A delighted guest rounds up. Bounded by tipMaxRatio so satisfaction is
    // worth chasing without becoming a second income stream.
    const tip = Math.round(base.coins * tipRatio(data, satisfaction));
    earn(state, base.coins, 'roomRevenue');
    earn(state, tip, 'tips');
    const coins = base.coins + tip;
    grantXp(data, state, base.xp, out);
    state.stats.guestsServed++;
    out.push({ type: 'guestCheckedOut', guestId: guest.id, roomId: room.id, coins, xp: base.xp });
  }

  // An unmet desire is the game telling the player what to build. It has to be
  // counted somewhere they can see it, or it is just a sad face on a sprite.
  if (guest.desire !== null && !guest.desireMet) {
    state.unmetDesires[guest.desire] = (state.unmetDesires[guest.desire] ?? 0) + 1;
    out.push({ type: 'desireUnmet', guestId: guest.id, tag: guest.desire });
  }

  recordReview(data, state, guest);
  guest.leaveReason = 'checkedOut';
  out.push({
    type: 'guestReviewed',
    guestId: guest.id,
    score: satisfaction,
    reputation: state.reputation.score,
  });

  const c = data.economy.cleanliness;
  // Charged by how long the room was used rather than per departure. A flat
  // per-checkout cost meant shortening stays made hotels dirtier for the same
  // occupancy, which quietly put five stars out of reach.
  const def = roomById(data, room.defId);
  const hours = (def && 'stayDurationSec' in def ? def.stayDurationSec : 300) / 3600;
  room.cleanliness = Math.max(0, room.cleanliness - c.dirtRatePerGuestCheckout * hours * 6);

  // On the way out, a guest who wanted something the hotel has goes and uses
  // it. This is what makes a cafe an investment rather than a decoration.
  //
  // Only while the hotel is actually open. During grace the rule is that what
  // has started may finish — starting a fresh treatment at 00:14 of a 15
  // minute window is how a wind-down turns back into a shift nobody paid for.
  const amenity = rng && isOpen(state) ? findAmenityFor(data, state, guest, rng) : null;
  if (amenity) {
    enterAmenity(data, state, guest, amenity);
    return;
  }

  guest.state = 'leaving';
  guest.roomId = null;
  guest.stateSinceTick = state.tick;
}


/**
 * Close the books when the grace window ends.
 *
 * Policy, chosen once and tested: a guest who was accepted while the hotel was
 * open is served. They finish and pay in full, exactly once, and then leave.
 * Anyone still waiting outside — arriving or queued — was never accepted, so
 * they walk away and count as lost.
 *
 * The alternative, voiding the stay, punishes the player for the shift they
 * paid for ending on schedule. The alternative in the other direction, letting
 * them run on, is an unpaid shift.
 */
export function settleAtGraceEnd(data: SimData, state: GameState, out: SimEvent[]): number {
  let settled = 0;
  // Anyone mid-check-in is completed first, so the stay they were promised
  // happens and the bed they were holding is not left reserved forever.
  for (const guest of state.guests) {
    if (guest.state === 'checkingIn') completeCheckIn(data, state, guest, out);
  }
  for (const guest of state.guests) {
    if (guest.state === 'staying') { checkOut(data, state, guest, out); settled++; }
    else if (guest.state === 'usingAmenity') { leaveAmenity(data, state, guest, out); settled++; }
  }
  for (const guest of state.guests) {
    if (guest.state !== 'arriving' && guest.state !== 'queued') continue;
    guest.state = 'leaving';
    guest.stateSinceTick = state.tick;
    guest.leaveReason = 'hotelClosed';
    state.stats.guestsLost++;
    out.push({ type: 'guestLeftAngry', guestId: guest.id, reason: 'noRoom' });
  }
  state.lobbyQueue = [];
  return settled;
}

/**
 * Every queued guest appears in the lobby queue exactly once, in arrival
 * order, and nobody else appears at all.
 *
 * `tryCheckIn` pushed an id that was already queued, every tick, so one guest
 * filled an eight-slot lobby with eight copies of themselves in under a
 * second. Guests who left with the queue full were never removed, so the queue
 * also accumulated ids of people who had gone home.
 */
export function reconcileQueue(state: GameState): void {
  const queued = new Map(state.guests.filter((g) => g.state === 'queued').map((g) => [g.id, g]));
  const seen = new Set<string>();
  const rebuilt: string[] = [];
  for (const id of state.lobbyQueue) {
    if (!queued.has(id) || seen.has(id)) continue;
    seen.add(id);
    rebuilt.push(id);
  }
  // A guest put into the queue by a command rather than by the loop still
  // belongs in it; append in arrival order so FIFO holds.
  for (const [id] of queued) if (!seen.has(id)) rebuilt.push(id);
  state.lobbyQueue = rebuilt;
}
