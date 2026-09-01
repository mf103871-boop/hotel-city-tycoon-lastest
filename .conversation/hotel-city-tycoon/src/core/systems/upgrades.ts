/**
 * Permanent hotel upgrades.
 *
 * A hundred and twenty days of simulated play showed a player reaching the
 * level cap around day 56 and then accumulating fifty-one million coins with
 * nothing whatsoever to spend them on: nothing unlocks after level 44 but one
 * plot, and the most expensive decor in the game costs 150,000.
 *
 * These are the sink. Each is bought in tiers, each tier costs several times
 * the last, and the effect is hotel-wide and permanent — so the drain scales
 * with the fortune it is draining.
 */
import type { SimData, UpgradeEffect } from '../data-source.ts';
import type { GameState } from '../state/types.ts';

/** How many tiers of this upgrade the player owns. Zero means none. */
export function tierOwned(state: GameState, upgradeId: string): number {
  return state.upgrades[upgradeId] ?? 0;
}

/**
 * The current multiplier for an effect.
 *
 * Returns 1 when nothing is owned, so every call site can multiply
 * unconditionally rather than branch.
 */
export function upgradeMultiplier(data: SimData, state: GameState, effect: UpgradeEffect): number {
  let mult = 1;
  for (const def of data.upgrades) {
    if (def.effect !== effect) continue;
    const owned = tierOwned(state, def.id);
    if (owned <= 0) continue;
    const tier = def.tiers[owned - 1];
    if (tier) mult *= tier.value;
  }
  return mult;
}

/** The next tier available to buy, or null when the track is finished. */
export function nextTier(
  data: SimData,
  state: GameState,
  upgradeId: string,
): { index: number; cost: number; value: number } | null {
  const def = data.upgrades.find((u) => u.id === upgradeId);
  if (!def) return null;
  const owned = tierOwned(state, upgradeId);
  const tier = def.tiers[owned];
  if (!tier) return null;
  return { index: owned + 1, cost: tier.cost, value: tier.value };
}

export function isUpgradeUnlocked(data: SimData, state: GameState, upgradeId: string): boolean {
  const def = data.upgrades.find((u) => u.id === upgradeId);
  return def ? def.unlockLevel <= state.player.level : false;
}

/** Everything the player has poured into upgrades so far. */
export function totalInvested(data: SimData, state: GameState): number {
  let total = 0;
  for (const def of data.upgrades) {
    for (let i = 0; i < tierOwned(state, def.id); i++) {
      total += def.tiers[i]?.cost ?? 0;
    }
  }
  return total;
}
