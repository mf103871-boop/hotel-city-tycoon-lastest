/**
 * Room quality and the hotel score.
 *
 * The star rating used to be four independent gates: average decor fill,
 * average cleanliness, a count of guest rooms and a count of commercial rooms.
 * Every one of them could be satisfied by repetition. Twenty copies of the
 * cheapest wallpaper filled the meter exactly as well as a furnished room, and
 * six cafes counted as six commercial rooms even though they served one desire
 * between them. Five stars was a shopping list, not a judgement.
 *
 * This replaces the gates with a score whose five components are each between
 * 0 and 1 and each separately explicable, and whose weights live in the data.
 */
import type { SimData, RoomDef } from '../data-source.ts';
import { decorDef, isCommercialRoom, isGuestRoom, roomById } from '../data-source.ts';
import type { GameState, RoomInstance } from '../state/types.ts';
import { decorFill } from './decor.ts';
import { averageCleanliness, staffEfficiency, effectActive } from './cleanliness.ts';

/**
 * Decor points after diminishing returns on repeats.
 *
 * The nth copy of the same piece in one room is worth `repeatFalloff^(n-1)` of
 * the first. Filling a room with twenty identical rugs used to be the cheapest
 * route to a full meter, and therefore to five stars.
 */
export function effectiveDecorPoints(data: SimData, room: RoomInstance): number {
  const falloff = data.economy.roomQuality.repeatFalloff;
  const seen: Record<string, number> = {};
  let sum = 0;
  // Sorted by id so the order of placement never changes the total.
  const ordered = [...room.decor].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const placed of ordered) {
    const n = seen[placed.defId] ?? 0;
    sum += decorDef(data, placed.defId).decorPoints * Math.pow(falloff, n);
    seen[placed.defId] = n + 1;
  }
  return sum;
}

/**
 * How many distinct kinds of thing are in the room, 0..1.
 *
 * Rises from `varietyFloor` to 1 as a room reaches `varietyTargetCategories`
 * distinct decor categories. A room of nothing but lamps is furnished; it is
 * not well furnished.
 */
export function variety(data: SimData, room: RoomInstance): number {
  const q = data.economy.roomQuality;
  if (room.decor.length === 0) return q.varietyFloor;
  const kinds = new Set(room.decor.map((p) => decorDef(data, p.defId).category));
  const t = Math.min(1, kinds.size / Math.max(1, q.varietyTargetCategories));
  return q.varietyFloor + (1 - q.varietyFloor) * t;
}

/**
 * The room's condition, 0..1.
 *
 * Derived from what is actually wrong with the room rather than from a decay
 * counter nobody set: a room that is on fire or infested is in poor condition
 * by definition. A separate wear-and-tear value would be a new mechanic, and
 * this phase is meant to fix the rating, not invent maintenance.
 */
export function condition(data: SimData, room: RoomInstance): number {
  const penalty = data.economy.roomQuality.hazardConditionPenalty;
  let c = 1;
  if (room.hasFire) c -= penalty;
  if (room.hasPest) c -= penalty;
  return Math.max(0, c);
}

/**
 * Theme agreement, 0..1.
 *
 * Returns 1 until decor carries `theme` tags. Assigning a theme to each of the
 * 77 decor items is art direction rather than engineering, so the machinery is
 * here and the tags are not invented — see the Phase 5 report.
 */
export function themeSynergy(data: SimData, room: RoomInstance): number {
  const themes = room.decor
    .map((p) => (decorDef(data, p.defId) as { theme?: string }).theme)
    .filter((t): t is string => typeof t === 'string' && t.length > 0);
  if (themes.length === 0) return 1;
  const counts: Record<string, number> = {};
  for (const t of themes) counts[t] = (counts[t] ?? 0) + 1;
  const dominant = Math.max(...Object.values(counts));
  return 0.75 + 0.25 * (dominant / themes.length);
}

/** Qroom = clamp(fill × themeSynergy × variety × condition, 0, 1). */
export function roomQuality(data: SimData, def: RoomDef, room: RoomInstance): number {
  const target = def.decorTarget > 0 ? def.decorTarget : 0;
  const fill = target > 0 ? Math.min(1, effectiveDecorPoints(data, room) / target) : decorFill(def, room);
  const q = fill * themeSynergy(data, room) * variety(data, room) * condition(data, room);
  return Math.max(0, Math.min(1, q));
}

/** Average room quality across every room that has a decor meter. */
export function averageRoomQuality(data: SimData, state: GameState): number {
  let total = 0;
  let counted = 0;
  for (const room of state.hotel.rooms) {
    const def = roomById(data, room.defId);
    if (!def || def.decorTarget <= 0) continue;
    total += roomQuality(data, def, room);
    counted++;
  }
  return counted === 0 ? 0 : total / counted;
}

/**
 * How much of what guests want the hotel can actually serve, 0..1.
 *
 * Counts **distinct desires covered**, not copies owned. Six cafes serve one
 * desire; the old rating counted them as six commercial rooms and let that
 * alone carry a hotel to five stars.
 */
export function amenityCoverage(data: SimData, state: GameState): number {
  const wanted = new Set<string>();
  for (const def of data.rooms) if (isCommercialRoom(def)) wanted.add(def.desireTag);
  if (wanted.size === 0) return 1;

  const served = new Set<string>();
  for (const room of state.hotel.rooms) {
    const def = roomById(data, room.defId);
    if (!def || !isCommercialRoom(def)) continue;
    // An amenity nobody is working in is closed, and a closed amenity serves
    // nothing. This is the same staffing rule the rest of the game now uses.
    if (!effectActive(data, state, room)) continue;
    served.add(def.desireTag);
  }
  return served.size / wanted.size;
}

/**
 * How well the hotel is staffed, 0..1.
 *
 * The share of staffed posts across every room that asks for somebody, scaled
 * by how good those people are. An empty desk and a gold receptionist should
 * not produce the same rating.
 */
export function staffService(data: SimData, state: GameState): number {
  let posts = 0;
  let filled = 0;
  for (const room of state.hotel.rooms) {
    const def = roomById(data, room.defId);
    if (!def || !('staffSlots' in def) || def.staffSlots <= 0) continue;
    posts++;
    const eff = staffEfficiency(data, state, room.staffId);
    if (eff > 0) filled += Math.min(1, eff);
  }
  return posts === 0 ? 1 : filled / posts;
}

/** Guest satisfaction as a 0..1 component, from the reputation window. */
export function satisfactionComponent(state: GameState): number {
  return Math.max(0, Math.min(1, state.reputation.score / 100));
}

export interface ScoreBreakdown {
  roomQuality: number;
  guestSatisfaction: number;
  cleanliness: number;
  amenityCoverage: number;
  staffService: number;
  total: number;
}

/**
 * The hotel score, and every number that went into it.
 *
 * Returned as a breakdown rather than a bare figure because "why am I not four
 * stars" has to be answerable. Each component is 0..1; the total is 0..100.
 */
export function hotelScore(data: SimData, state: GameState): ScoreBreakdown {
  const w = data.stars.score.weights;
  const parts = {
    roomQuality: averageRoomQuality(data, state),
    guestSatisfaction: satisfactionComponent(state),
    cleanliness: averageCleanliness(data, state),
    amenityCoverage: amenityCoverage(data, state),
    staffService: staffService(data, state),
  };
  const total = 100 * (
    parts.roomQuality * w.roomQuality
    + parts.guestSatisfaction * w.guestSatisfaction
    + parts.cleanliness * w.cleanliness
    + parts.amenityCoverage * w.amenityCoverage
    + parts.staffService * w.staffService
  );
  return { ...parts, total: Math.max(0, Math.min(100, total)) };
}

/** May this piece go in this room? */
export function slotAllowed(data: SimData, def: RoomDef, decorId: string): boolean {
  const slotType = decorDef(data, decorId).slotType;
  const rule = data.economy.roomQuality.slotTypeRooms.find((r) => r.slotType === slotType);
  const allowed = rule?.categories;
  if (!allowed || allowed.length === 0) return true;
  // A bed belongs in a bedroom. Nothing stopped one being installed in the
  // laundry, where it counted towards the rating just the same.
  return allowed.includes(def.category)
    || (allowed.includes('guest') && isGuestRoom(def));
}
