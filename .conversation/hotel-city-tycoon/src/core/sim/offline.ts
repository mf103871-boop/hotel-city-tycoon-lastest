/**
 * Offline progress.
 *
 * Thirty days away is 25,920,000 ticks. We do not simulate them. Income while
 * the player is gone is solved in closed form, per room, in O(rooms).
 *
 * The cap falls out of the design for free: income only accrues while a paid
 * shift is running, so the ceiling is however much shift time was left. That is
 * the original game's rule, and it is what makes the whole thing tractable.
 *
 * This is an approximation of the tick loop, not a replay of it — aggregate
 * throughput rather than individual guests. That is a deliberate trade: exact
 * per-guest replay would cost seconds of CPU on app open for no visible gain.
 */
import type { SimData, GuestRoomDef, CommercialRoomDef } from '../data-source.ts';
import { isGuestRoom, isCommercialRoom, roomById } from '../data-source.ts';
import type { GameState, SimEvent } from '../state/types.ts';
import { decorMultiplier } from '../systems/decor.ts';
import { incomeBlocked, dirtRateMultiplier } from '../systems/cleanliness.ts';
import { applyCleaning } from '../systems/cleaning.ts';
import { incomeMultiplier, computeStars, effectiveStars } from '../systems/stars.ts';
import { hotelScore } from '../systems/quality.ts';
import { tipRatio } from '../systems/satisfaction.ts';
import { upgradeMultiplier } from '../systems/upgrades.ts';
import { seasonIncomeMultiplier } from '../systems/liveops.ts';
import {
  arrivalsPerMinute, checkOut, leaveAmenity, settleAtGraceEnd, reconcileQueue, completeCheckIn, checkInTicks,
} from '../systems/guests.ts';
import { grantXp } from '../systems/progression.ts';
import { earn, shiftIncomeMultiplier } from '../systems/economy.ts';
import { checkPests } from '../systems/events.ts';

export interface OfflineResult {
  /** Real time that passed. */
  elapsedMs: number;
  /** Time that actually earned, after the shift cap. */
  earningMs: number;
  coins: number;
  xp: number;
  guestsServed: number;
  events: SimEvent[];
}

/**
 * Resolve `elapsedMs` of absence. Mutates state.
 */
export function resolveOffline(data: SimData, state: GameState, elapsedMs: number): OfflineResult {
  // The data names the strategy this function implements. If someone changes
  // it expecting different behaviour, they should hear about it here rather
  // than wonder why nothing changed.
  if (data.economy.simulation.offlineResolution !== 'analytic') {
    throw new Error(
      `economy.simulation.offlineResolution is "${data.economy.simulation.offlineResolution}" ` +
      'but this resolver only implements "analytic"',
    );
  }
  const events: SimEvent[] = [];
  const sim = data.economy.simulation;
  const tps = sim.ticksPerSecond;

  const realMs = Math.max(0, elapsedMs);

  /*
   * The cap bounds the reward, never the clock.
   *
   * This used to clamp `elapsedMs` itself and then advance `tick` and
   * `epochMs` by the clamped value. Two days away moved the world fourteen
   * hours. A 48 hour shift stayed live for days of real time, seasons and gift
   * days arrived late, and every cooldown in the game drifted further behind
   * reality on each absence, permanently and cumulatively.
   */
  const rewardCapMs = sim.maxOfflineHours * 3600 * 1000;

  // Income stops when the paid shift runs out. Grace is deliberately excluded
  // from the earning window: it exists to finish services already in progress,
  // which the settlement pass below does exactly and individually.
  const shiftLeftTicks = state.shift.activeShiftId !== null
    ? Math.max(0, state.shift.endsAtTick - state.tick)
    : 0;
  const eligibleShiftWindowMs = (shiftLeftTicks / tps) * 1000;
  const earningMs = Math.min(realMs, rewardCapMs, eligibleShiftWindowMs);
  const earningSec = earningMs / 1000;

  const result: OfflineResult = { elapsedMs: realMs, earningMs, coins: 0, xp: 0, guestsServed: 0, events };

  /*
   * Settle the guests who are actually in the building, one at a time, before
   * the aggregate model runs.
   *
   * The resolver used to pay a lump sum and leave every real guest sitting in
   * their room with a `finishesAtTick` in the past. The moment the tick loop
   * started again it checked them all out and paid for them a second time.
   * Paying them here, exactly once, through the same `checkOut` the live loop
   * uses, is what makes the settlement idempotent: run the resolver twice over
   * the same absence and the second run finds nobody left to pay.
   */
  const endTick = state.tick + Math.floor((realMs / 1000) * tps);
  const alreadyServed = settleFinishedGuests(data, state, endTick, events);
  result.coins += alreadyServed.coins;
  result.xp += alreadyServed.xp;
  result.guestsServed += alreadyServed.count;

  if (earningSec > 0) {
    // --- how many guests could the hotel physically serve? --------------
    let capacityPerSec = 0;
    const perRoom: Array<{ room: (typeof state.hotel.rooms)[number]; def: GuestRoomDef; rate: number }> = [];

    for (const room of state.hotel.rooms) {
      const def = roomById(data, room.defId);
      if (!def || !isGuestRoom(def)) continue;
      if (incomeBlocked(data, room)) {
        events.push({ type: 'incomeBlocked', roomId: room.id, reason: room.hasFire ? 'fire' : room.hasPest ? 'pest' : room.hasGhost ? 'ghost' : 'dirty' });
        continue;
      }
      // beds / stay length = guests this room can turn over per second
      const rate = def.beds / def.stayDurationSec;
      capacityPerSec += rate;
      perRoom.push({ room, def, rate });
    }

    // --- how many guests actually showed up? ----------------------------
    const arrivalsPerSec = arrivalsPerMinute(data, state) / 60;
    // Reception serves one guest at a time, so it is a ceiling on throughput
    // in exactly the way beds are. The resolver did not model it at all, which
    // is part of why it overestimated against the tick loop.
    const deskTicks = checkInTicks(data, state);
    const deskPerSec = Number.isFinite(deskTicks) && deskTicks > 0
      ? tps / deskTicks
      : 0;
    /*
     * Two factors, deliberately separate.
     *
     * `analyticThroughputFactor` corrects this model. It assumes perfect
     * packing — every bed refilled the instant it empties, nobody idle — and
     * so overstates what the tick loop actually achieves, by a measured mean
     * of 1.15x. That is a modelling error and its correction is measured.
     *
     * `offlineEfficiency` is the design decision: how much less an unwatched
     * hotel earns, because being present should be worth something.
     *
     * These used to be one number. The lever read 0.5 and delivered about
     * 0.95, because the correction and the design cancelled — so the figure
     * the data presented as a design choice was really a fudge factor, and
     * changing it moved two things at once.
     */
    const eff = sim.offlineEfficiency * sim.analyticThroughputFactor;
    const servedTotal = Math.floor(Math.min(capacityPerSec, arrivalsPerSec, deskPerSec) * earningSec * eff);

    if (servedTotal > 0 && capacityPerSec > 0) {
      /*
       * 4C: weather that was blowing at departure keeps costing the hotel
       * until it passes on its own clock — the fraction of the away window
       * it covers, at the event's declared multiplier, and not a coin after.
       */
      let climateMult = 1;
      if (state.climate) {
        const cdef = data.events.find((e) => e.id === state.climate!.eventId);
        const activeTicks = Math.max(0, state.climate.untilTick - state.tick);
        const portion = Math.min(1, activeTicks / Math.max(1, earningSec * sim.ticksPerSecond));
        climateMult = 1 - portion * (1 - (cdef?.incomeMultiplier ?? 1));
      }
      const starMult = incomeMultiplier(data, effectiveStars(data, state))
        * upgradeMultiplier(data, state, 'income')
        * shiftIncomeMultiplier(data, state)
        * seasonIncomeMultiplier(data, state.epochMs)
        * climateMult;
      const avgPay = averagePayMultiplier(data, state);

      /*
       * Guests are spread across the types that can actually stay in each
       * room, not paid a single hotel-wide average.
       *
       * `averagePayMultiplier` averaged every unlocked type regardless of
       * whether that type would take that room. A hotel of cheap rooms was
       * paid partly at VIP rates, and a hotel of suites partly at budget
       * rates, so the resolver's coins drifted from the tick loop's by up to
       * 43% in either direction while agreeing on the number of guests.
       */
      let coins = 0;
      let xp = 0;
      for (const entry of perRoom) {
        const share = entry.rate / capacityPerSec;
        const served = servedTotal * share;
        const pay = payForRoom(data, state, entry.def.tier);
        coins += served * entry.def.incomePerGuest * pay * decorMultiplier(data, entry.def, entry.room) * starMult;
        xp += served * entry.def.xpPerGuest * pay;

        // Each checkout leaves the room dirtier.
        const soil = data.economy.cleanliness.dirtRatePerGuestCheckout * served * dirtRateMultiplier(data, state);
        entry.room.cleanliness = Math.max(0, entry.room.cleanliness - soil);
      }

      // Amenity income, on the same aggregate footing as rooms. Leaving it out
      // would make a hotel earn less while away than the same hotel earns
      // while watched, for no reason a player could see.
      const amenities: Array<{ room: (typeof state.hotel.rooms)[number]; def: CommercialRoomDef }> = [];
      const tags = new Set<string>();
      for (const room of state.hotel.rooms) {
        const def = roomById(data, room.defId);
        if (!def || !isCommercialRoom(def)) continue;
        // 4B: a slot without a hire is worked by the temp; nothing closes.
        if (incomeBlocked(data, room)) continue;
        amenities.push({ room, def });
        tags.add(def.desireTag);
      }

      if (amenities.length > 0 && tags.size > 0) {
        // Only guests who wanted something the hotel provides go anywhere.
        const wantRate = averageDesireChance(data, state) * (tags.size / Math.max(1, allDesireTags(data).size));
        const visitorsWanted = servedTotal * wantRate;

        let amenityCapacity = 0;
        for (const entry of amenities) amenityCapacity += entry.def.capacity / entry.def.serviceDurationSec;
        const visitorsServed = Math.floor(Math.min(visitorsWanted, amenityCapacity * earningSec * eff));

        if (visitorsServed > 0 && amenityCapacity > 0) {
          for (const entry of amenities) {
            const share = (entry.def.capacity / entry.def.serviceDurationSec) / amenityCapacity;
            const served = visitorsServed * share;
            coins += served * entry.def.incomePerCustomer * avgPay
              * decorMultiplier(data, entry.def, entry.room) * starMult;
            xp += served * entry.def.xpPerCustomer * avgPay;
          }
        }
      }

      result.coins += Math.round(coins);
      result.xp += Math.round(xp);
      result.guestsServed += servedTotal;

      earn(state, Math.round(coins), 'roomRevenue');
      grantXp(data, state, Math.round(xp), events);
      state.stats.guestsServed += servedTotal;

      /*
       * The aggregate has to leave reviews too.
       *
       * Reputation feeds the hotel score, which sets the star rating, which
       * multiplies income. The individually settled guests above go through
       * `checkOut` and review normally; the guests the aggregate stands in for
       * did not exist as objects and left nothing. So a watched hotel built
       * reputation and an unwatched one did not, and the two drifted apart by
       * a fifth over a single hour.
       */
      const aggregateScore = recordAggregateReviews(data, state, servedTotal);
      // Delighted guests tip whether or not anyone is watching. Paying tips
      // only on the live path made being present worth a fifth of all income
      // by accident rather than by design.
      const tip = Math.round(coins * tipRatio(data, aggregateScore));
      if (tip > 0) {
        earn(state, tip, 'tips');
        result.coins += tip;
      }
    }
  }

  // --- cleaning, through the one shared implementation --------------------
  //
  // The resolver used to carry its own formula: a cleaning term derived from
  // checkouts and a separate rot term, neither of which matched the tick loop.
  // The same hotel therefore came back from an absence at a different
  // cleanliness than it would have reached being watched.
  const shutSec = Math.max(0, realMs / 1000 - earningSec);
  applyCleaning(data, state, earningSec, true, false);
  applyCleaning(data, state, shutSec, false, true);

  checkPests(data, state, events);

  // --- advance the clock, by the whole of the real absence ---------------
  state.tick += Math.floor((realMs / 1000) * tps);
  // 4C: the weather ends on its own clock even while nobody watches.
  if (state.climate && state.tick >= state.climate.untilTick) {
    events.push({ type: 'climateEnded', eventId: state.climate.eventId, repaired: false });
    state.climate = null;
  }
  state.epochMs += realMs;

  // --- the same shift state machine the live loop runs -------------------
  if (state.shift.activeShiftId !== null) {
    if (state.tick >= state.shift.endsAtTick) events.push({ type: 'shiftEnded' });
    if (state.tick >= state.shift.graceEndsAtTick) {
      const settled = settleAtGraceEnd(data, state, events);
      state.shift.activeShiftId = null;
      state.shift.paidCost = 0;
      events.push({ type: 'graceEnded', settled });
    }
  }
  reconcileQueue(state);

  const stars = computeStars(data, state);
  if (stars !== state.hotel.stars) {
    events.push({ type: 'starsChanged', from: state.hotel.stars, to: stars });
    state.hotel.stars = stars;
  }

  events.push({
    type: 'offlineResolved',
    elapsedMs: realMs,
    coins: result.coins,
    xp: result.xp,
    guestsServed: result.guestsServed,
  });
  return result;
}

/** Spawn-weighted average chance a guest wants something. */
function averageDesireChance(data: SimData, state: GameState): number {
  let weight = 0;
  let sum = 0;
  for (const type of data.guestTypes) {
    if (type.unlockLevel > state.player.level) continue;
    weight += type.spawnWeight;
    sum += type.spawnWeight * type.desireChance;
  }
  return weight === 0 ? 0 : sum / weight;
}

/** Every desire tag the game defines, satisfiable or not. */
function allDesireTags(data: SimData): Set<string> {
  const tags = new Set<string>();
  for (const def of data.rooms) {
    if (isCommercialRoom(def)) tags.add(def.desireTag);
  }
  return tags;
}

/**
 * Spawn-weighted pay multiplier among the guests who would take a room of this
 * tier.
 *
 * The tick loop pays each guest their own `payMultiplier` and only ever sends
 * a guest to a room inside their tier range. Averaging across every unlocked
 * type ignored that filter entirely.
 */
export function payForRoom(data: SimData, state: GameState, tier: number): number {
  let weight = 0;
  let sum = 0;
  for (const type of data.guestTypes) {
    if (type.unlockLevel > state.player.level) continue;
    if (tier < type.minTier || tier > type.maxTier) continue;
    weight += type.spawnWeight;
    sum += type.spawnWeight * type.payMultiplier;
  }
  // No unlocked type wants this room; fall back to the hotel-wide average
  // rather than paying nothing for a room the tick loop would leave empty.
  return weight === 0 ? averagePayMultiplier(data, state) : sum / weight;
}

/** Spawn-weighted average pay multiplier across unlocked guest types. */
function averagePayMultiplier(data: SimData, state: GameState): number {
  let weight = 0;
  let sum = 0;
  for (const type of data.guestTypes) {
    if (type.unlockLevel > state.player.level) continue;
    weight += type.spawnWeight;
    sum += type.spawnWeight * type.payMultiplier;
  }
  return weight === 0 ? 1 : sum / weight;
}


/**
 * Check out every guest whose stay or service finished during the absence.
 *
 * Runs against the real per-guest payout path, so the coins are the ones the
 * tick loop would have produced rather than an estimate, and the guest is gone
 * afterwards. Guests whose stay has not finished are left exactly as they are.
 *
 * The room/guest relationship is rebuilt at the end: `checkOut` removes the
 * guest from `occupants`, but a save written by an older build could carry an
 * occupant id with no matching guest, and a room that believes it is full
 * turns away arrivals forever.
 */
function settleFinishedGuests(
  data: SimData,
  state: GameState,
  endTick: number,
  out: SimEvent[],
): { coins: number; xp: number; count: number } {
  const before = { coins: state.player.coins, xp: state.player.xp };
  let count = 0;

  // Reception first: a guest left standing at the desk has a bed reserved,
  // and the aggregate model below counts that bed as occupied.
  for (const guest of state.guests) {
    if (guest.state === 'checkingIn' && guest.finishesAtTick <= endTick) {
      completeCheckIn(data, state, guest, out);
    }
  }
  for (const guest of state.guests) {
    if (guest.finishesAtTick > endTick) continue;
    if (guest.state === 'staying') { checkOut(data, state, guest, out); count++; }
    else if (guest.state === 'usingAmenity') { leaveAmenity(data, state, guest, out); count++; }
  }

  // Anyone still waiting when the player left, whose patience ran out.
  for (const guest of state.guests) {
    if (guest.state !== 'queued' && guest.state !== 'arriving') continue;
    // Time spent waiting counts the same whether anyone was watching.
    guest.waitedTicks += Math.max(0, endTick - guest.stateSinceTick);
    if (guest.patienceUntilTick > endTick) continue;
    guest.state = 'leaving';
    guest.stateSinceTick = endTick;
    guest.leaveReason = 'outOfPatience';
    state.stats.guestsLost++;
    out.push({ type: 'guestLeftAngry', guestId: guest.id, reason: 'outOfPatience' });
  }

  state.guests = state.guests.filter((g) => g.state !== 'leaving');
  rebuildOccupancy(state);
  reconcileQueue(state);

  return { coins: state.player.coins - before.coins, xp: state.player.xp - before.xp, count };
}

/** `guest.roomId` and `room.occupants` are two views of one fact. */
export function rebuildOccupancy(state: GameState): void {
  const live = new Set(state.guests.map((g) => g.id));
  for (const room of state.hotel.rooms) {
    room.occupants = room.occupants.filter((id) => live.has(id));
  }
  const byRoom = new Map(state.hotel.rooms.map((r) => [r.id, r]));
  for (const guest of state.guests) {
    if (guest.roomId === null) continue;
    const room = byRoom.get(guest.roomId);
    if (!room) { guest.roomId = null; continue; }
    if (!room.occupants.includes(guest.id)) room.occupants.push(guest.id);
  }
}


/**
 * Leave reviews on behalf of the guests the aggregate served.
 *
 * Scores them on the hotel they stayed in — its rooms, its cleanliness, its
 * staffing — through the same weights the per-guest model uses, rather than
 * inventing a number. Capped so one long absence cannot flood the window.
 */
function recordAggregateReviews(data: SimData, state: GameState, served: number): number {
  if (served <= 0) return 0;
  const w = data.economy.satisfaction;
  const parts = hotelScore(data, state);
  // No waiting term and no incident term: the aggregate models a hotel with
  // capacity to spare, which is exactly the case where nobody waits.
  const score = Math.max(0, Math.min(100,
    w.base
    + parts.roomQuality * w.roomQualityWeight
    + parts.cleanliness * w.cleanlinessWeight
    + parts.staffService * w.serviceWeight));

  const MAX_AGGREGATE_REVIEWS = 20;
  const n = Math.min(served, MAX_AGGREGATE_REVIEWS);
  for (let i = 0; i < n; i++) {
    state.reputation.reviews.push({ score: Math.round(score), atTick: state.tick });
  }
  const windowTicks = w.reviewWindowSec * data.economy.simulation.ticksPerSecond;
  state.reputation.reviews = state.reputation.reviews
    .filter((r) => r.atTick >= state.tick - windowTicks)
    .slice(-200);
  let total = 0;
  for (const r of state.reputation.reviews) total += r.score;
  state.reputation.score = state.reputation.reviews.length === 0
    ? w.reputationStart
    : Math.round(total / state.reputation.reviews.length);
  return score;
}
