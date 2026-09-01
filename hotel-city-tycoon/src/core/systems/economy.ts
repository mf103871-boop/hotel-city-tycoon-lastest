/**
 * Money in, money out. Every price the player pays passes through here so that
 * "can I afford this" is answered in exactly one place.
 */
import type { SimData, Price } from '../data-source.ts';
import { isFunctionalRoom, shiftDef, roomById, roomDef } from '../data-source.ts';
import type { GameState, ShiftPhase } from '../state/types.ts';
import { upgradeMultiplier } from './upgrades.ts';

export function canAfford(state: GameState, price: Price): boolean {
  return price.currency === 'coins'
    ? state.player.coins >= price.amount
    : state.player.gems >= price.amount;
}

/**
 * Where money comes from and where it goes.
 *
 * Every coin that enters or leaves is tagged. Without this the only figures
 * were `coinsEarned` and `coinsSpent`, two running totals that could not
 * answer the question the whole of Phase 6 turns on: is the hotel profitable,
 * or is the player living on gifts and objectives?
 *
 * `operating` marks the flows that are the hotel doing its job. Everything
 * else is a reward, a purchase, or an investment.
 */
export type LedgerKey =
  // --- sources
  | 'roomRevenue' | 'amenityRevenue' | 'tips'
  | 'giftReward' | 'objectiveReward' | 'eventReward' | 'socialReward'
  | 'decorSellback' | 'roomSellback' | 'starBonus'
  // --- sinks
  | 'shiftCost' | 'wages' | 'upkeep' | 'roomBuild' | 'decorBuy' | 'hazardRepair'
  | 'upgrade' | 'plotExpansion' | 'staffHire' | 'shopPurchase';

/** Which flows are the hotel operating, as opposed to being given things. */
export const OPERATING: ReadonlySet<LedgerKey> = new Set<LedgerKey>([
  'roomRevenue', 'amenityRevenue', 'tips',
  'shiftCost', 'wages', 'upkeep', 'hazardRepair',
]);

function record(state: GameState, key: LedgerKey, coins: number): void {
  if (coins === 0) return;
  state.ledger[key] = (state.ledger[key] ?? 0) + coins;
}

export function pay(state: GameState, price: Price, key: LedgerKey = 'decorBuy'): void {
  if (price.currency === 'coins') {
    state.player.coins -= price.amount;
    state.stats.coinsSpent += price.amount;
    record(state, key, -price.amount);
  } else {
    state.player.gems -= price.amount;
  }
}

export function earn(state: GameState, coins: number, key: LedgerKey = 'roomRevenue'): void {
  if (coins <= 0) return;
  state.player.coins += coins;
  state.stats.coinsEarned += coins;
  record(state, key, coins);
}

/** Coins out for something that is not a `Price`. */
export function spend(state: GameState, coins: number, key: LedgerKey): void {
  if (coins <= 0) return;
  state.player.coins -= coins;
  state.stats.coinsSpent += coins;
  record(state, key, -coins);
}

/**
 * Profit from running the hotel, with rewards excluded.
 *
 * The number that says whether the business works. A hotel can look rich on
 * gifts and objectives while losing money on every guest, and until now
 * nothing in the game could tell the difference.
 */
export function operatingProfit(state: GameState): number {
  let total = 0;
  for (const [key, value] of Object.entries(state.ledger)) {
    if (OPERATING.has(key as LedgerKey)) total += value;
  }
  return total;
}

/** Everything, including what the player was given. */
export function netProfit(state: GameState): number {
  let total = 0;
  for (const value of Object.values(state.ledger)) total += value;
  return total;
}

/** Discount on staff wages granted by staff rooms. */
export function wageMultiplier(data: SimData, state: GameState): number {
  let mult = 1;
  const stacks: Record<string, number> = {};
  for (const room of state.hotel.rooms) {
    const def = roomById(data, room.defId);
    if (!def || !isFunctionalRoom(def) || def.function.kind !== 'wageDiscount') continue;
    const max = Number(def.function.stacksMax ?? 1);
    stacks[def.id] = (stacks[def.id] ?? 0) + 1;
    if ((stacks[def.id] ?? 0) > max) continue;
    mult *= Number(def.function.wageMultiplier ?? 1);
  }
  return mult * upgradeMultiplier(data, state, 'wageDiscount');
}

/** Base price of a shift at the player's current level. */
export function shiftPrice(data: SimData, state: GameState, shiftId: string): number {
  const def = shiftDef(data, shiftId);
  const { perLevel } = data.economy.shiftCostScaling;
  return Math.round(def.baseCost * (1 + perLevel * (state.player.level - 1)));
}

/** Wages owed for one shift, for every filled staff slot. */
export function shiftWages(data: SimData, state: GameState, shiftId: string): number {
  const def = shiftDef(data, shiftId);
  const hours = def.durationSec / 3600;
  const mult = wageMultiplier(data, state);
  let total = 0;
  // 4A (decisions 10a/12a): the wage walks the ROOMS, not the payroll. A
  // staffed slot costs the permanent wage (zero, so the shift price is the
  // original table); an unstaffed slot is covered by the original's dearer
  // TEMP worker at the role's tempWagePerHour. Hiring is what removes it.
  for (const room of state.hotel.rooms) {
    const def = roomDef(data, room.defId);
    if (!def || !('staffSlots' in def) || !def.staffSlots) continue;
    const roleId = 'staffRole' in def ? def.staffRole : null;
    if (!roleId) continue;
    const role = data.staffRoles.find((r) => r.id === roleId);
    if (!role) continue;
    if (room.staffId) {
      const staff = state.staff.find((m) => m.id === room.staffId);
      const grade = data.staffGrades.find((g) => g.id === staff?.gradeId);
      total += role.wagePerHour * hours * (grade?.wageMultiplier ?? 1);
    } else {
      total += role.tempWagePerHour * hours;
    }
  }
  return Math.round(total * mult);
}

/**
 * What it costs to keep the rooms open for one shift.
 *
 * The hotel used to run at a 93% operating margin — wages and a token shift fee
 * against everything the guests paid — so no operating decision had a downside
 * and a hotel could not lose money. Upkeep scales with how much hotel there is
 * and with how good it is: a suite costs more to keep than a bunk.
 */
export function shiftUpkeep(data: SimData, state: GameState, shiftId: string): number {
  const def = shiftDef(data, shiftId);
  const hours = def.durationSec / 3600;
  const { perRoomPerHour, tierMultiplier } = data.economy.upkeep;
  let total = 0;
  for (const room of state.hotel.rooms) {
    const rdef = roomById(data, room.defId);
    if (!rdef || isFunctionalRoom(rdef)) continue;
    const tier = 'tier' in rdef ? rdef.tier : 1;
    total += perRoomPerHour * hours * (1 + tierMultiplier * (tier - 1));
  }
  return Math.round(total);
}

/** Income per guest while this shift runs. Short shifts pay more. */
export function shiftIncomeMultiplier(data: SimData, state: GameState): number {
  if (state.shift.activeShiftId === null) return 1;
  const def = data.shifts.find((s) => s.id === state.shift.activeShiftId);
  return def?.incomeMultiplier ?? 1;
}

/** Everything the player pays to open the hotel for one shift. */
export function totalShiftCost(data: SimData, state: GameState, shiftId: string): number {
  return shiftPrice(data, state, shiftId)
    + shiftWages(data, state, shiftId)
    + shiftUpkeep(data, state, shiftId);
}

/**
 * Which of the three phases the hotel is in.
 *
 * One function, used by the live loop and the offline resolver alike. The two
 * used to answer this question differently — the tick loop kept checking
 * guests in after `endsAtTick`, the resolver stopped at it — so the same
 * absence paid differently depending on whether the app was open.
 */
export function shiftPhase(state: GameState): ShiftPhase {
  if (state.shift.activeShiftId === null) return 'closed';
  if (state.tick < state.shift.endsAtTick) return 'active';
  if (state.tick < state.shift.graceEndsAtTick) return 'grace';
  return 'closed';
}

/** Taking arrivals, checking guests in, starting services, cleaning. */
export function isOpen(state: GameState): boolean {
  return shiftPhase(state) === 'active';
}

/**
 * Finishing what was already started, and nothing more.
 *
 * A guest who was checked in before the shift ended keeps their stay; nobody
 * new arrives, checks in, or begins an amenity.
 */
export function isGrace(state: GameState): boolean {
  return shiftPhase(state) === 'grace';
}

/** Income can still be paid: the guest was accepted while the hotel was open. */
export function isEarning(state: GameState): boolean {
  const phase = shiftPhase(state);
  return phase === 'active' || phase === 'grace';
}
