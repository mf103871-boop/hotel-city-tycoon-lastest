/**
 * Headless tests for the panel selectors.
 *
 * These are the rules the build, decorate, staff and room panels obey. Putting
 * them in the bridge rather than in components is what makes them testable at
 * all — the previous release shipped a broken renderer because UI wiring was
 * the one layer nothing headless could reach.
 *
 * Run: node --experimental-strip-types tools/selftest/panels.ts
 */
import { loadSimData } from '../balance-sim/load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { execute } from '../../src/core/commands/index.ts';
import type { GameState } from '../../src/core/state/types.ts';

// The bridge binds its own data at module load, so the tests run against the
// same balance numbers the game ships with.
const data = loadSimData();

const {
  initSelectors, buildCatalog, decorCatalog, freeSlots, roomDetail,
  staffOptionFor, urgentRooms, nextExpansion, shiftOptions, bestAffordableShift,
} = await import('../../src/bridge/selectors.ts');

initSelectors(data);
let passed = 0;
const failures: string[] = [];

async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }

const fresh = (): GameState => createInitialState(data, { seed: 31337, epochMs: 0 });
const rich = (): GameState => { const s = fresh(); s.player.coins = 50_000_000; s.player.level = 60; return s; };

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — panel selectors self-test');
console.log(line);

await (async () => {

// ---------------------------------------------------------------- build
await check('the build menu covers every live room exactly once', () => {
  // Parked rooms (unlockLevel past the cap, decision 11a) are switched off
  // and must be absent; everything else appears exactly once.
  const cap = data.levels[data.levels.length - 1]!.level;
  const live = data.rooms.filter((r) => r.unlockLevel <= cap);
  const options = Object.values(buildCatalog(fresh())).flat();
  eq(options.length, live.length, 'the menu lost, duplicated or resurrected a room');
  const ids = new Set(options.map((o) => o.defId));
  eq(ids.size, live.length, 'duplicate entries in the menu');
  for (const def of data.rooms) {
    if (def.unlockLevel > cap) assert(!ids.has(def.id), `parked room "${def.id}" is on the menu`);
  }
});

await check('a new player can build exactly what they should', () => {
  const groups = buildCatalog(fresh());
  const options = Object.values(groups).flat();
  const buildable = options.filter((o) => o.blocker === null);
  assert(buildable.some((o) => o.defId === 'economy'), 'cannot build an economy room at level 1');
  // 3B: the suites are gem-priced and available from level 1, as the original
  // sold its cash rooms — what stops a fresh player is gems, never level.
  const suite = options.find((o) => o.defId === 'presidential')!;
  assert(suite.blocker !== 'locked', 'the presidential suite is level-locked despite table A.1');
  assert(!buildable.some((o) => o.defId === 'family'), 'a level-1 player was offered the level-32 room');
  console.log(`      ${buildable.length} of ${options.length} listed rooms buildable at level 1`);
});

await check('every blocker names the real reason', () => {
  const s = fresh();
  const groups = buildCatalog(s);
  for (const option of Object.values(groups).flat()) {
    const def = data.rooms.find((r) => r.id === option.defId)!;
    if (def.unlockLevel > s.player.level) {
      eq(option.blocker, 'locked', `"${option.defId}" is above level but not reported as locked`);
    }
  }
  // A rich max-level player has no locked or unaffordable entries — rich in
  // BOTH currencies now that the five suites are gem-priced. Parked rooms
  // (L53) must not appear in the catalogue at all.
  const richState = rich();
  richState.player.gems = 10_000;
  const wealthy = Object.values(buildCatalog(richState)).flat();
  assert(!wealthy.some((o) => (data.rooms.find((r) => r.id === o.defId)!).unlockLevel > data.levels[data.levels.length - 1]!.level),
    'a parked room (L53) appears in the build catalogue');
  assert(!wealthy.some((o) => o.blocker === 'locked'), 'a max-level player still sees locked rooms');
  assert(!wealthy.some((o) => o.blocker === 'cannotAfford'), 'a rich player still sees unaffordable rooms');
});

await check('the lobby reports alreadyExists, not a vague refusal', () => {
  const option = Object.values(buildCatalog(rich())).flat().find((o) => o.defId === 'lobby');
  eq(option?.blocker, 'alreadyExists', 'a second lobby was not correctly blocked');
});

await check('a full plot reports noSpace', () => {
  const s = rich();
  s.player.level = 1;   // keep the plot at its starting size
  for (let i = 0; i < 40; i++) execute(data, s, { type: 'BUILD_ROOM', defId: 'economy' });
  const option = Object.values(buildCatalog(s)).flat().find((o) => o.defId === 'economy');
  eq(option?.blocker, 'noSpace', 'a full plot did not report noSpace');
});

await check('the menu blocker agrees with what the command actually does', () => {
  // The panel must never offer something the simulation will refuse, and never
  // grey out something it would accept.
  const s = rich();
  s.player.level = 8;
  for (const option of Object.values(buildCatalog(s)).flat()) {
    const before = JSON.stringify(s);
    const result = execute(data, s, { type: 'BUILD_ROOM', defId: option.defId });
    if (result.ok) {
      eq(option.blocker, null, `"${option.defId}" was greyed out but the command accepted it`);
      // roll back so the next probe sees the same state
      Object.assign(s, JSON.parse(before) as GameState);
    } else {
      assert(option.blocker !== null,
        `"${option.defId}" was offered but the command refused it (${result.reason})`);
    }
  }
});

// ---------------------------------------------------------------- decorate
await check('the decorate menu only offers items that fit a free slot', () => {
  const s = rich();
  const room = s.hotel.rooms.find((r) => r.defId === 'economy')!;
  const before = decorCatalog(s, room.id).filter((o) => o.blocker === null);
  assert(before.length > 0, 'nothing was offered for an empty room');

  const def = data.rooms.find((r) => r.id === 'economy')!;
  for (let i = 0; i < def.decorSlots; i++) {
    execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: 'wallpaper_plain', slot: i });
  }
  eq(freeSlots(s, room.id).length, 0, 'the room should be full');
  const after = decorCatalog(s, room.id).filter((o) => o.blocker === null);
  eq(after.length, 0, 'a full room still offered decor');
});

await check('meterShare tells the player how far one item gets them', () => {
  const s = rich();
  const room = s.hotel.rooms.find((r) => r.defId === 'economy')!;
  for (const option of decorCatalog(s, room.id)) {
    assert(option.meterShare >= 0 && option.meterShare <= 1,
      `"${option.defId}" reports a meter share of ${option.meterShare}`);
  }
  const best = decorCatalog(s, room.id).reduce((a, b) => (b.meterShare > a.meterShare ? b : a));
  assert(best.meterShare > 0.1, 'no single item makes a visible dent in the meter');
});

await check('placing decor moves the meter the amount the menu promised', () => {
  const s = rich();
  const room = s.hotel.rooms.find((r) => r.defId === 'economy')!;
  const option = decorCatalog(s, room.id).find((o) => o.blocker === null)!;
  const before = roomDetail(s, room.id)!.fill;
  execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: option.defId, slot: 0 });
  const after = roomDetail(s, room.id)!.fill;
  const moved = after - before;
  assert(Math.abs(moved - option.meterShare) < 0.02,
    `menu promised ${option.meterShare.toFixed(3)}, meter moved ${moved.toFixed(3)}`);
});

// ---------------------------------------------------------------- room sheet
await check('the room sheet reports an unknown room as null, not a crash', () => {
  eq(roomDetail(fresh(), 'no-such-room'), null, 'an unknown room id did not return null');
});

await check('the sheet reflects hazards and their cost', () => {
  const s = fresh();
  const room = s.hotel.rooms.find((r) => r.defId === 'economy')!;
  room.hasPest = true;
  const detail = roomDetail(s, room.id)!;
  eq(detail.hasPest, true, 'pest not reported');
  eq(detail.hazardCost, data.events.find((e) => e.id === 'pest')?.clearCost?.amount ?? 0, 'wrong clearing cost shown');
});

await check('the required lobby cannot be sold', () => {
  const s = fresh();
  const lobby = s.hotel.rooms.find((r) => r.defId === 'lobby')!;
  eq(roomDetail(s, lobby.id)!.canSell, false, 'the sheet offered to sell the lobby');
});

await check('an occupied room cannot be sold', () => {
  const s = fresh();
  const room = s.hotel.rooms.find((r) => r.defId === 'economy')!;
  eq(roomDetail(s, room.id)!.canSell, true, 'an empty room should be sellable');
  room.occupants.push('g1');
  eq(roomDetail(s, room.id)!.canSell, false, 'a room with a guest inside was sellable');
});

await check('the refund shown matches what selling actually pays', () => {
  const s = rich();
  execute(data, s, { type: 'BUILD_ROOM', defId: 'standard' });
  const room = s.hotel.rooms[s.hotel.rooms.length - 1]!;
  execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: 'wallpaper_plain', slot: 0 });
  const promised = roomDetail(s, room.id)!.sellRefund;
  const before = s.player.coins;
  assert(execute(data, s, { type: 'SELL_ROOM', roomId: room.id }).ok, 'selling failed');
  eq(s.player.coins - before, promised, 'the refund did not match what the sheet promised');
});

// ---------------------------------------------------------------- staff
await check('an unstaffed room offers exactly the role it needs', () => {
  // 4B: the cafe has no slot at all, so it must offer nobody; the gym still
  // has its slot and must offer exactly its trainer, hireable by a rich
  // max-level player.
  const s = rich();
  execute(data, s, { type: 'BUILD_ROOM', defId: 'cafe' });
  const cafe = s.hotel.rooms[s.hotel.rooms.length - 1]!;
  assert(!staffOptionFor(s, cafe.id), 'the staffless cafe still offers a hire (4B)');

  execute(data, s, { type: 'BUILD_ROOM', defId: 'gym' });
  const gym = s.hotel.rooms[s.hotel.rooms.length - 1]!;
  gym.staffId = null;
  const option = staffOptionFor(s, gym.id);
  eq(option?.roleId, 'trainer', 'the gym did not ask for its trainer');
  eq(option?.blocker, null, 'a rich max-level player could not hire');
});

await check('a staffed room offers nobody', () => {
  const s = fresh();
  const lobby = s.hotel.rooms.find((r) => r.defId === 'lobby')!;
  eq(staffOptionFor(s, lobby.id), null, 'a staffed room still offered a hire');
});

await check('a room needing no staff offers nobody', () => {
  const s = rich();
  execute(data, s, { type: 'BUILD_ROOM', defId: 'economy' });
  const room = s.hotel.rooms[s.hotel.rooms.length - 1]!;
  eq(staffOptionFor(s, room.id), null, 'a guest room asked for staff');
});

// ---------------------------------------------------------------- alerts
await check('urgent rooms surface fire before pest before dirt', () => {
  const s = fresh();
  const rooms = s.hotel.rooms.filter((r) => r.defId === 'economy');
  rooms[0]!.hasFire = true;
  rooms[0]!.hasPest = true;
  const issue = urgentRooms(s).find((u) => u.id === rooms[0]!.id);
  eq(issue?.issue, 'fire', 'a burning room was reported as merely infested');
});

await check('a healthy new hotel has nothing urgent', () => {
  eq(urgentRooms(fresh()).length, 0, 'a fresh hotel reported problems');
});

await check('an unstaffed commercial room is flagged', () => {
  const s = rich();
  execute(data, s, { type: 'BUILD_ROOM', defId: 'gym' });
  const room = s.hotel.rooms[s.hotel.rooms.length - 1]!;
  room.staffId = null;
  assert(urgentRooms(s).some((u) => u.id === room.id && u.issue === 'unstaffed'),
    'an unstaffed gym was not flagged');
});

// ---------------------------------------------------------------- shifts & plot
await check('the shift list matches what the player can pay', () => {
  const s = fresh();
  for (const option of shiftOptions(s)) {
    const def = data.shifts.find((x) => x.id === option.id)!;
    eq(option.unlocked, def.unlockLevel <= s.player.level, `"${option.id}" unlock state is wrong`);
    eq(option.affordable, s.player.coins >= option.cost, `"${option.id}" affordability is wrong`);
  }
  const best = bestAffordableShift(s);
  assert(best !== null, 'a new player cannot afford any shift');
});

await check('the next expansion is the smallest one bigger than the current plot', () => {
  const s = fresh();
  const next = nextExpansion(s)!;
  const current = data.plots.find((p) => p.id === s.hotel.plotId)!;
  assert(next.blocks > current.blocks, 'the next plot is not bigger');
  const smaller = data.plots.filter((p) => p.blocks > current.blocks && p.blocks < next.blocks);
  eq(smaller.length, 0, 'a smaller expansion was skipped');
});

await check('the last plot reports no further expansion', () => {
  const s = rich();
  const biggest = data.plots.reduce((a, b) => (b.blocks > a.blocks ? b : a));
  s.hotel.plotId = biggest.id;
  eq(nextExpansion(s), null, 'the final plot still offered an upgrade');
});

})();

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
