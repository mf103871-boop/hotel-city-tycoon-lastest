/**
 * Everything React is allowed to know about the simulation.
 *
 * The UI previously reached past this layer and imported `src/core` directly.
 * That worked, and it was still wrong: the whole point of the boundary is that
 * React depends on a small, stable surface rather than on the simulation's
 * internals, so the core can be reshaped — or moved to a server — without
 * touching a component. The lint rule caught it; this file is the fix.
 *
 * Selectors here take state and return plain values. They never mutate.
 */
import type { GameState, RoomInstance, SimEvent } from '../core/state/types.ts';
import type { RoomDef, SimData } from '../core/data-source.ts';
import { decorFill } from '../core/systems/decor.ts';
import { tierFor } from '../core/systems/stars.ts';
import { owned as ownedCount, sellValue } from '../core/systems/inventory.ts';
import { slotAllowed } from '../core/systems/quality.ts';
import { plotBounds, findFreeSpot, placementProblemAt } from '../core/state/grid.ts';
import { tierOwned, nextTier, totalInvested } from '../core/systems/upgrades.ts';
import {
  shopOffers, shopPeriod, msUntilShopRefresh, isOfferTaken,
  activeSeason, seasonDaysLeft, giftState,
} from '../core/systems/liveops.ts';
import type { ShopOffer } from '../core/systems/liveops.ts';
import { neighbours, cityRank, visitsLeft } from '../core/systems/neighbours.ts';
import type { Neighbour } from '../core/systems/neighbours.ts';
import { isOpen, totalShiftCost, shiftPrice, shiftWages } from '../core/systems/economy.ts';
import { levelProgress, xpForLevel } from '../core/systems/progression.ts';
import { averageCleanliness, cleaningCoverage } from '../core/systems/cleanliness.ts';

/** Re-exported so the UI never needs a path into src/core. */
export type { GameState, RoomInstance, SimEvent };

/**
 * The balance data, injected once at startup.
 *
 * It used to be imported statically from `src/data`, which pulled Zod and ten
 * JSON modules into every consumer — including the headless tests, where
 * neither is available. Injecting at the composition root keeps this layer as
 * testable as the core it sits on.
 */
let injected: SimData | null = null;

export function initSelectors(simulationData: SimData): void {
  injected = simulationData;
  roomIndex = null;
  decorIndex = null;
}

function D(): SimData {
  if (injected === null) {
    throw new Error('Bridge selectors used before initSelectors() — call it at startup.');
  }
  return injected;
}

/** The data the bridge is running on. */
export function simData(): SimData {
  return D();
}

// ---------------------------------------------------------------- hotel

/**
 * One placed decor piece, as the renderer needs to see it (DEC-010).
 *
 * `category`/`slotType` travel with the piece rather than making RoomView
 * look them up, for the same reason RoomSummary itself carries `assetKey`
 * instead of a bare defId: the render layer reads state, it does not query
 * the data tables.
 */
export interface RoomSummaryDecor {
  id: string;
  defId: string;
  category: string;
  slotType: string;
  /** Art for this piece. The renderer falls back to a placeholder if absent. */
  assetKey: string;
  /** Anchor units (16 per block) from the room's own top-left. */
  localX: number;
  localY: number;
  flipX: boolean;
  zBias: number;
}

export interface RoomSummary {
  id: string;
  defId: string;
  category: 'guest' | 'commercial' | 'functional';
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0..1 decor meter. */
  fill: number;
  showMeter: boolean;
  hasPest: boolean;
  hasFire: boolean;
  hasGhost: boolean;
  occupants: number;
  nameKey: string;
  /**
   * The picture this room is showing right now — base, night or dirty. The
   * renderer falls back to a drawn shell if the file is absent.
   */
  assetKey: string;
  /** Transparent roach layer, composited over the art. Empty when clean. */
  pestKey: string;
  decor: RoomSummaryDecor[];
}

/**
 * Room definitions indexed by id.
 *
 * This used to be a linear scan. The scene rebuilds its snapshot ten times a
 * second, and each rebuild looked up every room and every character against
 * all twenty-three definitions — fine at five rooms, and thousands of wasted
 * comparisons a second at eighty. The architecture document forbids work like
 * this in the hot path; it slipped in anyway because it was invisible at the
 * size things were being tested at.
 */
let roomIndex: Map<string, RoomDef> | null = null;

export function roomDefOf(defId: string): RoomDef | undefined {
  roomIndex ??= new Map(D().rooms.map((r) => [r.id, r]));
  return roomIndex.get(defId);
}

/** Same reasoning as roomIndex, for the decor catalogue's 77 entries. */
let decorIndex: Map<string, { category: string; slotType: string; assetKey: string }> | null = null;

function decorInfoOf(defId: string): { category: string; slotType: string; assetKey: string } | undefined {
  decorIndex ??= new Map(D().decor.map((d) => [
    d.id, { category: d.category, slotType: d.slotType, assetKey: d.assetKey },
  ]));
  return decorIndex.get(defId);
}

function summariseDecor(room: RoomInstance): RoomSummaryDecor[] {
  return room.decor.map((piece) => {
    const info = decorInfoOf(piece.defId);
    return {
      id: piece.id,
      defId: piece.defId,
      category: info?.category ?? 'unknown',
      slotType: info?.slotType ?? 'floor',
      // A piece whose definition has gone missing gets no art rather than a
      // guessed key: the renderer's placeholder is the honest answer there.
      assetKey: info?.assetKey ?? '',
      localX: piece.localX,
      localY: piece.localY,
      flipX: piece.flipX,
      zBias: piece.zBias,
    };
  });
}

/**
 * Which of a room's five pictures to show.
 *
 * The art pipeline draws `base`, `night`, `dirty`, `pest` and `thumb` for
 * every room, and until now the renderer only ever asked for `base`: 92 of
 * those files were generated, shipped, and never seen, and a room the player
 * urgently needed to clean looked exactly like one they did not.
 *
 * Dirt wins over dark, because dirt is the one the player has to act on. The
 * pest layer is not in this list — it is a transparent overlay the room view
 * composites over whichever of these is showing, so a room can be dirty and
 * infested at once.
 */
export function roomArtVariant(room: RoomInstance, def: RoomDef | undefined,
                               open: boolean): 'base' | 'night' | 'dirty' {
  const gate = D().economy.cleanliness.incomeGateThreshold;
  if (def && def.category !== 'functional' && room.cleanliness < gate) return 'dirty';
  return open ? 'base' : 'night';
}

export function summariseRoom(room: RoomInstance, open = true): RoomSummary {
  const def = roomDefOf(room.defId);
  const variant = roomArtVariant(room, def, open);
  return {
    id: room.id,
    defId: room.defId,
    category: def?.category ?? 'functional',
    x: room.x,
    y: room.y,
    w: def?.blocks.w ?? 1,
    h: def?.blocks.h ?? 1,
    fill: def ? decorFill(def, room) : 1,
    showMeter: (def?.decorTarget ?? 0) > 0,
    hasPest: room.hasPest,
    hasFire: room.hasFire,
    hasGhost: room.hasGhost,
    occupants: room.occupants.length,
    nameKey: def?.nameKey ?? `room.${room.defId}.name`,
    assetKey: `room.${room.defId}.${variant}`,
    // The infestation is a separate transparent layer, so it composites over
    // whichever variant is showing rather than needing one of its own.
    pestKey: room.hasPest ? `room.${room.defId}.pest` : '',
    decor: summariseDecor(room),
  };
}

export function summariseRooms(state: GameState): RoomSummary[] {
  // Whether the hotel is trading decides whether its rooms are lit, so it is
  // read once here rather than per room.
  const open = isOpen(state);
  return state.hotel.rooms.map((room) => summariseRoom(room, open));
}

export function gridSize(state: GameState): { w: number; h: number } {
  const bounds = plotBounds(D(), state);
  return { w: bounds.w, h: bounds.h };
}

// ---------------------------------------------------------------- shift

export function hotelIsOpen(state: GameState): boolean {
  return isOpen(state);
}

/** Seconds until the paid shift expires. Zero when closed. */
export function shiftSecondsLeft(state: GameState): number {
  if (!isOpen(state)) return 0;
  return Math.max(0, Math.round((state.shift.endsAtTick - state.tick) / D().economy.simulation.ticksPerSecond));
}

export interface ShiftOption {
  id: string;
  hours: number;
  cost: number;
  affordable: boolean;
  unlocked: boolean;
  /** So a locked shift can say which level unlocks it, not "level ?". */
  unlockLevel: number;
  nameKey: string;
}

export function shiftOptions(state: GameState): ShiftOption[] {
  return D().shifts.map((s) => {
    const cost = totalShiftCost(D(), state, s.id);
    return {
      id: s.id,
      hours: s.durationSec / 3600,
      cost,
      affordable: state.player.coins >= cost,
      unlocked: s.unlockLevel <= state.player.level,
      unlockLevel: s.unlockLevel,
      nameKey: `shift.${s.durationSec / 3600}h`,
    };
  });
}

/** The longest shift the player can actually pay for right now. */
export function bestAffordableShift(state: GameState): ShiftOption | null {
  const usable = shiftOptions(state).filter((s) => s.unlocked && s.affordable);
  return usable[usable.length - 1] ?? null;
}

export function shiftBreakdown(state: GameState, shiftId: string): { base: number; wages: number; total: number } {
  return {
    base: shiftPrice(D(), state, shiftId),
    wages: shiftWages(D(), state, shiftId),
    total: totalShiftCost(D(), state, shiftId),
  };
}

// ---------------------------------------------------------------- progress

export function levelBarProgress(state: GameState): number {
  return levelProgress(D(), state);
}

export function xpToNextLevel(state: GameState): number {
  const next = xpForLevel(D(), state.player.level + 1);
  return next === 0 ? 0 : Math.max(0, next - state.player.xp);
}

export function hotelCleanliness(state: GameState): number {
  return averageCleanliness(D(), state);
}

export function housekeepingCoverage(state: GameState): number {
  return cleaningCoverage(D(), state);
}

// ---------------------------------------------------------------- catalogue

export function buildableRooms(state: GameState) {
  return D().rooms
    .filter((r) => r.unlockLevel <= state.player.level)
    .map((r) => ({
      id: r.id,
      nameKey: r.nameKey,
      category: r.category,
      cost: r.cost,
      affordable: r.cost.currency === 'coins'
        ? state.player.coins >= r.cost.amount
        : state.player.gems >= r.cost.amount,
    }));
}

// ---------------------------------------------------------------- panels
//
// Everything the build, decorate, staff and room panels need. Kept here rather
// than computed in components so the rules are testable without a browser —
// the last release shipped a renderer bug precisely because UI wiring was the
// one layer nothing headless could reach.

/** Why an action is unavailable. The UI turns this into one short sentence. */
export type Blocker = 'locked' | 'cannotAfford' | 'noSpace' | 'alreadyExists' | null;

export interface BuildOption {
  defId: string;
  nameKey: string;
  descKey: string;
  category: 'guest' | 'commercial' | 'functional';
  blocks: { w: number; h: number };
  cost: { currency: 'coins' | 'gems'; amount: number };
  unlockLevel: number;
  /** Null when it can be built right now. */
  blocker: Blocker;
  /** Guest rooms only: what it earns per stay, for comparison. */
  incomePerGuest?: number;
  tier?: number;
}

function blockerFor(state: GameState, def: RoomDef): Blocker {
  if (def.unlockLevel > state.player.level) return 'locked';
  if (def.category === 'functional' && def.unique
      && state.hotel.rooms.some((r) => r.defId === def.id)) return 'alreadyExists';
  const affordable = def.cost.currency === 'coins'
    ? state.player.coins >= def.cost.amount
    : state.player.gems >= def.cost.amount;
  if (!affordable) return 'cannotAfford';
  if (findFreeSpot(D(), state, def.blocks) === null) return 'noSpace';
  return null;
}

/**
 * The build menu, in the order a player thinks about it: rooms that earn,
 * then rooms that entertain, then rooms that keep the place running.
 */
export function buildCatalog(state: GameState): Record<string, BuildOption[]> {
  const groups: Record<string, BuildOption[]> = { guest: [], commercial: [], functional: [] };
  // Content parked one past the level cap (the validator's PARKED convention,
  // decision 11a) is switched off, and off means absent — a room labelled
  // "unlocks at 53" in a 52-level game is a promise the game cannot keep.
  const cap = D().levels[D().levels.length - 1]!.level;
  for (const def of D().rooms) {
    if (def.unlockLevel > cap) continue;
    const option: BuildOption = {
      defId: def.id,
      nameKey: def.nameKey,
      descKey: `room.${def.id}.desc`,
      category: def.category,
      blocks: def.blocks,
      cost: def.cost,
      unlockLevel: def.unlockLevel,
      blocker: blockerFor(state, def),
      ...(def.category === 'guest' ? { incomePerGuest: def.incomePerGuest, tier: def.tier } : {}),
    };
    groups[def.category]?.push(option);
  }
  for (const list of Object.values(groups)) list.sort((a, b) => a.unlockLevel - b.unlockLevel);
  return groups;
}

export interface DecorOption {
  /** Unplaced copies the player already holds. */
  owned: number;
  defId: string;
  nameKey: string;
  category: string;
  slotType: string;
  decorPoints: number;
  cost: { currency: 'coins' | 'gems'; amount: number };
  unlockLevel: number;
  blocker: Blocker;
  /** How much of this room's meter one of these fills, 0..1. */
  meterShare: number;
}

/** Decor the player could put in this room right now. */
export function decorCatalog(state: GameState, roomId: string): DecorOption[] {
  const room = state.hotel.rooms.find((r) => r.id === roomId);
  const def = room ? roomDefOf(room.defId) : undefined;
  if (!room || !def) return [];

  return D().decor
    .filter((item) => item.unlockLevel <= state.player.level + 10)
    .map((item) => {
      /*
       * Ownership is checked before money.
       *
       * A player who took a piece down and had no coins left was told they
       * could not afford the thing they already owned, and the row was
       * disabled. `PLACE_DECOR` would have accepted it — the core consumes an
       * owned copy before it charges — so the catalog was refusing something
       * the simulation allowed.
       */
      const held = ownedCount(state, item.id);
      let blocker: Blocker = null;
      if (item.unlockLevel > state.player.level) blocker = 'locked';
      else if (held === 0 && (item.cost.currency === 'coins'
        ? state.player.coins < item.cost.amount
        : state.player.gems < item.cost.amount)) blocker = 'cannotAfford';
      else if (slotsFor(state, roomId, item.slotType).length === 0) blocker = 'noSpace';
      return {
        defId: item.id,
        nameKey: item.nameKey,
        category: item.category,
        slotType: item.slotType,
        decorPoints: item.decorPoints,
        cost: item.cost,
        /** Unplaced copies in hand. Above zero, placing costs nothing. */
        owned: held,
        unlockLevel: item.unlockLevel,
        blocker,
        meterShare: def.decorTarget > 0 ? Math.min(1, item.decorPoints / def.decorTarget) : 0,
      };
    })
    .sort((a, b) => a.unlockLevel - b.unlockLevel || b.decorPoints - a.decorPoints);
}

/**
 * Free slots that will actually accept this kind of piece.
 *
 * Picking the first empty index regardless of type meant offering a bed a slot
 * the compatibility rule then refused, so the row looked available and the
 * command said no. The catalog now asks the same question the core asks.
 */
export function slotsFor(state: GameState, roomId: string, slotType: string): number[] {
  const room = state.hotel.rooms.find((r) => r.id === roomId);
  const def = room ? roomDefOf(room.defId) : undefined;
  if (!room || !def) return [];
  const item = D().decor.find((d) => d.slotType === slotType);
  if (item && !slotAllowed(D(), def, item.id)) return [];
  return freeSlots(state, roomId);
}

/** Slot indices in this room that nothing occupies. */
export function freeSlots(state: GameState, roomId: string): number[] {
  const room = state.hotel.rooms.find((r) => r.id === roomId);
  const def = room ? roomDefOf(room.defId) : undefined;
  if (!room || !def) return [];
  const taken = new Set(room.decor.map((p) => p.slot));
  const free: number[] = [];
  for (let i = 0; i < def.decorSlots; i++) if (!taken.has(i)) free.push(i);
  return free;
}

export interface PlacedDecorView {
  id: string;
  defId: string;
  nameKey: string;
  slot: number;
  decorPoints: number;
  refund: number;
}

export interface RoomDetail {
  id: string;
  defId: string;
  nameKey: string;
  category: 'guest' | 'commercial' | 'functional';
  fill: number;
  decorPoints: number;
  decorTarget: number;
  decorSlots: number;
  usedSlots: number;
  cleanliness: number;
  hasPest: boolean;
  hasFire: boolean;
  hasGhost: boolean;
  occupants: number;
  capacity: number;
  /** Coins to clear whichever hazard is present, if any. */
  hazardCost: number;
  staffRoleId: string | null;
  staffAssigned: boolean;
  /** Grade of whoever works here, when anyone does. */
  staffGradeId: string | null;
  sellRefund: number;
  /** Null when STORE_ROOM would be accepted; otherwise the reason it would not. */
  storeBlocker: 'roomRequired' | 'roomOccupied' | 'roomHasHazard' | 'roomTooDirty' | null;
  canSell: boolean;
  placed: PlacedDecorView[];
}

/** Everything the room sheet shows when a room is tapped. */
export function roomDetail(state: GameState, roomId: string): RoomDetail | null {
  const room = state.hotel.rooms.find((r) => r.id === roomId);
  const def = room ? roomDefOf(room.defId) : undefined;
  if (!room || !def) return null;

  const hazard = room.hasFire ? 'fire' : room.hasPest ? 'pest' : null;
  const hazardDef = hazard ? D().events.find((e) => e.id === hazard) : undefined;

  // Selling the room pays for the room. Its decor is returned to the player
  // rather than liquidated, so adding the decor's value here promised coins
  // that no longer arrive — and used to promise coins for gem-priced pieces.
  const refund = Math.round(def.cost.amount * D().economy.sellback.ratio);
  const placed: PlacedDecorView[] = room.decor.map((p) => {
    const item = D().decor.find((x) => x.id === p.defId);
    const value = item ? sellValue(D(), item) : null;
    const itemRefund = value && value.currency === 'coins' ? value.amount : 0;
    return {
      id: p.id,
      defId: p.defId,
      nameKey: item?.nameKey ?? `decor.${p.defId}.name`,
      slot: p.slot,
      decorPoints: item?.decorPoints ?? 0,
      refund: itemRefund,
    };
  });

  const required = def.category === 'functional' && def.required;

  return {
    id: room.id,
    defId: room.defId,
    nameKey: def.nameKey,
    category: def.category,
    fill: decorFill(def, room),
    decorPoints: room.decorPoints,
    decorTarget: def.decorTarget,
    decorSlots: def.decorSlots,
    usedSlots: room.decor.length,
    cleanliness: room.cleanliness,
    hasPest: room.hasPest,
    hasFire: room.hasFire,
    hasGhost: room.hasGhost,
    occupants: room.occupants.length,
    capacity: def.category === 'guest' ? def.beds : def.category === 'commercial' ? def.capacity : 0,
    hazardCost: hazardDef?.clearCost?.amount ?? 0,
    staffRoleId: 'staffRole' in def ? def.staffRole : null,
    staffAssigned: room.staffId !== null,
    staffGradeId: state.staff.find((s) => s.id === room.staffId)?.gradeId ?? null,
    sellRefund: refund,
    // The same question the command asks, so the button never lies.
    canSell: !required && room.occupants.length === 0 && !room.hasFire && !room.hasPest && !room.hasGhost,
    /*
     * Why the room cannot be put away, or null when it can.
     *
     * A boolean told the player nothing: the Store button simply was not
     * there, and no screen said whether that was because somebody was inside,
     * because it was on fire, or because it needed cleaning first.
     */
    storeBlocker: required ? 'roomRequired'
      : room.occupants.length > 0 ? 'roomOccupied'
      : (room.hasFire || room.hasPest || room.hasGhost) ? 'roomHasHazard'
      : room.cleanliness < D().economy.cleanliness.incomeGateThreshold ? 'roomTooDirty'
      : null,
    placed: placed.sort((a, b) => a.slot - b.slot),
  };
}

export interface StaffOption {
  roleId: string;
  nameKey: string;
  hireCost: number;
  wagePerHour: number;
  blocker: Blocker;
}

/** The role this room needs, and whether it can be hired now. */
export function staffOptionFor(state: GameState, roomId: string): StaffOption | null {
  const room = state.hotel.rooms.find((r) => r.id === roomId);
  const def = room ? roomDefOf(room.defId) : undefined;
  if (!room || !def) return null;
  const roleId = 'staffRole' in def ? def.staffRole : null;
  if (!roleId || room.staffId !== null) return null;

  const role = D().staffRoles.find((r) => r.id === roleId);
  if (!role) return null;
  return {
    roleId: role.id,
    nameKey: `staff.${role.id}.name`,
    hireCost: role.hireCost,
    wagePerHour: role.wagePerHour,
    blocker: role.unlockLevel > state.player.level ? 'locked'
      : state.player.coins < role.hireCost ? 'cannotAfford' : null,
  };
}

/** Rooms that need attention now. Drives the alert badge on the HUD. */
export function urgentRooms(state: GameState): Array<{ id: string; issue: 'fire' | 'pest' | 'ghost' | 'unstaffed' | 'dirty' }> {
  const out: Array<{ id: string; issue: 'fire' | 'pest' | 'ghost' | 'unstaffed' | 'dirty' }> = [];
  const gate = D().economy.cleanliness.incomeGateThreshold;
  for (const room of state.hotel.rooms) {
    const def = roomDefOf(room.defId);
    if (!def) continue;
    if (room.hasFire) out.push({ id: room.id, issue: 'fire' });
    else if (room.hasGhost) out.push({ id: room.id, issue: 'ghost' });
    else if (room.hasPest) out.push({ id: room.id, issue: 'pest' });
    else if (room.cleanliness < gate && def.category !== 'functional') out.push({ id: room.id, issue: 'dirty' });
    else if ('staffRole' in def && def.staffRole && !room.staffId) out.push({ id: room.id, issue: 'unstaffed' });
  }
  return out;
}

/** Next plot the player could buy, with why they cannot. */
export interface Expansion {
  id: string;
  blocks: number;
  cost: number;
  blocker: Blocker;
  /** The level the plot asks for, so a locked row can say how far off it is. */
  unlockLevel: number;
  /** The buildable rectangle now, and what it would become. */
  grid: { w: number; h: number };
  currentGrid: { w: number; h: number };
  currentBlocks: number;
}

export function nextExpansion(state: GameState): Expansion | null {
  const current = D().plots.find((p) => p.id === state.hotel.plotId);
  const next = D().plots
    .filter((p) => p.blocks > (current?.blocks ?? 0))
    .sort((a, b) => a.blocks - b.blocks)[0];
  if (!next) return null;
  return {
    id: next.id,
    blocks: next.blocks,
    cost: next.cost,
    unlockLevel: next.unlockLevel,
    grid: { w: next.grid.w, h: next.grid.h },
    currentGrid: { w: current?.grid.w ?? 0, h: current?.grid.h ?? 0 },
    currentBlocks: current?.blocks ?? 0,
    blocker: next.unlockLevel > state.player.level ? 'locked'
      : state.player.coins < next.cost ? 'cannotAfford' : null,
  };
}

// ---------------------------------------------------------------- storage

export interface StoredRoomView {
  id: string;
  defId: string;
  nameKey: string;
  decorCount: number;
  decorPoints: number;
  cleanliness: number;
  blocks: { w: number; h: number };
}

/** Rooms the player has taken down and kept. */
export function storedRoomViews(state: GameState): StoredRoomView[] {
  const data = D();
  const out: StoredRoomView[] = [];
  for (const stored of state.storedRooms) {
    const def = data.rooms.find((r) => r.id === stored.defId);
    if (!def) continue;
    out.push({
      id: stored.id,
      defId: stored.defId,
      nameKey: def.nameKey,
      decorCount: stored.decor.length,
      decorPoints: stored.decorPoints,
      cleanliness: stored.cleanliness,
      blocks: { w: def.blocks.w, h: def.blocks.h },
    });
  }
  return out;
}

/**
 * Would a room of this size fit here?
 *
 * The placement preview asks this on every tap, so it has to be the same
 * question the command will ask — anything else shows a green box over a spot
 * the core then refuses.
 */
export function placementProblem(
  state: GameState,
  defId: string,
  x: number,
  y: number,
  movingRoomId?: string,
): string | null {
  return placementProblemAt(D(), state, defId, x, y, movingRoomId);
}

export function canPlaceAt(
  state: GameState,
  defId: string,
  x: number,
  y: number,
  movingRoomId?: string,
): boolean {
  return placementProblem(state, defId, x, y, movingRoomId) === null;
}

// ---------------------------------------------------------------- upgrades

export interface UpgradeOption {
  id: string;
  nameKey: string;
  descKey: string;
  effect: string;
  owned: number;
  total: number;
  /** Null when every tier is bought. */
  nextCost: number | null;
  /** The multiplier now, and what the next tier would make it. */
  current: number;
  next: number | null;
  blocker: Blocker;
  unlockLevel: number;
}

/**
 * The permanent upgrades, in the order they unlock.
 *
 * These are the endgame: a hundred and twenty simulated days showed a player
 * capped at level 60 by day 56 holding fifty-one million coins with nothing to
 * buy. Everything here is a sink whose price grows with the fortune.
 */
export function upgradeOptions(state: GameState): UpgradeOption[] {
  const data = D();
  return data.upgrades
    .map((def) => {
      const owned = tierOwned(state, def.id);
      const next = nextTier(data, state, def.id);
      const current = owned > 0 ? (def.tiers[owned - 1]?.value ?? 1) : 1;
      let blocker: Blocker = null;
      if (def.unlockLevel > state.player.level) blocker = 'locked';
      else if (!next) blocker = 'alreadyExists';
      else if (state.player.coins < next.cost) blocker = 'cannotAfford';
      return {
        id: def.id,
        nameKey: def.nameKey,
        descKey: def.descKey,
        effect: def.effect,
        owned,
        total: def.tiers.length,
        nextCost: next?.cost ?? null,
        current,
        next: next?.value ?? null,
        blocker,
        unlockLevel: def.unlockLevel,
      };
    })
    .sort((a, b) => a.unlockLevel - b.unlockLevel);
}

/**
 * Whether any upgrade track can ever be bought.
 *
 * DEC #14 parks every track at level 53 in a game capped at 52, so the HUD
 * button opened a panel in which every row was disabled — and, being the
 * fifth button in a row that cannot shrink, it was the one pushed off a
 * 390 px screen. A button that leads nowhere is hidden until the data says
 * otherwise; the level cap is read from the data, never assumed.
 */
export function upgradesReachable(state: GameState): boolean {
  void state;
  const data = D();
  const cap = data.levels.reduce((max, l) => Math.max(max, l.level), 0);
  return data.upgrades.some((u) => u.unlockLevel <= cap);
}

/** Everything poured into permanent upgrades so far. */
export function upgradeInvestment(state: GameState): number {
  return totalInvested(D(), state);
}

// ---------------------------------------------------------------- live ops

export interface ShopSlot extends ShopOffer {
  nameKey: string;
  decorPoints: number;
  taken: boolean;
  affordable: boolean;
  /** Unplaced copies the player already holds. */
  owned: number;
}

/** This week's shelf, with everything a row needs to render. */
export function shopSlots(state: GameState, epochMs: number): ShopSlot[] {
  const data = D();
  const period = shopPeriod(data, epochMs);
  return shopOffers(data, state, epochMs).map((offer) => {
    const item = data.decor.find((d) => d.id === offer.defId);
    return {
      ...offer,
      nameKey: item?.nameKey ?? `decor.${offer.defId}.name`,
      decorPoints: item?.decorPoints ?? 0,
      taken: isOfferTaken(state, period, offer.defId),
      owned: ownedCount(state, offer.defId),
      affordable: offer.currency === 'coins'
        ? state.player.coins >= offer.price
        : state.player.gems >= offer.price,
    };
  });
}

export function shopRefreshIn(epochMs: number): number {
  return msUntilShopRefresh(D(), epochMs);
}

export interface SeasonBanner {
  id: string;
  nameKey: string;
  descKey: string;
  incomeMultiplier: number;
  arrivalMultiplier: number;
  daysLeft: number;
}

/** The event running now, or null. Drives the banner. */
export function seasonBanner(epochMs: number): SeasonBanner | null {
  const data = D();
  const season = activeSeason(data, epochMs);
  if (!season) return null;
  return {
    id: season.id,
    nameKey: season.nameKey,
    descKey: season.descKey,
    incomeMultiplier: season.incomeMultiplier,
    arrivalMultiplier: season.arrivalMultiplier,
    daysLeft: seasonDaysLeft(data, epochMs),
  };
}

// ---------------------------------------------------------------- the phone

export interface PhoneView {
  /** Haunted rooms right now. */
  haunted: number;
  ghostFee: number;
  climate: { eventId: string; nameKey: string; msLeft: number; fee: number } | null;
}

/** 4C: what the phone can do about the hotel right now. */
export function phoneView(state: GameState): PhoneView {
  const data = D();
  const ghost = data.events.find((e) => e.id === 'ghost');
  const haunted = state.hotel.rooms.filter((r) => r.hasGhost).length;
  const tps = data.economy.simulation.ticksPerSecond;
  let climate: PhoneView['climate'] = null;
  if (state.climate && state.tick < state.climate.untilTick) {
    const def = data.events.find((e) => e.id === state.climate!.eventId);
    climate = {
      eventId: state.climate.eventId,
      nameKey: def?.nameKey ?? '',
      msLeft: Math.round(((state.climate.untilTick - state.tick) / tps) * 1000),
      fee: def?.clearCost?.amount ?? 0,
    };
  }
  return { haunted, ghostFee: ghost?.clearCost?.amount ?? 0, climate };
}

/** Today's gift, and whether it is waiting. */
export function dailyGift(state: GameState, epochMs: number) {
  return giftState(D(), state, epochMs);
}

// ---------------------------------------------------------------- the city

export interface CityView {
  hotels: Neighbour[];
  rank: number;
  of: number;
  visitsLeft: number;
  rewardCoins: number;
}

/** The city as it stands, and where the player sits in it. */
export function cityView(state: GameState, epochMs: number): CityView {
  const data = D();
  const standing = cityRank(data, state, epochMs);
  return {
    hotels: neighbours(data, state, epochMs),
    rank: standing.rank,
    of: standing.of,
    visitsLeft: visitsLeft(data, state, epochMs),
    rewardCoins: tierFor(data, state.hotel.stars).dailyBonusCoins,
  };
}


// ---------------------------------------------------------------- store

export interface StoredDecor {
  defId: string;
  nameKey: string;
  assetKey: string;
  count: number;
  decorPoints: number;
  /** What selling one pays, or null when it cannot be sold back. */
  refund: { currency: 'coins' | 'gems'; amount: number } | null;
}

/**
 * Everything the player owns and has not placed.
 *
 * Until Phase 2 there was nowhere for an unplaced item to exist, so the shop
 * charged for goods it never delivered. This is the read side of that store.
 */
export function storedDecor(state: GameState): StoredDecor[] {
  const data = D();
  const rows: StoredDecor[] = [];
  for (const [defId, count] of Object.entries(state.ownedDecor)) {
    const def = data.decor.find((d) => d.id === defId);
    if (!def || count <= 0) continue;
    rows.push({
      defId,
      nameKey: def.nameKey,
      assetKey: def.assetKey,
      count,
      decorPoints: def.decorPoints,
      refund: sellValue(data, def),
    });
  }
  return rows.sort((a, b) => b.decorPoints - a.decorPoints);
}


// ---------------------------------------------------------------- reputation

export interface ReputationView {
  score: number;
  reviews: number;
  /** Desires the hotel failed to meet, worst first. An investment signal. */
  unmet: Array<{ tag: string; count: number }>;
}

/**
 * What guests think, and what they wanted and did not get.
 *
 * The unmet list is the point of the whole satisfaction model from the
 * player's side: it turns "a guest looked sad" into "eleven people wanted a
 * gym this week", which is a reason to build one.
 */
export function reputationView(state: GameState): ReputationView {
  const unmet = Object.entries(state.unmetDesires)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
  return { score: state.reputation.score, reviews: state.reputation.reviews.length, unmet };
}
