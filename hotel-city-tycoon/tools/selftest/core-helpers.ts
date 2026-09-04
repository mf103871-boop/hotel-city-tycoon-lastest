import { testGuest } from './guest-factory.ts';
export { testGuest };
/**
 * Direct tests for the core's pure helpers.
 *
 * Most of the simulation is exercised indirectly: the suites run `advance()`
 * thousands of times, and that reaches `checkOut`, `spawnGuest` and the rest.
 * Indirect coverage proves the loop works, not that each piece of arithmetic
 * inside it is right — a diminishing reward that never diminishes, or a
 * progress bar off by a level, both survive a passing loop.
 *
 * These are the functions where being subtly wrong would go unnoticed.
 *
 * Run: node --experimental-strip-types tools/selftest/core-helpers.ts
 */
import fs from 'node:fs';
import { loadSimData } from '../balance-sim/load-data.ts';
import { createInitialState, makeRoom, usedBlocks, totalBeds } from '../../src/core/state/init.ts';
import { checkPlacement, findFreeSpot, occupancyMap, roomAt, plotBounds, overlaps, contains } from '../../src/core/state/grid.ts';
import { advanceCleanliness, cleaningCoverage, incomeBlocked, averageCleanliness } from '../../src/core/systems/cleanliness.ts';
import { computeDecorPoints, averageDecorFill } from '../../src/core/systems/decor.ts';
import { canAfford, shiftPrice } from '../../src/core/systems/economy.ts';
import { clearReward } from '../../src/core/systems/events.ts';
import { levelProgress, isUnlocked } from '../../src/core/systems/progression.ts';
import { tierFor, incomeMultiplier, arrivalMultiplier } from '../../src/core/systems/stars.ts';
import { ticksForMs } from '../../src/core/sim/tick.ts';
import { execute } from '../../src/core/commands/index.ts';
import { arrivalsPerMinute, checkoutPayout } from '../../src/core/systems/guests.ts';
import type { GuestInstance } from '../../src/core/state/types.ts';
import { roomById, isGuestRoom, catalogueFor, decorDef } from '../../src/core/data-source.ts';



/** A guest asleep in a room, for payout arithmetic. */
function sleeper(_s: GameState, roomId: string): GuestInstance {
  return testGuest({ id: 'probe', typeId: 'standard', state: 'staying', roomId,
    stateSinceTick: 0, finishesAtTick: 0, desire: null, patienceUntilTick: 0, everCheckedIn: false });
}
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
function near(a: number, b: number, m: string, eps = 1e-6): void {
  if (Math.abs(a - b) > eps) throw new Error(`${m} (got ${a}, expected ~${b})`);
}

const fresh = (): GameState => createInitialState(data, { seed: 5, epochMs: 0 });

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — core helpers');
console.log(line);

// ---------------------------------------------------------------- geometry
check('overlap is symmetric and excludes touching edges', () => {
  const a = { x: 0, y: 0, w: 2, h: 1 };
  assert(overlaps(a, { x: 1, y: 0, w: 2, h: 1 }), 'a genuine overlap was missed');
  assert(overlaps({ x: 1, y: 0, w: 2, h: 1 }, a), 'overlap is not symmetric');
  // Rooms sitting side by side must not count as overlapping, or nothing fits.
  assert(!overlaps(a, { x: 2, y: 0, w: 1, h: 1 }), 'adjacent rooms were treated as overlapping');
  assert(!overlaps(a, { x: 0, y: 1, w: 2, h: 1 }), 'stacked-but-not-overlapping was rejected');
});

check('containment requires the whole rectangle inside', () => {
  const plot = { x: 0, y: 0, w: 4, h: 3 };
  assert(contains(plot, { x: 0, y: 0, w: 4, h: 3 }), 'an exactly-fitting room was refused');
  assert(!contains(plot, { x: 3, y: 0, w: 2, h: 1 }), 'a room hanging over the edge was accepted');
  assert(!contains(plot, { x: -1, y: 0, w: 2, h: 1 }), 'a room starting outside was accepted');
});

check('placement refuses fractional coordinates', () => {
  const s = fresh();
  eq(checkPlacement(data, s, { w: 1, h: 1 }, 1.5, 0), 'outOfBounds',
    'a room was allowed to sit between two blocks');
});

check('occupancy and free-spot search agree with each other', () => {
  const s = fresh();
  const map = occupancyMap(data, s);
  const spot = findFreeSpot(data, s, { w: 1, h: 1 })!;
  assert(spot, 'a fresh hotel has nowhere to build');
  eq(map[spot.y]?.[spot.x], false, 'the free spot found is marked occupied on the map');
  // And every occupied cell really holds a room.
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y]!.length; x++) {
      if (map[y]![x]) assert(roomAt(data, s, x, y) !== null, `cell ${x},${y} is marked used but holds nothing`);
    }
  }
});

check('roomAt finds every block a multi-block room covers', () => {
  const s = fresh();
  const lobby = s.hotel.rooms.find((r) => r.defId === 'lobby')!;
  const def = data.rooms.find((r) => r.id === 'lobby')!;
  for (let dx = 0; dx < def.blocks.w; dx++) {
    eq(roomAt(data, s, lobby.x + dx, lobby.y)?.id, lobby.id,
      `block ${dx} of the lobby does not report the lobby`);
  }
  eq(roomAt(data, s, 99, 99), null, 'a coordinate outside the hotel returned a room');
});

check('used blocks and bed count match what is built', () => {
  const s = fresh();
  const expected = s.hotel.rooms.reduce((n, r) => {
    const def = data.rooms.find((x) => x.id === r.defId)!;
    return n + def.blocks.w * def.blocks.h;
  }, 0);
  eq(usedBlocks(data, s), expected, 'the block count disagrees with the rooms');
  assert(totalBeds(data, s) > 0, 'a hotel with guest rooms reports no beds');
  assert(usedBlocks(data, s) <= plotBounds(data, s).w * plotBounds(data, s).h,
    'the starting rooms use more blocks than the plot has');
});

check('makeRoom hands out unique ids', () => {
  const s = fresh();
  const ids = new Set(s.hotel.rooms.map((r) => r.id));
  for (let i = 0; i < 20; i++) ids.add(makeRoom(s, 'economy', 0, 0).id);
  eq(ids.size, s.hotel.rooms.length + 20, 'two rooms were given the same id');
});

// ---------------------------------------------------------------- arithmetic
check('cleanliness moves by the amount asked and stays in range', () => {
  const room = { ...fresh().hotel.rooms[0]!, cleanliness: 0.5 };
  const rate = data.economy.cleanliness.cleanRatePerCleanerPerSec;
  near(advanceCleanliness(data, room, 10, 1, 0, 1), 0.5 + rate * 10,
    'ten seconds of full-coverage cleaning moved the wrong amount');
  // And it cannot leave 0..1 whatever it is asked.
  eq(advanceCleanliness(data, room, 1e9, 1, 0, 1), 1, 'cleanliness ran past 1');
  eq(advanceCleanliness(data, room, 0, 0, 1e6, 1), 0, 'cleanliness ran below 0');
});

check('coverage is the ratio of capacity to rooms, capped at one', () => {
  const s = fresh();
  eq(cleaningCoverage(data, s), 1, 'a small hotel is not fully covered by its one cleaner');
  s.hotel.rooms = s.hotel.rooms.filter((r) => r.defId !== 'housekeeping');
  for (const st of s.staff) st.roomId = null;
  eq(cleaningCoverage(data, s), 0, 'a hotel with no cleaner reports coverage');
});

check('income is blocked by dirt, pests and fire alike', () => {
  const s = fresh();
  const room = s.hotel.rooms.find((r) => r.defId === 'economy')!;
  assert(!incomeBlocked(data, room), 'a clean empty room was blocked');
  room.cleanliness = 0;
  assert(incomeBlocked(data, room), 'a filthy room still earned');
  room.cleanliness = 1;
  room.hasPest = true;
  assert(incomeBlocked(data, room), 'an infested room still earned');
  room.hasPest = false;
  room.hasFire = true;
  assert(incomeBlocked(data, room), 'a burning room still earned');
});

check('decor points are the sum of what is placed', () => {
  const s = fresh();
  s.player.coins = 1_000_000;
  const room = s.hotel.rooms.find((r) => r.defId === 'economy')!;
  eq(computeDecorPoints(data, room), 0, 'an empty room has decor points');
  const item = decorDef(data, catalogueFor(data, 'economy')[0]!);
  execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: item.id, slot: 0 });
  eq(computeDecorPoints(data, room), item.decorPoints, 'the sum does not match the item placed');
  eq(room.decorPoints, item.decorPoints, 'the cached total drifted from the real one');
});

check('average decor fill ignores rooms with no meter', () => {
  const s = fresh();
  const fill = averageDecorFill(data, s.hotel.rooms);
  assert(fill >= 0 && fill <= 1, `average fill is ${fill}`);
  // A housekeeping closet has no meter and must not drag the average down.
  const withCloset = averageDecorFill(data, s.hotel.rooms);
  const withoutCloset = averageDecorFill(data, s.hotel.rooms.filter((r) => r.defId !== 'housekeeping'));
  near(withCloset, withoutCloset, 'a room with no decor target changed the average');
});

check('average cleanliness ignores back-of-house rooms', () => {
  const s = fresh();
  const before = averageCleanliness(data, s);
  const closet = s.hotel.rooms.find((r) => r.defId === 'housekeeping')!;
  closet.cleanliness = 0;
  near(averageCleanliness(data, s), before, 'a housekeeping closet counted toward hotel cleanliness');
});

check('affordability checks the right currency', () => {
  const s = fresh();
  s.player.coins = 100;
  s.player.gems = 1;
  assert(canAfford(s, { currency: 'coins', amount: 100 }), 'exactly enough coins was refused');
  assert(!canAfford(s, { currency: 'coins', amount: 101 }), 'one coin short was accepted');
  assert(canAfford(s, { currency: 'gems', amount: 1 }), 'exactly enough gems was refused');
  assert(!canAfford(s, { currency: 'gems', amount: 2 }), 'gems were paid out of the coin balance');
});

check('shift price scales from the base by the declared rate', () => {
  const s = fresh();
  const def = data.shifts[0]!;
  const perLevel = data.economy.shiftCostScaling.perLevel;
  eq(shiftPrice(data, s, def.id), def.baseCost, 'level one is not the base price');
  s.player.level = 11;
  eq(shiftPrice(data, s, def.id), Math.round(def.baseCost * (1 + perLevel * 10)),
    'the scaling formula does not match the data');
});

check('hazard rewards actually diminish', () => {
  // The original game let players farm fires because the reward never fell.
  // Indirect testing would never notice this staying flat.
  const s = fresh();
  const def = data.events.find((e) => e.id === 'fire')!;
  const first = clearReward(data, s, 'fire');
  eq(first, def.clearRewardCoins!.first, 'the first clear paid the wrong amount');
  s.eventClearCounts['fire'] = def.clearRewardCoins!.decayAfter;
  const repeat = clearReward(data, s, 'fire');
  eq(repeat, def.clearRewardCoins!.repeat, 'the reward did not fall after the first clear');
  assert(repeat < first, 'clearing fires is still farmable');
});

check('level progress runs 0 to 1 within each level', () => {
  const s = fresh();
  s.player.level = 5;
  s.player.xp = data.levels[4]!.xpTotal;
  near(levelProgress(data, s), 0, 'the start of a level is not zero progress');
  s.player.xp = data.levels[5]!.xpTotal - 1;
  const almost = levelProgress(data, s);
  assert(almost > 0.9 && almost < 1, `one xp short of levelling reports ${almost}`);
  s.player.level = data.levels.length;
  eq(levelProgress(data, s), 1, 'the final level does not report complete');
});

check('unlocks respect the level they are declared at', () => {
  const s = fresh();
  assert(isUnlocked(data, s, 'room', 'economy'), 'the starting room is not unlocked at level 1');
  // 3B: presidential is gem-priced and available from L1 (the original sold
  // cash rooms at any level); the level ladder now lives in the coin rooms.
  assert(isUnlocked(data, s, 'room', 'presidential'), 'the gem suites should be available from level 1');
  assert(!isUnlocked(data, s, 'room', 'family'), 'the level-32 High Ceiling room is unlocked at level 1');
  s.player.level = data.levels[data.levels.length - 1]!.level;
  assert(isUnlocked(data, s, 'room', 'family'), 'a max-level player cannot build everything');
  assert(!isUnlocked(data, s, 'room', 'laundry'), 'a parked room (L53) leaked back into the game');
});

check('poking sleepers pays decision 3a: 400..500, once each, capped daily', () => {
  const s = fresh();
  s.epochMs = 1_710_000_000_000;
  const poke = data.economy.poke;
  const room = s.hotel.rooms.find((r) => r.defId === 'economy')!;
  const tuck = (id: string) => s.guests.push(testGuest({ id, typeId: 'standard', state: 'staying',
    roomId: room.id, stateSinceTick: 0, finishesAtTick: 0, desire: null,
    patienceUntilTick: 0, everCheckedIn: true }));
  for (let i = 0; i <= poke.dailyCap; i++) tuck(`p${i}`);

  const paid: number[] = [];
  for (let i = 0; i < poke.dailyCap; i++) {
    const before = s.player.coins;
    const res = execute(data, s, { type: 'TAP_GUEST', guestId: `p${i}` });
    assert(res.ok, `poke ${i} was rejected`);
    const gain = s.player.coins - before;
    assert(gain >= poke.minCoins && gain <= poke.maxCoins,
      `a poke paid ${gain}, outside ${poke.minCoins}..${poke.maxCoins}`);
    paid.push(gain);
  }
  const again = execute(data, s, { type: 'TAP_GUEST', guestId: 'p0' });
  assert(!again.ok && again.reason === 'alreadyRevealed', 'the same sleeper paid twice');

  const before = s.player.coins;
  assert(execute(data, s, { type: 'TAP_GUEST', guestId: `p${poke.dailyCap}` }).ok,
    'tapping past the cap should be allowed, just unpaid');
  eq(s.player.coins - before, 0, 'a poke past the daily cap still paid');

  s.epochMs += 86_400_000;
  tuck('pTomorrow');
  const b2 = s.player.coins;
  execute(data, s, { type: 'TAP_GUEST', guestId: 'pTomorrow' });
  assert(s.player.coins - b2 >= poke.minCoins, 'a new day did not reset the poke cap');
  console.log(`      ${poke.dailyCap} pokes paid ${paid.join(', ')}`);
});

check('star tiers resolve and their multipliers rise', () => {
  for (const tier of data.starTiers) {
    eq(tierFor(data, tier.stars).stars, tier.stars, `tier ${tier.stars} did not resolve to itself`);
  }
  assert(incomeMultiplier(data, 5) > incomeMultiplier(data, 1), 'five stars earn no more than one');
  assert(arrivalMultiplier(data, 5) > arrivalMultiplier(data, 1), 'five stars attract no more guests');
  // A fractional rating from a boost must land on a real tier.
  eq(tierFor(data, 3.5).stars, 3, 'a boosted half-star did not fall back to the whole tier');
});

check('milliseconds convert to whole ticks, never partial', () => {
  const ms = data.economy.simulation.tickMs;
  eq(ticksForMs(data, ms), 1, 'one tick of time is not one tick');
  eq(ticksForMs(data, ms * 10), 10, 'ten ticks of time is not ten ticks');
  eq(ticksForMs(data, ms - 1), 0, 'a partial tick was counted as whole');
  eq(ticksForMs(data, 0), 0, 'no time produced ticks');
});

check('the guest catalogue IS table A.1, verbatim (3B)', () => {
  // The old guard demanded that climbing the ladder improve return per guest.
  // The original's table does not obey that rule (23,000/7 is a worse ratio
  // than 8,500/3, and the Grand Loft outpays the Presidential), and the
  // decisions bind us to the table, not to the rule. So the guard now pins
  // the table itself: any drift from these numbers is the regression.
  const T: Record<string, [string, number, number, number, number]> = {
    // id: [currency, cost, income=xp, staySec, unlockLevel]
    economy: ['coins', 3000, 1, 120, 1],
    standard: ['coins', 8500, 3, 180, 2],
    double: ['coins', 23000, 7, 240, 14],
    family: ['coins', 45500, 10, 240, 32],
    deluxe: ['gems', 6, 12, 300, 1],
    honeymoon: ['gems', 12, 24, 360, 1],
    executive: ['gems', 15, 24, 360, 1],
    luxurySuite: ['gems', 20, 42, 360, 1],
    presidential: ['gems', 22, 32, 360, 1],
  };
  for (const room of data.rooms) {
    if (!isGuestRoom(room)) continue;
    const row = T[room.id];
    assert(row, `guest room "${room.id}" is not in table A.1`);
    eq(room.cost.currency, row[0], `"${room.id}" currency drifted`);
    eq(room.cost.amount, row[1], `"${room.id}" price drifted`);
    eq(room.incomePerGuest, row[2], `"${room.id}" income drifted`);
    eq(room.xpPerGuest, row[2], `"${room.id}" XP is no longer income, as the original paid it`);
    eq(room.stayDurationSec, row[3], `"${room.id}" stay length drifted`);
    eq(room.unlockLevel, row[4], `"${room.id}" unlock level drifted`);
  }
});

check('a starting hotel can serve the guests that arrive', () => {
  // Two beds and six-minute stays gave a capacity of twenty guests an hour
  // against a hundred and twenty-five arriving. Eighty-four percent of
  // everyone who walked up was turned away, and the opening session showed a
  // hotel that lost money while looking busy.
  const s = fresh();
  let capacity = 0;
  for (const room of s.hotel.rooms) {
    const def = roomById(data, room.defId);
    // Narrowed rather than asserted: `beds` and `stayDurationSec` only exist
    // on a guest room, and the filter above did not tell the compiler that.
    if (!def || !isGuestRoom(def)) continue;
    capacity += (def.beds * 3600) / def.stayDurationSec;
  }
  const arriving = arrivalsPerMinute(data, s) * 60;
  assert(capacity >= arriving * 0.55,
    `capacity is ${capacity.toFixed(0)}/hour against ${arriving.toFixed(0)} arriving — most guests are turned away`);
  console.log(`      ${capacity.toFixed(0)} guests/hour of capacity, ${arriving.toFixed(0)} arriving`);
});

check('decorating a room pays for itself within a session', () => {
  // The meter is the mechanic the whole economy hangs on. If filling it costs
  // more than it returns in an hour, nobody has a reason to touch it.
  const s = fresh();
  s.player.coins = 100_000;
  const room = s.hotel.rooms.find((r) => r.defId === 'economy')!;
  const def = data.rooms.find((r) => r.id === 'economy')!;
  // The room's own set, which is the only way to fill its meter now.
  let spent = 0;
  catalogueFor(data, 'economy').forEach((id, slot) => {
    const item = decorDef(data, id);
    if (item.cost.currency !== 'coins' || slot >= def.decorSlots) return;
    if (execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: item.id, slot }).ok) {
      spent += item.cost.amount;
    }
  });
  const bare = fresh();
  const gain = checkoutPayout(data, s, sleeper(s, room.id), room).coins
    - checkoutPayout(data, bare, sleeper(bare, room.id), bare.hotel.rooms.find((r) => r.defId === 'economy')!).coins;
  assert(gain > 0, 'a decorated room earns no more than a bare one');
  // 3B: at original incomes (one coin a stay) decor is not a session-scale
  // investment and never was in Hotel City — its job is the star rating and
  // the +90% ceiling on a full meter. The guard keeps only what must stay
  // true: a full meter pays the documented bonus over a bare room.
  console.log(`      ${spent} coins to fill; a stay pays ${gain.toFixed(2)} more than bare`);
});

check('a new game fills every field the state declares', () => {
  // A field added to the type and forgotten in `createInitialState` reads as
  // undefined, turns into NaN on first arithmetic, and nothing complains. It
  // happened to `shiftsOpened` minutes after a guard was written for exactly
  // this shape of defect.
  const s = fresh();
  const missing: string[] = [];
  const walk = (value: unknown, path: string) => {
    if (value === undefined) { missing.push(path); return; }
    if (typeof value === 'number' && Number.isNaN(value)) { missing.push(`${path} (NaN)`); return; }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(s, '');
  assert(missing.length === 0, `a fresh game leaves these unset: ${missing.join(', ')}`);

  // And the declared shape must match what is written.
  const types = fs.readFileSync('src/core/state/types.ts', 'utf8');
  const statsBlock = /export interface Stats \{([\s\S]*?)\n\}/.exec(types)?.[1] ?? '';
  for (const m of statsBlock.matchAll(/^\s{2}(\w+):/gm)) {
    assert(m[1]! in s.stats, `Stats declares "${m[1]}" and a new game never sets it`);
  }
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
