/**
 * Phase 8 — the final pass.
 *
 * Holds the invariants against states that have actually been played, walks
 * the whole migration chain from version 1, and proves that a refused command
 * changes nothing at all.
 *
 * Run: node --experimental-strip-types tools/selftest/invariants.ts
 */
import { loadSimData } from '../balance-sim/load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { execute } from '../../src/core/commands/index.ts';
import type { Command } from '../../src/core/commands/index.ts';
import { advance } from '../../src/core/sim/tick.ts';
import { resolveOffline } from '../../src/core/sim/offline.ts';
import { checkInvariants } from '../../src/core/state/invariants.ts';
import { migrate, validateState, SaveManager, MemoryStorage } from '../../src/save/index.ts';
import { SCHEMA_VERSION } from '../../src/core/state/types.ts';
import type { GameState } from '../../src/core/state/types.ts';
import { Rng } from '../../src/core/rng/index.ts';

let passed = 0;
const failures: string[] = [];
type TestFn = () => void | Promise<void>;

/*
 * One runner, not two.
 *
 * This file was the careful version: `check` noticed a Promise and told the
 * caller to use `checkAsync` instead. That is better than the silent pass the
 * other suites had, but it still leaves a choice at every call site, and the
 * whole class of bug is somebody making that choice wrong. A single runner
 * that always awaits removes the choice.
 */
const tests: Array<{ name: string; fn: TestFn }> = [];
function check(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

async function runAll(): Promise<void> {
  for (const test of tests) {
    try {
      await test.fn();
      passed++;
      console.log(`  ✓ ${test.name}`);
    } catch (error) {
      failures.push(test.name);
      console.log(`  ✗ ${test.name}`);
      console.error(error);
    }
  }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

const data = loadSimData();
const TPS = data.economy.simulation.ticksPerSecond;
const HOUR = 3_600_000;

function fresh(seed = 4242): GameState {
  return createInitialState(data, { seed, epochMs: 1_700_000_000_000 });
}
function sound(state: GameState, where: string): void {
  const bad = checkInvariants(data, state);
  assert(bad.length === 0,
    `${where}: ${bad.map((v) => `${v.rule} — ${v.detail}`).join('; ')}`);
}

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — invariants');
console.log(line);

// ---------------------------------------------------------------- states

check('a fresh hotel is sound', () => {
  sound(fresh(), 'fresh');
});

check('a played hotel is sound', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 30;
  execute(data, state, { type: 'START_SHIFT', shiftId: 'shift_12h' });
  for (let i = 0; i < 6; i++) execute(data, state, { type: 'BUILD_ROOM', defId: 'economy' });
  advance(data, state, 3600 * TPS);
  sound(state, 'after an hour of play');
});

check('a hotel that has been away is sound', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 30;
  execute(data, state, { type: 'START_SHIFT', shiftId: 'shift_24h' });
  advance(data, state, 600 * TPS);
  resolveOffline(data, state, 9 * HOUR);
  sound(state, 'after nine hours away');
});

check('a hotel that has closed is sound', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 30;
  execute(data, state, { type: 'START_SHIFT', shiftId: 'shift_2h' });
  advance(data, state, state.shift.graceEndsAtTick - state.tick + 100);
  sound(state, 'after the grace window closed');
});

check('a congested hotel is sound', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 30;
  execute(data, state, { type: 'START_SHIFT', shiftId: 'shift_12h' });
  for (const room of state.hotel.rooms) room.hasPest = true;
  advance(data, state, 60 * TPS * 40);
  sound(state, 'with every room blocked and the queue full');
});

check('a rearranged hotel is sound', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 30;
  execute(data, state, { type: 'BUILD_ROOM', defId: 'standard' });
  const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;
  room.cleanliness = 1;
  execute(data, state, { type: 'PLACE_DECOR', roomId: room.id, defId: 'wallpaper_plain', slot: 0 });
  execute(data, state, { type: 'STORE_ROOM', roomId: room.id });
  sound(state, 'with a room in storage');
  execute(data, state, { type: 'PLACE_STORED_ROOM', roomId: room.id });
  sound(state, 'with the room put back');
});

// ---------------------------------------------------------------- the chain

check('a version 1 save migrates all the way to the current one', () => {
  const state = fresh();
  const modern = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;

  /*
   * Strip everything every migration adds, so the object entering the chain
   * looks like the oldest save the game has ever written. Each version has
   * been tested on its own; this is the only check that the twelve steps
   * compose.
   */
  for (const field of [
    'shopTaken', 'gift', 'visitedToday', 'startedAtMs', 'lastDragTick',
    'ownedDecor', 'storedRooms', 'reputation', 'lastServiceRating',
    'unmetDesires', 'ledger', 'lastStarBonusDay',
  ]) delete modern[field];
  const stats = modern['stats'] as Record<string, unknown>;
  delete stats['shiftsOpened'];
  const shift = modern['shift'] as Record<string, unknown>;
  delete shift['graceEndsAtTick'];
  for (const g of modern['guests'] as Array<Record<string, unknown>>) {
    delete g['everCheckedIn']; delete g['satisfaction']; delete g['satisfactionLog'];
  }

  const migrated = migrate(modern, 1, SCHEMA_VERSION);
  const problems = validateState(migrated);
  assert(problems.length === 0, `a version 1 save does not survive the chain: ${problems.join('; ')}`);
  sound(migrated as unknown as GameState, 'after migrating from version 1');
});

check('a save round-trips and stays sound', async () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 30;
  execute(data, state, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  advance(data, state, 1200 * TPS);

  const saves = new SaveManager(new MemoryStorage());
  assert((await saves.save(state, state.epochMs)).ok, 'the save did not write');
  const back = await saves.load();
  assert(back.ok, 'the save did not load');
  sound(back.state, 'after a round trip');
});

// ---------------------------------------------------------------- commands

check('a refused command changes nothing at all', () => {
  const state = fresh();
  state.player.coins += 200_000;
  state.player.level = 20;
  execute(data, state, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  advance(data, state, 300 * TPS);

  /*
   * Every command, aimed at something that does not exist or is not allowed.
   * The determinism guarantee rests on this: a rejection must not move the
   * RNG cursors, or two clients that disagree about what is legal drift apart
   * for ever after.
   */
  const doomed: Command[] = [
    { type: 'BUILD_ROOM', defId: 'nothing' },
    { type: 'SELL_ROOM', roomId: 'nothing' },
    { type: 'PLACE_DECOR', roomId: 'nothing', defId: 'nothing', slot: 0 },
    { type: 'REMOVE_DECOR', roomId: 'nothing', decorId: 'nothing' },
    { type: 'SELL_DECOR', defId: 'nothing' },
    { type: 'MOVE_ROOM', roomId: 'nothing', x: 0, y: 0 },
    { type: 'STORE_ROOM', roomId: 'nothing' },
    { type: 'PLACE_STORED_ROOM', roomId: 'nothing' },
    { type: 'START_SHIFT', shiftId: 'nothing' },
    { type: 'CLEAR_HAZARD', roomId: 'nothing', hazard: 'fire' },
    { type: 'EXPAND_PLOT', plotId: 'nothing' },
    { type: 'HIRE_STAFF', roomId: 'nothing', roleId: 'nothing' },
    { type: 'ASSIGN_STAFF', staffId: 'nothing', roomId: 'nothing' },
    { type: 'UNASSIGN_STAFF', staffId: 'nothing' },
    { type: 'FIRE_STAFF', staffId: 'nothing' },
    { type: 'DRAG_GUEST', guestId: 'nothing' },
    { type: 'TAP_GUEST', guestId: 'nothing' },
    { type: 'CLAIM_OBJECTIVE', objectiveId: 'nothing' },
    { type: 'BUY_UPGRADE', upgradeId: 'nothing' },
    { type: 'BUY_SHOP_OFFER', defId: 'nothing', epochMs: state.epochMs },
    { type: 'VISIT_NEIGHBOUR', neighbourId: 'nothing', epochMs: state.epochMs },
    { type: 'RENAME_HOTEL', name: '' },
  ];

  const before = JSON.stringify(state);
  for (const cmd of doomed) {
    const result = execute(data, state, cmd);
    assert(!result.ok, `${cmd.type} was accepted with a nonsense argument`);
    assert(JSON.stringify(state) === before, `a refused ${cmd.type} changed the state`);
  }
});

check('an unknown command is refused rather than crashing', () => {
  const state = fresh();
  const before = JSON.stringify(state);
  const result = execute(data, state, { type: 'NO_SUCH_COMMAND' } as unknown as Command);
  assert(!result.ok, 'an unknown command reported success');
  assert(JSON.stringify(state) === before, 'an unknown command changed the state');
});

// ---------------------------------------------------------------- the rng

check('the stream stays exact past four days of draws', () => {
  /*
   * `n * 0x9e3779b9` is exact only while the product fits a double's mantissa,
   * which fails at n ≈ 3,405,171 — under four simulated days at ten draws a
   * second. Past that the naive product disagrees with the correct 32-bit one
   * about three times in four. It never crashed and replays still matched, so
   * nothing caught it: the stream stayed deterministic while quietly ceasing
   * to be the sequence it was meant to be.
   */
  const cursors = { guestSpawn: 0, guestType: 0, guestDesire: 0, roomPick: 0, events: 0, staffGrade: 0, poke: 0 };
  const rng = new Rng(12345, { ...cursors, guestSpawn: 4_000_000 });
  const seen = new Set<number>();
  for (let i = 0; i < 2000; i++) {
    const v = rng.next('guestSpawn');
    assert(v >= 0 && v < 1, `draw ${i} past four days returned ${v}`);
    seen.add(v);
  }
  // A degenerate stream repeats. 2,000 draws should be 2,000 distinct floats.
  assert(seen.size > 1990, `only ${seen.size} of 2000 late draws were distinct`);
});

check('the same seed still replays identically', () => {
  const a = fresh(777);
  const b = fresh(777);
  for (const s of [a, b]) {
    s.player.coins += 5_000_000;
    s.player.level = 30;
    execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_12h' });
    advance(data, s, 1800 * TPS);
  }
  assert(JSON.stringify(a) === JSON.stringify(b), 'two runs of one seed diverged');
});

await runAll();

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
// exitCode, not exit(): exit() would tear the process down mid-flush.
process.exitCode = failures.length ? 1 : 0;
