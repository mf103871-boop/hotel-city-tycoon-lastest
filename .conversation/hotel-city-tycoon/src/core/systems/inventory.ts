/**
 * Decor ownership.
 *
 * The one place `state.ownedDecor` is read or written. Every count change goes
 * through `grant` or `consume`, so there is a single answer to "how did the
 * player come to own this" and a single invariant to hold: counts are whole
 * numbers above zero, and a count that reaches zero leaves the record rather
 * than sitting there as a zero.
 *
 * Before this existed, buying from the shop deducted coins or gems, wrote
 * `shopTaken[period:defId] = true`, and stopped. There was nowhere for the item
 * to go. `PLACE_DECOR` charged full price every time regardless, so a shop
 * purchase was a donation.
 */
import type { SimData, DecorDef } from '../data-source.ts';
import type { GameState } from '../state/types.ts';

/** How many unplaced copies of this item the player owns. */
export function owned(state: GameState, defId: string): number {
  return state.ownedDecor[defId] ?? 0;
}

/** Total unplaced items, across every definition. */
export function ownedTotal(state: GameState): number {
  let total = 0;
  for (const count of Object.values(state.ownedDecor)) total += count;
  return total;
}

/** Add `n` copies to the store. */
export function grant(state: GameState, defId: string, n = 1): void {
  if (n <= 0) return;
  state.ownedDecor[defId] = owned(state, defId) + n;
}

/**
 * Take one copy out of the store.
 *
 * Returns false and changes nothing when the player does not own one — the
 * caller decides whether that is a rejection or a reason to charge them.
 */
export function consume(state: GameState, defId: string, n = 1): boolean {
  const have = owned(state, defId);
  if (have < n) return false;
  const left = have - n;
  if (left === 0) delete state.ownedDecor[defId];
  else state.ownedDecor[defId] = left;
  return true;
}

/**
 * What selling one copy pays, and in what.
 *
 * `refundCurrency` and `gemPurchasesRefundable` have been in the data since P1
 * and nothing read either. The policy they describe: refunds are paid in
 * `refundCurrency` at `ratio`, and an item priced in gems is not refundable at
 * all unless `gemPurchasesRefundable` says otherwise — because paying coins for
 * a gem purchase is a laundering route out of the premium currency.
 */
export function sellValue(
  data: SimData,
  def: DecorDef,
): { currency: 'coins' | 'gems'; amount: number } | null {
  if (!def.sellable) return null;
  const sellback = data.economy.sellback;
  if (def.cost.currency === 'gems' && !sellback.gemPurchasesRefundable) return null;

  // A gem item, when refundable, is refunded in gems. Anything else follows
  // the configured refund currency.
  const currency = def.cost.currency === 'gems' ? 'gems' : sellback.refundCurrency;
  const amount = Math.round(def.cost.amount * sellback.ratio);
  if (amount <= 0) return null;
  return { currency, amount };
}
