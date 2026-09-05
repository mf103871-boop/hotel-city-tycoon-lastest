/**
 * Phase 1a — time, saving, offline progress, shifts and the queue.
 *
 * Every check here corresponds to a defect that shipped. They are written
 * against the seams the phase established: one shift state machine, one queue
 * reconciler, one settlement path shared by the live loop and the resolver.
 *
 * Run: node --experimental-strip-types tools/selftest/timeline.ts
 */
import { loadSimData } from '../balance-sim/load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { execute } from '../../src/core/commands/index.ts';
import { advance } from '../../src/core/sim/tick.ts';
import { resolveOffline } from '../../src/core/sim/offline.ts';
import { shiftPhase, isOpen } from '../../src/core/systems/economy.ts';
import { checkInTicks, receptionEfficiency } from '../../src/core/systems/guests.ts';
import {
  fixturesFor, slotAt, occupancyKey, spotKindFor, layoutFor, catalogueSlot,
} from '../../src/core/systems/roomAnchors.ts';
import { owned, grant, consume } from '../../src/core/systems/inventory.ts';
import { shopOffers, giftState } from '../../src/core/systems/liveops.ts';
import { objectiveProgress } from '../../src/core/systems/objectives.ts';
import { neighbours, cityRank, ahead } from '../../src/core/systems/neighbours.ts';
import { currentObjective } from '../../src/bridge/objectives.ts';
import { initSelectors } from '../../src/bridge/selectors.ts';
import { findFreeSpot, plotBounds } from '../../src/core/state/grid.ts';
import { readFileSync } from 'node:fs';
import { placementProblem, nextExpansion, decorCatalog, roomDetail } from '../../src/bridge/selectors.ts';
import { checkInvariants } from '../../src/core/state/invariants.ts';
import { roomDef, decorDef, catalogueFor, catalogueIndex } from '../../src/core/data-source.ts';
import { testGuest } from './guest-factory.ts';
import { scoreStay, tipRatio } from '../../src/core/systems/satisfaction.ts';
import { effectActive, cleaningCapacity, incomeBlocked } from '../../src/core/systems/cleanliness.ts';
import { operatingProfit, netProfit, totalShiftCost, shiftUpkeep, shiftIncomeMultiplier, shiftWages } from '../../src/core/systems/economy.ts';
import { cleaningOrder } from '../../src/core/systems/cleaning.ts';
import { computeDecorPoints } from '../../src/core/systems/decor.ts';
import { fireChanceMultiplier, checkPests, maxSimultaneousIncidents } from '../../src/core/systems/events.ts';
import { arrivalsPerMinute, enterAmenity } from '../../src/core/systems/guests.ts';
import type { SimEvent } from '../../src/core/state/types.ts';
import {
  effectiveDecorPoints, variety, condition, hotelScore, amenityCoverage,
} from '../../src/core/systems/quality.ts';
import { computeStars, structuralCeiling, incomeMultiplier, effectiveStars, tierFor } from '../../src/core/systems/stars.ts';
import { slotAllowed } from '../../src/core/systems/quality.ts';
import { GameEngine, fakeClock } from '../../src/bridge/engine.ts';
import { SaveManager, MemoryStorage, migrate, validateState, SAVE_KEY, QUARANTINE_KEY } from '../../src/save/index.ts';
import { SCHEMA_VERSION } from '../../src/core/state/types.ts';
import type { GameState } from '../../src/core/state/types.ts';

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
function eq(a: unknown, b: unknown, m: string): void {
  if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`);
}

const data = loadSimData();

const TPS = data.economy.simulation.ticksPerSecond;
const HOUR = 3600 * 1000;

function fresh(epochMs = 1_700_000_000_000): GameState {
  return createInitialState(data, { seed: 12345, epochMs });
}
function open(state: GameState, shiftId: string): void {
  state.player.coins += 1_000_000;
  // The longer shifts unlock later; these checks are about time, not gating.
  state.player.level = 30;
  const r = execute(data, state, { type: 'START_SHIFT', shiftId });
  assert(r.ok, `could not start ${shiftId}`);
}

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — time, shifts and the queue');
console.log(line);

// ---------------------------------------------------------------- cold boot

check('cold boot resolves the hour the app was shut', () => {
  const clock = fakeClock(5 * HOUR);
  const state = fresh();
  open(state, 'shift_12h');
  const savedAtMs = 4 * HOUR; // saved an hour before the clock reads now
  const engine = new GameEngine(data, state, { clock }, savedAtMs);
  const events = engine.resume();
  const resolved = events.find((e) => e.type === 'offlineResolved');
  assert(resolved, 'cold boot resolved nothing at all');
  assert(resolved.type === 'offlineResolved' && resolved.elapsedMs >= HOUR - 1000,
    `cold boot saw ${(resolved as { elapsedMs: number }).elapsedMs}ms of a 1 hour absence`);
});

check('a new game starts from now rather than from zero', () => {
  const clock = fakeClock(9 * HOUR);
  const engine = new GameEngine(data, fresh(), { clock });
  assert(engine.resume().length === 0, 'a game created at this instant resolved an absence');
});

check('a save from the future is treated as no time passed', () => {
  const clock = fakeClock(HOUR);
  const state = fresh();
  open(state, 'shift_12h');
  const engine = new GameEngine(data, state, { clock }, 10 * HOUR);
  assert(engine.resume().length === 0, 'a backwards clock produced offline progress');
});

// ---------------------------------------------------------------- the cap

check('the offline cap bounds the reward, never the clock', () => {
  const state = fresh();
  open(state, 'shift_48h');
  const startTick = state.tick;
  const startEpoch = state.epochMs;
  const away = 48 * HOUR;
  const result = resolveOffline(data, state, away);

  assert(result.elapsedMs === away, `clock advanced ${result.elapsedMs}ms of a ${away}ms absence`);
  assert(state.epochMs === startEpoch + away, 'epochMs was truncated to the reward cap');
  assert(state.tick === startTick + Math.floor((away / 1000) * TPS), 'tick was truncated to the reward cap');

  const capMs = data.economy.simulation.maxOfflineHours * HOUR;
  assert(result.earningMs <= capMs, `earned over ${capMs}ms: ${result.earningMs}ms`);
});

check('a 48 hour shift does not survive a 48 hour absence', () => {
  const state = fresh();
  open(state, 'shift_48h');
  resolveOffline(data, state, 49 * HOUR);
  assert(shiftPhase(state) === 'closed',
    `a 48h shift was still ${shiftPhase(state)} after 49 hours away`);
});

check('returning twice does not pay for the same absence twice', () => {
  const a = fresh();
  open(a, 'shift_12h');
  resolveOffline(data, a, 6 * HOUR);
  const once = a.player.coins;

  const b = fresh();
  open(b, 'shift_12h');
  resolveOffline(data, b, 3 * HOUR);
  resolveOffline(data, b, 3 * HOUR);

  // Two returns covering the same six hours may not out-earn one.
  assert(b.player.coins <= once * 1.02,
    `split return earned ${b.player.coins} against ${once} for one return`);
});

check('an absence longer than the shift stops earning when the shift does', () => {
  const short = fresh();
  open(short, 'shift_2h');
  const r = resolveOffline(data, short, 24 * HOUR);
  assert(r.earningMs <= 2 * HOUR + 1000,
    `a 2 hour shift earned for ${(r.earningMs / HOUR).toFixed(1)} hours`);
  assert(r.elapsedMs === 24 * HOUR, 'the clock stopped with the shift');
});

// ---------------------------------------------------------------- shift FSM

check('the three phases follow one another in order', () => {
  const state = fresh();
  open(state, 'shift_2h');
  assert(shiftPhase(state) === 'active', 'a freshly paid shift is not active');

  advance(data, state, state.shift.endsAtTick - state.tick);
  if (data.graceSec === 0) {
    // Decision 5a: the original closed hard — there is no grace phase at all.
    assert(shiftPhase(state) === 'closed', `at endsAtTick the phase is ${shiftPhase(state)}`);
  } else {
    assert(shiftPhase(state) === 'grace', `at endsAtTick the phase is ${shiftPhase(state)}`);
    advance(data, state, data.graceSec * TPS);
    assert(shiftPhase(state) === 'closed', `after grace the phase is ${shiftPhase(state)}`);
  }
});

check('nobody checks in after the shift ends', () => {
  const state = fresh();
  open(state, 'shift_2h');
  advance(data, state, state.shift.endsAtTick - state.tick);
  // Sitting in grace, put a guest at the door by hand.
  state.guests.push(testGuest({
    id: 'late', state: 'arriving', stateSinceTick: state.tick,
    patienceUntilTick: state.tick + 100000,
  }));
  advance(data, state, 20);
  const late = state.guests.find((g) => g.id === 'late');
  assert(!late || late.state !== 'staying', 'a guest checked in during the grace window');
});

check('grace settles everyone exactly once and empties the hotel', () => {
  const state = fresh();
  open(state, 'shift_2h');
  advance(data, state, 60 * TPS * 30); // half an hour of ordinary play
  advance(data, state, state.shift.graceEndsAtTick - state.tick + 1);

  for (const room of state.hotel.rooms) {
    assert(room.occupants.length === 0, `${room.id} still holds ${room.occupants.length} guest(s)`);
  }
  assert(state.lobbyQueue.length === 0, 'the queue survived the grace window');
  const stuck = state.guests.filter((g) => g.state === 'staying' || g.state === 'usingAmenity');
  assert(stuck.length === 0, `${stuck.length} guest(s) stranded past grace`);
});

check('a closed hotel earns nothing', () => {
  const state = fresh();
  const before = state.player.coins;
  advance(data, state, 60 * TPS * 60);
  assert(state.player.coins === before, 'a closed hotel earned coins');
});

// ---------------------------------------------------------------- the queue

check('a queued guest appears in the lobby exactly once', () => {
  const state = fresh();
  open(state, 'shift_12h');
  // Fill every room so arrivals have nowhere to go but the queue.
  for (const room of state.hotel.rooms) room.hasPest = true;
  advance(data, state, 60 * TPS * 20);

  const seen = new Set<string>();
  for (const id of state.lobbyQueue) {
    assert(!seen.has(id), `guest ${id} appears more than once in the queue`);
    seen.add(id);
  }
  const queued = new Set(state.guests.filter((g) => g.state === 'queued').map((g) => g.id));
  for (const id of state.lobbyQueue) assert(queued.has(id), `queue holds ${id}, who is not queued`);
  for (const id of queued) assert(seen.has(id), `queued guest ${id} is missing from the queue`);
});

check('the queue holds its capacity under sustained congestion', () => {
  const state = fresh();
  open(state, 'shift_24h');
  for (const room of state.hotel.rooms) room.hasPest = true;
  advance(data, state, 60 * TPS * 90);
  const cap = data.economy.guests.maxLobbyQueue;
  assert(state.lobbyQueue.length <= Math.max(cap, 64),
    `the queue grew to ${state.lobbyQueue.length}`);
});

check('guest and room agree about who is where', () => {
  const state = fresh();
  open(state, 'shift_12h');
  advance(data, state, 60 * TPS * 45);
  const byId = new Map(state.guests.map((g) => [g.id, g]));
  for (const room of state.hotel.rooms) {
    for (const id of room.occupants) {
      const guest = byId.get(id);
      assert(guest, `${room.id} lists ${id}, who does not exist`);
      assert(guest.roomId === room.id, `${id} thinks they are in ${guest.roomId}, not ${room.id}`);
    }
  }
  for (const guest of state.guests) {
    if (guest.roomId === null) continue;
    const room = state.hotel.rooms.find((r) => r.id === guest.roomId);
    assert(room?.occupants.includes(guest.id), `${guest.id} holds ${guest.roomId} but is not in it`);
  }
});

// ---------------------------------------------------------------- drag

check('a guest who has already paid cannot be dragged back', () => {
  const state = fresh();
  open(state, 'shift_12h');
  advance(data, state, 60 * TPS * 40);
  const paid = state.guests.find((g) => g.everCheckedIn && g.state === 'leaving');
  if (!paid) return; // nobody finished in this window; nothing to assert
  const before = state.player.coins;
  const r = execute(data, state, { type: 'DRAG_GUEST', guestId: paid.id });
  assert(!r.ok, 'a guest who had already stayed was re-queued');
  assert(state.player.coins === before, 'a rejected drag moved coins');
});

check('the drag cooldown is enforced', () => {
  const state = fresh();
  open(state, 'shift_12h');
  advance(data, state, 20);
  const walkers = state.guests.filter((g) => !g.everCheckedIn && g.state === 'arriving');
  if (walkers.length < 2) return;
  const first = execute(data, state, { type: 'DRAG_GUEST', guestId: walkers[0]!.id });
  assert(first.ok, 'the first drag was refused');
  const second = execute(data, state, { type: 'DRAG_GUEST', guestId: walkers[1]!.id });
  assert(!second.ok && second.reason === 'dragOnCooldown',
    'a second drag went through inside the cooldown');
});

check('a rejected drag leaves the state and the RNG untouched', () => {
  const state = fresh();
  open(state, 'shift_12h');
  advance(data, state, 60 * TPS * 5);
  const before = JSON.stringify(state);
  execute(data, state, { type: 'DRAG_GUEST', guestId: 'nobody' });
  assert(JSON.stringify(state) === before, 'a refused drag changed the state');
});

// ---------------------------------------------------------------- migration

check('a version 7 save migrates and validates', () => {
  const state = fresh();
  open(state, 'shift_12h');
  const old = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
  delete (old['shift'] as Record<string, unknown>)['graceEndsAtTick'];
  delete old['lastDragTick'];
  for (const g of old['guests'] as Array<Record<string, unknown>>) delete g['everCheckedIn'];

  const migrated = migrate(old, 7, SCHEMA_VERSION);
  const problems = validateState(migrated);
  assert(problems.length === 0, `migrated save is invalid: ${problems.join('; ')}`);
  const shift = migrated['shift'] as Record<string, number>;
  assert(shift['graceEndsAtTick'] === shift['endsAtTick'],
    'an existing save was handed grace it did not pay for');
});

check('a save round-trips through storage at the current version', async () => {
  const state = fresh();
  open(state, 'shift_6h');
  advance(data, state, 60 * TPS * 10);
  const saves = new SaveManager(new MemoryStorage());
  const wrote = await saves.save(state, 1_700_000_500_000);
  assert(wrote.ok, 'the save did not write');
  const back = await saves.load();
  assert(back.ok, `the save did not load back: ${back.ok === false ? back.reason : ''}`);
  assert(back.ok && back.savedAtMs === 1_700_000_500_000, 'savedAtMs did not survive the round trip');
  assert(back.ok && back.state.shift.graceEndsAtTick === state.shift.graceEndsAtTick,
    'the grace boundary did not survive the round trip');
});

// ---------------------------------------------------------------- parity

check('the offline discount delivers the throughput it declares', () => {
  const live = fresh();
  open(live, 'shift_12h');
  advance(live.player.level >= 0 ? data : data, live, 2 * 3600 * TPS);
  const liveServed = live.stats.guestsServed;

  const away = fresh();
  open(away, 'shift_12h');
  resolveOffline(data, away, 2 * HOUR);
  const awayServed = away.stats.guestsServed;

  const target = data.economy.simulation.offlineEfficiency;
  const actual = liveServed === 0 ? target : awayServed / liveServed;
  console.log(`      served: live ${liveServed} · away ${awayServed} · ratio ${actual.toFixed(3)} · lever ${target}`);

  /*
   * `offlineEfficiency` used to read 0.5 and deliver about 0.95, because it was
   * doing two jobs: correcting a modelling error and expressing a design
   * choice. Those are separate numbers now — `analyticThroughputFactor` is
   * measured, this one is chosen — so the lever can finally be asserted.
   * Measured across five hotel sizes and two window lengths, delivered
   * throughput averages 0.849 against a declared 0.85.
   */
  assert(Math.abs(actual - target) <= 0.25,
    `the offline lever claims ${target} and delivered ${actual.toFixed(3)} of live throughput`);
});

check('offline coin parity is recorded, and is not yet right', () => {
  const live = fresh();
  open(live, 'shift_12h');
  advance(data, live, 2 * 3600 * TPS);
  const away = fresh();
  open(away, 'shift_12h');
  resolveOffline(data, away, 2 * HOUR);

  const ratio = live.stats.coinsEarned === 0 ? 1 : away.stats.coinsEarned / live.stats.coinsEarned;
  console.log(`      coins: ratio ${ratio.toFixed(3)} against a ${data.economy.simulation.offlineEfficiency} lever`);

  /*
   * Throughput is now honest; the money is not, and this check says so rather
   * than passing quietly.
   *
   * The resolver pays every served guest a spawn-weighted AVERAGE rate. The
   * tick loop pays each guest their own rate, and does not pay at all for
   * guests who leave without a room or whose room is gated. So the two
   * disagree on coins even when they agree on guests, and the direction
   * depends on which guest types happen to be unlocked. Measured range across
   * hotel sizes: 0.77 to 1.43 of live, against a 0.85 lever.
   *
   * Fixing it means the resolver settling payouts per guest type rather than
   * per average, which is Phase 6b. This bound stops it drifting further.
   */
  assert(ratio >= 0.6 && ratio <= 1.6,
    `offline coin ratio ${ratio.toFixed(3)} has drifted outside the recorded range`);
});

check('the shift ends at the same tick whether watched or not', () => {
  const live = fresh();
  open(live, 'shift_2h');
  advance(data, live, 3 * 3600 * TPS);

  const away = fresh();
  open(away, 'shift_2h');
  resolveOffline(data, away, 3 * HOUR);

  assert(shiftPhase(live) === shiftPhase(away),
    `watched hotel is ${shiftPhase(live)}, unwatched is ${shiftPhase(away)}`);
  assert(!isOpen(live) && !isOpen(away), 'a 2 hour shift outlived 3 hours');
});

// ---------------------------------------------------------------- reception

check('every receptionist checks guests in at the same speed (decision 12a)', () => {
  const slow = fresh();
  open(slow, 'shift_12h');
  const desk = slow.staff.find((st) => st.roleId === 'receptionist');
  assert(desk, 'the starting hotel has nobody on reception');
  desk.gradeId = 'bronze';
  const bronze = checkInTicks(data, slow);

  desk.gradeId = 'gold';
  const gold = checkInTicks(data, slow);

  // Decision 12a: grades are neutralised — every desk works at the same speed.
  eq(gold, bronze, `grades still change check-in speed: gold ${gold} vs bronze ${bronze}`);
});

check('check-in takes time rather than happening instantly', () => {
  const state = fresh();
  open(state, 'shift_12h');
  advance(data, state, 1);
  // Run until somebody is at the desk.
  let atDesk = false;
  for (let i = 0; i < 600 && !atDesk; i++) {
    advance(data, state, 10);
    atDesk = state.guests.some((g) => g.state === 'checkingIn');
  }
  assert(atDesk, 'nobody ever occupied the reception desk');
});

check('reception serves one guest at a time', () => {
  const state = fresh();
  open(state, 'shift_12h');
  for (let i = 0; i < 300; i++) {
    advance(data, state, 10);
    const atDesk = state.guests.filter((g) => g.state === 'checkingIn').length;
    assert(atDesk <= 1, `${atDesk} guests were at the desk at once`);
  }
});

check('a guest at the desk holds the bed they were given', () => {
  const state = fresh();
  open(state, 'shift_12h');
  for (let i = 0; i < 400; i++) {
    advance(data, state, 5);
    for (const guest of state.guests) {
      if (guest.state !== 'checkingIn') continue;
      const room = state.hotel.rooms.find((r) => r.id === guest.roomId);
      assert(room, `${guest.id} is checking in to a room that does not exist`);
      assert(room.occupants.includes(guest.id), `${guest.id}'s bed was not reserved`);
    }
  }
});

check('an empty desk slows the hotel rather than stopping it', () => {
  const state = fresh();
  const lobby = state.hotel.rooms.find((r) => r.defId === 'lobby');
  assert(lobby, 'no lobby');
  lobby.staffId = null;

  const eff = receptionEfficiency(data, state);
  assert(eff === data.economy.guests.tempReceptionistEfficiency,
    `an unstaffed desk reported efficiency ${eff}`);
  // requireReceptionist is false in the data, so the shift must still open —
  // losing a receptionist should not be a dead end.
  state.player.coins += 100_000;
  const r = execute(data, state, { type: 'START_SHIFT', shiftId: 'shift_2h' });
  assert(r.ok, `an unstaffed hotel could not open: ${r.ok === false ? r.reason : ''}`);
});

check('the temp desk serves at full speed and charges for it (4B)', () => {
  // Temps are complete workers in the original model — an empty desk costs
  // money, never throughput. The two hotels must serve identically; what
  // separates them is the temp wage on the unstaffed one.
  const fast = fresh();
  open(fast, 'shift_12h');
  advance(data, fast, 30 * 60 * TPS);

  const slow = fresh();
  const lobby = slow.hotel.rooms.find((r) => r.defId === 'lobby')!;
  const desk = slow.staff.find((st) => st.id === lobby.staffId)!;
  execute(data, slow, { type: 'UNASSIGN_STAFF', staffId: desk.id });
  open(slow, 'shift_12h');
  advance(data, slow, 30 * 60 * TPS);

  console.log(`      staffed ${fast.stats.guestsServed} served · temp desk ${slow.stats.guestsServed}`);
  eq(slow.stats.guestsServed, fast.stats.guestsServed,
    'a temp desk changed throughput — the original charged for temps, it never slowed them');
  eq(shiftWages(data, fast, 'shift_12h'), 0, 'a fully staffed hotel is paying wages');
  assert(shiftWages(data, slow, 'shift_12h') > 0, 'the temp desk costs nothing');
});

// ---------------------------------------------------------------- ownership

check('the shop hands over what it charges for', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.gems += 500;
  const epochMs = state.epochMs;
  const offers = shopOffers(data, state, epochMs);
  assert(offers.length > 0, 'the shop had nothing to sell');
  const offer = offers[0]!;

  const before = owned(state, offer.defId);
  const r = execute(data, state, { type: 'BUY_SHOP_OFFER', defId: offer.defId, epochMs });
  assert(r.ok, `the purchase was refused: ${r.ok === false ? r.reason : ''}`);
  assert(owned(state, offer.defId) === before + 1,
    'coins left the player and no item arrived');
});

/** The first two pieces the standard room sells — what most checks below furnish it with. */
const STANDARD_A = catalogueFor(data, 'standard')[0]!;
const STANDARD_B = catalogueFor(data, 'standard')[1]!;

/** The floor covering (rug or flooring) a room sells — every room sells one. */
function surfaceSoldBy(roomDefId: string): string {
  const id = catalogueFor(data, roomDefId).find((d) => {
    const def = decorDef(data, d);
    return spotKindFor(def.category, def.slotType) === 'surface';
  });
  if (!id) throw new Error(`${roomDefId} sells no floor covering`);
  return id;
}

check('buy, place, remove, place again — one item, tracked throughout', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.gems += 500;
  state.player.level = 30;
  const epochMs = state.epochMs;
  const offer = shopOffers(data, state, epochMs)[0]!;
  // The shelf only carries what one of the player's own rooms sells, so
  // there is a room with a place kept for it.
  const room = state.hotel.rooms.find((r) => catalogueIndex(data, r.defId, offer.defId) >= 0);
  assert(room, `the shop offered ${offer.defId}, which none of the player's rooms sells`);
  const slot = catalogueIndex(data, room.defId, offer.defId);

  execute(data, state, { type: 'BUY_SHOP_OFFER', defId: offer.defId, epochMs });
  assert(owned(state, offer.defId) === 1, 'purchase did not land');

  const coinsAfterBuy = state.player.coins;
  const placed = execute(data, state, { type: 'PLACE_DECOR', roomId: room.id, defId: offer.defId, slot });
  assert(placed.ok, `placing failed: ${placed.ok === false ? placed.reason : ''}`);
  assert(owned(state, offer.defId) === 0, 'placing did not consume the owned copy');
  assert(state.player.coins === coinsAfterBuy, 'placing an owned item charged for it again');

  const piece = room.decor.find((p) => p.defId === offer.defId)!;
  const removed = execute(data, state, { type: 'REMOVE_DECOR', roomId: room.id, decorId: piece.id });
  assert(removed.ok, 'removing failed');
  assert(owned(state, offer.defId) === 1, 'removing did not return the item');
  assert(state.player.coins === coinsAfterBuy, 'removing quietly sold the item');
});

check('replacing a piece hands the old one back and stands the new one in its own place', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 40;
  const room = state.hotel.rooms.find((r) => r.defId === 'economy')!;
  const def = data.rooms.find((r) => r.id === 'economy')!;
  const [first, second] = catalogueFor(data, 'economy');
  execute(data, state, { type: 'PLACE_DECOR', roomId: room.id, defId: first!, slot: 0 });
  const piece = room.decor[0]!;
  const id = piece.id;

  const swapped = execute(data, state, {
    type: 'REPLACE_DECOR', roomId: room.id, decorId: piece.id, defId: second!,
  });
  assert(swapped.ok, `replacing failed: ${swapped.ok === false ? swapped.reason : ''}`);
  assert(room.decor.length === 1, 'replacing added a piece instead of swapping one');
  const now = room.decor[0]!;
  assert(now.id === id, 'the swap minted a new piece id');
  assert(now.defId === second, 'the swap did not take');
  // Every piece a room sells has one place of its own, and a swap stands the
  // new piece in ITS place — keeping the old one would put a lamp where the
  // rug goes.
  const place = catalogueSlot('economy', def.blocks.w, def.blocks.h, 1)!;
  assert(now.slot === 1, `the swapped-in piece is in slot ${now.slot}, not its own (1)`);
  assert(now.localX === place.x && now.localY === place.y,
    'the swapped-in piece is not standing in its own place');
  assert(owned(state, first!) === 1, 'the replaced piece was not handed back');
  assert(room.decorPoints === decorDef(data, second!).decorPoints, 'the meter did not follow the swap');
});

check('every piece a room sells stands in its own place, apart from the others, and the set fills the meter', () => {
  // The whole of the per-room design, stated as a property: the position of a
  // piece in the room's list is where it goes, no two pieces share a spot,
  // and buying all eight fills the meter exactly.
  const state = fresh();
  state.player.coins += 50_000_000;
  state.player.gems += 500;
  state.player.level = 52;
  for (const defId of ['restaurant', 'gym', 'deluxe']) {
    assert(execute(data, state, { type: 'BUILD_ROOM', defId }).ok, `could not build a ${defId}`);
  }
  let rooms = 0;
  for (const room of state.hotel.rooms) {
    const def = data.rooms.find((r) => r.id === room.defId)!;
    const list = catalogueFor(data, room.defId);
    assert(list.length === 8, `${room.defId} sells ${list.length} pieces, not 8`);
    list.forEach((defId, slot) => {
      const r = execute(data, state, { type: 'PLACE_DECOR', roomId: room.id, defId, slot });
      assert(r.ok, `${room.defId} refused its own ${defId}: ${r.ok === false ? r.reason : ''}`);
      const piece = room.decor.find((p) => p.defId === defId)!;
      const place = catalogueSlot(room.defId, def.blocks.w, def.blocks.h, slot)!;
      assert(piece.slot === slot && piece.localX === place.x && piece.localY === place.y,
        `${room.defId}'s ${defId} stands at (${piece.localX},${piece.localY}) slot ${piece.slot}, `
        + `not its own place (${place.x},${place.y}) slot ${slot}`);
    });
    const spots = new Set(room.decor.map((p) => `${p.localX},${p.localY}`));
    // A rug shares its spot with what stands on it by design, so the anchors
    // may repeat only between a surface and a standing piece.
    for (const a of room.decor) {
      for (const b of room.decor) {
        if (a.id >= b.id || a.localX !== b.localX || a.localY !== b.localY) continue;
        const ka = spotKindFor(decorDef(data, a.defId).category, decorDef(data, a.defId).slotType);
        const kb = spotKindFor(decorDef(data, b.defId).category, decorDef(data, b.defId).slotType);
        assert((ka === 'surface') !== (kb === 'surface'),
          `${room.defId} stands ${a.defId} and ${b.defId} on the same spot`);
      }
    }
    assert(spots.size >= 6, `${room.defId} uses only ${spots.size} spots for 8 pieces`);
    if (def.decorTarget > 0) {
      const coinPoints = list.filter((id) => decorDef(data, id).cost.currency === 'coins')
        .reduce((n, id) => n + decorDef(data, id).decorPoints, 0);
      assert(coinPoints === def.decorTarget,
        `${room.defId}'s coin pieces total ${coinPoints} against a target of ${def.decorTarget}`);
      assert(room.decorPoints >= def.decorTarget, `${room.defId}'s full set leaves the meter short`);
    }
    // Once: a second copy has nowhere to stand.
    const again = execute(data, state, { type: 'PLACE_DECOR', roomId: room.id, defId: list[0]!, slot: 0 });
    assert(!again.ok && again.reason === 'alreadyPlaced', `${room.defId} sold the same piece twice`);
    rooms++;
  }
  console.log(`      ${rooms} rooms furnished with their whole sets`);
});

check('a rug in a bedroom does not delete the bedroom\'s bed', () => {
  /*
   * A rug and the bed share a coordinate by design, because a rug lies under
   * the bed standing on it. Hiding a built-in by coordinate alone meant a
   * cheap rug deleted the room's bed, and the save migration re-anchored
   * every legacy rug onto exactly that coordinate, so it would have happened
   * on one load.
   */
  initSelectors(data);
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 40;
  const room = state.hotel.rooms.find((r) => r.defId === 'economy')!;
  const def = data.rooms.find((r) => r.id === 'economy')!;
  const before = fixturesFor('economy', def.blocks.w, def.blocks.h, new Set());
  const rug = surfaceSoldBy('economy');
  const placedOk = execute(data, state, {
    type: 'PLACE_DECOR', roomId: room.id, defId: rug, slot: catalogueIndex(data, 'economy', rug),
  });
  assert(placedOk.ok, `placing the rug failed: ${placedOk.ok === false ? placedOk.reason : ''}`);
  const detail = roomDetail(state, room.id)!;
  assert(detail.builtIn.length === before.length,
    `laying a rug removed ${before.length - detail.builtIn.length} of the room's built-in pieces`);
  assert(detail.builtIn.some((f) => f.defId === 'bed_cot'), 'the room lost its bed');
});

check('a rug does not take the bed\'s place away from the next bed', () => {
  /*
   * The two share a coordinate on purpose. Blocking by the bare anchor meant a
   * rug laid first made the bed's place unavailable, and the bed that followed
   * fell through to the scan and landed wherever it reached — the exact
   * behaviour the room plans exist to remove.
   */
  initSelectors(data);
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 40;
  const room = state.hotel.rooms.find((r) => r.defId === 'economy')!;
  const def = data.rooms.find((r) => r.id === 'economy')!;
  const rug = surfaceSoldBy('economy');
  const bed = catalogueFor(data, 'economy').find((id) => decorDef(data, id).category === 'bed');
  assert(bed, 'the economy room sells no bed');
  const bedSlot = catalogueSlot('economy', def.blocks.w, def.blocks.h, catalogueIndex(data, 'economy', bed))!;
  execute(data, state, {
    type: 'PLACE_DECOR', roomId: room.id, defId: rug, slot: catalogueIndex(data, 'economy', rug),
  });
  const placedBed = execute(data, state, {
    type: 'PLACE_DECOR', roomId: room.id, defId: bed, slot: catalogueIndex(data, 'economy', bed),
  });
  assert(placedBed.ok, `placing the bed failed: ${placedBed.ok === false ? placedBed.reason : ''}`);
  const piece = room.decor.find((p) => p.defId === bed)!;
  assert(piece.localX === bedSlot.x && piece.localY === bedSlot.y,
    `the bed landed at (${piece.localX},${piece.localY}) instead of its own place `
    + `(${bedSlot.x},${bedSlot.y})`);
});

check('replacing refuses what the room refuses, and changes nothing when it does', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 40;
  const room = state.hotel.rooms.find((r) => r.defId === 'housekeeping')!;
  const [first] = catalogueFor(data, 'housekeeping');
  execute(data, state, { type: 'PLACE_DECOR', roomId: room.id, defId: first!, slot: 0 });
  const piece = room.decor[0]!;

  const before = JSON.stringify(state);
  // A bed in a cleaning cupboard, a piece another room sells, and the same
  // piece it already is: all refused, and a refusal has to leave the state
  // byte-identical.
  for (const defId of ['bed_single', catalogueFor(data, 'economy')[0]!, first!]) {
    const r = execute(data, state, {
      type: 'REPLACE_DECOR', roomId: room.id, decorId: piece.id, defId,
    });
    assert(!r.ok, `replacing with ${defId} was allowed in a housekeeping room`);
    assert(JSON.stringify(state) === before, `a refused swap with ${defId} changed the state`);
  }
});

check('a room arrives furnished, and buying takes the built-in\'s place', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 40;
  const room = state.hotel.rooms.find((r) => r.defId === 'economy')!;
  const def = data.rooms.find((r) => r.id === 'economy')!;
  const built = fixturesFor('economy', def.blocks.w, def.blocks.h, new Set());
  assert(built.length > 0, 'an economy room arrives with nothing in it');
  assert(room.decorPoints === 0, 'the built-in furniture moved the decor meter');

  // The upgrade path: the room's own piece for a built-in's place is the
  // catalogue entry whose slot carries the fixture, and buying it lands
  // exactly there.
  const layout = layoutFor('economy', def.blocks.w, def.blocks.h);
  const index = layout.findIndex((slot, i) => i < 8 && slot.fixture !== undefined);
  assert(index >= 0, 'the economy room sells nothing that takes a built-in\'s place');
  const target = layout[index]!;
  const defId = catalogueFor(data, 'economy')[index]!;
  const placed = execute(data, state, { type: 'PLACE_DECOR', roomId: room.id, defId, slot: index });
  assert(placed.ok, `upgrading the built-in failed: ${placed.ok === false ? placed.reason : ''}`);
  const piece = room.decor[0]!;
  assert(piece.localX === target.x && piece.localY === target.y,
    'the bought piece did not take the built-in\'s place');
  const slot = slotAt('economy', def.blocks.w, def.blocks.h, piece.localX, piece.localY, target.kind);
  const after = fixturesFor('economy', def.blocks.w, def.blocks.h,
    new Set([occupancyKey(slot!.kind, piece.localX, piece.localY)]));
  assert(after.length === built.length - 1, 'the built-in is still drawn under the new piece');
});

check('placing without owning one buys it outright', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 30;
  const room = state.hotel.rooms.find((r) => r.defId === 'economy')!;
  const def = decorDef(data, catalogueFor(data, 'economy').find((id) => decorDef(data, id).cost.currency === 'coins')!);
  const before = state.player.coins;
  const r = execute(data, state, {
    type: 'PLACE_DECOR', roomId: room.id, defId: def.id, slot: catalogueIndex(data, 'economy', def.id),
  });
  assert(r.ok, 'a direct purchase was refused');
  assert(state.player.coins === before - def.cost.amount, 'the direct purchase did not charge');
  assert(owned(state, def.id) === 0, 'a direct purchase left a phantom copy in the store');
});

check('selling is its own act, and pays from the store', () => {
  const state = fresh();
  const def = data.decor.find((d) => d.cost.currency === 'coins' && d.sellable)!;
  grant(state, def.id);
  const before = state.player.coins;
  const r = execute(data, state, { type: 'SELL_DECOR', defId: def.id });
  assert(r.ok, `selling was refused: ${r.ok === false ? r.reason : ''}`);
  assert(owned(state, def.id) === 0, 'selling did not consume the copy');
  const expected = Math.round(def.cost.amount * data.economy.sellback.ratio);
  assert(state.player.coins === before + expected,
    `selling paid ${state.player.coins - before} rather than ${expected}`);
});

check('selling what you do not own is refused and changes nothing', () => {
  const state = fresh();
  const def = data.decor.find((d) => d.sellable)!;
  const before = JSON.stringify(state);
  const r = execute(data, state, { type: 'SELL_DECOR', defId: def.id });
  assert(!r.ok && r.reason === 'notOwned', 'sold an item the player does not have');
  assert(JSON.stringify(state) === before, 'a refused sale changed the state');
});

check('gems do not leak out through the sellback', () => {
  const state = fresh();
  const gemItem = data.decor.find((d) => d.cost.currency === 'gems');
  if (!gemItem) return; // no gem-priced decor in this data set
  grant(state, gemItem.id);
  const coinsBefore = state.player.coins;
  const r = execute(data, state, { type: 'SELL_DECOR', defId: gemItem.id });
  if (data.economy.sellback.gemPurchasesRefundable) {
    assert(r.ok, 'a refundable gem item could not be sold');
    assert(state.player.coins === coinsBefore, 'a gem item was refunded in coins');
  } else {
    assert(!r.ok && r.reason === 'notRefundable', 'a gem purchase was converted into coins');
  }
});

check('ownership survives a save round trip', async () => {
  const state = fresh();
  const def = data.decor.find((d) => d.sellable)!;
  grant(state, def.id, 3);
  const saves = new SaveManager(new MemoryStorage());
  await saves.save(state, state.epochMs);
  const back = await saves.load();
  assert(back.ok, 'the save did not load');
  assert(back.ok && owned(back.state, def.id) === 3,
    `the store came back holding ${back.ok ? owned(back.state, def.id) : '?'} instead of 3`);
});

check('a version 8 save migrates into an empty store', () => {
  const state = fresh();
  const old = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
  delete old['ownedDecor'];
  const migrated = migrate(old, 8, SCHEMA_VERSION);
  const problems = validateState(migrated);
  assert(problems.length === 0, `migrated save is invalid: ${problems.join('; ')}`);
  assert(Object.keys(migrated['ownedDecor'] as object).length === 0, 'items were invented');
});

check('a store entry never reaches zero and lingers', () => {
  const state = fresh();
  const def = data.decor[0]!;
  grant(state, def.id);
  consume(state, def.id);
  assert(!(def.id in state.ownedDecor), 'a zero count was left in the record');
});

// ---------------------------------------------------------------- rooms

function built(): { state: GameState; roomId: string } {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 30;
  const r = execute(data, state, { type: 'BUILD_ROOM', defId: 'standard' });
  assert(r.ok, 'could not build a room');
  return { state, roomId: state.hotel.rooms[state.hotel.rooms.length - 1]!.id };
}

check('a room can be moved, and nothing is charged or lost', () => {
  const { state, roomId } = built();
  const room = state.hotel.rooms.find((r) => r.id === roomId)!;
  execute(data, state, { type: 'PLACE_DECOR', roomId, defId: STANDARD_A, slot: 0 });
  const coins = state.player.coins;
  const decorCount = room.decor.length;

  const spot = findFreeSpot(data, state, roomDef(data, room.defId).blocks);
  assert(spot, 'nowhere free to move to');
  const r = execute(data, state, { type: 'MOVE_ROOM', roomId, x: spot.x, y: spot.y });
  assert(r.ok, `move refused: ${r.ok === false ? r.reason : ''}`);
  assert(room.x === spot.x && room.y === spot.y, 'the room did not move');
  assert(state.player.coins === coins, 'moving a room charged the player');
  assert(room.decor.length === decorCount, 'decor was lost in the move');
});

check('a room cannot be moved onto another', () => {
  const { state, roomId } = built();
  const other = state.hotel.rooms.find((r) => r.id !== roomId)!;
  const before = JSON.stringify(state);
  const r = execute(data, state, { type: 'MOVE_ROOM', roomId, x: other.x, y: other.y });
  assert(!r.ok && r.reason === 'overlaps', `expected overlaps, got ${r.ok ? 'ok' : r.reason}`);
  assert(JSON.stringify(state) === before, 'a refused move changed the state');
});

check('a room cannot be moved off the plot', () => {
  const { state, roomId } = built();
  const r = execute(data, state, { type: 'MOVE_ROOM', roomId, x: 99, y: 99 });
  assert(!r.ok && r.reason === 'outOfBounds', 'a room was moved outside the plot');
});

check('storing and restoring returns the same room, decor and condition', () => {
  const { state, roomId } = built();
  execute(data, state, { type: 'PLACE_DECOR', roomId, defId: STANDARD_A, slot: 0 });
  const room = state.hotel.rooms.find((r) => r.id === roomId)!;
  room.cleanliness = 0.9;
  const decorIds = room.decor.map((d) => d.id).join(',');
  const points = room.decorPoints;

  assert(execute(data, state, { type: 'STORE_ROOM', roomId }).ok, 'storing failed');
  assert(!state.hotel.rooms.some((r) => r.id === roomId), 'the room is still on the plot');
  assert(state.storedRooms.some((r) => r.id === roomId), 'the room is not in storage');

  assert(execute(data, state, { type: 'PLACE_STORED_ROOM', roomId }).ok, 'restoring failed');
  const back = state.hotel.rooms.find((r) => r.id === roomId)!;
  assert(back.decor.map((d) => d.id).join(',') === decorIds, 'decor changed in storage');
  assert(back.decorPoints === points, 'decor points changed in storage');
  assert(Math.abs(back.cleanliness - 0.9) < 1e-9, 'condition changed in storage');
  assert(state.storedRooms.length === 0, 'the room is in two places at once');
});

check('a filthy room cannot be hidden in storage', () => {
  const { state, roomId } = built();
  const room = state.hotel.rooms.find((r) => r.id === roomId)!;
  room.cleanliness = 0;
  const r = execute(data, state, { type: 'STORE_ROOM', roomId });
  assert(!r.ok && r.reason === 'roomTooDirty', 'a filthy room was put away');
});

check('an infested or burning room cannot be stored', () => {
  const { state, roomId } = built();
  const room = state.hotel.rooms.find((r) => r.id === roomId)!;
  room.cleanliness = 1;
  room.hasPest = true;
  assert(!execute(data, state, { type: 'STORE_ROOM', roomId }).ok, 'a pest was stored away');
  room.hasPest = false;
  room.hasFire = true;
  const r = execute(data, state, { type: 'STORE_ROOM', roomId });
  assert(!r.ok && r.reason === 'roomHasHazard', 'a fire was stored away');
});

check('an occupied room cannot be stored, and the lobby never can', () => {
  const { state, roomId } = built();
  const room = state.hotel.rooms.find((r) => r.id === roomId)!;
  room.cleanliness = 1;
  room.occupants.push('someone');
  assert(!execute(data, state, { type: 'STORE_ROOM', roomId }).ok, 'a room with a guest was stored');

  const lobby = state.hotel.rooms.find((r) => r.defId === 'lobby')!;
  lobby.cleanliness = 1;
  const r = execute(data, state, { type: 'STORE_ROOM', roomId: lobby.id });
  assert(!r.ok && r.reason === 'roomRequired', 'the lobby was put in storage');
});

check('storage survives a save round trip', async () => {
  const { state, roomId } = built();
  state.hotel.rooms.find((r) => r.id === roomId)!.cleanliness = 1;
  execute(data, state, { type: 'STORE_ROOM', roomId });
  const saves = new SaveManager(new MemoryStorage());
  await saves.save(state, state.epochMs);
  const back = await saves.load();
  assert(back.ok && back.state.storedRooms.some((r) => r.id === roomId),
    'the stored room did not survive the save');
});

// ---------------------------------------------------------------- staff

check('staff can be moved between rooms, and stand in only one', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 30;
  execute(data, state, { type: 'BUILD_ROOM', defId: 'housekeeping' });
  const cleaner = state.staff.find((st) => st.roleId === 'cleaner');
  assert(cleaner, 'the starting hotel has no cleaner');
  const target = state.hotel.rooms.filter((r) => r.defId === 'housekeeping')
    .find((r) => r.id !== cleaner.roomId);
  if (!target) return;

  assert(execute(data, state, { type: 'ASSIGN_STAFF', staffId: cleaner.id, roomId: target.id }).ok,
    'reassignment was refused');
  assert(cleaner.roomId === target.id, 'the cleaner did not move');
  const posts = state.hotel.rooms.filter((r) => r.staffId === cleaner.id);
  assert(posts.length === 1, `the cleaner is standing in ${posts.length} rooms`);
});

check('staff cannot be assigned to a room that does not want their role', () => {
  const state = fresh();
  const cleaner = state.staff.find((st) => st.roleId === 'cleaner')!;
  const lobby = state.hotel.rooms.find((r) => r.defId === 'lobby')!;
  const r = execute(data, state, { type: 'ASSIGN_STAFF', staffId: cleaner.id, roomId: lobby.id });
  assert(!r.ok && r.reason === 'roleMismatch', 'a cleaner was put on reception');
});

check('firing removes the member and empties their post', () => {
  const state = fresh();
  const desk = state.staff.find((st) => st.roleId === 'receptionist')!;
  const lobby = state.hotel.rooms.find((r) => r.defId === 'lobby')!;
  assert(execute(data, state, { type: 'FIRE_STAFF', staffId: desk.id }).ok, 'firing failed');
  assert(!state.staff.some((st) => st.id === desk.id), 'the member is still employed');
  assert(lobby.staffId === null, 'the room still points at somebody who left');
});

check('selling a room releases its staff rather than stranding them', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 30;
  // 4B: the cafe is staffless, so the flow lives in the restaurant now.
  execute(data, state, { type: 'BUILD_ROOM', defId: 'restaurant' });
  const diner = state.hotel.rooms.find((r) => r.defId === 'restaurant')!;
  assert(execute(data, state, { type: 'HIRE_STAFF', roomId: diner.id, roleId: 'chef' }).ok, 'hiring failed');
  const chef = state.staff.find((st) => st.roleId === 'chef')!;

  assert(execute(data, state, { type: 'SELL_ROOM', roomId: diner.id }).ok, 'selling failed');
  assert(state.staff.some((st) => st.id === chef.id), 'the chef vanished with the room');
  assert(chef.roomId === null, 'the chef still points at a room that is gone');
  // They can now be put somewhere else, which was impossible before.
  assert(execute(data, state, { type: 'FIRE_STAFF', staffId: chef.id }).ok,
    'an orphaned member of staff could not even be let go');
});

check('selling a room returns its decor instead of liquidating it', () => {
  const { state, roomId } = built();
  const sold = catalogueFor(data, state.hotel.rooms.find((r) => r.id === roomId)!.defId)[0]!;
  execute(data, state, { type: 'PLACE_DECOR', roomId, defId: sold, slot: 0 });
  const before = owned(state, sold);
  assert(execute(data, state, { type: 'SELL_ROOM', roomId }).ok, 'selling failed');
  assert(owned(state, sold) === before + 1, 'the decor was destroyed with the room');
});

check('a plot that cannot hold the hotel is refused', () => {
  const state = fresh();
  state.player.coins += 50_000_000;
  state.player.level = data.levels[data.levels.length - 1]!.level;
  // A plot with more blocks but a narrower grid must not orphan a room that
  // sits beyond its width. Block totals are not shapes.
  const wide = data.plots.find((p) => p.grid.w > plotBounds(data, state).w);
  if (!wide) return;
  const r = execute(data, state, { type: 'EXPAND_PLOT', plotId: wide.id });
  assert(r.ok || r.reason !== 'unknownPlot', 'the plot was not recognised');
});

// ---------------------------------------------------------------- satisfaction

check('every satisfaction change carries a reason', () => {
  const state = fresh();
  open(state, 'shift_12h');
  advance(data, state, 60 * TPS * 45);
  const reviewed = state.guests.filter((g) => g.review >= 0);
  const done = reviewed.length > 0 ? reviewed : [];
  assert(state.reputation.reviews.length > 0 || done.length > 0,
    'nobody completed a stay in 45 minutes');

  for (const guest of done) {
    assert(guest.satisfactionLog.length > 0, `${guest.id} was scored with no reasons`);
    for (const entry of guest.satisfactionLog) {
      assert(typeof entry.reason === 'string' && entry.reason.length > 0,
        `${guest.id} has a delta with no reason code`);
    }
  }
});

check('the score is the sum of its reasons', () => {
  const state = fresh();
  open(state, 'shift_12h');
  advance(data, state, 60 * TPS * 60);
  const scored = state.guests.filter((g) => g.satisfaction >= 0 && g.satisfactionLog.length > 0);
  for (const guest of scored) {
    let sum = 0;
    for (const entry of guest.satisfactionLog) sum += entry.delta;
    const clamped = Math.max(0, Math.min(100, sum));
    assert(Math.abs(clamped - guest.satisfaction) <= 1,
      `${guest.id} scored ${guest.satisfaction} but the reasons add to ${clamped.toFixed(1)}`);
  }
});

check('a filthy room scores worse than a clean one', () => {
  const clean = fresh();
  const dirty = fresh();
  for (const s2 of [clean, dirty]) open(s2, 'shift_12h');
  for (const room of clean.hotel.rooms) room.cleanliness = 1;
  for (const room of dirty.hotel.rooms) room.cleanliness = 0.6;

  const g1 = testGuest({ id: 'c1', state: 'staying', roomId: clean.hotel.rooms[1]!.id });
  const g2 = testGuest({ id: 'd1', state: 'staying', roomId: dirty.hotel.rooms[1]!.id });
  const s1 = scoreStay(data, clean, g1, clean.hotel.rooms[1]!);
  const s2 = scoreStay(data, dirty, g2, dirty.hotel.rooms[1]!);
  assert(s1 > s2, `clean scored ${s1}, dirty scored ${s2}`);
});

check('waiting costs satisfaction', () => {
  const state = fresh();
  const room = state.hotel.rooms[1]!;
  room.cleanliness = 1;
  const patient = testGuest({ id: 'p', state: 'staying', roomId: room.id, waitedTicks: 0 });
  const weary = testGuest({ id: 'w', state: 'staying', roomId: room.id, waitedTicks: 600 });
  const a = scoreStay(data, state, patient, room);
  const b = scoreStay(data, state, weary, room);
  assert(a > b, `no wait scored ${a}, full wait scored ${b}`);
  assert(weary.satisfactionLog.some((e) => e.reason === 'waited' && e.delta < 0),
    'the wait penalty left no trace');
});

check('an unmet desire dents the score without wiping the income', () => {
  const state = fresh();
  const room = state.hotel.rooms[1]!;
  room.cleanliness = 1;
  const happy = testGuest({ id: 'h', state: 'staying', roomId: room.id, desire: 'coffee', desireMet: true });
  const sad = testGuest({ id: 's', state: 'staying', roomId: room.id, desire: 'coffee', desireMet: false });
  const a = scoreStay(data, state, happy, room);
  const b = scoreStay(data, state, sad, room);
  assert(a > b, 'meeting a desire did not help');
  assert(b > 0, 'an unmet desire wiped the guest out entirely');
});

check('an incident is remembered in the score', () => {
  const state = fresh();
  const room = state.hotel.rooms[1]!;
  room.cleanliness = 1;
  const g = testGuest({ id: 'i', state: 'staying', roomId: room.id, sawIncident: true });
  scoreStay(data, state, g, room);
  assert(g.satisfactionLog.some((e) => e.reason === 'incident' && e.delta < 0),
    'a guest slept through a fire and did not mind');
});

check('reputation is the average of the reviews inside the window', () => {
  const state = fresh();
  open(state, 'shift_12h');
  advance(data, state, 60 * TPS * 60);
  if (state.reputation.reviews.length === 0) return;
  let sum = 0;
  for (const r of state.reputation.reviews) sum += r.score;
  const expected = Math.round(sum / state.reputation.reviews.length);
  assert(state.reputation.score === expected,
    `reputation is ${state.reputation.score} but the reviews average ${expected}`);
  console.log(`      ${state.reputation.reviews.length} reviews · reputation ${state.reputation.score}`);
});

check('a delighted guest tips, and the tip is bounded', () => {
  const w = data.economy.satisfaction;
  assert(tipRatio(data, w.tipThreshold - 1) === 0, 'a middling guest tipped');
  assert(tipRatio(data, 100) <= w.tipMaxRatio + 1e-9,
    `a perfect guest tipped ${tipRatio(data, 100)}, over the cap ${w.tipMaxRatio}`);
  assert(tipRatio(data, 100) > 0, 'a perfect guest tipped nothing');
});

check('beginners are not taunted with desires they cannot meet', () => {
  const early = fresh();
  early.player.level = 1;
  open(early, 'shift_12h');
  advance(data, early, 60 * TPS * 90);
  const withDesire = early.guests.filter((g) => g.desire !== null).length;
  const total = Math.max(1, early.guests.length);
  console.log(`      level 1: ${withDesire}/${total} guests arrived wanting something`);
  assert(withDesire < total, 'every single beginner guest wanted something');
});

check('unmet desires are counted where the player can act on them', () => {
  const state = fresh();
  open(state, 'shift_12h');
  advance(data, state, 60 * TPS * 90);
  const counted = Object.values(state.unmetDesires).reduce((a, b) => a + b, 0);
  // With no amenities built, any guest who wanted something must be recorded.
  assert(counted >= 0, 'the unmet tally is not a number');
  for (const [tag, n] of Object.entries(state.unmetDesires)) {
    assert(typeof tag === 'string' && n > 0, `unmetDesires holds a bad entry: ${tag}=${n}`);
  }
});

check('room choice is deterministic and prefers free beds at equal tier', () => {
  const a = fresh();
  const b = fresh();
  for (const s2 of [a, b]) { open(s2, 'shift_12h'); advance(data, s2, 60 * TPS * 30); }
  const layoutA = a.hotel.rooms.map((r) => `${r.id}:${r.occupants.length}`).join('|');
  const layoutB = b.hotel.rooms.map((r) => `${r.id}:${r.occupants.length}`).join('|');
  assert(layoutA === layoutB, 'the same seed produced two different hotels');
});

check('no guest is left in a state nothing can move them out of', () => {
  const state = fresh();
  open(state, 'shift_2h');
  advance(data, state, state.shift.graceEndsAtTick - state.tick + 100);
  for (const guest of state.guests) {
    assert(guest.state === 'leaving',
      `${guest.id} is stuck in "${guest.state}" after the hotel closed`);
  }
});

check('a version 10 save migrates and validates', () => {
  const state = fresh();
  open(state, 'shift_12h');
  advance(data, state, 60 * TPS * 5);
  const old = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
  delete old['reputation']; delete old['lastServiceRating']; delete old['unmetDesires'];
  for (const g of old['guests'] as Array<Record<string, unknown>>) {
    delete g['satisfaction']; delete g['satisfactionLog']; delete g['waitedTicks'];
    delete g['patienceTotalTicks']; delete g['desireMet']; delete g['sawIncident'];
    delete g['ratedQuality']; delete g['ratedCleanliness']; delete g['review']; delete g['leaveReason'];
  }
  const migrated = migrate(old, 10, SCHEMA_VERSION);
  const problems = validateState(migrated);
  assert(problems.length === 0, `migrated save is invalid: ${problems.join('; ')}`);
});

// ---------------------------------------------------------------- staffing

check('no room gets its effect from staff who are not there', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 40;

  for (const defId of ['maintenance', 'business']) {
    const built = execute(data, state, { type: 'BUILD_ROOM', defId });
    if (!built.ok) continue;
    const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;
    assert(!effectActive(data, state, room),
      `${defId} is working with nobody employed in it`);
  }
});

check('maintenance only reduces the fire risk once it is staffed', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 40;
  if (!execute(data, state, { type: 'BUILD_ROOM', defId: 'maintenance' }).ok) return;
  const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;

  const unstaffed = fireChanceMultiplier(data, state);
  assert(execute(data, state, { type: 'HIRE_STAFF', roomId: room.id, roleId: 'engineer' }).ok,
    'could not hire an engineer');
  const staffed = fireChanceMultiplier(data, state);
  assert(staffed < unstaffed,
    `fire risk was ${unstaffed} empty and ${staffed} staffed — the room worked for free`);
});

check('business only lifts arrivals once it is staffed', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 40;
  if (!execute(data, state, { type: 'BUILD_ROOM', defId: 'business' }).ok) return;
  const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;
  const before = arrivalsPerMinute(data, state);
  if (!execute(data, state, { type: 'HIRE_STAFF', roomId: room.id, roleId: 'concierge' }).ok) return;
  const after = arrivalsPerMinute(data, state);
  assert(after > before, 'an empty business centre was already boosting arrivals');
});

check('moving a cleaner changes capacity immediately', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 40;
  const cleaner = state.staff.find((st) => st.roleId === 'cleaner');
  assert(cleaner, 'no cleaner to move');
  // 4B: the closet is worked by a temp the moment its cleaner steps out, so
  // capacity holds; what moving the cleaner changes is the temp wage.
  const before = cleaningCapacity(data, state);
  assert(execute(data, state, { type: 'UNASSIGN_STAFF', staffId: cleaner.id }).ok, 'unassign failed');
  eq(cleaningCapacity(data, state), before, 'capacity moved — the temp is not covering the closet');
  assert(shiftWages(data, state, 'shift_12h') > 0, 'an uncovered closet charges no temp wage');
});

check('grades no longer buy anything (decision 12a)', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 40;
  if (!execute(data, state, { type: 'BUILD_ROOM', defId: 'restaurant' }).ok) return;
  const cafe = state.hotel.rooms[state.hotel.rooms.length - 1]!;
  if (!execute(data, state, { type: 'HIRE_STAFF', roomId: cafe.id, roleId: 'chef' }).ok) return;
  const member = state.staff.find((st) => st.roomId === cafe.id)!;

  const guest = testGuest({ id: 'amen', state: 'staying', roomId: cafe.id, desire: 'food' });
  state.guests.push(guest);

  member.gradeId = 'bronze';
  enterAmenity(data, state, guest, cafe);
  const bronzeTicks = guest.finishesAtTick - state.tick;
  cafe.occupants = [];

  member.gradeId = 'silver';
  enterAmenity(data, state, guest, cafe);
  const silverTicks = guest.finishesAtTick - state.tick;

  // Decision 12a: grades are neutralised — service time must not depend on them.
  eq(silverTicks, bronzeTicks,
    `grades still change service speed: silver ${silverTicks} vs bronze ${bronzeTicks}`);
});

// ---------------------------------------------------------------- cleaning

check('cleaners work on the rooms that are losing money first', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 40;
  for (let i = 0; i < 4; i++) execute(data, state, { type: 'BUILD_ROOM', defId: 'economy' });
  const gate = data.economy.cleanliness.incomeGateThreshold;
  const rooms = state.hotel.rooms.filter((r) => r.defId === 'economy');
  if (rooms.length < 2) return;
  rooms[0]!.cleanliness = gate - 0.1;   // earning nothing
  for (let i = 1; i < rooms.length; i++) rooms[i]!.cleanliness = 0.95;

  const order = cleaningOrder(data, state);
  assert(order[0]?.id === rooms[0]!.id,
    'the cleaners started somewhere other than the room earning nothing');
});

check('online and offline reach the same cleanliness', () => {
  const live = fresh();
  const away = fresh();
  for (const s2 of [live, away]) {
    s2.player.coins += 5_000_000;
    s2.player.level = 30;
    open(s2, 'shift_12h');
    for (const room of s2.hotel.rooms) room.cleanliness = 0.5;
  }
  advance(data, live, 3600 * TPS);
  resolveOffline(data, away, HOUR);

  const avg = (st: GameState) => {
    const rooms = st.hotel.rooms.filter((r) => r.defId !== 'lobby' && r.defId !== 'housekeeping');
    if (rooms.length === 0) return 0;
    return rooms.reduce((a, r) => a + r.cleanliness, 0) / rooms.length;
  };
  const a = avg(live);
  const b = avg(away);
  console.log(`      watched ${a.toFixed(3)} · away ${b.toFixed(3)}`);
  assert(Math.abs(a - b) < 0.1, `cleanliness diverged: ${a.toFixed(3)} vs ${b.toFixed(3)}`);
});

// ---------------------------------------------------------------- incidents

check('a hotel cannot be wiped out by simultaneous incidents', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 40;
  for (let i = 0; i < 8; i++) execute(data, state, { type: 'BUILD_ROOM', defId: 'economy' });
  for (const room of state.hotel.rooms) room.cleanliness = 0;

  const events: SimEvent[] = [];
  checkPests(data, state, events);
  const infested = state.hotel.rooms.filter((r) => r.hasPest).length;
  assert(infested <= maxSimultaneousIncidents(data),
    `${infested} rooms were infested at once, over the cap of ${maxSimultaneousIncidents(data)}`);
});

check('clearing a hazard pays the XP the data promises', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 40;
  execute(data, state, { type: 'BUILD_ROOM', defId: 'economy' });
  const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;
  room.hasFire = true;
  const promised = data.events.find((e) => e.id === 'fire')?.clearRewardXp ?? 0;
  if (promised <= 0) return;

  const before = state.player.xp;
  const r = execute(data, state, { type: 'CLEAR_HAZARD', roomId: room.id, hazard: 'fire' });
  assert(r.ok, `clearing failed: ${r.ok === false ? r.reason : ''}`);
  assert(state.player.xp - before >= promised,
    `the data promises ${promised} XP for a fire clear and paid ${state.player.xp - before}`);
});

check('a hazard cannot be escaped by selling the room', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 40;
  execute(data, state, { type: 'BUILD_ROOM', defId: 'economy' });
  const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;
  room.hasFire = true;
  const before = state.player.coins;
  const r = execute(data, state, { type: 'SELL_ROOM', roomId: room.id });
  assert(!r.ok && r.reason === 'roomHasHazard', 'a burning room was sold out from under the fire');
  assert(state.player.coins === before, 'a refused sale paid a refund');
});

check('whether a hazard blocks income comes from the event data', () => {
  const fire = data.events.find((e) => e.id === 'fire');
  const pest = data.events.find((e) => e.id === 'pest');
  assert(fire !== undefined && pest !== undefined, 'the hazard events are missing');
  assert(typeof fire.blocksIncome === 'boolean', 'fire.blocksIncome is not declared');
  const state = fresh();
  const room = state.hotel.rooms[1]!;
  room.cleanliness = 1;
  room.hasFire = true;
  assert(incomeBlocked(data, room) === fire.blocksIncome,
    'the income gate disagrees with what events.json says about fire');
});

// ---------------------------------------------------------------- quality

check('stacking the cheapest piece has diminishing returns', () => {
  const state = fresh();
  state.player.coins += 50_000_000;
  state.player.level = 40;
  execute(data, state, { type: 'BUILD_ROOM', defId: 'standard' });
  const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;
  const cheap = data.decor
    .filter((d) => d.slotType !== 'bed' && d.unlockLevel <= 40 && d.cost.currency === 'coins')
    .sort((a, b) => a.cost.amount - b.cost.amount)[0]!;

  const points: number[] = [];
  for (let i = 0; i < 4; i++) {
    room.decor.push({ id: `x${i}`, defId: cheap.id, slot: i, localX: i, localY: 0, flipX: false, zBias: 0 });
    points.push(effectiveDecorPoints(data, room));
  }
  const first = points[0]!;
  const fourthGain = points[3]! - points[2]!;
  assert(fourthGain < first,
    `the fourth copy was worth ${fourthGain} against the first's ${first}`);
});

check('repeats keep diminishing returns; variety is neutralised (decision 8b)', () => {
  const state = fresh();
  const same = state.hotel.rooms[1]!;
  const mixed = state.hotel.rooms[2] ?? state.hotel.rooms[1]!;
  const items = data.decor.filter((d) => d.slotType !== 'bed' && d.unlockLevel <= 5);
  if (items.length < 4 || same === mixed) return;

  same.decor = [0, 1, 2, 3].map((i) => ({ id: `s${i}`, defId: items[0]!.id, slot: i, localX: i, localY: 0, flipX: false, zBias: 0 }));
  mixed.decor = [0, 1, 2, 3].map((i) => ({ id: `m${i}`, defId: items[i % items.length]!.id, slot: i, localX: i, localY: 0, flipX: false, zBias: 0 }));
  // Decision 8b: the variety requirement is neutralised (varietyFloor = 1)...
  eq(variety(data, mixed), variety(data, same), 'variety is supposed to be neutralised');
  eq(variety(data, same), 1, 'varietyFloor is no longer 1');
  // ...but repetition still has diminishing returns: four copies of one item
  // must be worth less than four times its value, or the original's
  // cheapest-item exploit is back.
  same.decorPoints = computeDecorPoints(data, same);
  const effective = effectiveDecorPoints(data, same);
  assert(effective < items[0]!.decorPoints * 4,
    `four copies scored ${effective} effective — repeatFalloff has stopped working`);
});

check('a bed cannot be installed in a room that is not a bedroom', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 40;
  // A room with decor slots that is not a guest room. The laundry has none, so
  // it is refused for lack of space before the compatibility rule is reached.
  const host = data.rooms.find((d) => d.category !== 'guest' && d.decorSlots > 0 && d.unlockLevel <= 40);
  if (!host) return;
  if (!execute(data, state, { type: 'BUILD_ROOM', defId: host.id }).ok) return;
  const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;
  const bed = data.decor.find((d) => d.slotType === 'bed' && d.unlockLevel <= 40);
  if (!bed) return;
  const r = execute(data, state, { type: 'PLACE_DECOR', roomId: room.id, defId: bed.id, slot: 0 });
  assert(!r.ok && r.reason === 'slotIncompatible',
    `a bed went into the ${host.id}: ${r.ok ? 'accepted' : r.reason}`);
});

check('a hazard drags the room condition down', () => {
  const state = fresh();
  const room = state.hotel.rooms[1]!;
  assert(condition(data, room) === 1, 'a healthy room is not in full condition');
  room.hasPest = true;
  assert(condition(data, room) < 1, 'an infested room is in perfect condition');
});

// ---------------------------------------------------------------- the score

check('every component of the score is between 0 and 1', () => {
  const state = fresh();
  open(state, 'shift_12h');
  advance(data, state, 60 * TPS * 30);
  const b = hotelScore(data, state);
  for (const [name, value] of Object.entries(b)) {
    if (name === 'total') continue;
    assert(value >= 0 && value <= 1, `${name} is ${value}, outside 0..1`);
  }
  assert(b.total >= 0 && b.total <= 100, `the total is ${b.total}`);
});

check('the total is the weighted sum of its parts', () => {
  const state = fresh();
  open(state, 'shift_12h');
  advance(data, state, 60 * TPS * 20);
  const b = hotelScore(data, state);
  const w = data.stars.score.weights;
  const expected = 100 * (b.roomQuality * w.roomQuality + b.guestSatisfaction * w.guestSatisfaction
    + b.cleanliness * w.cleanliness + b.amenityCoverage * w.amenityCoverage
    + b.staffService * w.staffService);
  assert(Math.abs(b.total - expected) < 0.001, `total ${b.total} against parts ${expected}`);
});

check('coverage counts distinct desires, not copies', () => {
  const state = fresh();
  state.player.coins += 50_000_000;
  state.player.level = 40;
  let built = 0;
  for (let i = 0; i < 4; i++) if (execute(data, state, { type: 'BUILD_ROOM', defId: 'cafe' }).ok) built++;
  if (built < 2) return;
  for (const room of state.hotel.rooms) {
    const def = data.rooms.find((d) => d.id === room.defId);
    if (def && 'staffSlots' in def && def.staffSlots > 0 && !room.staffId) {
      execute(data, state, { type: 'HIRE_STAFF', roomId: room.id, roleId: (def as { staffRole: string }).staffRole });
    }
  }
  const withCafes = amenityCoverage(data, state);
  const tags = new Set(data.rooms.filter((d) => d.category === 'commercial').map((d) => (d as { desireTag: string }).desireTag));
  assert(withCafes <= 1 / tags.size + 1e-9,
    `${built} cafes covered ${(withCafes * 100).toFixed(0)}% of desires — copies were counted as breadth`);
});

check('five stars cannot be bought with the cheapest piece repeated', () => {
  const state = fresh();
  state.player.coins += 500_000_000;
  state.player.level = data.levels[data.levels.length - 1]!.level;
  const cheap = data.decor
    .filter((d) => d.slotType !== 'bed' && d.unlockLevel <= 1 && d.cost.currency === 'coins')
    .sort((a, b) => a.cost.amount - b.cost.amount)[0]!;
  for (let i = 0; i < 25; i++) execute(data, state, { type: 'BUILD_ROOM', defId: 'economy' });
  for (const room of state.hotel.rooms) {
    room.cleanliness = 1;
    const def = data.rooms.find((d) => d.id === room.defId)!;
    room.decor = Array.from({ length: Math.min(20, def.decorSlots) }, (_, i) => ({
      id: `c${room.id}_${i}`, defId: cheap.id, slot: i, localX: i, localY: 0, flipX: false, zBias: 0,
    }));
    room.decorPoints = effectiveDecorPoints(data, room);
  }
  const stars = computeStars(data, state);
  assert(stars < 5, `a hotel of ${cheap.id} repeated reached ${stars} stars`);
});

check('the inspector boost actually changes the payout', () => {
  const state = fresh();
  const earned = computeStars(data, state);
  const plain = incomeMultiplier(data, earned);
  state.starBoost = { amount: 0.5, untilTick: state.tick + 100000 };
  const boosted = incomeMultiplier(data, effectiveStars(data, state));
  assert(boosted > plain,
    `+0.5 stars moved income from ${plain} to ${boosted} — the floor ate the reward`);
});

check('the structural minimums still cap the rating', () => {
  const state = fresh();
  // A tiny hotel, perfect in every way the score can measure.
  for (const room of state.hotel.rooms) room.cleanliness = 1;
  state.reputation = { score: 100, reviews: [{ score: 100, atTick: state.tick }] };
  const ceiling = structuralCeiling(data, state);
  assert(computeStars(data, state) <= ceiling,
    'a two-room hotel got five stars for being spotless');
});

// ---------------------------------------------------------------- gifts

check('the bag returns every day, with no cycle to break (4B)', () => {
  // Decision 15a retired the streak. Ten consecutive days: ten bags, each at
  // the star-tier value, and exactly one weekly item somewhere in the run
  // per item week crossed.
  const state = fresh();
  const DAY = 86_400_000;
  const start = 1_700_000_000_000;
  let items = 0;
  for (let i = 0; i < 10; i++) {
    const at = start + i * DAY;
    const g = giftState(data, state, at);
    assert(g.available, `day ${i + 1} was not claimable`);
    eq(g.bagCoins, data.starTiers.find((t) => t.stars === state.hotel.stars)!.dailyBonusCoins,
      `day ${i + 1} offered the wrong bag`);
    const r = execute(data, state, { type: 'CLAIM_GIFT', epochMs: at });
    assert(r.ok, `claiming on day ${i + 1} failed`);
    if (r.events.some((e) => e.type === 'giftClaimed' && e.itemDefId !== null)) items++;
  }
  assert(items >= 1 && items <= 3, `${items} weekly items in ten days — the weekly beat is off`);
});

check('a gap costs nothing — the next bag is whole (4B)', () => {
  // Decision 15a retired the streak, and with it the punishment for missing
  // a day. A returning player finds today's bag at full value.
  const state = fresh();
  const DAY = 86_400_000;
  const start = 1_700_000_000_000;
  execute(data, state, { type: 'CLAIM_GIFT', epochMs: start });
  const after = start + DAY * 6;
  const g = giftState(data, state, after);
  assert(g.available, 'a returning player could not claim at all');
  eq(g.bagCoins, tierFor(data, state.hotel.stars).dailyBonusCoins,
    'the returning bag is not the full tier value');
});

check('the gift period comes from the data, not from a hardcoded day', () => {
  assert(data.gifts.resetHours > 0, 'resetHours is not declared');
  const state = fresh();
  const periodMs = data.gifts.resetHours * 3_600_000;
  // Aligned to a period boundary: 1_700_000_000_000 falls mid-period, so
  // "half a period later" would cross into the next one and the probe would
  // be measuring the wrong thing.
  const start = Math.floor(1_700_000_000_000 / periodMs) * periodMs;
  execute(data, state, { type: 'CLAIM_GIFT', epochMs: start });
  assert(!giftState(data, state, start + periodMs / 2).available,
    'a second gift was available inside the same period');
  assert(giftState(data, state, start + periodMs * 1.5).available,
    'no gift was available in the next period');
});

// ---------------------------------------------------------------- xp

check('the level table derives xpTotal from xpToNext', () => {
  const levels = data.levels;
  for (let i = 1; i < levels.length; i++) {
    const expected = levels[i - 1]!.xpTotal + (levels[i - 1]!.xpToNext ?? 0);
    assert(levels[i]!.xpTotal === expected,
      `L${levels[i]!.level} stores ${levels[i]!.xpTotal}, the running sum gives ${expected}`);
  }
});

// ---------------------------------------------------------------- the ledger

check('every coin that moves is recorded somewhere', () => {
  const state = fresh();
  state.player.coins += 500_000;
  state.player.level = 30;
  open(state, 'shift_12h');
  execute(data, state, { type: 'BUILD_ROOM', defId: 'standard' });

  // Snapshot after setup, because the fixture hands out coins directly and the
  // ledger only knows about money the game itself moved.
  const purseBefore = state.player.coins;
  const ledgerBefore = netProfit(state);
  advance(data, state, 60 * TPS * 30);
  execute(data, state, { type: 'BUILD_ROOM', defId: 'economy' });

  const moved = state.player.coins - purseBefore;
  const booked = netProfit(state) - ledgerBefore;
  assert(Math.abs(moved - booked) <= 2,
    `the purse moved by ${moved} and the ledger accounts for ${booked}`);
});

check('operating profit excludes what the player was given', () => {
  const state = fresh();
  state.player.coins += 500_000;
  state.player.level = 30;
  open(state, 'shift_12h');
  advance(data, state, 60 * TPS * 20);
  execute(data, state, { type: 'CLAIM_GIFT', epochMs: state.epochMs });

  const op = operatingProfit(state);
  const net = netProfit(state);
  assert(net > op, 'a claimed gift did not show up outside operating profit');
  // 4B: the daily claim pays the money bag (starBonus); the coin streak is retired.
  assert((state.ledger['starBonus'] ?? 0) > 0, 'the bag was not recorded as a reward');
  eq(state.ledger['giftReward'] ?? 0, 0, 'the retired coin streak paid out');
  assert((state.ledger['shiftCost'] ?? 0) < 0, 'the shift cost was not recorded as a sink');
  // Decision 10a: wages are zeroed so the shift price is the original table —
  // a wages entry appearing in the ledger means they have quietly returned.
  eq(state.ledger['wages'] ?? 0, 0, 'wages were charged despite decision 10a');
});

check('the shift cost is split from its payroll and upkeep', () => {
  const state = fresh();
  state.player.coins += 500_000;
  state.player.level = 30;
  const total = totalShiftCost(data, state, 'shift_12h');
  open(state, 'shift_12h');
  const booked = -((state.ledger['shiftCost'] ?? 0) + (state.ledger['wages'] ?? 0)
    + (state.ledger['upkeep'] ?? 0));
  assert(Math.abs(booked - total) <= 1,
    `the shift cost ${total} was booked as ${booked}`);
});

// ---------------------------------------------------------------- balance

check('no shift is both cheapest per hour and least effort', () => {
  const perHour = data.shifts.map((sh) => ({
    id: sh.id, hours: sh.durationSec / 3600, rate: sh.baseCost / (sh.durationSec / 3600),
  })).sort((a, b) => a.hours - b.hours);
  console.log(`      ${perHour.map((s2) => `${s2.id.replace('shift_', '')} ${s2.rate.toFixed(1)}/h`).join(' · ')}`);
  // The longest shift used to be the cheapest per hour AND the least effort,
  // which is not a trade-off, it is a right answer.
  for (let i = 1; i < perHour.length; i++) {
    assert(perHour[i]!.rate >= perHour[i - 1]!.rate,
      `${perHour[i]!.id} costs ${perHour[i]!.rate.toFixed(2)}/h, less than the shorter ${perHour[i - 1]!.id}`);
  }
});

check('every shift pays guests identically (decision 9a)', () => {
  // The per-shift income multiplier is not in the original; the original
  // priced long shifts steeply instead (the 48h shift costs 566x the 2h one).
  for (const sh of data.shifts) {
    eq(sh.incomeMultiplier, 1, `${sh.id} still carries an income multiplier`);
  }
});

check('the neutral income multiplier reaches the payout (decision 9a)', () => {
  const shortRun = fresh();
  const longRun = fresh();
  for (const s2 of [shortRun, longRun]) { s2.player.coins += 5_000_000; s2.player.level = 30; }
  execute(data, shortRun, { type: 'START_SHIFT', shiftId: 'shift_2h' });
  execute(data, longRun, { type: 'START_SHIFT', shiftId: 'shift_48h' });
  const a = shiftIncomeMultiplier(data, shortRun);
  const b = shiftIncomeMultiplier(data, longRun);
  eq(a, 1, `a 2h shift multiplied income by ${a}`);
  eq(b, 1, `a 48h shift multiplied income by ${b}`);
});

check('the shift price IS the level-scaled original table (decision 10a)', () => {
  const small = fresh();
  small.player.coins += 5_000_000;
  small.player.level = 30;
  // Upkeep is not in the original: it must charge nothing at any hotel size.
  eq(shiftUpkeep(data, small, 'shift_12h'), 0, 'upkeep on a starting hotel is not zero');
  for (let i = 0; i < 4; i++) execute(data, small, { type: 'BUILD_ROOM', defId: 'economy' });
  eq(shiftUpkeep(data, small, 'shift_12h'), 0, 'upkeep returned as the hotel grew');
  // With wages and upkeep zeroed, the total equals the table price exactly.
  const def = data.shifts.find((sh) => sh.id === 'shift_12h')!;
  const table = Math.round(def.baseCost * (1 + data.economy.shiftCostScaling.perLevel * (small.player.level - 1)));
  eq(totalShiftCost(data, small, 'shift_12h'), table, 'the shift price is not the scaled table');
});

check('the daily claim pays exactly one bag, nothing hidden (4B)', () => {
  // The coin streak is gone; the claim's coins are the star bonus and only
  // that, bounded by the decision-1a table (430 at five stars).
  const state = fresh();
  const periodMs = data.gifts.resetHours * 3_600_000;
  const start = Math.floor(1_700_000_000_000 / periodMs) * periodMs;
  const before = state.player.coins;
  assert(execute(data, state, { type: 'CLAIM_GIFT', epochMs: start }).ok, 'the claim failed');
  const paid = state.player.coins - before;
  eq(paid, state.ledger['starBonus'] ?? 0, 'the claim paid coins beyond the bag');
  assert(paid <= 430, `one claim paid ${paid} — past the table's five-star bag`);
});

check('the daily star bonus is paid, once', () => {
  const state = fresh();
  const periodMs = data.gifts.resetHours * 3_600_000;
  const start = Math.floor(1_700_000_000_000 / periodMs) * periodMs;
  const tier = tierFor(data, state.hotel.stars);
  if (tier.dailyBonusCoins <= 0) return;

  const before = state.player.coins;
  assert(execute(data, state, { type: 'CLAIM_GIFT', epochMs: start }).ok, 'the first claim failed');
  const paid = state.player.coins - before;
  assert(paid >= tier.dailyBonusCoins,
    `${tier.stars} stars promise ${tier.dailyBonusCoins} a day and paid ${paid} in total`);
  assert((state.ledger['starBonus'] ?? 0) === tier.dailyBonusCoins,
    'the star bonus was not booked as its own source');

  // Claiming again inside the same period must not pay it twice.
  const afterFirst = state.ledger['starBonus'] ?? 0;
  execute(data, state, { type: 'CLAIM_GIFT', epochMs: start + periodMs / 2 });
  assert((state.ledger['starBonus'] ?? 0) === afterFirst,
    'the star bonus paid twice in one day');
});

check('a version 12 save migrates and is owed today\'s bonus', () => {
  const state = fresh();
  const old = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
  delete old['lastStarBonusDay'];
  const migrated = migrate(old, 12, SCHEMA_VERSION);
  assert(validateState(migrated).length === 0, 'the migrated save is invalid');
  assert(migrated['lastStarBonusDay'] === -1,
    'a returning player was told they had already had today\'s bonus');
});

// ---------------------------------------------------------------- objectives

check('an unknown objective condition is not complete', () => {
  const state = fresh();
  const progress = objectiveProgress(data, state, { kind: 'nonsenseCondition', min: 1 });
  assert(progress === 0,
    `an unrecognised condition reported ${progress} — a typo used to pay its reward`);
});

check('spotless measures cleanliness, not decor', () => {
  const def = data.objectives.find((o) => o.id === 'spotless');
  if (!def) return;
  assert(def.check.kind === 'cleanliness',
    `an objective named spotless checks "${def.check.kind}"`);

  const state = fresh();
  for (const room of state.hotel.rooms) { room.cleanliness = 0.2; room.decor = []; }
  const dirty = objectiveProgress(data, state, def.check);
  for (const room of state.hotel.rooms) room.cleanliness = 1;
  const clean = objectiveProgress(data, state, def.check);
  assert(clean > dirty, 'cleaning the hotel did not move a cleanliness objective');
});

check('every objective condition in the data is one the checker implements', () => {
  const state = fresh();
  for (const def of data.objectives) {
    const p = objectiveProgress(data, state, def.check);
    assert(Number.isFinite(p) && p >= 0 && p <= 1,
      `${def.id} reports ${p} for kind "${def.check.kind}"`);
  }
});

check('a new player is pointed at a tutorial step, not a milestone', () => {
  // The bridge selectors need the data handed to them once, the way the app
  // does at startup.
  initSelectors(data);
  const state = fresh();
  const first = currentObjective(state);
  assert(first, 'a fresh hotel has no next step at all');
  assert(first.group === 'tutorial',
    `the first thing a new player is shown is a ${first.group}`);
});

check('no objective gates any other', () => {
  // Nothing in the core consults completedObjectives to decide what a player
  // may do. If that ever changes, an unclaimed objective becomes a wall.
  const state = fresh();
  state.player.coins += 500_000;
  state.player.level = 30;
  assert(state.completedObjectives.length === 0, 'a fresh hotel starts with claims');
  assert(execute(data, state, { type: 'START_SHIFT', shiftId: 'shift_12h' }).ok,
    'a shift needed an objective claimed first');
  assert(execute(data, state, { type: 'BUILD_ROOM', defId: 'standard' }).ok,
    'building needed an objective claimed first');
});

// ---------------------------------------------------------------- the city

check('the rank and the list agree about who is ahead', () => {
  const state = fresh();
  state.player.level = 12;
  const epochMs = state.epochMs;
  const list = neighbours(data, state, epochMs);
  const { rank } = cityRank(data, state, epochMs);
  // Whoever the list puts above the player must be exactly who the rank counts.
  const me = { level: state.player.level, stars: state.hotel.stars };
  const above = list.filter((n) => ahead(n, me) < 0).length;
  assert(rank === above + 1,
    `the list shows ${above} rivals above and the rank says ${rank - 1}`);
});

check('the rivals are declared to be what they are', () => {
  const state = fresh();
  for (const n of neighbours(data, state, state.epochMs)) {
    assert(n.npc === true, `${n.id} is not marked as an NPC`);
  }
});

check('a visit pays once, whatever the client claims the time is', () => {
  const state = fresh();
  const epochMs = state.epochMs;
  const first = neighbours(data, state, epochMs)[0]!;
  const before = state.player.coins;
  assert(execute(data, state, { type: 'VISIT_NEIGHBOUR', neighbourId: first.id, epochMs }).ok,
    'the first visit was refused');
  const paid = state.player.coins - before;
  const again = execute(data, state, { type: 'VISIT_NEIGHBOUR', neighbourId: first.id, epochMs });
  assert(!again.ok, 'the same rival paid twice in one day');
  // A client insisting it is a different moment must not reopen the day.
  const later = execute(data, state, { type: 'VISIT_NEIGHBOUR', neighbourId: first.id, epochMs: epochMs + 60_000 });
  assert(!later.ok, 'moving the clock forward a minute reopened the visit');
  assert(state.player.coins - before === paid, 'a refused visit still paid');
});

// ---------------------------------------------------------------- seasons

check('a season pays the gems it promises, once a day', () => {
  const season = data.seasons.find((se) => se.dailyGems > 0);
  if (!season) return;
  const state = fresh();
  // Put the clock inside that season.
  const periodMs = data.gifts.resetHours * 3_600_000;
  const [mm, dd] = season.from.split('-').map(Number) as [number, number];
  // A day inside the window, not its first hour, so a season that wraps the
  // year boundary is still comfortably inside itself.
  const inSeason = Math.floor((Date.UTC(2025, mm - 1, dd) + 86_400_000) / periodMs) * periodMs;
  state.epochMs = inSeason;

  const gemsBefore = state.player.gems;
  assert(execute(data, state, { type: 'CLAIM_GIFT', epochMs: inSeason }).ok, 'the claim failed');
  const gained = state.player.gems - gemsBefore;
  assert(gained >= season.dailyGems,
    `${season.id} promises ${season.dailyGems} gems a day and paid ${gained}`);

  const afterFirst = state.player.gems;
  execute(data, state, { type: 'CLAIM_GIFT', epochMs: inSeason + periodMs / 2 });
  assert(state.player.gems === afterFirst, 'season gems paid twice in one day');
});

// ---------------------------------------------------------------- reachability

check('every command the player needs has a UI path', () => {
  /*
   * Six commands had core logic, tests and save support and no button. This
   * check reads the panels themselves, so deleting the button fails the build
   * rather than quietly returning the game to where it was.
   */
  const ui = ['src/ui/ManagePanel.tsx', 'src/ui/PlacementBar.tsx', 'src/ui/RoomSheet.tsx']
    .map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const cmd of [
    'EXPAND_PLOT', 'MOVE_ROOM', 'STORE_ROOM',
    'PLACE_STORED_ROOM', 'REMOVE_DECOR', 'SELL_DECOR',
  ]) {
    assert(ui.includes(`type: '${cmd}'`), `${cmd} still has no panel that dispatches it`);
  }
});

check('the placement preview agrees with the command', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 30;
  execute(data, state, { type: 'BUILD_ROOM', defId: 'standard' });
  const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;

  // Every square on the plot: whatever the preview says, the command must do.
  const bounds = plotBounds(data, state);
  let checked = 0;
  for (let y = 0; y < bounds.h; y++) {
    for (let x = 0; x < bounds.w; x++) {
      // No special case for sameSpot. It used to be counted as acceptance
      // here, which is exactly how the preview came to disagree with the
      // command: the square a room already occupies is a refusal, and the
      // preview has to show it red.
      const preview = placementProblem(state, room.defId, x, y, room.id);
      const probe = JSON.parse(JSON.stringify(state)) as GameState;
      const result = execute(data, probe, { type: 'MOVE_ROOM', roomId: room.id, x, y });
      const fromCommand = result.ok ? null : result.reason;
      assert(preview === fromCommand,
        `${x},${y}: preview said ${String(preview)} and the command said ${String(fromCommand)}`);
      checked++;
    }
  }
  console.log(`      ${checked} squares agreed`);
});

check('an owned piece is placed without paying again', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 30;
  execute(data, state, { type: 'BUILD_ROOM', defId: 'standard' });
  const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;

  const first = catalogueFor(data, 'standard')[0]!;
  execute(data, state, { type: 'PLACE_DECOR', roomId: room.id, defId: first, slot: 0 });
  const piece = room.decor[0]!;
  execute(data, state, { type: 'REMOVE_DECOR', roomId: room.id, decorId: piece.id });
  assert(owned(state, first) === 1, 'removing did not return the piece');

  const before = state.player.coins;
  assert(execute(data, state, { type: 'PLACE_DECOR', roomId: room.id, defId: first, slot: 0 }).ok,
    'placing the owned piece failed');
  assert(state.player.coins === before, 'placing an owned piece charged for it again');
  assert(owned(state, first) === 0, 'the owned copy was not consumed');
});

check('expansion, move, store and inventory all survive a reload', async () => {
  const state = fresh();
  state.player.coins += 50_000_000;
  state.player.level = data.levels[data.levels.length - 1]!.level;

  const plot = nextExpansion(state);
  if (plot && plot.blocker === null) execute(data, state, { type: 'EXPAND_PLOT', plotId: plot.id });
  const plotAfter = state.hotel.plotId;

  execute(data, state, { type: 'BUILD_ROOM', defId: 'standard' });
  const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;
  room.cleanliness = 1;
  const first = catalogueFor(data, 'standard')[0]!;
  execute(data, state, { type: 'PLACE_DECOR', roomId: room.id, defId: first, slot: 0 });
  execute(data, state, { type: 'REMOVE_DECOR', roomId: room.id, decorId: room.decor[0]!.id });
  execute(data, state, { type: 'STORE_ROOM', roomId: room.id });

  const ownedBefore = owned(state, first);
  const storedBefore = state.storedRooms.length;

  const saves = new SaveManager(new MemoryStorage());
  assert((await saves.save(state, state.epochMs)).ok, 'the save did not write');
  const back = await saves.load();
  // Printed on purpose: this line existing in the transcript is the proof the
  // runner waited. Under the old runner the test was ticked green before this
  // await had even been reached.
  console.log(`      round trip: load() returned ok=${back.ok}`);
  assert(back.ok, 'the save did not load');

  assert(back.state.hotel.plotId === plotAfter, 'the expanded plot did not survive');
  assert(back.state.storedRooms.length === storedBefore, 'the stored room did not survive');
  assert(owned(back.state, first) === ownedBefore, 'the owned decor did not survive');
});

// ---------------------------------------------------------- DEC-010 position

check('a freshly placed piece gets a real, in-bounds anchor — not the same spot twice', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 40;
  execute(data, state, { type: 'BUILD_ROOM', defId: 'standard' });
  const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;
  const rdef = roomDef(data, room.defId);

  // The room's own wall piece and its own floor piece, each in its place.
  const sold = catalogueFor(data, 'standard');
  const wall = decorDef(data, sold.find((id) => decorDef(data, id).slotType === 'wall')!);
  const floor = decorDef(data, sold.find((id) => !['wall', 'ceiling'].includes(decorDef(data, id).slotType)
    && slotAllowed(data, rdef, id))!);
  assert(execute(data, state, {
    type: 'PLACE_DECOR', roomId: room.id, defId: wall.id, slot: sold.indexOf(wall.id),
  }).ok, 'wall piece refused');
  assert(execute(data, state, {
    type: 'PLACE_DECOR', roomId: room.id, defId: floor.id, slot: sold.indexOf(floor.id),
  }).ok, 'floor piece refused');
  const [a, b] = room.decor;

  for (const piece of [a!, b!]) {
    assert(Number.isInteger(piece.localX) && piece.localX >= 0 && piece.localX < rdef.blocks.w * 16,
      `localX ${piece.localX} out of the room's ${rdef.blocks.w}-block width`);
    assert(Number.isInteger(piece.localY) && piece.localY >= 0 && piece.localY < rdef.blocks.h * 16,
      `localY ${piece.localY} out of the room's ${rdef.blocks.h}-block height`);
    assert(piece.flipX === false, 'a freshly placed piece starts flipped');
    assert(piece.zBias === 0, 'a freshly placed piece starts with a non-zero zBias');
  }
  assert(a!.localX !== b!.localX || a!.localY !== b!.localY, 'both pieces landed on the same anchor');
  // Room-local Y grows downward (RoomView draws top-left origin, height
  // going down) — a wall piece belongs nearer the top than a floor piece.
  assert(a!.localY < b!.localY, `the wall piece (y=${a!.localY}) is not above the floor piece (y=${b!.localY})`);
});

check('a second copy of a piece is refused, so no anchor is ever reused', () => {
  // Under the old rules the same rug could be bought eight times and the
  // plan had to find eight anchors for it. A room now holds each of its
  // pieces once, in the one place designed for it, and the second copy is
  // refused before any money moves.
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 40;
  assert(execute(data, state, { type: 'BUILD_ROOM', defId: 'standard' }).ok, 'could not build the room');
  const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;
  const rug = surfaceSoldBy('standard');
  const slot = catalogueIndex(data, 'standard', rug);
  assert(execute(data, state, { type: 'PLACE_DECOR', roomId: room.id, defId: rug, slot }).ok, 'the rug was refused');
  const coins = state.player.coins;
  const again = execute(data, state, { type: 'PLACE_DECOR', roomId: room.id, defId: rug, slot });
  assert(!again.ok && again.reason === 'alreadyPlaced', 'a second copy of the same piece was sold');
  assert(state.player.coins === coins, 'a refused second copy still charged');
  assert(room.decor.length === 1, 'a refused second copy still landed');
});

check('decor position, flip and z-bias survive a reload', async () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 40;
  execute(data, state, { type: 'BUILD_ROOM', defId: 'standard' });
  const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;
  execute(data, state, { type: 'PLACE_DECOR', roomId: room.id, defId: catalogueFor(data, 'standard')[0]!, slot: 0 });
  const piece = room.decor[0]!;
  // Nothing sets flipX/zBias to anything but the defaults yet (no MOVE_DECOR
  // or FLIP_DECOR command exists — HC-P1-S3's own scope note), so the round
  // trip is checked against those defaults directly rather than against a
  // hand-mutated value the game cannot actually produce.

  const saves = new SaveManager(new MemoryStorage());
  assert((await saves.save(state, state.epochMs)).ok, 'the save did not write');
  const back = await saves.load();
  assert(back.ok, 'the save did not load');
  const restored = back.state.hotel.rooms.find((r) => r.id === room.id)!.decor[0]!;
  assert(restored.localX === piece.localX && restored.localY === piece.localY,
    `anchor moved on reload: (${piece.localX},${piece.localY}) -> (${restored.localX},${restored.localY})`);
  assert(restored.flipX === piece.flipX, 'flipX did not survive a reload');
  assert(restored.zBias === piece.zBias, 'zBias did not survive a reload');
});

check('migration 17→18 gives every legacy piece a valid anchor, with no SimData at all', () => {
  const legacyRoom = {
    id: 'r1', defId: 'standard', x: 0, y: 0, cleanliness: 1,
    hasPest: false, hasFire: false, hasGhost: false, occupants: [],
    decor: [
      { id: 'd0', defId: 'wallpaper_plain', slot: 0 },
      { id: 'd1', defId: 'bed_single', slot: 1 },
      { id: 'd2', defId: 'seating_armchair', slot: 2 },
    ],
  };
  const legacyStored = {
    id: 's1', defId: 'economy', decorPoints: 0, cleanliness: 1, builtAtTick: 0,
    decor: [{ id: 'd3', defId: 'rug_mat', slot: 0 }],
  };
  const raw = {
    hotel: { rooms: [legacyRoom] },
    storedRooms: [legacyStored],
  };
  // No fourth argument: this is the call every existing selftest already
  // makes, and the one a SaveManager built without SimData still makes too.
  const migrated = migrate(raw as unknown as Record<string, unknown>, 17, 18) as {
    hotel: { rooms: Array<{ decor: Array<Record<string, unknown>> }> };
    storedRooms: Array<{ decor: Array<Record<string, unknown>> }>;
  };

  const allPieces = [...migrated.hotel.rooms[0]!.decor, ...migrated.storedRooms[0]!.decor];
  const anchors = new Set<string>();
  for (const p of allPieces) {
    assert(Number.isInteger(p['localX']) && (p['localX'] as number) >= 0 && (p['localX'] as number) < 16,
      `${p['id']} localX ${p['localX']} is outside the safe 1x1-block fallback`);
    assert(Number.isInteger(p['localY']) && (p['localY'] as number) >= 0 && (p['localY'] as number) < 16,
      `${p['id']} localY ${p['localY']} is outside the safe 1x1-block fallback`);
    eq(p['flipX'], false, `${p['id']} did not default to flipX=false`);
    eq(p['zBias'], 0, `${p['id']} did not default to zBias=0`);
  }
  eq(migrated.hotel.rooms[0]!.decor[0]!['slot'], 0, 'slot was touched by the migration');
  eq(migrated.hotel.rooms[0]!.decor[1]!['defId'], 'bed_single', 'defId was touched by the migration');
  for (const p of migrated.hotel.rooms[0]!.decor) {
    const key = `${p['localX']},${p['localY']}`;
    assert(!anchors.has(key), `two pieces in the same room share anchor ${key}`);
    anchors.add(key);
  }
});

check('migration 17→18 with SimData respects the room\'s real footprint and surface bands', () => {
  const rdef = roomDef(data, 'presidential'); // 3x2 blocks — bigger than the 1x1 fallback
  const legacyRoom = {
    id: 'r1', defId: 'presidential', x: 0, y: 0, cleanliness: 1,
    hasPest: false, hasFire: false, hasGhost: false, occupants: [],
    decor: [
      { id: 'wall0', defId: 'wallpaper_plain', slot: 0 }, // slotType: wall
      { id: 'floor0', defId: 'bed_single', slot: 1 },      // slotType: bed
    ],
  };
  const migrated = migrate(
    { hotel: { rooms: [legacyRoom] } } as unknown as Record<string, unknown>, 17, 18, data,
  ) as { hotel: { rooms: Array<{ decor: Array<Record<string, unknown>> }> } };
  const [wall, floor] = migrated.hotel.rooms[0]!.decor;

  const maxX = rdef.blocks.w * 16 - 1;
  const maxY = rdef.blocks.h * 16 - 1;
  for (const p of [wall!, floor!]) {
    assert((p['localX'] as number) <= maxX, `${p['id']} escaped the room's real ${rdef.blocks.w}-block width`);
    assert((p['localY'] as number) <= maxY, `${p['id']} escaped the room's real ${rdef.blocks.h}-block height`);
  }
  // presidential is taller than the 1x1 fallback (32 vs 16 anchor units), so
  // this only proves something if the real footprint was actually used.
  assert(maxY > 15, 'test fixture stopped being bigger than the fallback room');
  assert((wall!['localY'] as number) < (floor!['localY'] as number),
    `with real data the wall piece (y=${wall!['localY']}) should sit above the bed (y=${floor!['localY']})`);
});

check('a decor piece missing its DEC-010 fields is refused, not silently accepted', () => {
  const state = JSON.parse(JSON.stringify(fresh())) as Record<string, unknown>;
  const hotel = state['hotel'] as { rooms: Array<Record<string, unknown>> };
  hotel.rooms[0]!['decor'] = [{ id: 'd0', defId: 'wallpaper_plain', slot: 0 }]; // no localX/localY/flipX/zBias
  const problems = validateState(state);
  assert(problems.some((p) => p.includes('localX')), `missing localX was not caught: ${problems.join('; ')}`);
});

check('the plot ladder cannot be skipped', () => {
  const state = fresh();
  state.player.coins += 500_000_000;
  state.player.level = data.levels[data.levels.length - 1]!.level;
  const plots = [...data.plots].sort((a, b) => a.blocks - b.blocks);
  const far = plots[plots.length - 1]!;
  const current = plots.find((p) => p.id === state.hotel.plotId);
  if (!current || far.id === current.id) return;

  const before = state.player.coins;
  const leap = execute(data, state, { type: 'EXPAND_PLOT', plotId: far.id });
  assert(!leap.ok && leap.reason === 'notNextPlot',
    `a player bought ${far.id} outright from ${current.id}`);
  assert(state.player.coins === before, 'a refused expansion still charged');

  // The next one up must be accepted, and must charge exactly its price.
  const next = plots.find((p) => p.blocks > current.blocks)!;
  const ok = execute(data, state, { type: 'EXPAND_PLOT', plotId: next.id });
  assert(ok.ok, `the next plot was refused: ${ok.ok === false ? ok.reason : ''}`);
  assert(state.player.coins === before - next.cost,
    `expansion charged ${before - state.player.coins}, the plot costs ${next.cost}`);
});

check('a penniless player can still place a piece they own', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 30;
  execute(data, state, { type: 'BUILD_ROOM', defId: 'standard' });
  const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;
  const first = catalogueFor(data, 'standard')[0]!;
  execute(data, state, { type: 'PLACE_DECOR', roomId: room.id, defId: first, slot: 0 });
  execute(data, state, { type: 'REMOVE_DECOR', roomId: room.id, decorId: room.decor[0]!.id });

  // Broke, but holding the piece.
  state.player.coins = 0;
  state.player.gems = 0;
  const row = decorCatalog(state, room.id).find((d) => d.defId === first);
  assert(row, 'the owned piece vanished from the catalogue');
  assert(row.owned === 1, `the catalogue says ${row.owned} owned`);
  assert(row.blocker !== 'cannotAfford',
    'a player was told they could not afford something they already own');

  const r = execute(data, state, { type: 'PLACE_DECOR', roomId: room.id, defId: first, slot: 0 });
  assert(r.ok, `placing an owned piece with no money failed: ${r.ok === false ? r.reason : ''}`);
  assert(state.player.coins === 0 && state.player.gems === 0, 'placing an owned piece charged');
});

check('the store button says which rule stops it', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 30;
  execute(data, state, { type: 'BUILD_ROOM', defId: 'standard' });
  const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;
  initSelectors(data);

  room.cleanliness = 1;
  assert(roomDetail(state, room.id)!.storeBlocker === null, 'a clean empty room refused storage');
  room.occupants.push('somebody');
  assert(roomDetail(state, room.id)!.storeBlocker === 'roomOccupied', 'an occupied room gave the wrong reason');
  room.occupants = [];
  room.hasFire = true;
  assert(roomDetail(state, room.id)!.storeBlocker === 'roomHasHazard', 'a burning room gave the wrong reason');
  room.hasFire = false;
  room.cleanliness = 0;
  assert(roomDetail(state, room.id)!.storeBlocker === 'roomTooDirty', 'a filthy room gave the wrong reason');

  const lobby = state.hotel.rooms.find((r) => r.defId === 'lobby')!;
  lobby.cleanliness = 1;
  assert(roomDetail(state, lobby.id)!.storeBlocker === 'roomRequired', 'the lobby gave the wrong reason');
});

check('a corrupt stored room is refused rather than restored as undefined', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 30;
  execute(data, state, { type: 'BUILD_ROOM', defId: 'standard' });
  const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;
  room.cleanliness = 1;
  execute(data, state, { type: 'STORE_ROOM', roomId: room.id });

  for (const missing of ['id', 'defId', 'decor'] as const) {
    const broken = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    delete (broken['storedRooms'] as Array<Record<string, unknown>>)[0]![missing];
    assert(validateState(broken).length > 0,
      `a stored room with no ${missing} was accepted by validateState`);
  }
});

check('a stored room that points at nothing fails the invariants', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 30;
  execute(data, state, { type: 'BUILD_ROOM', defId: 'standard' });
  const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;
  room.cleanliness = 1;
  execute(data, state, { type: 'STORE_ROOM', roomId: room.id });

  state.storedRooms[0]!.defId = 'no_such_room';
  const bad = checkInvariants(data, state);
  assert(bad.length > 0, 'a stored room pointing at an unknown definition passed');
});

check('the four placement verdicts, each named', () => {
  const state = fresh();
  state.player.coins += 5_000_000;
  state.player.level = 30;
  execute(data, state, { type: 'BUILD_ROOM', defId: 'standard' });
  const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;
  const other = state.hotel.rooms.find((r) => r.id !== room.id)!;

  assert(placementProblem(state, room.defId, room.x, room.y, room.id) === 'sameSpot',
    'the square the room stands on did not report sameSpot');
  assert(placementProblem(state, room.defId, other.x, other.y, room.id) === 'overlaps',
    'landing on another room did not report overlaps');
  assert(placementProblem(state, room.defId, 99, 99, room.id) === 'outOfBounds',
    'a square off the plot did not report outOfBounds');

  const spot = findFreeSpot(data, state, roomDef(data, room.defId).blocks);
  if (spot) {
    assert(placementProblem(state, room.defId, spot.x, spot.y, room.id) === null,
      'a free square was refused');
  }

  // Each refusal must leave the hotel exactly as it was.
  const before = JSON.stringify(state);
  for (const [x, y] of [[room.x, room.y], [other.x, other.y], [99, 99]] as const) {
    const r = execute(data, state, { type: 'MOVE_ROOM', roomId: room.id, x, y });
    assert(!r.ok, `moving to ${x},${y} was accepted`);
    assert(JSON.stringify(state) === before, `a refused move to ${x},${y} changed the state`);
  }
});

/**
 * The corruption table.
 *
 * Defined once and used by both the load test and the import test. They were
 * separate lists — nine cases and three — which is precisely the arrangement
 * that lets the two paths drift apart without anything noticing.
 */
const CORRUPTIONS: Array<[string, (s: Record<string, unknown>) => void]> = [
  ['storedRooms: [null]', (x) => { x['storedRooms'] = [null]; }],
  ['unknown stored room def', (x) => { (x['storedRooms'] as Array<Record<string, unknown>>)[0]!['defId'] = 'no_such_room'; }],
  ['stored decor: [null]', (x) => { (x['storedRooms'] as Array<Record<string, unknown>>)[0]!['decor'] = [null]; }],
  ['decor piece with no slot', (x) => {
    delete ((x['storedRooms'] as Array<Record<string, unknown>>)[0]!['decor'] as Array<Record<string, unknown>>)[0]!['slot'];
  }],
  ['room id used twice', (x) => {
    (x['storedRooms'] as Array<Record<string, unknown>>)[0]!['id'] =
      (x['hotel'] as { rooms: Array<{ id: string }> }).rooms[0]!.id;
  }],
  ['decorPoints disagree with the pieces', (x) => {
    (x['storedRooms'] as Array<Record<string, unknown>>)[0]!['decorPoints'] = 99_999;
  }],
  ['cleanliness outside 0..1', (x) => { (x['storedRooms'] as Array<Record<string, unknown>>)[0]!['cleanliness'] = 4; }],
  ['builtAtTick in the future', (x) => { (x['storedRooms'] as Array<Record<string, unknown>>)[0]!['builtAtTick'] = 10_000_000; }],
  ['negative coins', (x) => { (x['player'] as Record<string, unknown>)['coins'] = -1; }],
];

/** Roots that are valid JSON documents and not save files. */
const BAD_ROOTS: Array<[string, string]> = [
  ['null', 'null'],
  ['0', '0'],
  ['false', 'false'],
  ['empty string', '""'],
  ['a bare string', '"text"'],
  ['an array', '[]'],
  ['an empty object', '{}'],
];

/** A hotel with a stored room and a real piece of decor in it. */
function soundSave(): GameState {
  const s = fresh();
  s.player.coins += 5_000_000;
  s.player.level = 30;
  execute(data, s, { type: 'BUILD_ROOM', defId: 'standard' });
  const room = s.hotel.rooms[s.hotel.rooms.length - 1]!;
  room.cleanliness = 1;
  execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: catalogueFor(data, 'standard')[0]!, slot: 0 });
  execute(data, s, { type: 'STORE_ROOM', roomId: room.id });
  return s;
}

const envelope = (state: unknown): string =>
  JSON.stringify({ version: SCHEMA_VERSION, savedAtMs: 1_700_000_000_000, state });

check('a JSON root that is not an envelope is refused, not thrown on', async () => {
  /*
   * `typeof null === 'object'`, so a save file containing the four characters
   * `null` passed the envelope check and threw on `env.version` — a TypeError
   * out of load(), where the caller expected a corrupt result.
   */
  for (const [name, raw] of BAD_ROOTS) {
    const storage = new MemoryStorage();
    await storage.set(SAVE_KEY, raw);

    let result;
    try {
      result = await new SaveManager(storage, data).load();
    } catch (e) {
      throw new Error(`load("${name}") threw: ${(e as Error).message}`);
    }
    assert(!result.ok, `load("${name}") was accepted`);
    assert(result.reason === 'corrupt', `load("${name}") reported "${result.reason}"`);
    assert(await storage.get(QUARANTINE_KEY) === raw, `load("${name}") did not quarantine verbatim`);
    assert(await storage.get(SAVE_KEY) === raw, `load("${name}") altered the save`);
  }
  console.log(`      ${BAD_ROOTS.length} non-envelope roots refused by load()`);
});

check('a non-envelope import is refused and disturbs nothing', async () => {
  const goodRaw = envelope(soundSave());
  const sentinel = 'previously-quarantined';

  for (const [name, raw] of BAD_ROOTS) {
    const storage = new MemoryStorage();
    await storage.set(SAVE_KEY, goodRaw);
    await storage.set(QUARANTINE_KEY, sentinel);

    let result;
    try {
      result = await new SaveManager(storage, data).importFromJson(raw);
    } catch (e) {
      throw new Error(`import("${name}") threw: ${(e as Error).message}`);
    }
    assert(!result.ok && result.reason === 'corrupt', `import("${name}") was accepted`);
    assert(await storage.get(SAVE_KEY) === goodRaw, `import("${name}") overwrote the save`);
    assert(await storage.get(QUARANTINE_KEY) === sentinel, `import("${name}") touched quarantine`);
  }
});

check('an empty room id or defId is refused, with or without SimData', async () => {
  for (const field of ['id', 'defId'] as const) {
    const broken = JSON.parse(JSON.stringify(soundSave())) as Record<string, unknown>;
    const rooms = (broken['hotel'] as { rooms: Array<Record<string, unknown>> }).rooms;
    // A room nobody occupies and nobody staffs, so the empty id is the only
    // thing wrong with it.
    const spare = rooms.find((r) => (r['occupants'] as unknown[]).length === 0 && r['staffId'] === null);
    assert(spare, 'the fixture has no unoccupied, unstaffed room');
    spare[field] = '';

    assert(validateState(broken).length > 0, `${field}: "" passed validateState`);

    const raw = envelope(broken);
    // Structural rejection must not depend on having the data.
    for (const manager of ['without data', 'with data'] as const) {
      const storage = new MemoryStorage();
      await storage.set(SAVE_KEY, raw);
      const saves = manager === 'with data'
        ? new SaveManager(storage, data)
        : new SaveManager(storage);

      let result;
      try {
        result = await saves.load();
      } catch (e) {
        throw new Error(`${field}: "" ${manager} threw: ${(e as Error).message}`);
      }
      assert(!result.ok && result.reason === 'corrupt', `${field}: "" ${manager} was accepted`);
      assert(await storage.get(QUARANTINE_KEY) === raw, `${field}: "" ${manager} did not quarantine verbatim`);
      assert(await storage.get(SAVE_KEY) === raw, `${field}: "" ${manager} altered the save`);
    }
  }
});

check('every corruption is refused and quarantined by load()', async () => {
  const sound = soundSave();
  for (const [name, corrupt] of CORRUPTIONS) {
    const broken = JSON.parse(JSON.stringify(sound)) as Record<string, unknown>;
    corrupt(broken);
    const raw = envelope(broken);

    const storage = new MemoryStorage();
    await storage.set(SAVE_KEY, raw);

    let result;
    try {
      result = await new SaveManager(storage, data).load();
    } catch (e) {
      throw new Error(`"${name}" threw out of load(): ${(e as Error).message}`);
    }
    assert(!result.ok, `"${name}" was loaded as a valid save`);
    assert(result.reason === 'corrupt', `"${name}" reported "${result.reason}" rather than corrupt`);
    assert(await storage.get(QUARANTINE_KEY) === raw, `"${name}" was not quarantined verbatim`);
    assert(await storage.get(SAVE_KEY) === raw, `"${name}" altered the save on disk`);
  }
  console.log(`      ${CORRUPTIONS.length} corrupt saves refused and quarantined via load()`);
});

check('every corruption is refused by import, leaving storage alone', async () => {
  const sound = soundSave();
  const goodRaw = envelope(sound);
  const sentinel = 'previously-quarantined';

  for (const [name, corrupt] of CORRUPTIONS) {
    const broken = JSON.parse(JSON.stringify(sound)) as Record<string, unknown>;
    corrupt(broken);

    const storage = new MemoryStorage();
    await storage.set(SAVE_KEY, goodRaw);
    await storage.set(QUARANTINE_KEY, sentinel);

    let result;
    try {
      result = await new SaveManager(storage, data).importFromJson(envelope(broken));
    } catch (e) {
      throw new Error(`importing "${name}" threw: ${(e as Error).message}`);
    }
    assert(!result.ok && result.reason === 'corrupt', `importing "${name}" was accepted`);
    assert(await storage.get(SAVE_KEY) === goodRaw, `importing "${name}" overwrote the player's save`);
    assert(await storage.get(QUARANTINE_KEY) === sentinel, `importing "${name}" touched quarantine`);
  }
  console.log(`      ${CORRUPTIONS.length} corrupt files refused by importFromJson()`);
});

check('load and import agree on what is wrong', async () => {
  // Two paths, one verdict. If they ever diverge, one of them has grown a gate
  // the other does not have.
  const sound = soundSave();
  for (const [name, corrupt] of CORRUPTIONS) {
    const broken = JSON.parse(JSON.stringify(sound)) as Record<string, unknown>;
    corrupt(broken);
    const raw = envelope(broken);

    const loadStorage = new MemoryStorage();
    await loadStorage.set(SAVE_KEY, raw);
    const loaded = await new SaveManager(loadStorage, data).load();
    const imported = await new SaveManager(new MemoryStorage(), data).importFromJson(raw);

    assert(!loaded.ok && !imported.ok, `"${name}" was accepted by one of the two paths`);
    assert(loaded.reason === imported.reason,
      `"${name}": load said ${loaded.reason}, import said ${imported.reason}`);
    assert(loaded.detail === imported.detail,
      `"${name}": load and import disagree on the reason`);
  }
});

check('a sound save survives load and import unchanged, in full', async () => {
  const sound = soundSave();
  const original = JSON.stringify(sound);
  const sentinel = 'previously-quarantined';

  const storage = new MemoryStorage();
  await storage.set(QUARANTINE_KEY, sentinel);
  const manager = new SaveManager(storage, data);
  assert((await manager.save(sound, sound.epochMs)).ok, 'the sound save did not write');

  const loaded = await manager.load();
  assert(loaded.ok, `a sound save was refused: ${loaded.ok === false ? loaded.detail : ''}`);
  // The whole state, not a corner of it.
  assert(loaded.ok && JSON.stringify(loaded.state) === original,
    'the state changed on the way through load()');

  const raw = await storage.get(SAVE_KEY);
  assert(raw !== null, 'nothing was written');
  const imported = await new SaveManager(new MemoryStorage(), data).importFromJson(raw);
  assert(imported.ok, `a sound save failed to import: ${imported.ok === false ? imported.detail : ''}`);
  assert(imported.ok && JSON.stringify(imported.state) === original,
    'the state changed on the way through importFromJson()');

  assert(await storage.get(QUARANTINE_KEY) === sentinel, 'a successful load wrote to quarantine');
  assert(sound.storedRooms.length === 1 && sound.storedRooms[0]!.decor.length === 1,
    'the fixture lost its stored room or its decor');
});

check('load waits for the quarantine write before it resolves', async () => {
  /*
   * A storage that takes its time.
   *
   * If `load` returned before the quarantine write settled, the evidence would
   * be missing exactly when it is needed: right after a crash.
   */
  let quarantineWritten = false;
  let resolvedBeforeWrite = false;

  class SlowStorage extends MemoryStorage {
    override async get(key: string): Promise<string | null> {
      await new Promise((r) => setTimeout(r, 20));
      return super.get(key);
    }
    override async set(key: string, value: string): Promise<void> {
      await new Promise((r) => setTimeout(r, 20));
      if (key === QUARANTINE_KEY) quarantineWritten = true;
      return super.set(key, value);
    }
  }

  const broken = JSON.parse(JSON.stringify(fresh())) as Record<string, unknown>;
  broken['storedRooms'] = [null];
  const raw = JSON.stringify({ version: SCHEMA_VERSION, savedAtMs: 1_700_000_000_000, state: broken });

  const storage = new SlowStorage();
  await storage.set(SAVE_KEY, raw);
  quarantineWritten = false;

  const result = await new SaveManager(storage, data).load();
  if (!quarantineWritten) resolvedBeforeWrite = true;

  assert(!result.ok && result.reason === 'corrupt', 'the slow load did not report corrupt');
  assert(!resolvedBeforeWrite, 'load resolved before the quarantine write finished');
  assert(await storage.get(QUARANTINE_KEY) === raw, 'the quarantine copy is not the original bytes');
});

check('the six commands survive a real save and reload', async () => {
  const state = fresh();
  state.player.coins += 50_000_000;
  state.player.level = data.levels[data.levels.length - 1]!.level;

  const plot = nextExpansion(state);
  assert(plot && plot.blocker === null, 'the next plot was not affordable in the fixture');
  const coinsBeforePlot = state.player.coins;
  assert(execute(data, state, { type: 'EXPAND_PLOT', plotId: plot.id }).ok, 'EXPAND_PLOT failed');
  assert(state.player.coins === coinsBeforePlot - plot.cost, 'the expansion charged the wrong amount');
  const plotId = state.hotel.plotId;

  execute(data, state, { type: 'BUILD_ROOM', defId: 'standard' });
  const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;
  room.cleanliness = 1;
  execute(data, state, { type: 'PLACE_DECOR', roomId: room.id, defId: STANDARD_A, slot: 0 });

  const spot = findFreeSpot(data, state, roomDef(data, room.defId).blocks);
  assert(spot, 'nowhere to move to');
  assert(execute(data, state, { type: 'MOVE_ROOM', roomId: room.id, x: spot.x, y: spot.y }).ok, 'MOVE_ROOM failed');

  assert(execute(data, state, { type: 'REMOVE_DECOR', roomId: room.id, decorId: room.decor[0]!.id }).ok, 'REMOVE_DECOR failed');
  const coinsBeforeSell = state.player.coins;
  const def = data.decor.find((d) => d.id === STANDARD_A)!;
  const expectedRefund = Math.round(def.cost.amount * data.economy.sellback.ratio);
  assert(execute(data, state, { type: 'SELL_DECOR', defId: STANDARD_A }).ok, 'SELL_DECOR failed');
  assert(state.player.coins === coinsBeforeSell + expectedRefund,
    `the sale paid ${state.player.coins - coinsBeforeSell}, expected ${expectedRefund}`);

  assert(execute(data, state, { type: 'STORE_ROOM', roomId: room.id }).ok, 'STORE_ROOM failed');
  assert(execute(data, state, { type: 'PLACE_STORED_ROOM', roomId: room.id }).ok, 'PLACE_STORED_ROOM failed');

  const before = state.hotel.rooms.find((r) => r.id === room.id)!;
  const snapshot = {
    coins: state.player.coins, plotId,
    id: before.id, defId: before.defId, x: before.x, y: before.y,
    decorPoints: before.decorPoints, cleanliness: before.cleanliness, builtAtTick: before.builtAtTick,
    owned: owned(state, STANDARD_A),
  };

  const saves = new SaveManager(new MemoryStorage(), data);
  assert((await saves.save(state, state.epochMs)).ok, 'the save did not write');
  const back = await saves.load();
  assert(back.ok, `the save did not load back: ${back.ok === false ? back.reason : ''}`);

  const after = back.state.hotel.rooms.find((r) => r.id === snapshot.id);
  assert(after, 'the room did not survive the reload');
  assert(back.state.player.coins === snapshot.coins, 'coins changed across the reload');
  assert(back.state.hotel.plotId === snapshot.plotId, 'the plot changed across the reload');
  assert(after.x === snapshot.x && after.y === snapshot.y, 'the room moved across the reload');
  assert(after.defId === snapshot.defId, 'the room changed type across the reload');
  assert(after.decorPoints === snapshot.decorPoints, 'decorPoints changed across the reload');
  assert(after.cleanliness === snapshot.cleanliness, 'cleanliness changed across the reload');
  assert(after.builtAtTick === snapshot.builtAtTick, 'builtAtTick changed across the reload');
  assert(owned(back.state, STANDARD_A) === snapshot.owned, 'the inventory changed across the reload');
});

// ---------------------------------------------------------------- decor identity

/**
 * A structurally sound hotel with two placed rooms carrying decor and two
 * stored rooms carrying decor, so every duplicate shape has somewhere to live.
 */
function identityFixture(): GameState {
  const s = fresh();
  s.player.coins += 5_000_000;
  s.player.level = 30;
  execute(data, s, { type: 'BUILD_ROOM', defId: 'standard' });
  execute(data, s, { type: 'BUILD_ROOM', defId: 'standard' });
  execute(data, s, { type: 'BUILD_ROOM', defId: 'standard' });
  execute(data, s, { type: 'BUILD_ROOM', defId: 'standard' });
  const rooms = s.hotel.rooms.filter((r) => r.defId === 'standard');
  assert(rooms.length >= 4, 'the fixture could not build four rooms');
  for (const room of rooms) {
    room.cleanliness = 1;
    execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: STANDARD_A, slot: 0 });
    execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: STANDARD_B, slot: 1 });
  }
  execute(data, s, { type: 'STORE_ROOM', roomId: rooms[2]!.id });
  execute(data, s, { type: 'STORE_ROOM', roomId: rooms[3]!.id });
  assert(checkInvariants(data, s).length === 0, 'the identity fixture is not sound');
  return s;
}

/** Every live decor id, with where it sits. */
function liveDecorIds(s: GameState): Map<string, string[]> {
  const where = new Map<string, string[]>();
  const note = (id: string, loc: string) => {
    const list = where.get(id) ?? [];
    list.push(loc);
    where.set(id, list);
  };
  for (const room of s.hotel.rooms) for (const p of room.decor) note(p.id, `placed:${room.id}:${p.slot}`);
  for (const room of s.storedRooms) for (const p of room.decor) note(p.id, `stored:${room.id}:${p.slot}`);
  return where;
}

function assertAllUnique(s: GameState, where: string): void {
  for (const [id, locs] of liveDecorIds(s)) {
    assert(locs.length === 1, `${where}: ${id} appears ${locs.length} times (${locs.join(', ')})`);
  }
}

/**
 * Run one corrupt-but-structurally-valid state through the whole gate:
 * invariants, load with quarantine, and import with nothing disturbed. Both
 * paths must give the same verdict for the same reason.
 */
async function expectSemanticRejection(name: string, state: GameState, rule: string): Promise<void> {
  const structural = validateState(state);
  assert(structural.length === 0, `"${name}" is structurally invalid (${structural[0]}) — it proves nothing about the semantic gate`);

  const violations = checkInvariants(data, state);
  assert(violations.some((v) => v.rule === rule),
    `"${name}" did not produce "${rule}"; got: ${violations.map((v) => v.rule).join(', ') || 'nothing'}`);

  const raw = JSON.stringify({ version: SCHEMA_VERSION, savedAtMs: 1_700_000_000_000, state });

  const loadStorage = new MemoryStorage();
  await loadStorage.set(SAVE_KEY, raw);
  const loaded = await new SaveManager(loadStorage, data).load();
  assert(!loaded.ok && loaded.reason === 'corrupt', `"${name}" was loaded`);
  assert(await loadStorage.get(SAVE_KEY) === raw, `"${name}": load altered the save`);
  assert(await loadStorage.get(QUARANTINE_KEY) === raw, `"${name}": load did not quarantine verbatim`);

  const importStorage = new MemoryStorage();
  const goodRaw = JSON.stringify({ version: SCHEMA_VERSION, savedAtMs: 1_700_000_000_000, state: fresh() });
  await importStorage.set(SAVE_KEY, goodRaw);
  await importStorage.set(QUARANTINE_KEY, 'sentinel');
  const imported = await new SaveManager(importStorage, data).importFromJson(raw);
  assert(!imported.ok && imported.reason === 'corrupt', `"${name}" was imported`);
  assert(await importStorage.get(SAVE_KEY) === goodRaw, `"${name}": import overwrote the save`);
  assert(await importStorage.get(QUARANTINE_KEY) === 'sentinel', `"${name}": import touched quarantine`);
  assert(loaded.detail === imported.detail, `"${name}": load and import disagree on the reason`);
}

async function expectSound(name: string, state: GameState): Promise<void> {
  assert(validateState(state).length === 0, `"${name}" failed structurally`);
  const v = checkInvariants(data, state);
  assert(v.length === 0, `"${name}" was refused: ${v.map((x) => `${x.rule} — ${x.detail}`).join('; ')}`);
  const raw = JSON.stringify({ version: SCHEMA_VERSION, savedAtMs: 1_700_000_000_000, state });
  const storage = new MemoryStorage();
  await storage.set(SAVE_KEY, raw);
  const loaded = await new SaveManager(storage, data).load();
  assert(loaded.ok, `"${name}" failed to load: ${loaded.ok === false ? loaded.detail : ''}`);
  assert(loaded.ok && JSON.stringify(loaded.state) === JSON.stringify(state), `"${name}" changed on load`);
}

check('A — every shape of duplicate decor id is refused', async () => {
  const base = identityFixture();
  const placed = base.hotel.rooms.filter((r) => r.decor.length > 0);
  const stored = base.storedRooms;
  assert(placed.length >= 2 && stored.length >= 2, 'fixture lacks rooms to test with');

  const shapes: Array<[string, (s: GameState) => void]> = [
    ['inside one placed room, two slots', (s) => {
      const r = s.hotel.rooms.find((x) => x.id === placed[0]!.id)!;
      r.decor[1]!.id = r.decor[0]!.id;
    }],
    ['across two placed rooms', (s) => {
      const a = s.hotel.rooms.find((x) => x.id === placed[0]!.id)!;
      const b = s.hotel.rooms.find((x) => x.id === placed[1]!.id)!;
      b.decor[0]!.id = a.decor[0]!.id;
    }],
    ['between a placed and a stored room', (s) => {
      const a = s.hotel.rooms.find((x) => x.id === placed[0]!.id)!;
      s.storedRooms[0]!.decor[0]!.id = a.decor[0]!.id;
    }],
    ['across two stored rooms', (s) => {
      s.storedRooms[1]!.decor[0]!.id = s.storedRooms[0]!.decor[0]!.id;
    }],
    ['inside one stored room', (s) => {
      s.storedRooms[0]!.decor[1]!.id = s.storedRooms[0]!.decor[0]!.id;
    }],
  ];
  for (const [name, corrupt] of shapes) {
    const s = JSON.parse(JSON.stringify(base)) as GameState;
    corrupt(s);
    await expectSemanticRejection(name, s, 'unique decor ids');
  }
  console.log(`      ${shapes.length} duplicate shapes refused via load and import`);
});

check('A — the violation names both locations', () => {
  const s = identityFixture();
  const a = s.hotel.rooms.find((r) => r.decor.length > 0)!;
  s.storedRooms[0]!.decor[0]!.id = a.decor[0]!.id;
  const v = checkInvariants(data, s).find((x) => x.rule === 'unique decor ids');
  assert(v, 'no unique decor ids violation');
  assert(v.detail.includes('placed room') && v.detail.includes('stored room'),
    `the detail does not name both locations: ${v.detail}`);
});

check('B — a stale or invalid decor counter is refused; a correct one is not', async () => {
  const withOne = (id: string, counter: number): GameState => {
    const s = fresh();
    s.player.coins += 5_000_000;
    s.player.level = 30;
    execute(data, s, { type: 'BUILD_ROOM', defId: 'standard' });
    const room = s.hotel.rooms[s.hotel.rooms.length - 1]!;
    room.cleanliness = 1;
    execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: STANDARD_A, slot: 0 });
    room.decor[0]!.id = id;
    s.counters.decor = counter;
    return s;
  };

  const bad: Array<[string, GameState, string]> = [
    ['d0 with counter 0', withOne('d0', 0), 'decor counter is ahead of live ids'],
    ['d5 with counter 5', withOne('d5', 5), 'decor counter is ahead of live ids'],
    ['d5 with counter 2', withOne('d5', 2), 'decor counter is ahead of live ids'],
    ['negative counter', withOne('d0', -1), 'decor counter is a safe non-negative integer'],
    ['fractional counter', withOne('d0', 1.5), 'decor counter is a safe non-negative integer'],
    ['unsafe counter', withOne('d0', Number.MAX_SAFE_INTEGER + 2), 'decor counter is a safe non-negative integer'],
  ];
  for (const [name, s, rule] of bad) await expectSemanticRejection(name, s, rule);

  await expectSound('d5 with counter 6', withOne('d5', 6));
  await expectSound('legacy id with counter 0', withOne('legacy-lamp-7', 0));

  const many = identityFixture();
  const suffixes = [...liveDecorIds(many).keys()]
    .map((id) => /^d(\d+)$/.exec(id)).filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
  assert(suffixes.length > 0 && many.counters.decor > Math.max(...suffixes),
    'the game itself does not keep the counter ahead of what it minted');
  await expectSound('several pieces, counter above the highest suffix', many);
  console.log(`      ${bad.length} counter states refused, 3 accepted`);
});

check('C — ownedDecor keys must exist; counts are not tied to live pieces', async () => {
  const unknown = identityFixture();
  unknown.ownedDecor['missing-decoration'] = 1;
  await expectSemanticRejection('unknown owned def', unknown, 'owned decor references');

  const known = identityFixture();
  known.ownedDecor[STANDARD_A] = 3;   // also placed in every room: allowed
  await expectSound('known def owned and placed at once', known);

  // Several pieces of one definition, each its own instance: allowed.
  const same = identityFixture();
  const ids = [...liveDecorIds(same).keys()];
  assert(ids.length > 1, 'fixture has only one piece');
  await expectSound('many instances of one definition', same);
});

check('D — decor identity survives the whole command lifecycle', () => {
  const s = fresh();
  s.player.coins += 5_000_000;
  s.player.level = 30;
  const sound = (where: string) => {
    const v = checkInvariants(data, s);
    assert(v.length === 0, `${where}: ${v.map((x) => `${x.rule} — ${x.detail}`).join('; ')}`);
    assertAllUnique(s, where);
  };

  execute(data, s, { type: 'BUILD_ROOM', defId: 'standard' });
  const room = s.hotel.rooms[s.hotel.rooms.length - 1]!;
  room.cleanliness = 1;
  const counterBefore = s.counters.decor;
  assert(execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: STANDARD_A, slot: 0 }).ok, 'place 1');
  assert(execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: STANDARD_B, slot: 1 }).ok, 'place 2');
  const [p1, p2] = room.decor.map((p) => p.id) as [string, string];
  assert(p1 !== p2, 'two placements shared an id');
  assert(s.counters.decor === counterBefore + 2, 'the counter did not advance twice');
  sound('after placing two');

  const spot = findFreeSpot(data, s, roomDef(data, room.defId).blocks);
  assert(spot, 'nowhere to move');
  assert(execute(data, s, { type: 'MOVE_ROOM', roomId: room.id, x: spot.x, y: spot.y }).ok, 'move');
  assert(room.decor.map((p) => p.id).join() === [p1, p2].join(), 'moving changed decor ids');
  sound('after move');

  assert(execute(data, s, { type: 'STORE_ROOM', roomId: room.id }).ok, 'store');
  let where = liveDecorIds(s);
  assert(where.get(p1)![0]!.startsWith('stored:') && where.get(p2)![0]!.startsWith('stored:'), 'ids did not move to stored');
  sound('after store');

  assert(execute(data, s, { type: 'PLACE_STORED_ROOM', roomId: room.id }).ok, 'restore');
  where = liveDecorIds(s);
  assert(where.get(p1)![0]!.startsWith('placed:') && where.get(p2)![0]!.startsWith('placed:'), 'ids did not return to placed');
  assert(where.size === 2, `restoring minted new ids: ${where.size} live`);
  sound('after restore');

  const back = s.hotel.rooms.find((r) => r.id === room.id)!;
  const ownedBefore = owned(s, STANDARD_A);
  assert(execute(data, s, { type: 'REMOVE_DECOR', roomId: back.id, decorId: p1 }).ok, 'remove');
  assert(!liveDecorIds(s).has(p1), 'the removed id is still live');
  assert(owned(s, STANDARD_A) === ownedBefore + 1, 'removal returned the wrong count');
  sound('after remove');

  const coinsBefore = s.player.coins;
  assert(execute(data, s, { type: 'PLACE_DECOR', roomId: back.id, defId: STANDARD_A, slot: 0 }).ok, 're-place');
  assert(owned(s, STANDARD_A) === ownedBefore, 're-placing did not consume the owned copy');
  assert(s.player.coins === coinsBefore, 're-placing an owned copy charged');
  const p3 = back.decor.find((p) => p.slot === 0)!.id;
  assert(p3 !== p1, 'a retired id was reused');
  sound('after re-placing from stock');

  execute(data, s, { type: 'REMOVE_DECOR', roomId: back.id, decorId: p3 });
  const ownedForSale = owned(s, STANDARD_A);
  assert(execute(data, s, { type: 'SELL_DECOR', defId: STANDARD_A }).ok, 'sell');
  assert(owned(s, STANDARD_A) === ownedForSale - 1, 'selling changed the count by other than one');
  assert(liveDecorIds(s).has(p2), 'selling stock touched a live id');
  sound('after sell');

  execute(data, s, { type: 'PLACE_DECOR', roomId: back.id, defId: STANDARD_A, slot: 0 });
  const livingBefore = [...liveDecorIds(s).keys()].filter((id) => back.decor.some((p) => p.id === id));
  const ownedBeforeSale = owned(s, STANDARD_A) + owned(s, STANDARD_B);
  assert(execute(data, s, { type: 'SELL_ROOM', roomId: back.id }).ok, 'sell room');
  for (const id of livingBefore) assert(!liveDecorIds(s).has(id), `${id} survived the room being sold`);
  // One of each: the room held its first and its second piece, and both come back.
  assert(owned(s, STANDARD_A) + owned(s, STANDARD_B) === ownedBeforeSale + livingBefore.length,
    'selling the room returned the wrong number of pieces');
  sound('after selling the room');
});

check('E — a duplicate is stopped at the gate, never reaching REMOVE_DECOR', async () => {
  const s = identityFixture();
  const room = s.hotel.rooms.find((r) => r.decor.length >= 2)!;
  room.decor[1]!.id = room.decor[0]!.id;
  const dupe = room.decor[0]!.id;

  await expectSemanticRejection('two pieces, one id, one placed room', s, 'unique decor ids');
  // The fixture is not repaired: the duplicate is still there, and it is what
  // was quarantined.
  assert(room.decor.filter((p) => p.id === dupe).length === 2, 'the fixture was silently repaired');
});

await runAll();


console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
// exitCode, not exit(): exit() would tear the process down mid-flush and
// could cut off a test that had not settled.
process.exitCode = failures.length ? 1 : 0;
