/**
 * The tick loop.
 *
 * Fixed 100ms steps (10Hz). A hotel is not a shooter; 10Hz is plenty and it
 * leaves the whole frame budget to the renderer. The renderer interpolates
 * between ticks for smooth motion.
 *
 * Nothing here reads a clock. `advance` is told how many ticks to run.
 */
import type { SimData } from '../data-source.ts';
import type { GameState, SimEvent, StepResult } from '../state/types.ts';
import { Rng } from '../rng/index.ts';
import { isOpen, shiftPhase } from '../systems/economy.ts';
import { applyCleaning } from '../systems/cleaning.ts';
import { computeStars } from '../systems/stars.ts';
import { arrivalsPerMinute, spawnGuest, tryCheckIn, checkOut, leaveAmenity, settleAtGraceEnd, reconcileQueue, completeCheckIn } from '../systems/guests.ts';
import { checkPests, checkFires, checkGhosts, checkClimate } from '../systems/events.ts';
import { shopPeriod } from '../systems/liveops.ts';

/**
 * Forget shop purchases from weeks that have closed.
 *
 * Only the current period is ever consulted; a previous week's record cannot
 * change anything. One period of slack is kept so a purchase made seconds
 * before a rollover is not immediately forgotten.
 */
function pruneShopHistory(data: SimData, state: GameState): void {
  const keys = Object.keys(state.shopTaken);
  if (keys.length === 0) return;
  const current = shopPeriod(data, state.epochMs);
  for (const key of keys) {
    const period = Number(key.slice(0, key.indexOf(':')));
    if (Number.isFinite(period) && period < current - 1) {
      delete state.shopTaken[key];
    }
  }
}

/** How often the expensive systems run, in ticks. Cheap ones run every tick. */
const SLOW_INTERVAL = 10; // once per simulated second


interface ClosedRules {
  dirtRateMultiplier: number;
  pestChanceMultiplier: number;
  guestsWalkAway: boolean;
}

/** What happens to a hotel nobody is paying to keep open. */
function shiftsClosedRules(data: SimData): ClosedRules {
  const raw = (data as unknown as { closedHotel?: Partial<ClosedRules> }).closedHotel;
  return {
    dirtRateMultiplier: raw?.dirtRateMultiplier ?? 1,
    pestChanceMultiplier: raw?.pestChanceMultiplier ?? 1,
    guestsWalkAway: raw?.guestsWalkAway ?? false,
  };
}

/**
 * Advance the simulation by `ticks` fixed steps.
 * Pure with respect to its inputs: the same state and seed always produce the
 * same result. Mutates the passed state for speed; callers that need the old
 * state should clone before calling.
 */
export function advance(data: SimData, state: GameState, ticks: number): StepResult {
  const events: SimEvent[] = [];
  const rng = new Rng(state.seed, state.rng);
  const tps = data.economy.simulation.ticksPerSecond;

  for (let i = 0; i < ticks; i++) {
    state.tick++;
    state.epochMs += data.economy.simulation.tickMs;

    // --- shift state machine ------------------------------------------
    //
    // Active → Grace → Closed. The shift used to vanish the instant it
    // expired, while the loop below carried on checking guests in and paying
    // them out for as long as the app stayed open. Ending it in two steps is
    // what lets "already being served" mean something.
    if (state.shift.activeShiftId !== null) {
      if (state.tick === state.shift.endsAtTick) {
        events.push({ type: 'shiftEnded' });
      }
      if (state.tick >= state.shift.graceEndsAtTick) {
        const settled = settleAtGraceEnd(data, state, events);
        state.shift.activeShiftId = null;
        state.shift.paidCost = 0;
        events.push({ type: 'graceEnded', settled });
      }
    }

    const open = isOpen(state);

    // --- guests finishing their stay ----------------------------------
    for (const guest of state.guests) {
      if (guest.state === 'staying' && state.tick >= guest.finishesAtTick) {
        checkOut(data, state, guest, events, rng);
      } else if (guest.state === 'usingAmenity' && state.tick >= guest.finishesAtTick) {
        leaveAmenity(data, state, guest, events);
      } else if (guest.state === 'checkingIn' && state.tick >= guest.finishesAtTick) {
        // Reception finishes what it started, in grace as well as active. The
        // guest is already holding the bed; abandoning them at the desk
        // because the clock ticked over would strand a reserved room.
        completeCheckIn(data, state, guest, events);
      }
    }

    // --- arrivals ------------------------------------------------------
    if (open) {
      const perTick = arrivalsPerMinute(data, state) / 60 / tps;
      if (rng.chance('guestSpawn', Math.min(1, perTick))) {
        spawnGuest(data, state, rng, events);
      }
    }

    // --- move arriving and queued guests -------------------------------
    //
    // Check-in is an Active-phase action. Letting it run in grace was the
    // single largest online/offline divergence: the resolver stopped paying at
    // `endsAtTick` while the live loop kept admitting and charging guests for
    // as long as somebody watched.
    for (const guest of state.guests) {
      // Waiting is measured, not assumed. Without this the wait penalty was a
      // term that could only ever be zero.
      if (guest.state === 'arriving' || guest.state === 'queued') guest.waitedTicks++;

      if (guest.state === 'queued' && state.tick >= guest.patienceUntilTick) {
        guest.state = 'leaving';
        guest.stateSinceTick = state.tick;
        guest.leaveReason = 'outOfPatience';
        state.stats.guestsLost++;
        events.push({ type: 'guestLeftAngry', guestId: guest.id, reason: 'outOfPatience' });
        continue;
      }
      if (!open) continue;
      if (guest.state === 'arriving' || guest.state === 'queued') {
        tryCheckIn(data, state, guest, rng, events);
      }
    }
    // One place decides what the queue contains, rather than four call sites
    // each remembering to splice their own id out of it.
    reconcileQueue(state);

    // --- drop departed guests ------------------------------------------
    // A leaving guest lingers while they walk out. Culling them after one
    // second made the signature "drag them back to reception" interaction
    // impossible: nobody can grab a sprite that exists for ten frames.
    if (state.guests.length > 0 && state.tick % SLOW_INTERVAL === 0) {
      const linger = data.economy.guests.walkAwaySec * tps;
      state.guests = state.guests.filter(
        (g) => g.state !== 'leaving' || state.tick - g.stateSinceTick < linger,
      );
    }

    // --- slow systems ---------------------------------------------------
    if (state.tick % SLOW_INTERVAL === 0) {
      const seconds = SLOW_INTERVAL / tps;
      const shut = shiftsClosedRules(data);
      // One implementation, shared with the offline resolver. The two used to
      // apply different formulas, so a hotel came back from an absence at a
      // different cleanliness than the same hotel watched for the same span.
      applyCleaning(data, state, seconds, open, shiftPhase(state) === 'closed');

      // A boost that has run out should not linger in the save.
      if (state.starBoost.amount > 0 && state.tick >= state.starBoost.untilTick) {
        state.starBoost = { amount: 0, untilTick: 0 };
      }
      if (state.revealedGuests.length > 0) {
        const alive = new Set(state.guests.map((g) => g.id));
        state.revealedGuests = state.revealedGuests.filter((id) => alive.has(id));
      }

      // Shop purchases are keyed by the week they happened in and nothing ever
      // read an old one. Left alone the record grew forever — 156 entries and
      // four kilobytes after a simulated year, and no ceiling at all. A save
      // that grows without bound is a slow failure in the one copy of the
      // player's hotel.
      pruneShopHistory(data, state);

      checkPests(data, state, events, open ? 1 : shut.pestChanceMultiplier);
      if (open) checkFires(data, state, seconds, rng, events);
      if (open) checkGhosts(data, state, seconds, rng, events);
      checkClimate(data, state, seconds, rng, events, open);

      // Nobody waits outside a closed hotel.
      if (!open && shut.guestsWalkAway) {
        for (const guest of state.guests) {
          if (guest.state !== 'queued' && guest.state !== 'arriving') continue;
          guest.state = 'leaving';
          guest.stateSinceTick = state.tick;
          state.stats.guestsLost++;
          events.push({ type: 'guestLeftAngry', guestId: guest.id, reason: 'noRoom' });
        }
        reconcileQueue(state);
      }

      const stars = computeStars(data, state);
      if (stars !== state.hotel.stars) {
        events.push({ type: 'starsChanged', from: state.hotel.stars, to: stars });
        state.hotel.stars = stars;
      }
    }
  }

  state.rng = rng.snapshot();
  return { state, events };
}

/** Convert elapsed wall-clock milliseconds into whole ticks. */
export function ticksForMs(data: SimData, ms: number): number {
  return Math.floor(ms / data.economy.simulation.tickMs);
}
