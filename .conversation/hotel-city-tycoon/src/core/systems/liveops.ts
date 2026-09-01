/**
 * The rotating shop, the seasonal calendar, and the daily gift.
 *
 * These are the three things P6 promised and never delivered, and they are the
 * last mechanics separating this from the game it is modelled on. The original
 * refreshed its catalogue weekly, ran synchronised seasonal events with
 * exclusive items, and handed out free gifts every day — and those three
 * together were most of why anybody opened it on a schedule.
 *
 * Everything here is a pure function of the save's seed and the clock. Nothing
 * is stored except what the player has taken, so the shop is identical on
 * every device, after every reload, and inside every test.
 */
import type { SimData, SeasonDef } from '../data-source.ts';
import type { GameState } from '../state/types.ts';
import { Rng, mulberry32 } from '../rng/index.ts';
import { tierFor } from './stars.ts';

// ---------------------------------------------------------------- shop

export interface ShopOffer {
  /** Points at decor.json items[]. */
  defId: string;
  /** What it normally costs. */
  fullPrice: number;
  /** What it costs this week. */
  price: number;
  /** 0..1 */
  discount: number;
  /** One slot a week is a showpiece at a steep cut. */
  featured: boolean;
  currency: 'coins' | 'gems';
}

/**
 * Which refresh period a moment falls in.
 *
 * Derived from wall-clock rather than tick count so the shop turns over on a
 * calendar week whether the player was here for it or not — coming back after
 * a fortnight should not present a fortnight-old catalogue.
 */
export function shopPeriod(data: SimData, epochMs: number): number {
  return Math.floor(epochMs / (data.shop.refreshHours * 3600 * 1000));
}

/** Milliseconds until the catalogue turns over. */
export function msUntilShopRefresh(data: SimData, epochMs: number): number {
  const span = data.shop.refreshHours * 3600 * 1000;
  return span - (epochMs % span);
}

/**
 * This period's offers.
 *
 * Seeded on the save's seed combined with the period, so the same week always
 * produces the same shelf and a test can assert on it. Items above the
 * player's level are excluded: a discount on something unbuyable is an advert,
 * not an offer.
 */
export function shopOffers(data: SimData, state: GameState, epochMs: number): ShopOffer[] {
  const period = shopPeriod(data, epochMs);
  const rng = new Rng(state.seed + period * 7919, {
    guestSpawn: 0, guestType: 0, guestDesire: 0, roomPick: 0, events: 0, staffGrade: 0, poke: 0,
  });

  const eligible = data.decor.filter((item) => item.unlockLevel <= state.player.level);
  if (eligible.length === 0) return [];

  const season = activeSeason(data, epochMs);
  const seasonCut = season?.decorDiscount ?? 0;

  const picked: typeof eligible = [];
  const seen = new Set<string>();
  // Draw without replacement so a slot is never the same item twice.
  for (let attempt = 0; attempt < eligible.length * 4 && picked.length < data.shop.slots; attempt++) {
    const item = rng.pick('events', eligible);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    picked.push(item);
  }

  const { min, max } = data.shop.discount;
  return picked.map((item, index) => {
    const featured = index === 0;
    const base = featured
      ? data.shop.featured.discount
      : min + rng.next('events') * (max - min);
    // A season stacks on top, but the price can never reach zero.
    const discount = Math.min(0.85, base + seasonCut);
    return {
      defId: item.id,
      fullPrice: item.cost.amount,
      price: Math.max(1, Math.round(item.cost.amount * (1 - discount))),
      discount,
      featured,
      currency: item.cost.currency,
    };
  });
}

/** Offers this player has already taken this period. */
export function isOfferTaken(state: GameState, period: number, defId: string): boolean {
  return state.shopTaken[`${period}:${defId}`] === true;
}

// ---------------------------------------------------------------- seasons

/**
 * Day of the year as `MM-DD`, in UTC.
 *
 * Computed arithmetically rather than through `new Date`. The core is not
 * allowed to construct a Date — the lint rule exists because a Date is the
 * usual way an ambient clock or a local timezone leaks into a simulation that
 * has to replay identically everywhere. The result is byte-identical to the
 * `getUTCMonth`/`getUTCDate` pair this replaced.
 */
function monthDay(epochMs: number): string {
  // Days since the Unix epoch, floored so pre-1970 timestamps stay correct.
  const days = Math.floor(epochMs / 86_400_000);
  // Civil-from-days, shifted to an era beginning on 0000-03-01 so that the
  // leap day lands at the end of the year and needs no special case.
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The event running now, if any.
 *
 * Ranges are month and day so an event recurs every year with nobody editing
 * data. A range may wrap the new year, which is why the comparison is not a
 * simple between.
 */
export function activeSeason(data: SimData, epochMs: number): SeasonDef | null {
  const today = monthDay(epochMs);
  for (const season of data.seasons) {
    const wraps = season.from > season.to;
    const inside = wraps
      ? today >= season.from || today <= season.to
      : today >= season.from && today <= season.to;
    if (inside) return season;
  }
  return null;
}

export function seasonIncomeMultiplier(data: SimData, epochMs: number): number {
  return activeSeason(data, epochMs)?.incomeMultiplier ?? 1;
}

export function seasonArrivalMultiplier(data: SimData, epochMs: number): number {
  return activeSeason(data, epochMs)?.arrivalMultiplier ?? 1;
}

/** Days remaining in the running event, for the banner. */
export function seasonDaysLeft(data: SimData, epochMs: number): number {
  const season = activeSeason(data, epochMs);
  if (!season) return 0;
  for (let day = 0; day <= 60; day++) {
    if (!activeSeason(data, epochMs + day * 86_400_000)) return day;
  }
  return 60;
}

// ---------------------------------------------------------------- daily gift

export interface GiftState {
  /** The home money bag this claim pays: the star-tier value, 400..430. */
  bagCoins: number;
  /** True when it can be taken right now. */
  available: boolean;
  /** Milliseconds until the next one, when it cannot. */
  msUntilNext: number;
  /** This week's free catalogue item — the same for everyone. */
  itemDefId: string;
  /** True when this claim will also hand the item over. */
  itemIsNew: boolean;
}

/**
 * Which gift period a moment falls in.
 *
 * Driven by `gifts.resetHours`, which the data has declared since P1 while the
 * code assumed 24 regardless. They agree today; they would not have if anyone
 * had edited the field.
 */
function dayIndex(data: SimData, epochMs: number): number {
  const periodMs = Math.max(1, data.gifts.resetHours) * 3_600_000;
  return Math.floor(epochMs / periodMs);
}

/**
 * The gift waiting today.
 *
 * The streak advances on consecutive days and resets after a gap, which is
 * 4B, decision 15a: one daily claim, no streak. The payload is the home
 * money bag (star bonus) plus, on a new week, the free catalogue item.
 */
export function giftState(data: SimData, state: GameState, epochMs: number): GiftState {
  const today = dayIndex(data, epochMs);
  const available = state.gift.lastClaimedDay < 0 || today > state.gift.lastClaimedDay;
  const nextDayStart = (today + 1) * Math.max(1, data.gifts.resetHours) * 3_600_000;
  return {
    bagCoins: tierFor(data, state.hotel.stars).dailyBonusCoins,
    available,
    msUntilNext: available ? 0 : nextDayStart - epochMs,
    itemDefId: weeklyGiftItem(data, epochMs),
    itemIsNew: weekIndexOf(data, epochMs) > state.gift.lastItemWeek,
  };
}

/** Which free-item week a moment falls in. */
export function weekIndexOf(data: SimData, epochMs: number): number {
  return Math.floor(dayIndex(data, epochMs) / Math.max(1, data.gifts.itemPeriodDays));
}

/**
 * This week's free catalogue item — decision 15a. Deterministic in the week
 * alone, so every hotel sees the same shelf, as the original's weekly
 * catalogue rotated for everyone at once. The pool is every coin decor piece
 * at or under gifts.maxItemCost, so the gift is always placeable early.
 */
export function weeklyGiftItem(data: SimData, epochMs: number): string {
  const pool = data.decor
    .filter((d) => d.cost.currency === 'coins' && d.cost.amount <= data.gifts.maxItemCost)
    .sort((a, b) => a.id.localeCompare(b.id));
  const week = weekIndexOf(data, epochMs);
  const roll = mulberry32(Math.imul(week + 1, 0x9e3779b9) >>> 0);
  return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))]!.id;
}
