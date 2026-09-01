/**
 * Guest satisfaction.
 *
 * A guest used to be a payment with a sprite attached: they arrived, occupied a
 * bed for a fixed time, paid a fixed amount and left. Nothing about the stay —
 * how long they waited, whether the room was filthy, whether the thing they
 * came for existed — changed anything at all. The desire field was set at spawn
 * and read only by the renderer, to draw a thought bubble nobody could act on.
 *
 * Every term below is data-driven and every change carries a reason code, so a
 * score can always be read backwards into the stay that produced it. That is
 * the property the acceptance criteria ask for: no unexplained deltas.
 *
 * The same functions run online and offline. There is no second copy of this
 * arithmetic anywhere.
 */
import type { SimData, RoomDef } from '../data-source.ts';
import { isGuestRoom, roomById } from '../data-source.ts';
import type { GameState, GuestInstance, RoomInstance, SatisfactionNote } from '../state/types.ts';

/**
 * Why a guest's satisfaction moved. Stored on the guest, so a review can be
 * explained without recomputing anything.
 */
export type SatisfactionReason =
  | 'base'
  | 'roomQuality'
  | 'cleanliness'
  | 'service'
  | 'desireMet'
  | 'desireUnmet'
  | 'waited'
  | 'incident';

function note(guest: GuestInstance, reason: SatisfactionReason, delta: number): void {
  if (delta === 0) return;
  guest.satisfactionLog.push({ reason, delta: Math.round(delta * 10) / 10 });
}

/**
 * How good the room is, 0..1.
 *
 * Decor fill against the room's own target, scaled by tier. Phase 5 replaces
 * this with the full room-quality model including themes and variety; this is
 * the honest interim: it reads the two things that already exist.
 */
export function roomQuality(_data: SimData, def: RoomDef, room: RoomInstance): number {
  const target = def.decorTarget > 0 ? def.decorTarget : 1;
  const fill = Math.min(1, room.decorPoints / target);
  return Math.max(0, Math.min(1, fill));
}

/**
 * How much of their patience the guest burned waiting.
 *
 * Returns 0..1. A guest who walked straight to the desk waited for nothing; one
 * who nearly gave up waited for everything.
 */
export function waitRatio(guest: GuestInstance): number {
  if (guest.patienceTotalTicks <= 0) return 0;
  return Math.max(0, Math.min(1, guest.waitedTicks / guest.patienceTotalTicks));
}

/**
 * Score the stay, once, at checkout.
 *
 * Writes the guest's satisfaction and the reasons behind it. Called from the
 * one checkout path, so an offline settlement and a watched checkout produce
 * the same number for the same stay.
 */
export function scoreStay(
  data: SimData,
  state: GameState,
  guest: GuestInstance,
  room: RoomInstance,
): number {
  const w = data.economy.satisfaction;
  guest.satisfactionLog = [];

  let score = w.base;
  note(guest, 'base', w.base);

  const def = roomById(data, room.defId);
  if (def && isGuestRoom(def)) {
    const quality = roomQuality(data, def, room);
    const delta = quality * w.roomQualityWeight;
    score += delta;
    note(guest, 'roomQuality', delta);
    guest.ratedQuality = Math.round(quality * 100);
  }

  // Cleanliness is already 0..1 on the room.
  const cleanDelta = room.cleanliness * w.cleanlinessWeight;
  score += cleanDelta;
  note(guest, 'cleanliness', cleanDelta);
  guest.ratedCleanliness = Math.round(room.cleanliness * 100);

  // Service is how well reception coped, which is now a real number rather
  // than a wage the player paid for nothing.
  const service = Math.max(0, Math.min(1, state.lastServiceRating));
  const serviceDelta = service * w.serviceWeight;
  score += serviceDelta;
  note(guest, 'service', serviceDelta);

  if (guest.desire !== null) {
    if (guest.desireMet) {
      score += w.amenityMetBonus;
      note(guest, 'desireMet', w.amenityMetBonus);
    } else {
      // Deliberately a dent, not a wipe. A guest who wanted a gym the hotel
      // does not have still slept in the bed and still pays for it; the hotel
      // just does not get a good review out of them.
      score -= w.unmetDesirePenalty;
      note(guest, 'desireUnmet', -w.unmetDesirePenalty);
    }
  }

  const waited = waitRatio(guest) * w.waitPenaltyMax;
  score -= waited;
  note(guest, 'waited', -waited);

  if (guest.sawIncident) {
    score -= w.incidentPenalty;
    note(guest, 'incident', -w.incidentPenalty);
  }

  guest.satisfaction = Math.max(0, Math.min(100, Math.round(score)));
  return guest.satisfaction;
}

/**
 * The tip a delighted guest leaves, as a ratio of their bill.
 *
 * Bounded by `tipMaxRatio` and paid only above `tipThreshold`, so satisfaction
 * is worth chasing without becoming a second income stream that dwarfs the
 * first.
 */
export function tipRatio(data: SimData, satisfaction: number): number {
  const w = data.economy.satisfaction;
  if (satisfaction < w.tipThreshold) return 0;
  const span = 100 - w.tipThreshold;
  if (span <= 0) return w.tipMaxRatio;
  return ((satisfaction - w.tipThreshold) / span) * w.tipMaxRatio;
}

/**
 * Record a review and roll the reputation forward.
 *
 * Reviews outside the window are dropped rather than decayed by a curve: a
 * rolling window is something a player can reason about ("the last day of
 * guests"), and a decay constant is not.
 */
export function recordReview(
  data: SimData,
  state: GameState,
  guest: GuestInstance,
): void {
  const w = data.economy.satisfaction;
  const score = guest.satisfaction;
  guest.review = score;

  state.reputation.reviews.push({ score, atTick: state.tick });

  const windowTicks = w.reviewWindowSec * data.economy.simulation.ticksPerSecond;
  const cutoff = state.tick - windowTicks;
  state.reputation.reviews = state.reputation.reviews.filter((r) => r.atTick >= cutoff);

  // A save is one copy of the player's hotel; an unbounded review list is a
  // slow failure in it. The window bounds it by time, this bounds it by count.
  const MAX_REVIEWS = 200;
  if (state.reputation.reviews.length > MAX_REVIEWS) {
    state.reputation.reviews = state.reputation.reviews.slice(-MAX_REVIEWS);
  }

  if (state.reputation.reviews.length === 0) {
    state.reputation.score = w.reputationStart;
    return;
  }
  let total = 0;
  for (const r of state.reputation.reviews) total += r.score;
  state.reputation.score = Math.round(total / state.reputation.reviews.length);
}

/** A human-readable trace of one guest's score. Used by the UI and by tests. */
export function explain(guest: GuestInstance): SatisfactionNote[] {
  return guest.satisfactionLog;
}
