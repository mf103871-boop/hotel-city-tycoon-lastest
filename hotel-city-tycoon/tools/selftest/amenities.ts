import { testGuest } from './guest-factory.ts';
/**
 * Headless tests for amenities.
 *
 * Eight room types — cafe through swimming pool, costing up to 190,000 coins
 * each — earned exactly nothing for five phases. The `usingAmenity` state sat
 * in the type union with no code path entering it, `incomePerCustomer` was
 * read by nobody, and the whole category was decoration the player paid for.
 *
 * Run: node --experimental-strip-types tools/selftest/amenities.ts
 */
import { loadSimData } from '../balance-sim/load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { advance } from '../../src/core/sim/tick.ts';
import { resolveOffline } from '../../src/core/sim/offline.ts';
import { execute } from '../../src/core/commands/index.ts';
import type { GameState, GuestInstance } from '../../src/core/state/types.ts';
import type { CommercialRoomDef } from '../../src/core/data-source.ts';
import { isCommercialRoom, catalogueFor } from '../../src/core/data-source.ts';

const data = loadSimData();
let passed = 0;
const failures: string[] = [];
type TestFn = () => void | Promise<void>;

/*
 * Registered here, run later — and always awaited.
 *
 * This used to call `fn()` and count the test green the moment it returned.
 * An async callback returns a Promise immediately, so the runner printed a
 * tick before the test had done anything, and every assertion inside it
 * settled afterwards in a rejected promise nobody was listening to. Tests that
 * could not fail were being counted as passing.
 *
 * Registering without executing is what makes the fix hold: there is no longer
 * a code path that runs a callback outside the awaited loop.
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
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }

const TPS = data.economy.simulation.ticksPerSecond;

/** Narrows the room union to a commercial definition, or fails loudly. */
function commercial(id: string): CommercialRoomDef {
  const def = data.rooms.find((r) => r.id === id);
  if (!def || def.category !== 'commercial') throw new Error(`"${id}" is not a commercial room`);
  return def;
}

/** A hotel with rooms, a staffed cafe, and guests who want food. */
function hotelWithCafe(seed = 5150): GameState {
  const s = createInitialState(data, { seed, epochMs: 0 });
  s.player.coins = 5_000_000;
  s.player.level = 20;
  // Buy space first: the starting plot is 12 blocks and the prebuilt rooms
  // already use five, so six more rooms plus a cafe does not fit.
  for (const plot of [...data.plots].sort((a, b) => a.blocks - b.blocks)) {
    execute(data, s, { type: 'EXPAND_PLOT', plotId: plot.id });
  }
  for (let i = 0; i < 6; i++) execute(data, s, { type: 'BUILD_ROOM', defId: 'economy' });
  execute(data, s, { type: 'BUILD_ROOM', defId: 'cafe' });
  const cafe = s.hotel.rooms.find((r) => r.defId === 'cafe');
  if (!cafe) throw new Error('setup failed: the cafe was not built');
  // 4B: the cafe is staffless — nothing to hire.
  return s;
}

function cafeOf(s: GameState) {
  return s.hotel.rooms.find((r) => r.defId === 'cafe')!;
}

/** Put a guest in a room, wanting food, about to check out. */
function guestReadyToLeave(s: GameState, desire: string | null = 'food'): GuestInstance {
  const room = s.hotel.rooms.find((r) => r.defId === 'economy')!;
  const guest: GuestInstance = testGuest({ id: `g_test_${s.counters.guest++}`,
    typeId: 'standard',
    state: 'staying',
    roomId: room.id,
    stateSinceTick: s.tick,
    finishesAtTick: s.tick,
    desire,
    patienceUntilTick: s.tick + 6000, everCheckedIn: false });
  s.guests.push(guest);
  room.occupants.push(guest.id);
  return guest;
}

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — amenities self-test');
console.log(line);

check('a guest who wants food goes to the cafe instead of leaving', () => {
  const s = hotelWithCafe();
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  const guest = guestReadyToLeave(s);
  advance(data, s, 2);
  eq(guest.state, 'usingAmenity', 'the guest walked out past an empty cafe');
  eq(guest.roomId, cafeOf(s).id, 'the guest is not in the cafe');
});

check('the cafe actually takes their money', () => {
  const s = hotelWithCafe();
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  const guest = guestReadyToLeave(s);
  advance(data, s, 2);
  const before = s.player.coins;
  const def = commercial('cafe');
  advance(data, s, (def.serviceDurationSec + 2) * TPS);
  assert(s.player.coins > before,
    'a guest used the cafe and paid nothing — the amenity is still decoration');
  eq(guest.state, 'leaving', 'the guest never finished their visit');
});

check('the staffless cafe serves, and hiring into it is refused (4B)', () => {
  // The original listed the cafe, arcade and disco without staff. There is
  // no closed-for-staffing state left anywhere: a declared slot without a
  // hire is worked by the temp (whose wage shiftWages charges), and these
  // three have no slot at all.
  const s = hotelWithCafe();
  cafeOf(s).staffId = null;
  const hire = execute(data, s, { type: 'HIRE_STAFF', roomId: cafeOf(s).id, roleId: 'chef' });
  assert(!hire.ok, 'the staffless cafe accepted a hire');
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  const guest = guestReadyToLeave(s);
  advance(data, s, 2);
  eq(guest.state, 'usingAmenity', 'the staffless cafe turned a guest away');
});

check('a guest only visits what they actually wanted', () => {
  const s = hotelWithCafe();
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  const guest = guestReadyToLeave(s, 'fitness');   // the hotel has no gym
  advance(data, s, 2);
  eq(guest.state, 'leaving', 'a guest wanting a gym was diverted into a cafe');
});

check('a guest wanting nothing goes straight out', () => {
  const s = hotelWithCafe();
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  const guest = guestReadyToLeave(s, null);
  advance(data, s, 2);
  eq(guest.state, 'leaving', 'a guest with no want was pushed into the cafe anyway');
});

check('a full amenity turns guests away rather than overfilling', () => {
  const s = hotelWithCafe();
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  const def = commercial('cafe');
  const guests = Array.from({ length: def.capacity + 3 }, () => guestReadyToLeave(s));
  advance(data, s, 2);
  const inside = guests.filter((g) => g.state === 'usingAmenity').length;
  assert(inside <= def.capacity, `${inside} guests packed into a cafe holding ${def.capacity}`);
  eq(cafeOf(s).occupants.length, inside, 'the room roster disagrees with the guest states');
});

check('an infested amenity earns nothing', () => {
  const s = hotelWithCafe();
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  cafeOf(s).hasPest = true;
  const guest = guestReadyToLeave(s);
  advance(data, s, 2);
  eq(guest.state, 'leaving', 'a guest was served in an infested cafe');
});

check('decor raises what an amenity earns, exactly as it does for rooms', () => {
  const bare = hotelWithCafe(11);
  const nice = hotelWithCafe(11);
  catalogueFor(data, 'cafe').forEach((defId, slot) => {
    execute(data, nice, { type: 'PLACE_DECOR', roomId: cafeOf(nice).id, defId, slot });
  });
  for (const s of [bare, nice]) {
    execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
    guestReadyToLeave(s);
  }
  const earnings: number[] = [];
  for (const s of [bare, nice]) {
    const before = s.player.coins;
    advance(data, s, (commercial('cafe').serviceDurationSec + 4) * TPS);
    earnings.push(s.player.coins - before);
  }
  assert(earnings[1]! > earnings[0]!,
    `a decorated cafe earned ${earnings[1]} against a bare one's ${earnings[0]}`);
});

check('every commercial room type can serve somebody', () => {
  // If a room type has no guest that ever wants it, the player is buying a
  // very expensive wall decoration.
  const wanted = new Set(data.guestTypes.flatMap(() =>
    data.rooms.filter((r) => r.category === 'commercial').map((r) => r.desireTag)));
  for (const def of data.rooms) {
    if (def.category !== 'commercial') continue;
    assert(wanted.has(def.desireTag), `nothing ever wants "${def.desireTag}", so "${def.id}" can never earn`);
    assert(def.incomePerCustomer > 0, `"${def.id}" pays nothing per customer`);
    assert(def.capacity > 0, `"${def.id}" holds nobody`);
  }
});

check('the amenity catalogue IS table A.2, verbatim (3B)', () => {
  // The old guard demanded quick payback; the original's amenities were star
  // and desire infrastructure, not investments (a cafe at 41,000 coins pays 2
  // a visit). The decisions bind us to the table, so the guard pins the table.
  const T: Record<string, [number, number, number, number, number, number, string | null]> = {
    // id: [cost, capacity, income, xp, serviceSec, unlockLevel, staffRole]
    gym: [5000, 2, 2, 2, 300, 3, 'trainer'],
    restaurant: [17500, 3, 3, 3, 300, 9, 'chef'],
    bar: [14500, 5, 1, 1, 240, 12, 'bartender'],
    cinema: [26500, 4, 2, 2, 360, 17, 'usher'],
    cafe: [41000, 4, 2, 1, 270, 20, null],
    pool: [54500, 3, 6, 6, 300, 24, 'lifeguard'],
    arcade: [14500, 3, 1, 1, 150, 28, null],
    spa: [58000, 5, 1, 1, 120, 30, null],
  };
  const commercial = data.rooms.filter(isCommercialRoom);
  eq(commercial.length, Object.keys(T).length, 'the amenity count drifted from table A.2');
  for (const def of commercial) {
    const row = T[def.id];
    assert(row, `amenity "${def.id}" is not in table A.2`);
    eq(def.cost.amount, row[0], `"${def.id}" price drifted`);
    eq(def.capacity, row[1], `"${def.id}" capacity drifted`);
    eq(def.incomePerCustomer, row[2], `"${def.id}" income drifted`);
    eq(def.xpPerCustomer, row[3], `"${def.id}" XP drifted`);
    eq(def.serviceDurationSec, row[4], `"${def.id}" service length drifted`);
    eq(def.unlockLevel, row[5], `"${def.id}" unlock level drifted`);
    eq(def.staffRole, row[6], `"${def.id}" staff role drifted`);
  }
});

check('offline income includes amenities', () => {
  // Otherwise a hotel earns less while away than the same hotel earns while
  // watched, for no reason a player could see.
  const withCafe = hotelWithCafe(77);
  const without = hotelWithCafe(77);
  const cafe = cafeOf(without);
  without.hotel.rooms = without.hotel.rooms.filter((r) => r.id !== cafe.id);

  for (const s of [withCafe, without]) {
    execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_12h' });
  }
  const a = resolveOffline(data, withCafe, 4 * 3600 * 1000).coins;
  const b = resolveOffline(data, without, 4 * 3600 * 1000).coins;
  assert(a > b, `a hotel with a staffed cafe earned ${a} offline against ${b} without one`);
  console.log(`      four hours away: ${a.toLocaleString()} with a cafe, ${b.toLocaleString()} without`);
});

check('offline and live agree that nothing is closed for staffing (4B)', () => {
  const a0 = hotelWithCafe(88);
  const b0 = hotelWithCafe(88);
  cafeOf(b0).staffId = null; // identical hotels; the cafe has no slot anyway
  for (const s of [a0, b0]) execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_12h' });
  const a = resolveOffline(data, a0, 4 * 3600 * 1000).coins;
  const b = resolveOffline(data, b0, 4 * 3600 * 1000).coins;
  eq(a, b, 'the resolver still has a closed-for-staffing state the tick loop lost');
});

check('a busy hotel with amenities stays deterministic', () => {
  const run = () => {
    const s = hotelWithCafe(20260828);
    execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
    advance(data, s, 1800 * TPS);
    return JSON.stringify(s);
  };
  eq(run(), run(), 'amenities introduced non-determinism into the simulation');
});

check('guests in an amenity are drawn inside it', async () => {
  const { initSelectors } = await import('../../src/bridge/selectors.ts');
  initSelectors(data);
  const { characterViews } = await import('../../src/bridge/characters.ts');

  const s = hotelWithCafe();
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  const guest = guestReadyToLeave(s);
  advance(data, s, 2);
  eq(guest.state, 'usingAmenity', 'setup failed: the guest is not in the cafe');

  const cafe = cafeOf(s);
  const def = commercial('cafe');
  const view = characterViews(s).find((v) => v.id === guest.id)!;
  assert(view.x >= cafe.x && view.x <= cafe.x + def.blocks.w,
    `a guest in the cafe is drawn at x=${view.x}, outside ${cafe.x}..${cafe.x + def.blocks.w}`);
});

await runAll();

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
// exitCode, not exit(): exit() would tear the process down mid-flush and
// could cut off a test that had not settled.
process.exitCode = failures.length ? 1 : 0;
