import { testGuest } from './guest-factory.ts';
/**
 * Headless tests for staff grades.
 *
 * Three grades were declared from the very first data file — bronze, silver,
 * gold, with efficiencies of 1.0, 1.2 and 1.45 and wages to match. Every hire
 * was bronze, and `efficiency` was read by nothing. Silver and gold existed as
 * a more expensive way to get identical work, obtainable by nobody.
 *
 * Run: node --experimental-strip-types tools/selftest/staff.ts
 */
import { loadSimData } from '../balance-sim/load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { execute } from '../../src/core/commands/index.ts';
import { advance } from '../../src/core/sim/tick.ts';
import { cleaningCapacity, staffEfficiency } from '../../src/core/systems/cleanliness.ts';
import { shiftWages } from '../../src/core/systems/economy.ts';
import { queueCapacity } from '../../src/core/systems/guests.ts';
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

const TPS = data.economy.simulation.ticksPerSecond;
const fresh = (seed = 909): GameState => createInitialState(data, { seed, epochMs: 0 });

function rich(seed = 909): GameState {
  const s = fresh(seed);
  s.player.coins = 20_000_000;
  s.player.level = 40;
  for (const p of [...data.plots].sort((a, b) => a.blocks - b.blocks)) {
    execute(data, s, { type: 'EXPAND_PLOT', plotId: p.id });
  }
  return s;
}

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — staff grades self-test');
console.log(line);

check('the grades are neutralised, exactly (decision 12a)', () => {
  // The original had no staff grades. The rows survive for the schema and for
  // existing saves, but they must be indistinguishable: any grade that works
  // better or costs more would silently reintroduce a system that was removed.
  for (const g of data.staffGrades) {
    eq(g.efficiency, 1, `grade "${g.id}" still changes how well staff work`);
    eq(g.wageMultiplier, 1, `grade "${g.id}" still changes what staff cost`);
  }
});

check('hiring can produce a grade above bronze', () => {
  // Every hire was hardcoded to bronze, so silver and gold were unreachable.
  const seen = new Set<string>();
  for (let seed = 0; seed < 60; seed++) {
    const s = rich(seed);
    execute(data, s, { type: 'BUILD_ROOM', defId: 'housekeeping' });
    const room = s.hotel.rooms[s.hotel.rooms.length - 1]!;
    if (execute(data, s, { type: 'HIRE_STAFF', roomId: room.id, roleId: 'cleaner' }).ok) {
      const staff = s.staff.find((x) => x.roomId === room.id);
      if (staff) seen.add(staff.gradeId);
    }
  }
  assert(seen.size > 1, `every hire across 60 seeds was "${[...seen][0]}" — the ladder is unreachable`);
  console.log(`      grades seen across 60 hires: ${[...seen].sort().join(', ')}`);
});

check('every grade cleans identically (decision 12a)', () => {
  const measure = (gradeId: string) => {
    const s = fresh();
    const closet = s.hotel.rooms.find((r) => r.defId === 'housekeeping')!;
    const staff = s.staff.find((x) => x.roomId === closet.id)!;
    staff.gradeId = gradeId;
    return cleaningCapacity(data, s);
  };
  eq(measure('gold'), measure('bronze'), 'a grade still changes cleaning capacity');
});

check('an unstaffed slot is covered by the dearer temp (4A)', () => {
  // The original's incentive: leave a slot empty and a temp fills it at a
  // higher rate; hire the permanent (free) and the charge disappears. A fully
  // staffed hotel therefore still pays exactly the original shift table.
  const s = fresh();
  s.player.coins += 100_000;
  s.player.level = 10;
  assert(execute(data, s, { type: 'BUILD_ROOM', defId: 'gym' }).ok, 'could not build the gym');
  const role = data.staffRoles.find((r) => r.id === 'trainer')!;
  assert(role.tempWagePerHour > 0, 'the temp wage is zero — the hiring incentive is gone');
  eq(shiftWages(data, s, 'shift_24h'), Math.round(role.tempWagePerHour * 24), 'wrong temp charge');
  const gym = s.hotel.rooms[s.hotel.rooms.length - 1]!;
  assert(execute(data, s, { type: 'HIRE_STAFF', roomId: gym.id, roleId: 'trainer' }).ok, 'hire failed');
  eq(shiftWages(data, s, 'shift_24h'), 0, 'hiring did not remove the temp wage');
});

check('wages are zero, so the shift price is the original table (decision 10a)', () => {
  const s = fresh();
  eq(shiftWages(data, s, 'shift_24h'), 0, 'staffed slots still add wages on top of the table');
  for (const role of data.staffRoles) {
    eq(role.hireCost, 0, `role "${role.id}" still charges a hire cost`);
  }
});

check('an empty staff slot has no efficiency at all', () => {
  const s = fresh();
  eq(staffEfficiency(data, s, null), 0, 'an unstaffed room reported an efficiency');
  eq(staffEfficiency(data, s, 'nobody'), 0, 'an unknown staff id reported an efficiency');
});

check('hiring stays deterministic', () => {
  // The grade is drawn from the seeded rng, so a replay must produce the same
  // team. If hiring reached for Math.random this would fail.
  const run = () => {
    const s = rich(4242);
    for (let i = 0; i < 5; i++) {
      execute(data, s, { type: 'BUILD_ROOM', defId: 'housekeeping' });
      const room = s.hotel.rooms[s.hotel.rooms.length - 1]!;
      execute(data, s, { type: 'HIRE_STAFF', roomId: room.id, roleId: 'cleaner' });
    }
    return s.staff.map((x) => x.gradeId).join(',');
  };
  eq(run(), run(), 'the same seed produced a different team');
});

// ---------------------------------------------------------------- lobby
check('the lobby decides how many can wait, not a global number', () => {
  const s = fresh();
  const lobby = data.rooms.find((r) => r.id === 'lobby')!;
  const declared = Number(
    (lobby as unknown as { function: { queueCapacity: number } }).function.queueCapacity,
  );
  eq(queueCapacity(data, s), declared, 'the lobby\'s own capacity was ignored');
});

check('a hotel with no lobby still has a sane queue limit', () => {
  const s = fresh();
  s.hotel.rooms = s.hotel.rooms.filter((r) => r.defId !== 'lobby');
  assert(queueCapacity(data, s) > 0, 'a lobby-less hotel can queue nobody, which would deadlock arrivals');
});

// ---------------------------------------------------------------- closed
check('a closed hotel gets dirtier than an open one', () => {
  // shifts.json has described this since P1 and nothing applied it: closing
  // for a week cost the player nothing at all.
  const hours = 6;
  const measure = (open: boolean) => {
    const s = fresh();
    for (const room of s.hotel.rooms) room.cleanliness = 0.5;
    if (open) {
      // Assert the shift actually started. An earlier version of this test
      // asked for a shift the starting balance could not cover, the command
      // refused, and both hotels were measured shut.
      const started = execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
      assert(started.ok, `could not open the hotel: ${started.ok === false ? started.reason : ''}`);
    }
    advance(data, s, hours * 3600 * TPS);
    const rooms = s.hotel.rooms.filter((r) => r.defId === 'economy');
    return rooms.reduce((n, r) => n + r.cleanliness, 0) / rooms.length;
  };
  const openHotel = measure(true);
  const shutHotel = measure(false);
  assert(shutHotel < openHotel,
    `a shut hotel ended at ${shutHotel.toFixed(2)} against an open one's ${openHotel.toFixed(2)}`);
  assert(shutHotel > 0,
    `six hours closed took cleanliness to ${shutHotel.toFixed(2)} — that is a ruinous rate, not a nudge`);
  console.log(`      after ${hours}h: open ${openHotel.toFixed(2)}, closed ${shutHotel.toFixed(2)}`);
});

check('nobody waits outside a closed hotel', () => {
  const s = fresh();
  s.guests.push(testGuest({ id: 'gq', typeId: 'standard', state: 'queued', roomId: null,
    stateSinceTick: s.tick, finishesAtTick: 0, desire: null, patienceUntilTick: s.tick + 99999, everCheckedIn: false }));
  s.lobbyQueue.push('gq');
  advance(data, s, 2 * TPS);
  eq(s.lobbyQueue.length, 0, 'guests kept queueing at a hotel that was shut');
});

check('an open hotel keeps its queue', () => {
  const s = fresh();
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  s.guests.push(testGuest({ id: 'gq2', typeId: 'standard', state: 'queued', roomId: null,
    stateSinceTick: s.tick, finishesAtTick: 0, desire: null, patienceUntilTick: s.tick + 99999, everCheckedIn: false }));
  s.lobbyQueue.push('gq2');
  advance(data, s, 2 * TPS);
  // They may have checked in, but they must not have been thrown out.
  const guest = s.guests.find((g) => g.id === 'gq2');
  assert(guest && guest.state !== 'leaving', 'an open hotel turned away a waiting guest');
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
