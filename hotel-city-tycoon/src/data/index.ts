/**
 * Typed, validated access to the game's balance data.
 *
 * Everything the simulation needs to know about costs, durations, rewards and
 * unlocks comes through here. No other module reads data/*.json directly, and
 * no module anywhere hardcodes a balance number.
 */
import economyRaw from '../../data/economy.json';
import roomsRaw from '../../data/rooms.json';
import shiftsRaw from '../../data/shifts.json';
import starsRaw from '../../data/stars.json';
import guestsRaw from '../../data/guests.json';
import staffRaw from '../../data/staff.json';
import eventsRaw from '../../data/events.json';
import plotsRaw from '../../data/plots.json';
import decorRaw from '../../data/decor.json';
import levelsRaw from '../../data/levels.json';
import objectivesRaw from '../../data/objectives.json';
import upgradesRaw from '../../data/upgrades.json';
import shopRaw from '../../data/shop.json';
import neighboursRaw from '../../data/neighbours.json';
import seasonsRaw from '../../data/seasons.json';
import giftsRaw from '../../data/gifts.json';

import {
  EconomySchema, RoomsSchema, ShiftsSchema, StarsSchema, GuestsSchema,
  StaffSchema, EventsSchema, PlotsSchema, DecorSchema, LevelsSchema, ObjectivesSchema, UpgradesSchema, ShopSchema, SeasonsSchema, GiftsSchema, NeighboursSchema,
  AnimationSchema,
} from './schemas/index.ts';

/**
 * The per-character animation files, one per staff role and guest type.
 *
 * Loaded by glob rather than by name on purpose: the set is defined by
 * `staff.json` and `guests.json` (the integrity validator holds the two in
 * step), so a new character means a new file and nothing to edit here. Sorted
 * so the order is the directory's, not the bundler's.
 */
const animationsRaw = import.meta.glob('../../data/animations/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

/**
 * Parsed once at module load. In dev this throws loudly on malformed data;
 * in production the build already failed at `npm run validate:data`, so this
 * is a belt-and-braces guard rather than the primary defence.
 */
export const GameData = {
  economy: EconomySchema.parse(economyRaw),
  rooms: RoomsSchema.parse(roomsRaw),
  shifts: ShiftsSchema.parse(shiftsRaw),
  stars: StarsSchema.parse(starsRaw),
  guests: GuestsSchema.parse(guestsRaw),
  staff: StaffSchema.parse(staffRaw),
  events: EventsSchema.parse(eventsRaw),
  plots: PlotsSchema.parse(plotsRaw),
  decor: DecorSchema.parse(decorRaw),
  levels: LevelsSchema.parse(levelsRaw),
  objectives: ObjectivesSchema.parse(objectivesRaw),
  upgrades: UpgradesSchema.parse(upgradesRaw),
  shop: ShopSchema.parse(shopRaw),
  neighbours: NeighboursSchema.parse(neighboursRaw),
  seasons: SeasonsSchema.parse(seasonsRaw),
  gifts: GiftsSchema.parse(giftsRaw),
  animations: Object.keys(animationsRaw).sort().map((file) => AnimationSchema.parse(animationsRaw[file])),
} as const;

// ---- lookup tables, built once ---------------------------------------
const byId = <T extends { id: string }>(list: readonly T[]): ReadonlyMap<string, T> =>
  new Map(list.map((item) => [item.id, item]));

export const RoomById = byId(GameData.rooms.rooms);
export const DecorById = byId(GameData.decor.items);
export const StaffRoleById = byId(GameData.staff.roles);
export const GuestTypeById = byId(GameData.guests.types);
export const ShiftById = byId(GameData.shifts.shifts);
export const PlotById = byId(GameData.plots.expansions);
export const EventById = byId(GameData.events.events);
export const AnimationById = byId(GameData.animations);

export const GuestRooms = GameData.rooms.rooms.filter((r) => r.category === 'guest');
export const CommercialRooms = GameData.rooms.rooms.filter((r) => r.category === 'commercial');
export const FunctionalRooms = GameData.rooms.rooms.filter((r) => r.category === 'functional');

/** Cumulative XP required to reach `level`. */
export function xpForLevel(level: number): number {
  const entry = GameData.levels.levels[level - 1];
  if (!entry) throw new Error(`No level entry for level ${level}`);
  return entry.xpTotal;
}

/** The level a given cumulative XP total corresponds to. */
export function levelForXp(xp: number): number {
  const list = GameData.levels.levels;
  let lo = 0;
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (entry && entry.xpTotal <= xp) lo = i;
    else break;
  }
  return lo + 1;
}

/** Shift price at a given player level, per economy.shiftCostScaling. */
export function shiftCost(shiftId: string, level: number): number {
  const shift = ShiftById.get(shiftId);
  if (!shift) throw new Error(`Unknown shift "${shiftId}"`);
  const { perLevel } = GameData.economy.shiftCostScaling;
  return Math.round(shift.baseCost * (1 + perLevel * (level - 1)));
}

/** Everything unlocked exactly at `level`. */
export function unlocksAt(level: number) {
  return GameData.levels.levels[level - 1]?.unlocks ?? [];
}

export type GameDataT = typeof GameData;
