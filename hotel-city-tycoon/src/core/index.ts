/**
 * Public surface of the simulation.
 *
 * Everything outside src/core talks to the game through this file and nothing
 * else. Keeping the surface small is what makes it possible to move this whole
 * directory to a server later without touching a line.
 */
export type {
  GameState, RoomInstance, GuestInstance, StaffInstance,
  PlacedDecor, PlayerState, HotelState, ShiftState, RunStats,
  SimEvent, StepResult,
} from './state/types.ts';
export { SCHEMA_VERSION } from './state/types.ts';

export type { Command, CommandResult, RejectReason } from './commands/index.ts';
export { execute, executeAll, isBuildable } from './commands/index.ts';

export { createInitialState, usedBlocks, totalBeds } from './state/init.ts';
export {
  footprintOf, overlaps, contains, plotBounds, checkPlacement,
  findFreeSpot, occupancyMap, freeBlocks, roomAt,
} from './state/grid.ts';
export type { Rect, PlacementProblem } from './state/grid.ts';
export type { NewGameOptions } from './state/init.ts';

export { advance, ticksForMs } from './sim/tick.ts';
export { resolveOffline } from './sim/offline.ts';
export type { OfflineResult } from './sim/offline.ts';

export { Rng, STREAMS, createCursors } from './rng/index.ts';
export type { RngCursors, StreamName } from './rng/index.ts';

export type * from './data-source.ts';
export {
  roomDef, decorDef, shiftDef, catalogueFor, catalogueIndex,
  isGuestRoom, isCommercialRoom, isFunctionalRoom,
} from './data-source.ts';

// selectors the UI needs
export { decorFill, decorMultiplier, averageDecorFill } from './systems/decor.ts';
export { cleaningCapacity, cleaningCoverage, averageCleanliness, incomeBlocked } from './systems/cleanliness.ts';
export { computeStars, effectiveStars, tierFor, incomeMultiplier, arrivalMultiplier } from './systems/stars.ts';
export { levelForXp, xpForLevel, levelProgress, isUnlocked } from './systems/progression.ts';
export { canAfford, shiftPrice, shiftWages, totalShiftCost, isOpen, wageMultiplier } from './systems/economy.ts';
export { arrivalsPerMinute, arrivalBoost, checkoutPayout } from './systems/guests.ts';
export { clearReward, fireChanceMultiplier } from './systems/events.ts';
export { tierOwned, upgradeMultiplier, nextTier, isUpgradeUnlocked, totalInvested } from './systems/upgrades.ts';
export {
  shopOffers, shopPeriod, msUntilShopRefresh, isOfferTaken,
  activeSeason, seasonIncomeMultiplier, seasonArrivalMultiplier, seasonDaysLeft,
  giftState,
} from './systems/liveops.ts';
export type { ShopOffer, GiftState } from './systems/liveops.ts';
export { neighbours, cityRank, visitsLeft, canVisit } from './systems/neighbours.ts';
export type { Neighbour } from './systems/neighbours.ts';
