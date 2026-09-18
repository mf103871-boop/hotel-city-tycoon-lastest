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

/*
 * A term that contributed nothing is recorded, not dropped.
 *
 * This used to return early on a zero delta, to keep the log tidy. But three
 * of the terms are bonuses bounded by a weight, and the worst possible value
 * of a bonus is exactly zero — a room caked in filth adds no cleanliness
 * points, it does not subtract any. Dropping the entry erased the single most
 * important fact about the stay, and `dominantComplaint` could not have told
 * the player their rooms were dirty however dirty they got.
 *
 * `-0` is normalised away so a saved log never carries it.
 */
function note(guest: GuestInstance, reason: SatisfactionReason, delta: number): void {
  guest.satisfactionLog.push({ reason, delta: Math.round(delta * 10) / 10 + 0 });
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

/**
 * How much each term of the score took off the best stay this hotel could
 * have given, always as a positive amount.
 *
 * The note log stores signed deltas, and reading "the most negative one" is
 * wrong here in a way that is easy to miss: three of the terms never go
 * negative at all. A filthy room does not subtract — it contributes nothing
 * of a weight it could have contributed all of. So the most common real
 * complaint in the game could never once have been reported.
 *
 * `data/economy.json` states the model this reads: "Weights are the maximum
 * each term can contribute". The shortfall of a bonus term is therefore the
 * part it did not earn, and the shortfall of a penalty term is what it took.
 * Both are in the same unit — points off the stay — so they compare directly.
 *
 * The table is structure, not balance: which weight bounds which term. Every
 * number stays in `data/economy.json`, and `Record<SatisfactionReason, ...>`
 * means a new reason cannot be added without deciding how it is read.
 */
type SatisfactionWeights = SimData['economy']['satisfaction'];

const SHORTFALL: Record<
  SatisfactionReason,
  (w: SatisfactionWeights, delta: number) => number
> = {
  // Given, not withheld: the arrival score and a desire the hotel did meet.
  base: () => 0,
  desireMet: () => 0,
  // Bonuses: what was left on the table.
  roomQuality: (w, delta) => w.roomQualityWeight - delta,
  cleanliness: (w, delta) => w.cleanlinessWeight - delta,
  service: (w, delta) => w.serviceWeight - delta,
  // Penalties: what was taken. Already stored negative.
  desireUnmet: (_w, delta) => -delta,
  waited: (_w, delta) => -delta,
  incident: (_w, delta) => -delta,
};

/**
 * The one thing that most spoiled a stay, or null if nothing did.
 *
 * `explain()` hands back every term; this picks the single one worth saying
 * out loud. A player cannot act on seven signed numbers passing in a toast,
 * and they can act on "the room was dirty".
 *
 * Returns the note's own `reason` string rather than the union, because that is
 * what the note carries — the two are held in step by tools/selftest/feedback.ts,
 * which requires every member of the union to have a message.
 *
 * Only a stay under `complaintBelow` has one at all, so a hotel that is merely
 * imperfect does not nag. The line is in `data/economy.json` with the rest of
 * the satisfaction model, because where "not good enough to mention" ends is a
 * balance decision and Phase 6 will move it.
 *
 * Ties go to the earlier note, and the log is written in one fixed order, so
 * the same stay always names the same complaint.
 */
export function dominantComplaint(
  data: SimData,
  guest: GuestInstance,
): string | null {
  if (guest.satisfaction < 0) return null;            // never scored
  const w = data.economy.satisfaction;
  if (guest.satisfaction >= w.complaintBelow) return null;
  let worst: string | null = null;
  let worstAmount = 0;
  for (const note of guest.satisfactionLog) {
    const read = SHORTFALL[note.reason as SatisfactionReason];
    if (!read) continue;                              // a reason this does not model
    const amount = read(w, note.delta);
    if (amount > worstAmount) { worstAmount = amount; worst = note.reason; }
  }
  return worst;
}
