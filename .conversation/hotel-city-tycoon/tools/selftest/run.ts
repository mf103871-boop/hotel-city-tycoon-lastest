/**
 * Headless self-test.
 *
 * Mirrors the Vitest suites so the same assertions can run on a cold checkout
 * with nothing installed. `npm run test:logic` is still the authority; this is
 * what makes the core verifiable before dependencies exist.
 *
 * Run: node --experimental-strip-types tools/selftest/run.ts
 */
import { loadSimData } from '../balance-sim/load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { advance } from '../../src/core/sim/tick.ts';
import { resolveOffline } from '../../src/core/sim/offline.ts';
import { execute } from '../../src/core/commands/index.ts';
import { Rng, createCursors, STREAMS } from '../../src/core/rng/index.ts';
import { computeStars } from '../../src/core/systems/stars.ts';
import { decorFill, decorMultiplier } from '../../src/core/systems/decor.ts';
import { isOpen, totalShiftCost } from '../../src/core/systems/economy.ts';
import { plotBounds, footprintOf, overlaps, freeBlocks } from '../../src/core/state/grid.ts';
import type { GameState } from '../../src/core/state/types.ts';
import { measure, describe } from './measure.ts';

const data = loadSimData();

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(`${name}: ${(e as Error).message}`);
    console.log(`  ✗ ${name}`);
    console.log(`      ${(e as Error).message}`);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function eq(a: unknown, b: unknown, msg: string): void {
  if (a !== b) throw new Error(`${msg} (got ${String(a)}, expected ${String(b)})`);
}

const newState = (seed = 12345): GameState =>
  createInitialState(data, { seed, epochMs: 1_700_000_000_000, hotelName: 'Test' });

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — core self-test');
console.log(line);

// ---------------------------------------------------------------- rng
check('rng is a pure function of seed, stream and cursor', () => {
  const a = new Rng(99, createCursors());
  const b = new Rng(99, createCursors());
  for (let i = 0; i < 500; i++) {
    eq(a.next('guestSpawn'), b.next('guestSpawn'), `divergence at draw ${i}`);
  }
});

check('rng streams are independent', () => {
  const r = new Rng(7, createCursors());
  const first = r.next('guestSpawn');
  r.next('events'); r.next('events'); r.next('events');
  const r2 = new Rng(7, createCursors());
  eq(r2.next('guestSpawn'), first, 'draining one stream shifted another');
});

check('rng output stays inside [0,1)', () => {
  const r = new Rng(3, createCursors());
  for (const s of STREAMS) {
    for (let i = 0; i < 2000; i++) {
      const v = r.next(s);
      assert(v >= 0 && v < 1, `stream ${s} produced ${v}`);
    }
  }
});

// ---------------------------------------------------------------- determinism
check('DETERMINISM — same seed, same 6h of play, identical state', () => {
  const run = () => {
    const s = newState(20260828);
    execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
    advance(data, s, 6 * 3600 * data.economy.simulation.ticksPerSecond);
    return JSON.stringify(s);
  };
  const a = run();
  const b = run();
  assert(a === b, `states diverged (${a.length} vs ${b.length} bytes)`);
});

check('DETERMINISM — different seeds diverge', () => {
  const run = (seed: number) => {
    const s = newState(seed);
    execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
    advance(data, s, 3 * 3600 * data.economy.simulation.ticksPerSecond);
    return JSON.stringify(s);
  };
  assert(run(1) !== run(2), 'two different seeds produced identical states — the seed is being ignored');
});

check('DETERMINISM — chunked advance equals one big advance', () => {
  const tps = data.economy.simulation.ticksPerSecond;
  const total = 3600 * tps;

  const whole = newState(555);
  execute(data, whole, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  advance(data, whole, total);

  const chunked = newState(555);
  execute(data, chunked, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  for (let i = 0; i < 60; i++) advance(data, chunked, total / 60);

  assert(JSON.stringify(whole) === JSON.stringify(chunked),
    'advancing in chunks produced a different state than advancing all at once');
});

check('a rejected command leaves state byte-identical', () => {
  const s = newState();
  const before = JSON.stringify(s);
  // 3B: presidential is gem-priced and available from L1, so the level lock
  // moved — family (High Ceiling) is the room a fresh hotel cannot build.
  const res = execute(data, s, { type: 'BUILD_ROOM', defId: 'family', x: 0, y: 0 });
  assert(!res.ok, 'family should be rejected at level 1');
  eq(res.ok === false ? res.reason : '', 'notUnlocked', 'wrong rejection reason');
  eq(JSON.stringify(s), before, 'a rejected command mutated the state');
});

// ---------------------------------------------------------------- state
check('a new game is serialisable and round-trips', () => {
  const s = newState();
  const clone = JSON.parse(JSON.stringify(s));
  eq(JSON.stringify(clone), JSON.stringify(s), 'state does not survive a JSON round trip');
});

check('a new game starts with its prebuilt rooms staffed', () => {
  const s = newState();
  eq(s.hotel.rooms.length, data.economy.start.prebuiltRooms.length, 'wrong starting room count');
  const lobby = s.hotel.rooms.find((r) => r.defId === 'lobby');
  assert(lobby?.staffId, 'lobby has no receptionist');
  const closet = s.hotel.rooms.find((r) => r.defId === 'housekeeping');
  assert(closet?.staffId, 'housekeeping has no cleaner');
});

// ---------------------------------------------------------------- economy
check('the hotel earns nothing while closed', () => {
  const s = newState();
  assert(!isOpen(s), 'a new hotel should start closed');
  const coins = s.player.coins;
  advance(data, s, 2 * 3600 * data.economy.simulation.ticksPerSecond);
  eq(s.player.coins, coins, 'a closed hotel earned money');
  eq(s.stats.guestsServed, 0, 'a closed hotel served guests');
});

check('the hotel earns while open', () => {
  const s = newState();
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  const after = s.player.coins;
  advance(data, s, 6 * 3600 * data.economy.simulation.ticksPerSecond);
  assert(s.stats.guestsServed > 0, 'an open hotel served nobody in six hours');
  assert(s.player.coins > after, 'an open hotel earned nothing in six hours');
});

check('a shift expires and closes the hotel', () => {
  const s = newState();
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_2h' });
  assert(isOpen(s), 'shift did not open the hotel');
  const { events } = advance(data, s, (2 * 3600 + 10) * data.economy.simulation.ticksPerSecond);
  assert(!isOpen(s), 'hotel stayed open past its shift');
  assert(events.some((e) => e.type === 'shiftEnded'), 'no shiftEnded event emitted');
});

check('shift cost rises with level', () => {
  const s = newState();
  const atL1 = totalShiftCost(data, s, 'shift_6h');
  s.player.level = 30;
  assert(totalShiftCost(data, s, 'shift_6h') > atL1, 'shift cost did not scale with level');
});

check('a player cannot buy what they cannot afford', () => {
  const s = newState();
  s.player.coins = 10;
  const res = execute(data, s, { type: 'BUILD_ROOM', defId: 'economy', x: 2, y: 0 });
  assert(!res.ok && res.reason === 'cannotAfford', 'a broke player bought a room');
});

check('a player cannot build past the plot boundary', () => {
  const s = newState();
  s.player.coins = 10_000_000;
  const bounds = plotBounds(data, s);
  const res = execute(data, s, { type: 'BUILD_ROOM', defId: 'economy', x: bounds.w, y: 0 });
  assert(!res.ok && res.reason === 'outOfBounds', 'a room was built outside the plot');
});

check('a player cannot stack two rooms on the same block', () => {
  // The block budget alone used to allow this: sixty-five rooms could sit on
  // coordinate 0,0 and the simulation was perfectly happy.
  const s = newState();
  s.player.coins = 10_000_000;
  const existing = s.hotel.rooms[0]!;
  const res = execute(data, s, { type: 'BUILD_ROOM', defId: 'economy', x: existing.x, y: existing.y });
  assert(!res.ok && res.reason === 'overlaps', 'two rooms occupied the same block');
});

check('auto-placement finds a free spot and never overlaps', () => {
  const s = newState();
  s.player.coins = 10_000_000;
  let built = 0;
  for (let i = 0; i < 30; i++) {
    if (execute(data, s, { type: 'BUILD_ROOM', defId: 'economy' }).ok) built++;
  }
  assert(built > 0, 'auto-placement never placed anything');
  for (let i = 0; i < s.hotel.rooms.length; i++) {
    for (let j = i + 1; j < s.hotel.rooms.length; j++) {
      const a = footprintOf(data, s.hotel.rooms[i]!);
      const b = footprintOf(data, s.hotel.rooms[j]!);
      assert(!overlaps(a, b), `rooms ${i} and ${j} overlap after auto-placement`);
    }
  }
  console.log(`      packed ${built} auto-placed rooms with zero overlaps`);
});

check('the plot fills up and then refuses politely', () => {
  const s = newState();
  s.player.coins = 10_000_000;
  for (let i = 0; i < 60; i++) execute(data, s, { type: 'BUILD_ROOM', defId: 'economy' });
  eq(freeBlocks(data, s), 0, 'auto-placement left gaps it could have filled');
  const res = execute(data, s, { type: 'BUILD_ROOM', defId: 'economy' });
  assert(!res.ok && res.reason === 'noSpace', 'a full plot still accepted a room');
});

// ---------------------------------------------------------------- decor & stars
check('decor raises the income multiplier', () => {
  const s = newState();
  s.player.coins = 1_000_000;
  const room = s.hotel.rooms.find((r) => r.defId === 'economy');
  assert(room, 'no economy room to decorate');
  const def = data.rooms.find((r) => r.id === 'economy');
  assert(def, 'no economy definition');
  const before = decorMultiplier(data, def, room);
  execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: 'wallpaper_plain', slot: 0 });
  const after = decorMultiplier(data, def, room);
  assert(after > before, `decor did not raise income (${before} -> ${after})`);
  assert(decorFill(def, room) > 0, 'decor meter did not move');
});

check('an occupied slot cannot be reused', () => {
  const s = newState();
  s.player.coins = 1_000_000;
  const room = s.hotel.rooms.find((r) => r.defId === 'economy')!;
  execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: 'wallpaper_plain', slot: 0 });
  const res = execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: 'flooring_concrete', slot: 0 });
  assert(!res.ok && res.reason === 'slotTaken', 'two items occupied one slot');
});

check('stars never exceed the tier table', () => {
  const s = newState();
  const stars = computeStars(data, s);
  assert(stars >= 1 && stars <= 5, `stars out of range: ${stars}`);
});

check('a fresh hotel actually has the stars the data promises', () => {
  // economy.start.stars once claimed 3 while the formula computed 1, so a new
  // player watched their rating collapse in the first second of play.
  const s = newState();
  eq(computeStars(data, s), data.economy.start.stars,
    'declared starting stars disagree with the star formula');
});

check('the rating floors at 3 and neglect still bites above the floor', () => {
  // Decision 6a: the original rated hotels 3..5. A filthy hotel is punished by
  // pests and blocked income (checked below), not by a rating under 3.
  const s = newState();
  eq(computeStars(data, s), data.economy.start.stars, 'unexpected starting rating');
  for (const room of s.hotel.rooms) room.cleanliness = 0;
  eq(computeStars(data, s), 3, 'the rating left the 3..5 band');
  // Above the floor the rating must still fall: a hotel that structurally
  // qualifies for 4 stars loses that fourth star the moment cleanliness dies,
  // because tier 4 requires minCleanliness and the score loses its share.
  const four = data.starTiers.find((t) => t.stars === 4)!;
  assert(four.minCleanliness > 0, 'tier 4 no longer requires cleanliness — neglect would be free');
});

// ---------------------------------------------------------------- hazards
check('an infested room earns nothing', () => {
  const s = newState();
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  for (const room of s.hotel.rooms) { room.hasPest = true; room.cleanliness = 0; }
  const coins = s.player.coins;
  advance(data, s, 3600 * data.economy.simulation.ticksPerSecond);
  eq(s.player.coins, coins, 'an infested hotel still earned money');
});

check('clearing a hazard costs what the data says', () => {
  const s = newState();
  const room = s.hotel.rooms.find((r) => r.defId === 'economy')!;
  room.hasPest = true;
  const coins = s.player.coins;
  const res = execute(data, s, { type: 'CLEAR_HAZARD', roomId: room.id, hazard: 'pest' });
  assert(res.ok, 'clearing a pest failed');
  assert(!room.hasPest, 'the pest survived');
  eq(s.player.coins, coins - (data.events.find((e) => e.id === 'pest')?.clearCost?.amount ?? 0), 'wrong pest clearing cost');
});

// ---------------------------------------------------------------- offline
check('offline income is capped by remaining shift time', () => {
  const s = newState();
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_2h' });
  const r = resolveOffline(data, s, 30 * 24 * 3600 * 1000);
  assert(r.earningMs <= 2 * 3600 * 1000 + 1, `earned for ${r.earningMs}ms with a 2h shift`);
});

check('a closed hotel earns nothing offline', () => {
  const s = newState();
  const coins = s.player.coins;
  const r = resolveOffline(data, s, 24 * 3600 * 1000);
  eq(r.coins, 0, 'a closed hotel earned offline');
  eq(s.player.coins, coins, 'coins changed while closed');
});

check('offline resolution of 30 days is fast', () => {
  const s = newState();
  s.player.coins = 10_000_000;
  for (let i = 0; i < 6; i++) execute(data, s, { type: 'BUILD_ROOM', defId: 'economy', x: i, y: 1 });
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_48h' });
  // Median of several runs, not one sample — see tools/selftest/measure.ts.
  const t = measure(
    () => JSON.parse(JSON.stringify(s)) as typeof s,
    (copy) => { resolveOffline(data, copy, 30 * 24 * 3600 * 1000); },
  );
  assert(t.median < 50, `took ${t.median.toFixed(1)}ms — the resolver is iterating, not solving`);
  console.log(`      resolved 30 days in ${describe(t)}`);
});

check('the offline cap bounds the reward and not the clock', () => {
  // This asserted the opposite until Phase 1a: that `elapsedMs` itself was
  // clamped. That is what made a year away move the world fourteen hours and
  // left every seasonal date, gift day and cooldown permanently behind.
  const s = newState();
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_48h' });
  const year = 365 * 24 * 3600 * 1000;
  const before = s.epochMs;
  const r = resolveOffline(data, s, year);
  const capMs = data.economy.simulation.maxOfflineHours * 3600 * 1000;

  assert(r.elapsedMs === year, `the clock advanced ${r.elapsedMs} of ${year}`);
  assert(s.epochMs === before + year, 'epochMs did not follow real time');
  assert(r.earningMs <= capMs, `earned ${r.earningMs} past the cap ${capMs}`);
});

// ---------------------------------------------------------------- report
console.log(line);
if (failures.length === 0) {
  console.log(`  ${passed} checks passed`);
} else {
  console.log(`  ${passed} passed, ${failures.length} FAILED`);
  for (const f of failures) console.log(`    ✗ ${f}`);
}
console.log(line);
process.exit(failures.length ? 1 : 0);
