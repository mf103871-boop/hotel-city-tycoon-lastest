/**
 * The complete game state.
 *
 * Every field here is plain JSON: no class instances, no Map, no Set, no
 * functions, no circular references. That constraint is what makes the state
 * saveable, diffable, replayable and transmittable without a serializer.
 */
import type { RngCursors } from '../rng/index.ts';

/**
 * 1 → 2: objectives added.
 * 2 → 3: the hotel inspector's temporary rating boost.
 * 3 → 4: permanent hotel upgrades.
 * 4 → 5: the rotating shop and the daily gift.
 * 5 → 6: rival hotels in the city.
 * 6 → 7: a count of shifts opened, so a milestone survives the shift ending.
 * 7 → 8: the shift grace window and the drag cooldown, so that ending a shift
 *        is a state the simulation can be in rather than a boolean that flips.
 * 8 → 9: decor ownership. The shop took the player's money and gave them
 *        nothing at all; there was no place for an owned-but-unplaced piece to
 *        exist, so a purchase had nowhere to land.
 * 9 → 10: room storage. A room could be built or sold and nothing else — there
 *        was no way to move one, and selling was the only way to take one down,
 *        which destroyed its decor and orphaned its staff.
 * 10 → 11: guest satisfaction, reviews and reputation. A guest was a payment
 *        with a sprite attached; nothing about the stay changed anything.
 * 11 → 12: the coin ledger. `coinsEarned` and `coinsSpent` could not say
 *        whether the hotel was profitable or the player was living on gifts.
 * 12 → 13: the star bonus day. Every star tier has promised a daily payout
 *        since P1 and nothing ever paid it.
 * 16 → 17: the last original incidents (4C) — see the 16 step below.
 * 17 → 18: decor gets a place to stand. `slot` said which bucket of the room
 *        a piece filled and nothing about where it stood, so nothing could
 *        ever draw it. DEC-010 (docs/HC-P1-S1-PLACEMENT-DECISION.md) adds a
 *        local anchor (`localX`/`localY`, 16 units per block), one flip axis
 *        and a draw-order bias; `slot` is untouched.
 * 18 → 19: every placed piece moves onto its room's designed slot. The point
 *        list those anchors came from had never been checked against the room
 *        it was written for, and often sat inside it — furniture inside the
 *        laundry's washing machines, sunbeds in the pool. HC-P1-S5 measured
 *        each room and replaced the points with a slot table, and this step
 *        re-runs the placement a returning player would get today.
 *
 * Each step gives an older save the field a fresh game would have started
 * with, so migrating never costs a player anything.
 */
export const SCHEMA_VERSION = 20;

// ---------------------------------------------------------------- pieces

export interface PlacedDecor {
  /** Instance id, unique within the hotel. */
  id: string;
  /** Points at decor.json items[]. */
  defId: string;
  /** Which slot in the room it occupies. Ownership/uniqueness bookkeeping only. */
  slot: number;
  /**
   * Position within the room, in anchor units (16 per block; DEC-010).
   * Relative to the room's own top-left, independent of the room's size or
   * the camera. Always in bounds for the room's current footprint.
   */
  localX: number;
  localY: number;
  /** The only orientation change allowed (DEC-010): no free rotation. */
  flipX: boolean;
  /** Draw-order tiebreaker among decor in the same room; 0 is the default. */
  zBias: number;
}

export interface RoomInstance {
  id: string;
  /** Points at rooms.json rooms[]. */
  defId: string;
  x: number;
  y: number;
  decor: PlacedDecor[];
  /** Cached sum of decor points. Kept in sync by the decor system. */
  decorPoints: number;
  /** 0 = filthy, 1 = spotless. */
  cleanliness: number;
  /** Blocks all income until cleared. */
  hasPest: boolean;
  hasFire: boolean;
  /** 4C: haunted — blocks the room until the ghostbuster is called. */
  hasGhost: boolean;
  /** Guest instance ids currently inside. */
  occupants: string[];
  /** Staff instance id assigned, if the room needs one. */
  staffId: string | null;
  /** Simulation tick this room was built on. */
  builtAtTick: number;
}

export interface GuestInstance {
  id: string;
  /** Points at guests.json types[]. */
  typeId: string;
  /**
   * `checkingIn` was added in Phase 1b. Reception used to be instantaneous, so
   * a receptionist's efficiency changed nothing and the grade you were dealt
   * was cosmetic. A guest in this state is holding a bed that is already
   * reserved for them.
   */
  state: 'arriving' | 'queued' | 'checkingIn' | 'staying' | 'usingAmenity' | 'leaving';
  /** Room instance id, once checked in. */
  roomId: string | null;
  /** Tick the current state began. */
  stateSinceTick: number;
  /** Tick at which the stay or service completes. */
  finishesAtTick: number;
  /** What this guest wants the hotel to have; drives the icon above their head. */
  desire: string | null;
  /** Patience expiry while queued or walking past. */
  patienceUntilTick: number;
  /** Patience this guest started with, in ticks. The denominator for waiting. */
  patienceTotalTicks: number;
  /** Ticks spent arriving or queued. Drives the wait penalty. */
  waitedTicks: number;
  /** 0..100, written once at checkout. -1 until then. */
  satisfaction: number;
  /** Every change to the score, with the reason for it. */
  satisfactionLog: SatisfactionNote[];
  /** Whether the thing they came wanting was actually provided. */
  desireMet: boolean;
  /** Whether they were in a room that caught fire or had pests. */
  sawIncident: boolean;
  /** What they rated the room and its cleanliness, 0..100. */
  ratedQuality: number;
  ratedCleanliness: number;
  /** Their review score, or -1 if they never left one. */
  review: number;
  /** Why they left. */
  leaveReason: 'checkedOut' | 'noRoom' | 'outOfPatience' | 'hotelClosed' | null;
  /**
   * True once this guest has been given a room, whether or not the room paid.
   * Added in schema version 8 so that dragging someone back to reception
   * cannot make a guest who has already had their stay have it again.
   */
  everCheckedIn: boolean;
}

/**
 * A room the player has taken down and kept.
 *
 * It holds its identity, its decor and its condition: putting it back is the
 * exact room that came out, not a fresh one. Staff are not stored with it —
 * they stay hired and unassigned, because a person is not part of the
 * furniture.
 */
/** One movement of a guest's satisfaction, and why it happened. */
export interface SatisfactionNote {
  reason: string;
  delta: number;
}

/** Reviews inside the rolling window, and the average they produce. */
export interface Reputation {
  score: number;
  reviews: Array<{ score: number; atTick: number }>;
}

export interface StoredRoom {
  id: string;
  defId: string;
  decor: PlacedDecor[];
  decorPoints: number;
  cleanliness: number;
  builtAtTick: number;
}

export interface StaffInstance {
  id: string;
  /** Points at staff.json roles[]. */
  roleId: string;
  /** Points at staff.json grades[]. */
  gradeId: string;
  /** Room instance id, or null when unassigned. */
  roomId: string | null;
}

/**
 * Closed, Active, or Grace.
 *
 * This used to be a boolean derived from `tick < endsAtTick`, which left no
 * room to express "the shift is over but the guest in the spa paid for that
 * treatment". The live loop let those guests check in and pay past the end;
 * the offline resolver stopped dead at it. Which one a player got depended on
 * whether the app happened to be open.
 */
export type ShiftPhase = 'closed' | 'active' | 'grace';

export interface ShiftState {
  /** Points at shifts.json, or null when the hotel is closed. */
  activeShiftId: string | null;
  /** Tick at which the paid shift expires. Arrivals and check-in stop here. */
  endsAtTick: number;
  /**
   * Tick at which the grace window closes. Between `endsAtTick` and this,
   * guests already being served finish and nothing new begins. Added in
   * schema version 8.
   */
  graceEndsAtTick: number;
  /** What the player paid for it, for the UI and for analytics. */
  paidCost: number;
}

export interface PlayerState {
  level: number;
  xp: number;
  coins: number;
  gems: number;
}

export interface HotelState {
  name: string;
  /** Points at plots.json expansions[]. */
  plotId: string;
  /** Cached star rating, recomputed by the stars system. */
  stars: number;
  rooms: RoomInstance[];
}

export interface RunStats {
  guestsServed: number;
  coinsEarned: number;
  coinsSpent: number;
  pestsCleared: number;
  firesCleared: number;
  ghostsCleared: number;
  guestsLost: number;
  /**
   * How many shifts have ever been opened. Added in schema version 7 and
   * written by the 6 → 7 migration; the objective checker counts it rather
   * than sampling whether the hotel happens to be open right now.
   */
  shiftsOpened: number;
}

// ---------------------------------------------------------------- state

export interface GameState {
  schemaVersion: number;
  /** Master RNG seed. Never changes for the life of a save. */
  seed: number;
  rng: RngCursors;
  /** Simulation tick counter. The only clock the core trusts. */
  tick: number;
  /** Wall-clock ms the tick counter corresponds to. Set at the boundary only. */
  epochMs: number;
  player: PlayerState;
  hotel: HotelState;
  shift: ShiftState;
  guests: GuestInstance[];
  /** Guest ids waiting at reception, in order. */
  lobbyQueue: string[];
  staff: StaffInstance[];
  stats: RunStats;
  /** Monotonic id counters, so ids stay stable across replays. */
  counters: { room: number; guest: number; staff: number; decor: number };
  /** Per-event-id tick at which the cooldown expires. */
  eventCooldowns: Record<string, number>;
  /** How many times each event has been cleared, for diminishing rewards. */
  eventClearCounts: Record<string, number>;
  /**
   * 4C: the hotel-wide weather incident. Set by heatWave/coldSnap, cleared by
   * the repair call or by reaching untilTick on its own.
   */
  climate: { eventId: string; untilTick: number } | null;
  /** Objective ids the player has claimed. Added in schema version 2. */
  completedObjectives: string[];
  /**
   * A temporary rating lift from a satisfied inspector. Added in version 3.
   * Zero amount means none is active.
   */
  starBoost: { amount: number; untilTick: number };
  /** Guest ids already revealed, so an inspector cannot be claimed twice. */
  revealedGuests: string[];
  /** Upgrade id to the number of tiers owned. Added in schema version 4. */
  upgrades: Record<string, number>;
  /** Shop offers already taken, keyed `period:defId`. Added in version 5. */
  shopTaken: Record<string, boolean>;
  /** The daily gift streak. Added in version 5. */
  gift: { lastClaimedDay: number; lastItemWeek: number };
  /**
   * Wall-clock ms the hotel was first opened. Added in schema version 6 and
   * written by the 5 → 6 migration; the city uses it to decide how far the
   * rival hotels have grown.
   */
  startedAtMs: number;
  /**
   * Which neighbours have been visited today, and which day that was.
   * Added in schema version 6.
   */
  visitedToday: { day: number; ids: string[] };
  /**
   * Tick of the last successful drag-to-lobby. The data has declared a
   * cooldown since P1 and nothing enforced it. Added in schema version 8.
   */
  lastDragTick: number;
  /**
   * Decor the player owns but has not placed, keyed by definition id.
   *
   * Added in schema version 9. Buying from the shop deducted coins or gems and
   * recorded that the offer had been taken, and that was all — there was
   * nowhere for the item itself to go, so the player paid for nothing. A count
   * of zero is removed rather than stored, so the record does not grow with
   * every item ever handled.
   */
  ownedDecor: Record<string, number>;
  /**
   * Rooms taken down and kept, added in schema version 10.
   *
   * Storage is deliberately not a way to improve the hotel's rating: a room
   * has to be clean and hazard-free before it can be taken down, so a filthy
   * or infested room cannot be hidden from the average it drags down.
   */
  storedRooms: StoredRoom[];
  /**
   * What guests think of the hotel, added in schema version 11. An average of
   * the reviews inside a rolling window rather than a decayed constant,
   * because "the last day of guests" is something a player can reason about.
   */
  reputation: Reputation;
  /**
   * How well reception coped with the last guest it handled, 0..1. Written by
   * the check-in path and read by the satisfaction model, so service quality
   * is measured rather than assumed.
   */
  lastServiceRating: number;
  /** Desires the hotel could not meet, by tag. An investment signal. */
  unmetDesires: Record<string, number>;
  /**
   * Every coin in and out, by source and sink. Added in schema version 12.
   * Sources are positive, sinks negative, so the sum is net profit and the
   * operating subset is the hotel's own performance.
   */
  ledger: Record<string, number>;
  /**
   * The last gift period in which the star bonus was paid, or -1.
   *
   * Added in schema version 13. `dailyBonusCoins` has been on every star tier
   * since the first data file and nothing read it, so a five-star hotel was
   * promised 3,500 coins a day and given nothing. Keyed by period so claiming
   * twice in one day pays once.
   */
  lastStarBonusDay: number;
  /** Poke tracking (decision 3a): which day, and how many paid so far. */
  pokes: { day: number; count: number };
}

// ---------------------------------------------------------------- events out

export type SimEvent =
  | { type: 'guestArrived'; guestId: string; typeId: string }
  | { type: 'guestCheckedIn'; guestId: string; roomId: string }
  | { type: 'guestCheckedOut'; guestId: string; roomId: string; coins: number; xp: number }
  | { type: 'guestLeftAngry'; guestId: string; reason: 'noRoom' | 'outOfPatience' }
  | { type: 'incomeBlocked'; roomId: string; reason: 'dirty' | 'pest' | 'fire' | 'ghost' | 'closed' }
  | { type: 'pestAppeared'; roomId: string }
  | { type: 'fireStarted'; roomId: string }
  | { type: 'hazardCleared'; roomId: string; hazard: 'pest' | 'fire'; coins: number }
  | { type: 'ghostAppeared'; roomId: string }
  | { type: 'climateStarted'; eventId: string }
  | { type: 'climateEnded'; eventId: string; repaired: boolean }
  | { type: 'serviceCalled'; service: 'ghostbuster' | 'repair'; coins: number; cleared: number }
  | { type: 'levelUp'; level: number; rewardCoins: number; rewardGems: number }
  | { type: 'inspectorFound'; guestId: string; coins: number; xp: number; boost: number }
  | { type: 'guestPoked'; guestId: string; coins: number }
  | { type: 'nothingFound'; guestId: string }
  | { type: 'staffHired'; staffId: string; roleId: string; gradeId: string }
  | { type: 'upgradeBought'; upgradeId: string; tier: number; cost: number }
  | { type: 'shopPurchase'; defId: string; price: number; saved: number }
  | { type: 'giftClaimed'; itemDefId: string | null }
  | { type: 'neighbourVisited'; neighbourId: string; coins: number; xp: number }
  | { type: 'starsChanged'; from: number; to: number }
  | { type: 'shiftStarted'; shiftId: string; cost: number; endsAtTick: number }
  | { type: 'shiftEnded' }
  | { type: 'graceEnded'; settled: number }
  | { type: 'starBonusPaid'; stars: number; coins: number }
  | { type: 'seasonGemsPaid'; seasonId: string; gems: number }
  | { type: 'decorSold'; defId: string; currency: 'coins' | 'gems'; amount: number }
  | { type: 'plotExpanded'; plotId: string; cost: number }
  | { type: 'roomMoved'; roomId: string; x: number; y: number }
  | { type: 'roomStored'; roomId: string }
  | { type: 'roomRestored'; roomId: string; x: number; y: number }
  | { type: 'staffAssigned'; staffId: string; roomId: string }
  | { type: 'staffUnassigned'; staffId: string }
  | { type: 'staffFired'; staffId: string }
  | { type: 'guestReviewed'; guestId: string; score: number; reputation: number }
  | { type: 'desireUnmet'; guestId: string; tag: string }
  | { type: 'offlineResolved'; elapsedMs: number; coins: number; xp: number; guestsServed: number };

/** Result of advancing the simulation. */
export interface StepResult {
  state: GameState;
  events: SimEvent[];
}
