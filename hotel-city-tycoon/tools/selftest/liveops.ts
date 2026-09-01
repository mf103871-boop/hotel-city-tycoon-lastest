/**
 * Headless tests for the rotating shop, the seasonal calendar and the daily
 * gift — the three things P6 promised and never built.
 *
 * They are also the last mechanics separating this from the game it copies.
 * The original refreshed its catalogue weekly, ran synchronised seasonal
 * events, and handed out daily gifts, and those three were most of why anybody
 * opened it on a schedule.
 *
 * Run: node --experimental-strip-types tools/selftest/liveops.ts
 */
import fs from 'node:fs';
import { loadSimData } from '../balance-sim/load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { execute } from '../../src/core/commands/index.ts';
import {
  shopOffers, shopPeriod, msUntilShopRefresh, isOfferTaken,
  activeSeason, seasonIncomeMultiplier, seasonDaysLeft, giftState, weekIndexOf,
} from '../../src/core/systems/liveops.ts';
import { migrate } from '../../src/save/index.ts';
import { owned } from '../../src/core/systems/inventory.ts';
import { SCHEMA_VERSION } from '../../src/core/state/types.ts';
import type { GameState } from '../../src/core/state/types.ts';

const data = loadSimData();
let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }

const DAY = 86_400_000;
/** A Tuesday in an ordinary month, clear of every seasonal window. */
const PLAIN = Date.UTC(2026, 4, 12);

function player(level = 30, coins = 5_000_000): GameState {
  const s = createInitialState(data, { seed: 4242, epochMs: PLAIN });
  s.player.level = level;
  s.player.coins = coins;
  return s;
}

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — shop, seasons and daily gift');
console.log(line);

// ---------------------------------------------------------------- shop
check('the same week always shows the same shelf', () => {
  // Everything else depends on this. A shop that differs between two reads is
  // untestable, and a player who reloads must not reroll the catalogue.
  const s = player();
  const a = shopOffers(data, s, PLAIN);
  const b = shopOffers(data, s, PLAIN + 3 * 3600_000);
  eq(JSON.stringify(a), JSON.stringify(b), 'the shelf changed within the same week');
});

check('a new week brings a different shelf', () => {
  const s = player();
  const week1 = shopOffers(data, s, PLAIN);
  const week2 = shopOffers(data, s, PLAIN + data.shop.refreshHours * 3600_000);
  assert(JSON.stringify(week1) !== JSON.stringify(week2), 'the catalogue never turned over');
});

check('two hotels see different shelves', () => {
  // Seeded per save, so the shop is personal rather than global.
  const a = createInitialState(data, { seed: 1, epochMs: PLAIN });
  const b = createInitialState(data, { seed: 2, epochMs: PLAIN });
  a.player.level = b.player.level = 30;
  assert(JSON.stringify(shopOffers(data, a, PLAIN)) !== JSON.stringify(shopOffers(data, b, PLAIN)),
    'every hotel is shown an identical shop');
});

check('the shelf fills its slots without repeating an item', () => {
  const offers = shopOffers(data, player(), PLAIN);
  eq(offers.length, data.shop.slots, 'the shop is not full');
  eq(new Set(offers.map((o) => o.defId)).size, offers.length, 'an item appeared twice');
});

check('nothing on the shelf is above the player\'s level', () => {
  // A discount on something unbuyable is an advert, not an offer.
  const s = player(5);
  for (const offer of shopOffers(data, s, PLAIN)) {
    const item = data.decor.find((d) => d.id === offer.defId)!;
    assert(item.unlockLevel <= s.player.level,
      `"${offer.defId}" needs level ${item.unlockLevel} and the player is ${s.player.level}`);
  }
});

check('every offer is genuinely cheaper, and one is a showpiece', () => {
  const offers = shopOffers(data, player(), PLAIN);
  for (const offer of offers) {
    assert(offer.price < offer.fullPrice, `"${offer.defId}" is not discounted at all`);
    assert(offer.price >= 1, `"${offer.defId}" costs nothing`);
    assert(offer.discount >= data.shop.discount.min - 1e-9, `"${offer.defId}" is barely discounted`);
  }
  const featured = offers.filter((o) => o.featured);
  eq(featured.length, 1, 'there is not exactly one featured item');
  assert(featured[0]!.discount >= data.shop.featured.discount - 1e-9,
    'the featured item is not the best deal on the shelf');
});

check('buying charges the discounted price, not the full one', () => {
  const s = player();
  const offer = shopOffers(data, s, PLAIN).find((o) => o.currency === 'coins')!;
  const before = s.player.coins;
  assert(execute(data, s, { type: 'BUY_SHOP_OFFER', defId: offer.defId, epochMs: PLAIN }).ok,
    'buying failed');
  eq(before - s.player.coins, offer.price, 'the full price was charged');
});

check('an offer can only be taken once a week', () => {
  const s = player();
  const offer = shopOffers(data, s, PLAIN).find((o) => o.currency === 'coins')!;
  execute(data, s, { type: 'BUY_SHOP_OFFER', defId: offer.defId, epochMs: PLAIN });
  const again = execute(data, s, { type: 'BUY_SHOP_OFFER', defId: offer.defId, epochMs: PLAIN });
  assert(!again.ok && again.reason === 'offerTaken', 'the same discount was claimed twice');
  assert(isOfferTaken(s, shopPeriod(data, PLAIN), offer.defId), 'the purchase was not recorded');
});

check('a purchase from last week does not block this week', () => {
  const s = player();
  const offer = shopOffers(data, s, PLAIN).find((o) => o.currency === 'coins')!;
  execute(data, s, { type: 'BUY_SHOP_OFFER', defId: offer.defId, epochMs: PLAIN });
  const nextWeek = PLAIN + data.shop.refreshHours * 3600_000;
  const fresh = shopOffers(data, s, nextWeek);
  for (const o of fresh) {
    assert(!isOfferTaken(s, shopPeriod(data, nextWeek), o.defId),
      'a new week started already sold out');
  }
});

check('an item not on the shelf cannot be bought at a discount', () => {
  // The core recomputes the offer rather than trusting the caller, so asking
  // for something absent has to be refused.
  const s = player();
  const onShelf = new Set(shopOffers(data, s, PLAIN).map((o) => o.defId));
  const absent = data.decor.find((d) => !onShelf.has(d.id) && d.unlockLevel <= 30)!;
  const result = execute(data, s, { type: 'BUY_SHOP_OFFER', defId: absent.id, epochMs: PLAIN });
  assert(!result.ok && result.reason === 'offerExpired', 'an item off the shelf was sold cheap');
});

check('the refresh countdown runs down and resets', () => {
  const span = data.shop.refreshHours * 3600_000;
  const left = msUntilShopRefresh(data, PLAIN);
  assert(left > 0 && left <= span, `the countdown reads ${left}ms against a ${span}ms week`);
  assert(msUntilShopRefresh(data, PLAIN + 3600_000) < left, 'the countdown did not move');
});

// ---------------------------------------------------------------- seasons
check('an ordinary day has no event running', () => {
  eq(activeSeason(data, PLAIN), null, 'a plain Tuesday in May is a festival');
  eq(seasonIncomeMultiplier(data, PLAIN), 1, 'income is boosted with no event running');
});

check('each declared event runs on its own dates', () => {
  for (const season of data.seasons) {
    const [m, d] = season.from.split('-').map(Number);
    const inside = Date.UTC(2026, m! - 1, d! + 1);
    eq(activeSeason(data, inside)?.id, season.id, `"${season.id}" is not running inside its own window`);
  }
});

check('an event spanning new year still works', () => {
  // The window wraps, so a simple between-comparison would report nothing.
  const newYear = data.seasons.find((s) => s.from > s.to);
  assert(newYear, 'no event wraps the year — this check has nothing to prove');
  eq(activeSeason(data, Date.UTC(2026, 11, 30))?.id, newYear.id, 'the event is dark in late December');
  eq(activeSeason(data, Date.UTC(2027, 0, 3))?.id, newYear.id, 'the event is dark in early January');
  eq(activeSeason(data, Date.UTC(2026, 5, 1)), null, 'the wrapping event runs in June');
});

check('an event actually changes what the hotel earns', () => {
  const season = data.seasons[0]!;
  const [m, d] = season.from.split('-').map(Number);
  const during = Date.UTC(2026, m! - 1, d! + 1);
  eq(seasonIncomeMultiplier(data, during), season.incomeMultiplier,
    'the event is a banner and nothing more');
});

check('the countdown to an event ending is sane', () => {
  const season = data.seasons[0]!;
  const [m, d] = season.from.split('-').map(Number);
  const during = Date.UTC(2026, m! - 1, d! + 1);
  const left = seasonDaysLeft(data, during);
  assert(left > 0 && left <= 60, `the event reports ${left} days remaining`);
  eq(seasonDaysLeft(data, PLAIN), 0, 'a day with no event has days remaining');
});

check('no two events overlap', () => {
  // Two running at once would silently multiply, and only one would be shown.
  for (let day = 0; day < 365; day++) {
    const when = Date.UTC(2026, 0, 1) + day * DAY;
    const today = new Date(when);
    const md = `${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
    const running = data.seasons.filter((s) => {
      const wraps = s.from > s.to;
      return wraps ? md >= s.from || md <= s.to : md >= s.from && md <= s.to;
    });
    assert(running.length <= 1, `${md} has ${running.length} events running at once`);
  }
});

// ---------------------------------------------------------------- gift
check('a new player has a gift waiting (4B: bag + weekly item)', () => {
  const gift = giftState(data, player(), PLAIN);
  assert(gift.available, 'a brand new hotel has nothing to collect');
  const s = player();
  eq(gift.bagCoins, data.starTiers.find((t) => t.stars === s.hotel.stars)!.dailyBonusCoins,
    'the bag is not the star-tier value');
  assert(gift.itemIsNew, 'the first week does not offer the free item');
  assert(data.decor.some((d) => d.id === gift.itemDefId), 'the free item is not a real decor piece');
});

check('claiming pays the bag, hands the item, and closes the day', () => {
  const s = player();
  const gift = giftState(data, s, PLAIN);
  const before = s.player.coins;
  const res = execute(data, s, { type: 'CLAIM_GIFT', epochMs: PLAIN });
  assert(res.ok, 'claiming failed');
  // Decision 15a: no coin streak — the coins ARE the star bonus, nothing else.
  eq(s.ledger['giftReward'] ?? 0, 0, 'the retired coin streak paid out');
  eq(s.player.coins - before, s.ledger['starBonus'] ?? 0, 'the purse and the bag disagree');
  eq(owned(s, gift.itemDefId), 1, 'the weekly item did not land in the inventory');
  assert(res.events.some((e) => e.type === 'giftClaimed' && e.itemDefId === gift.itemDefId),
    'the claim did not report the item');
  assert(!giftState(data, s, PLAIN).available, 'the same day could be claimed twice');
  const twice = execute(data, s, { type: 'CLAIM_GIFT', epochMs: PLAIN });
  assert(!twice.ok && twice.reason === 'giftNotReady', 'the gift paid out twice in one day');
});

check('the item comes once a week, the bag every day', () => {
  const s = player();
  const first = giftState(data, s, PLAIN);
  execute(data, s, { type: 'CLAIM_GIFT', epochMs: PLAIN });
  eq(owned(s, first.itemDefId), 1, 'day one did not hand the item over');
  // Day two: bag only.
  const dayTwo = giftState(data, s, PLAIN + DAY);
  assert(dayTwo.available, 'day two has no bag');
  assert(!dayTwo.itemIsNew, 'the weekly item is on offer twice in one week');
  execute(data, s, { type: 'CLAIM_GIFT', epochMs: PLAIN + DAY });
  eq(owned(s, first.itemDefId), 1, 'the same week handed the item over twice');
  // Next week: a fresh item claim.
  const nextWeek = PLAIN + data.gifts.itemPeriodDays * DAY;
  const later = giftState(data, s, nextWeek);
  assert(later.itemIsNew, 'a new week did not bring a fresh item');
  const had = owned(s, later.itemDefId);
  execute(data, s, { type: 'CLAIM_GIFT', epochMs: nextWeek });
  eq(owned(s, later.itemDefId), had + 1, 'the new week did not hand its item over');
});

check('a long absence costs nothing — tomorrow is simply another bag', () => {
  // The streak and its guilt are gone with decision 15a. A returning player
  // gets today's bag and, if the week turned while they were away, the item.
  const s = player();
  execute(data, s, { type: 'CLAIM_GIFT', epochMs: PLAIN });
  const afterGap = PLAIN + 20 * DAY;
  const gift = giftState(data, s, afterGap);
  assert(gift.available, 'a returning player has nothing to collect');
  assert(gift.itemIsNew, 'weeks passed and no item is waiting');
});

check('the weekly shelf is deterministic and universal', () => {
  // Same week, same item, for everyone — the original's catalogue rotated
  // for all players at once. PLAIN can fall anywhere in a week, so find a
  // later day that provably shares it before comparing.
  const sameWeek = [1, 2, 3, 4, 5, 6]
    .find((d) => weekIndexOf(data, PLAIN + d * DAY) === weekIndexOf(data, PLAIN));
  if (sameWeek !== undefined) {
    eq(giftState(data, player(), PLAIN).itemDefId,
      giftState(data, player(), PLAIN + sameWeek * DAY).itemDefId,
      'the item changed inside one week');
  }
  eq(giftState(data, player(), PLAIN).itemDefId, giftState(data, player(), PLAIN).itemDefId,
    'two hotels in the same moment see different shelves');
  const pool = data.decor.filter((d) => d.cost.currency === 'coins' && d.cost.amount <= data.gifts.maxItemCost);
  assert(pool.length >= 8, `only ${pool.length} pieces qualify — the weekly shelf will feel repetitive`);
});

check('the free item is always a coin piece under the cap', () => {
  for (let week = 0; week < 30; week++) {
    const when = PLAIN + week * data.gifts.itemPeriodDays * DAY;
    const id = giftState(data, player(), when).itemDefId;
    const def = data.decor.find((d) => d.id === id)!;
    assert(def.cost.currency === 'coins' && def.cost.amount <= data.gifts.maxItemCost,
      `week ${week} offered ${id} at ${def.cost.amount} ${def.cost.currency}`);
  }
});

// ---------------------------------------------------------------- migration
check('an older save gains a shop and a gift streak', () => {
  assert(SCHEMA_VERSION >= 5, 'the shop was never versioned');
  const migrated = migrate({ seed: 1, player: { coins: 3 } }, 1, SCHEMA_VERSION);
  assert(typeof migrated['shopTaken'] === 'object', 'the shop record was not added');
  eq((migrated['gift'] as { lastItemWeek: number }).lastItemWeek, -1,
    'a migrated player does not have this week\'s item waiting');
  eq((migrated['player'] as { coins: number }).coins, 3, 'the chain lost existing data');
});

check('every new string exists in both locales', () => {
  const en = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>;
  const ar = JSON.parse(fs.readFileSync('src/i18n/locales/ar.json', 'utf8')) as Record<string, string>;
  for (const season of data.seasons) {
    for (const key of [season.nameKey, season.descKey]) {
      assert(key in en, `${key} is missing from en.json`);
      assert(key in ar, `${key} is missing from ar.json`);
    }
  }
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
