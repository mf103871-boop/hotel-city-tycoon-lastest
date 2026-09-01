/**
 * Headless tests for permanent upgrades — the endgame sink.
 *
 * A hundred and twenty simulated days showed a player capped at level 60 by
 * day 56 and then accumulating fifty-one million coins with nothing to spend
 * them on. Nothing unlocks after level 44 but one plot, and the most expensive
 * decor in the game costs 150,000.
 *
 * Run: node --experimental-strip-types tools/selftest/upgrades.ts
 */
import fs from 'node:fs';
import { loadSimData } from '../balance-sim/load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { execute } from '../../src/core/commands/index.ts';
import { advance } from '../../src/core/sim/tick.ts';
import {
  tierOwned, nextTier, upgradeMultiplier, totalInvested, isUpgradeUnlocked,
} from '../../src/core/systems/upgrades.ts';
import { arrivalsPerMinute } from '../../src/core/systems/guests.ts';
import { shiftWages } from '../../src/core/systems/economy.ts';
import { cleaningCapacity } from '../../src/core/systems/cleanliness.ts';
import { SCHEMA_VERSION } from '../../src/core/state/types.ts';
import { migrate } from '../../src/save/index.ts';
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

const fresh = (): GameState => createInitialState(data, { seed: 31, epochMs: 0 });
function maxed(): GameState {
  const s = fresh();
  s.player.level = data.levels[data.levels.length - 1]!.level + 1;
  s.player.coins = 500_000_000;
  return s;
}

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — upgrades self-test');
console.log(line);

check('every tier costs more than the one before it', () => {
  for (const def of data.upgrades) {
    for (let i = 1; i < def.tiers.length; i++) {
      assert(def.tiers[i]!.cost > def.tiers[i - 1]!.cost,
        `"${def.id}" tier ${i + 1} costs no more than tier ${i} — the sink stops draining`);
    }
  }
});

check('every tier is worth more than the one before it', () => {
  for (const def of data.upgrades) {
    const better = def.effect === 'wageDiscount'
      ? (a: number, b: number) => a < b     // a discount improves downward
      : (a: number, b: number) => a > b;
    for (let i = 1; i < def.tiers.length; i++) {
      assert(better(def.tiers[i]!.value, def.tiers[i - 1]!.value),
        `"${def.id}" tier ${i + 1} is no better than tier ${i} but costs more`);
    }
  }
});

check('the sink is big enough to matter', () => {
  // The whole point. If every track together costs less than the fortune a
  // capped player accumulates, the drought returns.
  const total = data.upgrades.reduce((n, u) => n + u.tiers.reduce((m, t) => m + t.cost, 0), 0);
  assert(total > 40_000_000,
    `every upgrade in the game costs ${total.toLocaleString()} — a capped player out-earns that`);
  console.log(`      buying everything costs ${(total / 1_000_000).toFixed(0)}M coins`);
});

check('owning nothing multiplies nothing', () => {
  const s = fresh();
  for (const effect of ['arrivalRate', 'income', 'staffEfficiency', 'amenityCapacity'] as const) {
    eq(upgradeMultiplier(data, s, effect), 1, `"${effect}" already boosted on a new hotel`);
  }
  eq(upgradeMultiplier(data, s, 'wageDiscount'), 1, 'wages already discounted on a new hotel');
});

check('buying charges the price and records the tier', () => {
  const s = maxed();
  const before = s.player.coins;
  const next = nextTier(data, s, 'renown')!;
  assert(execute(data, s, { type: 'BUY_UPGRADE', upgradeId: 'renown' }).ok, 'buying failed');
  eq(before - s.player.coins, next.cost, 'the wrong amount was charged');
  eq(tierOwned(s, 'renown'), 1, 'the tier was not recorded');
});

check('a locked upgrade cannot be bought', () => {
  const s = fresh();
  s.player.coins = 500_000_000;
  const result = execute(data, s, { type: 'BUY_UPGRADE', upgradeId: 'concierge' });
  assert(!result.ok && result.reason === 'notUnlocked', 'a level-1 player bought a level-44 upgrade');
});

check('an unaffordable upgrade is refused', () => {
  const s = fresh();
  s.player.level = data.levels[data.levels.length - 1]!.level + 1;
  s.player.coins = 10;
  const result = execute(data, s, { type: 'BUY_UPGRADE', upgradeId: 'renown' });
  assert(!result.ok && result.reason === 'cannotAfford', 'a broke player bought an upgrade');
});

check('a finished track refuses further purchases', () => {
  const s = maxed();
  const def = data.upgrades.find((u) => u.id === 'renown')!;
  for (let i = 0; i < def.tiers.length; i++) {
    assert(execute(data, s, { type: 'BUY_UPGRADE', upgradeId: 'renown' }).ok, `tier ${i + 1} failed`);
  }
  eq(nextTier(data, s, 'renown'), null, 'a finished track still offers a tier');
  const extra = execute(data, s, { type: 'BUY_UPGRADE', upgradeId: 'renown' });
  assert(!extra.ok && extra.reason === 'fullyUpgraded', 'a finished track sold another tier');
});

check('an unknown upgrade is refused rather than crashed on', () => {
  const result = execute(data, maxed(), { type: 'BUY_UPGRADE', upgradeId: 'no_such_thing' });
  assert(!result.ok && result.reason === 'unknownUpgrade', 'a phantom upgrade was sold');
});

// ---------------------------------------------------------------- effects
check('renown brings more guests', () => {
  const s = maxed();
  const before = arrivalsPerMinute(data, s);
  execute(data, s, { type: 'BUY_UPGRADE', upgradeId: 'renown' });
  assert(arrivalsPerMinute(data, s) > before,
    `arrivals unchanged at ${before.toFixed(2)} after buying renown`);
});

check('the payroll upgrade still discounts, even with wages zeroed', () => {
  // Decision 10a zeroed wages so the shift price is the original table, which
  // leaves this upgrade nothing to discount in coins. The code path must still
  // work — a save that owns it, or a later decision restoring wages, relies on
  // the multiplier actually moving.
  const s = maxed();
  execute(data, s, { type: 'BUY_UPGRADE', upgradeId: 'wages' });
  assert(upgradeMultiplier(data, s, 'wageDiscount') < 1,
    'buying the payroll upgrade left the wage multiplier at 1');
  eq(shiftWages(data, s, 'shift_24h'), 0, 'zeroed wages stopped being zero');
});

check('training makes cleaners cover more', () => {
  const s = maxed();
  const before = cleaningCapacity(data, s);
  execute(data, s, { type: 'BUY_UPGRADE', upgradeId: 'training' });
  assert(cleaningCapacity(data, s) > before,
    `cleaning capacity unchanged at ${before} after training`);
});

check('service raises what guests actually pay', () => {
  // Measured on earnings, not on the coin balance: the balance also carries
  // the price of the upgrade itself, so comparing it showed no difference and
  // hid a working feature.
  //
  // And measured on a room worth measuring. An undecorated economy room pays
  // six coins; eight percent of six rounds to six, so the first version of
  // this test proved nothing except that it had picked the smallest number in
  // the game.
  const play = (buy: boolean) => {
    const s = createInitialState(data, { seed: 777, epochMs: 0 });
    s.player.level = data.levels[data.levels.length - 1]!.level + 1;
    s.player.coins = 500_000_000;
    for (const p of [...data.plots].sort((a, b) => a.blocks - b.blocks)) {
      execute(data, s, { type: 'EXPAND_PLOT', plotId: p.id });
    }
    // 3B: executive is gem-priced now; family is the top coin room and big
    // enough for an 8% income lift to survive rounding (10 -> 11).
    for (let i = 0; i < 6; i++) execute(data, s, { type: 'BUILD_ROOM', defId: 'family' });
    if (buy) execute(data, s, { type: 'BUY_UPGRADE', upgradeId: 'service' });
    execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
    advance(data, s, 6 * 3600 * data.economy.simulation.ticksPerSecond);
    return s.stats.coinsEarned;
  };
  const plain = play(false);
  const upgraded = play(true);
  assert(upgraded > plain, `six hours earned ${upgraded} with service against ${plain} without`);
  console.log(`      six hours: ${plain.toLocaleString()} plain, ${upgraded.toLocaleString()} with service`);
});

check('the investment total matches what was spent', () => {
  const s = maxed();
  const before = s.player.coins;
  execute(data, s, { type: 'BUY_UPGRADE', upgradeId: 'renown' });
  execute(data, s, { type: 'BUY_UPGRADE', upgradeId: 'renown' });
  execute(data, s, { type: 'BUY_UPGRADE', upgradeId: 'service' });
  eq(totalInvested(data, s), before - s.player.coins, 'the reported investment disagrees with the spend');
});

check('every upgrade is parked one past the cap (decision 14a)', () => {
  // Permanent upgrades are not in the original. Parked at maxLevel + 1 — the
  // validator's PARKED convention — they are schema-valid and unreachable by
  // any player. If any row drops to a reachable level, the system has been
  // quietly re-enabled.
  const PARK = data.levels[data.levels.length - 1]!.level + 1;
  for (const def of data.upgrades) {
    eq(def.unlockLevel, PARK, `"${def.id}" is reachable — upgrades were disabled by decision 14a`);
    const s = fresh();
    s.player.level = def.unlockLevel; // a test superuser one past the cap
    assert(isUpgradeUnlocked(data, s, def.id), `"${def.id}" is not available at its own unlock level`);
  }
});

// ---------------------------------------------------------------- migration
check('an older save gains an empty upgrade record', () => {
  // Not pinned to a literal version: every later feature would break this for
  // the wrong reason. The chain being complete is what matters.
  assert(SCHEMA_VERSION >= 4, 'the upgrades migration was never versioned');
  const migrated = migrate({ seed: 1, player: { coins: 9 } }, 1, SCHEMA_VERSION);
  assert(typeof migrated['upgrades'] === 'object' && migrated['upgrades'] !== null,
    'the upgrades field was not added');
  eq(Object.keys(migrated['upgrades'] as object).length, 0, 'a migrated save arrived pre-upgraded');
  eq((migrated['player'] as { coins: number }).coins, 9, 'the chain lost existing data');
});

check('every upgrade string exists in both locales', () => {
  const en = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>;
  const ar = JSON.parse(fs.readFileSync('src/i18n/locales/ar.json', 'utf8')) as Record<string, string>;
  for (const def of data.upgrades) {
    for (const key of [def.nameKey, def.descKey]) {
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
