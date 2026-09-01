/**
 * The vitest suite, run without vitest.
 *
 * `npm run verify` runs three vitest files, and vitest needs `node_modules`,
 * which the headless tooling here does not have. So those assertions went
 * fourteen rounds without executing — through a balance retune that changed
 * every income figure, every stay length and the starting balance.
 *
 * They happened to survive, because they read the data rather than hardcoding
 * it. That was luck dressed as design, and luck is not a property.
 *
 * This mirrors what they assert so the same claims are checked every run. It
 * does not replace the vitest suite — that still runs on a real machine with
 * real coverage numbers — it removes the blind spot between.
 *
 * Run: node --experimental-strip-types tools/selftest/vitest-parity.ts
 */
import fs from 'node:fs';
import { loadSimData } from '../balance-sim/load-data.ts';
import { isGuestRoom } from '../../src/core/data-source.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { execute } from '../../src/core/commands/index.ts';
import { advance } from '../../src/core/sim/tick.ts';
import { resolveOffline } from '../../src/core/sim/offline.ts';

const data = loadSimData();
const TPS = data.economy.simulation.ticksPerSecond;

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — vitest claims, checked headlessly');
console.log(line);

// ---------------------------------------------------------------- data
check('coin rooms rise with tier; gem rooms match table A.1 (3B)', () => {
  // The original's ladder is only monotone inside the coin rooms (1/3/7/10).
  // The gem rooms deliberately are not: the Grand Loft outpays the
  // Presidential (42 vs 32) in the April-2010 table, and the table wins.
  const coin = data.rooms.filter(isGuestRoom).filter((r) => r.cost.currency === 'coins')
    .sort((a, b) => a.tier - b.tier);
  for (let i = 1; i < coin.length; i++) {
    assert(coin[i]!.incomePerGuest > coin[i - 1]!.incomePerGuest,
      `"${coin[i]!.id}" pays ${coin[i]!.incomePerGuest} against "${coin[i - 1]!.id}" at ${coin[i - 1]!.incomePerGuest}`);
  }
  const expected: Record<string, number> = { deluxe: 12, honeymoon: 24, executive: 24, luxurySuite: 42, presidential: 32 };
  const gemRooms = data.rooms.filter(isGuestRoom).filter((r) => r.cost.currency === 'gems');
  eq(gemRooms.length, 5, 'the gem catalogue is not five rooms');
  for (const room of gemRooms) {
    eq(room.incomePerGuest, expected[room.id], `"${room.id}" gem payout drifted from table A.1`);
  }
});

check('every unlock names something that exists', () => {
  // Every kind of thing a level can unlock. Guest types were missing from the
  // first version of this list, which reported `tourist` as a phantom room.
  const ids = new Set([
    ...data.rooms.map((r) => r.id),
    ...data.decor.map((d) => d.id),
    ...data.shifts.map((s) => s.id),
    ...data.plots.map((p) => p.id),
    ...data.staffRoles.map((s) => s.id),
    ...data.guestTypes.map((g) => g.id),
    ...data.upgrades.map((u) => u.id),
  ]);
  for (const level of data.levels) {
    for (const unlock of level.unlocks ?? []) {
      assert(ids.has(unlock.id), `level ${level.level} unlocks "${unlock.id}", which does not exist`);
    }
  }
});

// ---------------------------------------------------------------- offline
check('a closed hotel earns nothing while away', () => {
  const s = createInitialState(data, { seed: 1, epochMs: 0 });
  eq(resolveOffline(data, s, 24 * 3600 * 1000).coins, 0, 'a shut hotel paid out overnight');
});

check('offline earning stops when the shift does', () => {
  const s = createInitialState(data, { seed: 1, epochMs: 0 });
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_2h' });
  const result = resolveOffline(data, s, 30 * 24 * 3600 * 1000);
  assert(result.earningMs <= 2 * 3600 * 1000 + 1,
    `a two-hour shift earned across ${(result.earningMs / 3600000).toFixed(1)} hours`);
});

check('a long absence is paid to the cap and clocked in full', () => {
  const s = createInitialState(data, { seed: 1, epochMs: 0 });
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_48h' });
  const year = 365 * 24 * 3600 * 1000;
  const result = resolveOffline(data, s, year);
  assert(result.earningMs <= data.economy.simulation.maxOfflineHours * 3600 * 1000,
    'a year away was paid past the cap');
  assert(result.elapsedMs === year, 'a year away did not advance the clock by a year');
});

// ---------------------------------------------------------------- simulation
check('a shift ends and says so', () => {
  const s = createInitialState(data, { seed: 1, epochMs: 0 });
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_2h' });
  const { events } = advance(data, s, (2 * 3600 + 10) * TPS);
  assert(events.some((e) => e.type === 'shiftEnded'), 'the shift ran out silently');
});

check('the same seed replays identically', () => {
  const run = () => {
    const s = createInitialState(data, { seed: 99, epochMs: 0 });
    execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
    advance(data, s, 3 * 3600 * TPS);
    return JSON.stringify(s);
  };
  eq(run(), run(), 'two identical runs diverged');
});

check('stepping in pieces equals stepping all at once', () => {
  // The property the whole engine rests on: a throttled tab and a smooth one
  // must reach the same hotel.
  const total = 3600 * TPS;
  const whole = createInitialState(data, { seed: 7, epochMs: 0 });
  execute(data, whole, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  advance(data, whole, total);

  const pieces = createInitialState(data, { seed: 7, epochMs: 0 });
  execute(data, pieces, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  for (let i = 0; i < 60; i++) advance(data, pieces, total / 60);

  eq(JSON.stringify(whole), JSON.stringify(pieces), 'batching changed the outcome');
});

// ---------------------------------------------------------------- the gap
check('the vitest files still exist and still assert something', () => {
  // If a file is deleted or emptied, this mirror keeps passing and reports a
  // coverage that is no longer there.
  const files = ['tests/unit/data.test.ts', 'tests/unit/simulation.test.ts', 'tests/determinism/replay.test.ts'];
  let total = 0;
  for (const file of files) {
    assert(fs.existsSync(file), `${file} is gone`);
    const count = [...fs.readFileSync(file, 'utf8').matchAll(/\b(it|test)\(/g)].length;
    assert(count > 0, `${file} declares no tests`);
    total += count;
  }
  console.log(`      ${total} vitest cases across ${files.length} files`);
});

check('the vitest suite reads its numbers rather than hardcoding them', () => {
  // What saved these through the retune. A test asserting `toBe(50000)` for a
  // starting balance would have failed on your machine and passed here.
  const problems: string[] = [];
  for (const file of ['tests/unit/data.test.ts', 'tests/unit/simulation.test.ts']) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/toBe\((\d{4,})\)/g)) {
      problems.push(`${file}: toBe(${m[1]})`);
    }
  }
  assert(problems.length === 0,
    `these pin a balance figure and will break on the next retune: ${problems.join(', ')}`);
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
