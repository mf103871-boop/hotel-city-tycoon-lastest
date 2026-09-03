/**
 * Incidents — the ghost, the weather, and the phone (4C).
 *
 * The original resolved these through a phone menu: the ghost took a
 * ghostbuster, the heat and the cold took a repair crew, and nothing here is
 * cleared by tapping. These checks pin the data rows, the one-ghost rule, the
 * half-pay weather, the phone's honesty, the away-window overlap, and the
 * room-incident cap that a kind-name typo had silently pinned to one.
 */
import { loadSimData } from '../balance-sim/load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { execute } from '../../src/core/commands/index.ts';
import { advance } from '../../src/core/sim/tick.ts';
import { resolveOffline } from '../../src/core/sim/offline.ts';
import {
  checkGhosts, checkClimate, climateMultiplier, maxSimultaneousIncidents,
} from '../../src/core/systems/events.ts';
import { incomeBlocked } from '../../src/core/systems/cleanliness.ts';
import { checkoutPayout } from '../../src/core/systems/guests.ts';
import { initSelectors, phoneView } from '../../src/bridge/selectors.ts';
import { Rng, createCursors } from '../../src/core/rng/index.ts';
import { migrate } from '../../src/save/index.ts';
import { SCHEMA_VERSION } from '../../src/core/state/types.ts';
import type { GameState, SimEvent } from '../../src/core/state/types.ts';
import { isGuestRoom } from '../../src/core/data-source.ts';
import { testGuest } from './guest-factory.ts';
import fs from 'node:fs';

const data = loadSimData();
initSelectors(data);
const TPS = data.economy.simulation.ticksPerSecond;

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }

function fresh(level = 20): GameState {
  const s = createInitialState(data, { seed: 11, epochMs: 1_710_000_000_000 });
  s.player.coins = 5_000_000;
  s.player.level = level;
  return s;
}
function withRooms(level = 20, rooms = 5): GameState {
  const s = fresh(level);
  for (let i = 0; i < rooms; i++) execute(data, s, { type: 'BUILD_ROOM', defId: 'economy' });
  return s;
}
function haunt(s: GameState): { rng: Rng; out: SimEvent[] } {
  const rng = new Rng(7, createCursors());
  const out: SimEvent[] = [];
  for (let i = 0; i < 500 && !s.hotel.rooms.some((r) => r.hasGhost); i++) {
    s.tick += 1;
    checkGhosts(data, s, 24 * 3600, rng, out);
  }
  assert(s.hotel.rooms.some((r) => r.hasGhost), 'no ghost appeared in five hundred rolls');
  return { rng, out };
}

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — incidents (ghost, weather, the phone)');
console.log(line);

check('the three original incidents are declared with their fixes', () => {
  const ghost = data.events.find((e) => e.id === 'ghost')!;
  assert(ghost, 'the ghost is not in the data');
  eq(ghost.scope, 'room', 'the ghost is not room-scope');
  eq(ghost.blocksIncome, true, 'a haunting does not block income');
  assert((ghost.clearCost?.amount ?? 0) > 0, 'the ghostbuster works for free');
  for (const id of ['heatWave', 'coldSnap']) {
    const def = data.events.find((e) => e.id === id)!;
    assert(def, `${id} is not in the data`);
    eq(def.scope, 'hotel', `${id} is not hotel-scope`);
    assert((def.incomeMultiplier ?? 1) < 1, `${id} does not discount what guests pay`);
    assert((def.durationSec ?? 0) > 0, `${id} never passes on its own`);
    assert((def.clearCost?.amount ?? 0) > 0, `${id}'s repair crew works for free`);
  }
});

check('the room-incident cap counts its hazards again', () => {
  // The filter used to test for trigger kinds no event ever used, so the cap
  // silently sat at one for the whole game. Three room hazards, plus one.
  eq(maxSimultaneousIncidents(data), 4, 'the cap does not reflect pest + fire + ghost, plus one');
});

check('a ghost haunts one room at a time and blocks it', () => {
  const s = withRooms();
  const { rng } = haunt(s);
  const haunted = s.hotel.rooms.filter((r) => r.hasGhost);
  eq(haunted.length, 1, 'more than one haunting at once');
  assert(incomeBlocked(data, haunted[0]!), 'a haunted room still earns');
  // Even past the cooldown, a second ghost never joins the first.
  s.tick += (data.events.find((e) => e.id === 'ghost')!.cooldownSec + 10) * TPS;
  const out: SimEvent[] = [];
  for (let i = 0; i < 200; i++) checkGhosts(data, s, 24 * 3600, rng, out);
  eq(s.hotel.rooms.filter((r) => r.hasGhost).length, 1, 'a second ghost appeared beside the first');
});

check('tapping cannot clear a ghost — only the phone can', () => {
  const s = withRooms();
  haunt(s);
  const room = s.hotel.rooms.find((r) => r.hasGhost)!;
  const tap = execute(data, s, { type: 'CLEAR_HAZARD', roomId: room.id, hazard: 'fire' });
  assert(!tap.ok, 'a fire-clear tap resolved a haunting');
  const before = s.player.coins;
  const xpBefore = s.player.xp;
  const res = execute(data, s, { type: 'CALL_SERVICE', service: 'ghostbuster' });
  assert(res.ok, 'the ghostbuster refused the call');
  const fee = data.events.find((e) => e.id === 'ghost')!.clearCost!.amount;
  eq(before - s.player.coins, fee, 'the ghostbuster charged the wrong fee');
  assert(!s.hotel.rooms.some((r) => r.hasGhost), 'the ghost survived the ghostbuster');
  eq(s.stats.ghostsCleared, 1, 'the tally did not count the bust');
  assert(s.player.xp > xpBefore, 'clearing the ghost granted no XP');
  assert(res.events.some((e) => e.type === 'serviceCalled' && e.service === 'ghostbuster' && e.cleared === 1),
    'the call was not reported');
});

// AUDIT 2026-09-03 (D7, reference §4G-1): selling a haunted room paid a third
// of its price and removed the ghost for nothing; storing it and placing it
// back returned it with `hasGhost: false`. Both skipped the ghostbuster's fee.
check('selling or storing a haunted room is refused — the ghost cannot be laundered away', () => {
  const s = withRooms();
  haunt(s);
  const room = s.hotel.rooms.find((r) => r.hasGhost)!;
  const coins = s.player.coins;
  const sell = execute(data, s, { type: 'SELL_ROOM', roomId: room.id });
  assert(!sell.ok && sell.reason === 'roomHasHazard', `selling a haunted room was ${sell.ok ? 'allowed' : sell.reason}`);
  const store = execute(data, s, { type: 'STORE_ROOM', roomId: room.id });
  assert(!store.ok && store.reason === 'roomHasHazard', `storing a haunted room was ${store.ok ? 'allowed' : store.reason}`);
  eq(s.player.coins, coins, 'a refused sale still paid out');
  assert(s.hotel.rooms.some((r) => r.id === room.id && r.hasGhost), 'the ghost left without the ghostbuster');
});

check('the ghostbuster with nothing to bust is refused', () => {
  const s = withRooms();
  const res = execute(data, s, { type: 'CALL_SERVICE', service: 'ghostbuster' });
  assert(!res.ok && res.reason === 'nothingToFix', 'a pointless call was billed');
});

check('weather starts, halves what guests pay, and the repair call ends it', () => {
  const s = withRooms(20);
  execute(data, s, { type: 'BUILD_ROOM', defId: 'double' });
  const doubleRoom = s.hotel.rooms[s.hotel.rooms.length - 1]!;
  const sleeper = testGuest({ id: 'g1', typeId: 'standard', state: 'staying', roomId: doubleRoom.id,
    stateSinceTick: 0, finishesAtTick: 0, desire: null, patienceUntilTick: 0, everCheckedIn: true });

  const calm = checkoutPayout(data, s, sleeper, doubleRoom).coins;
  const rng = new Rng(9, createCursors());
  const out: SimEvent[] = [];
  for (let i = 0; i < 500 && !s.climate; i++) {
    s.tick += 1;
    checkClimate(data, s, 24 * 3600, rng, out, true);
  }
  assert(s.climate, 'no weather in five hundred rolls');
  assert(out.some((e) => e.type === 'climateStarted'), 'the wave was not announced');
  eq(climateMultiplier(data, s), 0.5, 'the weather multiplier is not the declared half');
  const stormy = checkoutPayout(data, s, sleeper, doubleRoom).coins;
  assert(stormy < calm, `a guest paid ${stormy} in the weather against ${calm} in the calm`);

  const before = s.player.coins;
  const active = data.events.find((e) => e.id === s.climate!.eventId)!;
  const res = execute(data, s, { type: 'CALL_SERVICE', service: 'repair' });
  assert(res.ok, 'the repair crew refused the call');
  eq(before - s.player.coins, active.clearCost!.amount, 'the repair crew charged the wrong fee');
  eq(s.climate, null, 'the weather survived the repair');
  assert(res.events.some((e) => e.type === 'climateEnded' && e.repaired === true), 'the repair was not reported');
});

check('the repair crew under clear skies is refused', () => {
  const s = withRooms();
  const res = execute(data, s, { type: 'CALL_SERVICE', service: 'repair' });
  assert(!res.ok && res.reason === 'nothingToFix', 'a pointless repair was billed');
});

check('the weather passes on its own clock, even while closed', () => {
  const s = withRooms();
  s.climate = { eventId: 'heatWave', untilTick: s.tick + 10 };
  s.tick += 20;
  const out: SimEvent[] = [];
  checkClimate(data, s, 1, new Rng(3, createCursors()), out, false);
  eq(s.climate, null, 'expired weather is still hanging around');
  assert(out.some((e) => e.type === 'climateEnded' && e.repaired === false), 'the passing was not announced');
});

check('away weather costs its overlap and not a coin more', () => {
  const build = () => {
    const s = withRooms(20, 8);
    execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_24h' });
    advance(data, s, 1800 * TPS); // settle guests in
    return s;
  };
  const calm = build();
  const full = build();
  const half = build();
  const away = 8 * 3600 * 1000;
  full.climate = { eventId: 'coldSnap', untilTick: full.tick + 8 * 3600 * TPS };
  half.climate = { eventId: 'coldSnap', untilTick: half.tick + 4 * 3600 * TPS };

  const a = resolveOffline(data, calm, away).coins;
  const b = resolveOffline(data, full, away).coins;
  const c = resolveOffline(data, half, away).coins;
  assert(a > 0, 'the calm hotel earned nothing — the probe is broken');
  const rFull = b / a;
  const rHalf = c / a;
  assert(rFull > 0.44 && rFull < 0.56, `full-window weather paid ${rFull.toFixed(2)} of calm, not ~0.50`);
  assert(rHalf > 0.69 && rHalf < 0.81, `half-window weather paid ${rHalf.toFixed(2)} of calm, not ~0.75`);
  eq(full.climate, null, 'weather outlived an away window that covered it');
  console.log(`      calm ${a} · full-storm ${b} (${rFull.toFixed(2)}) · half-storm ${c} (${rHalf.toFixed(2)})`);
});

check('a haunted room earns nothing while away', () => {
  // The away model excludes a haunted room from capacity outright. That only
  // shows in the total when beds are the binding constraint, so the probe
  // counts the guest rooms it actually has (the starter hotel ships with
  // some) and expects exactly their share to vanish — and with every bed
  // haunted, the whole room income with them.
  const guestRoomCount = (s: GameState) =>
    s.hotel.rooms.filter((r) => { const d = data.rooms.find((x) => x.id === r.defId); return d && isGuestRoom(d); }).length;
  const clean = withRooms(20, 2);
  const cursed = withRooms(20, 2);
  const doomed = withRooms(20, 2);
  const n = guestRoomCount(clean);
  assert(n >= 2, 'the probe needs at least two beds');
  const firstGuestRoom = cursed.hotel.rooms.find((r) => { const d = data.rooms.find((x) => x.id === r.defId); return d && isGuestRoom(d); })!;
  firstGuestRoom.hasGhost = true;
  for (const r of doomed.hotel.rooms) {
    const d = data.rooms.find((x) => x.id === r.defId);
    if (d && isGuestRoom(d)) r.hasGhost = true;
  }
  for (const s of [clean, cursed, doomed]) execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_24h' });
  const a = resolveOffline(data, clean, 6 * 3600 * 1000);
  const b = resolveOffline(data, cursed, 6 * 3600 * 1000);
  const c = resolveOffline(data, doomed, 6 * 3600 * 1000);
  assert(a.coins > 0, 'the clear hotel earned nothing — the probe is broken');
  const ratio = b.coins / a.coins;
  const expected = (n - 1) / n;
  assert(Math.abs(ratio - expected) < 0.08,
    `one haunted bed of ${n} left ${ratio.toFixed(2)} of the coins, not ~${expected.toFixed(2)}`);
  assert(c.coins <= Math.max(2, a.coins * 0.02),
    `with every bed haunted the hotel still earned ${c.coins} of ${a.coins}`);
  assert(b.events.some((e) => e.type === 'incomeBlocked' && e.reason === 'ghost'),
    'the haunting was not named as the reason');
  console.log(`      clear ${a.coins} · one of ${n} haunted ${b.coins} (${ratio.toFixed(2)}) · all haunted ${c.coins}`);
});

check('the phone view tells the truth', () => {
  const s = withRooms();
  let view = phoneView(s);
  eq(view.haunted, 0, 'a quiet hotel reports hauntings');
  eq(view.climate, null, 'a quiet hotel reports weather');
  haunt(s);
  s.climate = { eventId: 'heatWave', untilTick: s.tick + 3600 * TPS };
  view = phoneView(s);
  eq(view.haunted, 1, 'the haunting is not on the phone');
  eq(view.ghostFee, data.events.find((e) => e.id === 'ghost')!.clearCost!.amount, 'wrong ghostbuster fee');
  assert(view.climate !== null && view.climate.eventId === 'heatWave', 'the weather is not on the phone');
  assert(view.climate!.msLeft > 0 && view.climate!.msLeft <= 3_600_000, 'the countdown is wrong');
});

check('weather needs an open hotel and its unlock level; the ghost needs its own', () => {
  const low = withRooms(5);
  const rng = new Rng(4, createCursors());
  const out: SimEvent[] = [];
  for (let i = 0; i < 300; i++) { low.tick += 1; checkClimate(data, low, 24 * 3600, rng, out, true); }
  eq(low.climate, null, 'weather struck below its unlock level');
  for (let i = 0; i < 300; i++) { low.tick += 1; checkGhosts(data, low, 24 * 3600, rng, out); }
  assert(!low.hotel.rooms.some((r) => r.hasGhost), 'a ghost appeared below its unlock level');

  const closed = withRooms(20);
  for (let i = 0; i < 300; i++) { closed.tick += 1; checkClimate(data, closed, 24 * 3600, rng, out, false); }
  eq(closed.climate, null, 'weather struck a closed hotel');
});

check('migration v17 arms every room and calms the sky', () => {
  const migrated = migrate({
    seed: 1,
    player: { coins: 3 },
    hotel: { rooms: [{ id: 'r1', defId: 'economy' }] },
    stats: { guestsServed: 9 },
  }, 1, SCHEMA_VERSION);
  const rooms = (migrated['hotel'] as { rooms: Array<Record<string, unknown>> }).rooms;
  eq(rooms[0]!['hasGhost'], false, 'an old room did not learn it can be haunted');
  eq(migrated['climate'], null, 'an old save arrived mid-storm');
  eq((migrated['stats'] as Record<string, unknown>)['ghostsCleared'], 0, 'the ghost tally did not start at zero');
  eq((migrated['stats'] as Record<string, unknown>)['guestsServed'], 9, 'the chain lost existing stats');
});

check('every new string exists in both locales', () => {
  const en = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>;
  const ar = JSON.parse(fs.readFileSync('src/i18n/locales/ar.json', 'utf8')) as Record<string, string>;
  const keys = [
    'event.ghost.name', 'event.heatWave.name', 'event.coldSnap.name',
    'notice.ghost', 'notice.heatWave', 'notice.coldSnap', 'notice.climateEnded', 'notice.serviceDone',
    'ui.phone', 'ui.ghostbuster', 'ui.repairCrew', 'ui.allQuiet', 'ui.minutesShort', 'ui.ghostHint',
  ];
  for (const k of keys) {
    assert(typeof en[k] === 'string' && en[k]!.length > 0, `en is missing ${k}`);
    assert(typeof ar[k] === 'string' && ar[k]!.length > 0, `ar is missing ${k}`);
  }
});

console.log(line);
if (failures.length > 0) {
  console.log(`  ${passed} passed, ${failures.length} FAILED`);
  for (const f of failures) console.log(`    ✗ ${f}`);
  console.log(line);
  process.exit(1);
}
console.log(`  ${passed} checks passed`);
console.log(line);
