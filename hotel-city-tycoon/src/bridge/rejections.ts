/**
 * Turning a refusal into a sentence.
 *
 * Twenty-six of the twenty-nine reasons a command can refuse never reached the
 * player: they tapped, nothing happened, and no message explained why. That is
 * worse than a visible bug, because a bug at least looks like a bug.
 *
 * Every reason is mapped here, and a test proves none is missed — so adding a
 * rejection to the core forces a wording for it.
 */
import type { RejectReason } from '../core/commands/index.ts';

/** i18n key for every way a command can say no. */
export const REJECTION_KEY: Record<RejectReason, string> = {
  hotelClosed: 'reject.hotelClosed',
  unknownStaff: 'reject.unknownStaff',
  roomHasHazard: 'reject.roomHasHazard',
  roomTooDirty: 'reject.roomTooDirty',
  roomRequired: 'reject.roomRequired',
  notStored: 'reject.notStored',
  notNextPlot: 'reject.notNextPlot',
  slotIncompatible: 'reject.slotIncompatible',
  sameDecor: 'reject.sameDecor',
  alreadyPlaced: 'reject.alreadyPlaced',
  sameSpot: 'reject.sameSpot',
  storageFull: 'reject.storageFull',
  notOwned: 'reject.notOwned',
  notRefundable: 'reject.notRefundable',
  noReceptionist: 'reject.noReceptionist',
  unknownCommand: 'reject.unknownCommand',
  dragOnCooldown: 'reject.dragOnCooldown',

  unknownRoom: 'reject.unknownRoom',
  unknownDecor: 'reject.unknownDecor',
  unknownShift: 'reject.unknownShift',
  unknownPlot: 'reject.unknownPlot',
  unknownGuest: 'reject.unknownGuest',
  unknownObjective: 'reject.unknownObjective',

  notUnlocked: 'reject.notUnlocked',
  cannotAfford: 'reject.cannotAfford',
  noSpace: 'reject.noSpace',
  outOfBounds: 'reject.outOfBounds',
  overlaps: 'reject.overlaps',
  alreadyExists: 'reject.alreadyExists',
  plotTooSmall: 'reject.plotTooSmall',

  slotTaken: 'reject.slotTaken',
  slotFilled: 'reject.slotFilled',
  roomLimitReached: 'reject.roomLimitReached',
  decorLimitReached: 'reject.decorLimitReached',

  alreadyOpen: 'reject.alreadyOpen',
  noSuchHazard: 'reject.noSuchHazard',
  roomOccupied: 'reject.roomOccupied',
  roleMismatch: 'reject.roleMismatch',
  invalidName: 'reject.invalidName',

  guestNotDraggable: 'reject.guestNotDraggable',
  queueFull: 'reject.queueFull',
  dragDisabled: 'reject.dragDisabled',
  guestNotResting: 'reject.guestNotResting',
  alreadyRevealed: 'reject.alreadyRevealed',

  unknownUpgrade: 'reject.unknownUpgrade',
  fullyUpgraded: 'reject.fullyUpgraded',

  unknownNeighbour: 'reject.unknownNeighbour',
  alreadyVisited: 'reject.alreadyVisited',
  noVisitsLeft: 'reject.noVisitsLeft',

  offerExpired: 'reject.offerExpired',
  offerTaken: 'reject.offerTaken',
  giftNotReady: 'reject.giftNotReady',
  nothingToFix: 'reject.nothingToFix',

  notComplete: 'reject.notComplete',
  alreadyClaimed: 'reject.alreadyClaimed',
};

/**
 * Reasons the player never needs to see.
 *
 * These only occur when the interface asks for something that does not exist,
 * which is a programming error rather than a decision the player made. They
 * still have wording, because a silent failure is worse than an odd sentence.
 */
export const INTERNAL: ReadonlySet<RejectReason> = new Set([
  'unknownRoom', 'unknownDecor', 'unknownShift', 'unknownPlot',
  'unknownGuest', 'unknownObjective', 'unknownUpgrade', 'unknownNeighbour', 'roleMismatch',
]);

export function rejectionKey(reason: RejectReason): string {
  return REJECTION_KEY[reason] ?? 'reject.generic';
}

/** True when this refusal is worth interrupting the player about. */
export function worthShowing(reason: RejectReason): boolean {
  return !INTERNAL.has(reason);
}
