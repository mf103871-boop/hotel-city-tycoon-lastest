/**
 * Star rating.
 *
 * The hotel holds the highest tier whose requirements it fully meets. Stars
 * multiply both income and guest arrival rate, so they are the main
 * compounding loop: decorate -> more stars -> more guests paying more -> more
 * money to decorate.
 */
import type { SimData, StarTier } from '../data-source.ts';

import type { GameState } from '../state/types.ts';
import { roomById } from '../data-source.ts';
import { hotelScore } from './quality.ts';
import { averageDecorFill } from './decor.ts';
import { averageCleanliness } from './cleanliness.ts';

/**
 * The rating a satisfied inspector temporarily lifts the hotel to.
 *
 * Applied on top of the earned rating and capped at five, so a boost is worth
 * having but cannot manufacture a five-star hotel out of a filthy one.
 */
export function effectiveStars(data: SimData, state: GameState): number {
  const earned = computeStars(data, state);
  if (state.starBoost.amount <= 0 || state.tick >= state.starBoost.untilTick) return earned;
  const top = data.starTiers[data.starTiers.length - 1]?.stars ?? 5;
  return Math.min(top, earned + state.starBoost.amount);
}

export function computeStars(data: SimData, state: GameState): number {
  /*
   * The rating is the score, banded.
   *
   * It used to be four independent gates, each satisfiable by repetition:
   * twenty copies of the cheapest wallpaper filled the decor meter, and six
   * cafes counted as six commercial rooms while serving one desire between
   * them. Five stars was a shopping list. The score cannot be gamed that way
   * because repeats have diminishing returns and coverage counts distinct
   * desires, and every component of it can be shown to the player.
   */
  const t = data.stars.score.thresholds;
  const score = hotelScore(data, state).total;
  const banded = score >= t.five ? 5 : score >= t.four ? 4 : score >= t.three ? 3 : score >= t.two ? 2 : 1;
  // The tier minimums survive as a structural floor rather than being deleted.
  // A beautifully furnished two-room hotel is not a five-star hotel, and the
  // counts in stars.json are the only thing that says so.
  return Math.min(banded, structuralCeiling(data, state));
}

/**
 * The highest tier whose structural minimums the hotel actually meets.
 *
 * Size and breadth, not quality: guest rooms, commercial rooms, cleanliness
 * and decor fill. These were the whole rating before; they are now a ceiling
 * on it, because they are the part repetition cannot fake — you really do need
 * twenty rooms.
 */
export function structuralCeiling(data: SimData, state: GameState): number {
  const decorFillAvg = averageDecorFill(data, state.hotel.rooms);
  const cleanliness = averageCleanliness(data, state);
  let guestRooms = 0;
  let commercialRooms = 0;
  for (const room of state.hotel.rooms) {
    const def = roomById(data, room.defId);
    if (!def) continue;
    if (def.category === 'guest') guestRooms++;
    else if (def.category === 'commercial') commercialRooms++;
  }
  let best = data.starTiers[0]?.stars ?? 1;
  for (const tier of data.starTiers) {
    const meets =
      decorFillAvg >= tier.minAvgDecorFill &&
      cleanliness >= tier.minCleanliness &&
      guestRooms >= tier.minGuestRooms &&
      commercialRooms >= tier.minCommercialRooms;
    if (meets) best = tier.stars;
  }
  return best;
}

export function tierFor(data: SimData, stars: number): StarTier {
  // A boost can land between tiers; take the best whole tier at or below it.
  const whole = Math.floor(stars);
  const tier = data.starTiers.find((t) => t.stars === whole) ?? data.starTiers[0];
  if (!tier) throw new Error('No star tiers defined');
  return tier;
}

/**
 * Interpolate a tier multiplier across a fractional rating.
 *
 * The inspector's reward is +0.5 stars. Both multipliers went through
 * `tierFor`, which floors — so 3 + 0.5 read as 3, and the reward changed
 * nothing at all: not income, not arrivals. A satisfied inspector paid out in
 * a currency the game did not accept.
 */
function interpolate(data: SimData, stars: number, pick: (t: StarTier) => number): number {
  const lowStars = Math.floor(stars);
  const low = pick(tierFor(data, lowStars));
  const frac = stars - lowStars;
  if (frac <= 0) return low;
  const top = data.starTiers[data.starTiers.length - 1]?.stars ?? 5;
  if (lowStars >= top) return low;
  const high = pick(tierFor(data, lowStars + 1));
  return low + (high - low) * frac;
}

export function incomeMultiplier(data: SimData, stars: number): number {
  return interpolate(data, stars, (t) => t.incomeMultiplier);
}

export function arrivalMultiplier(data: SimData, stars: number): number {
  return interpolate(data, stars, (t) => t.arrivalMultiplier);
}
