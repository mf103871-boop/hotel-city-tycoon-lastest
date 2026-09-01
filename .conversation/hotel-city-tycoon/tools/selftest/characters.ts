import { testGuest } from './guest-factory.ts';
/**
 * Headless tests for character positioning and the drag-to-reception rescue.
 *
 * Positions are derived rather than stored, which is what makes them testable
 * here at all: the same tick must always produce the same frame, and a guest
 * must never be drawn somewhere the simulation does not think they are.
 *
 * Run: node --experimental-strip-types tools/selftest/characters.ts
 */
import { loadSimData } from '../balance-sim/load-data.ts';
import { isCommercialRoom } from '../../src/core/data-source.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { advance } from '../../src/core/sim/tick.ts';
import { execute } from '../../src/core/commands/index.ts';
import type { GameState } from '../../src/core/state/types.ts';

const data = loadSimData();
const { initSelectors } = await import('../../src/bridge/selectors.ts');
initSelectors(data);
const { characterViews, guestPosition, guestNear, unmetDesires } =
  await import('../../src/bridge/characters.ts');

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }

const TPS = data.economy.simulation.ticksPerSecond;
const fresh = (seed = 8080): GameState => createInitialState(data, { seed, epochMs: 0 });

/**
 * A hotel that is open for business.
 *
 * Dragging somebody to reception now requires the hotel to be open — it was a
 * way to check guests in past the end of a paid shift. These fixtures used a
 * closed hotel because it did not used to matter.
 */
function opened(seed = 8080): GameState {
  const s = fresh(seed);
  s.player.coins += 100_000;
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  return s;
}

/** Move past the drag cooldown, which the data has declared since P1. */
function pastDragCooldown(s: GameState): void {
  s.tick += Math.round(data.economy.guests.dragToLobbyCooldownSec * TPS) + 1;
}

/** A hotel that has been open long enough to have people in it. */
function busy(seed = 8080, seconds = 400): GameState {
  const s = fresh(seed);
  s.player.coins = 5_000_000;
  for (let i = 0; i < 5; i++) execute(data, s, { type: 'BUILD_ROOM', defId: 'economy' });
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  advance(data, s, seconds * TPS);
  return s;
}

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — characters self-test');
console.log(line);

await (async () => {

await check('a new hotel shows its staff and nobody else', () => {
  const s = fresh();
  const views = characterViews(s);
  eq(views.length, s.staff.filter((x) => x.roomId).length, 'wrong number of people on screen');
  assert(views.every((v) => v.kind === 'staff'), 'a guest appeared before the hotel opened');
});

await check('an open hotel fills with guests', () => {
  const s = busy();
  const guests = characterViews(s).filter((v) => v.kind === 'guest');
  assert(guests.length > 0, 'nobody arrived in an open hotel');
  console.log(`      ${guests.length} guests and ${characterViews(s).length - guests.length} staff on screen`);
});

await check('every view has a finite position', () => {
  for (const view of characterViews(busy())) {
    assert(Number.isFinite(view.x) && Number.isFinite(view.y),
      `"${view.id}" is at (${view.x}, ${view.y})`);
    assert(view.opacity >= 0 && view.opacity <= 1, `"${view.id}" has opacity ${view.opacity}`);
  }
});

await check('positions are deterministic for a given tick', () => {
  const a = characterViews(busy(4242));
  const b = characterViews(busy(4242));
  eq(JSON.stringify(a), JSON.stringify(b), 'the same state produced two different frames');
});

await check('a guest inside a room is drawn inside that room', () => {
  const s = busy();
  const staying = s.guests.filter((g) => g.state === 'staying');
  assert(staying.length > 0, 'nobody checked in');
  for (const guest of staying) {
    const room = s.hotel.rooms.find((r) => r.id === guest.roomId)!;
    const pos = guestPosition(s, guest);
    const def = data.rooms.find((r) => r.id === room.defId)!;
    assert(pos.x >= room.x && pos.x <= room.x + def.blocks.w,
      `guest drawn at x=${pos.x} but their room spans ${room.x}..${room.x + def.blocks.w}`);
    eq(pos.y, room.y, 'guest drawn on the wrong floor');
    eq(pos.activity, 'resting', 'a guest in bed is not resting');
  }
});

await check('two guests in one room do not stand on each other', () => {
  const s = busy();
  const shared = s.hotel.rooms.find((r) => r.occupants.length > 1);
  if (!shared) { console.log('      (no shared room this run — skipped)'); return; }
  const xs = shared.occupants.map((id) => {
    const g = s.guests.find((x) => x.id === id)!;
    return guestPosition(s, g).x;
  });
  eq(new Set(xs).size, xs.length, 'two guests were placed at the same coordinate');
});

await check('an arriving guest walks in from off-plot', () => {
  const s = busy();
  const arriving = s.guests.find((g) => g.state === 'arriving');
  if (!arriving) { console.log('      (nobody arriving this tick — skipped)'); return; }
  const pos = guestPosition(s, arriving);
  eq(pos.facing, 'left', 'a guest walking toward the lobby faces the wrong way');
  eq(pos.activity, 'walking', 'an arriving guest is not walking');
});

await check('a leaving guest walks out and fades', () => {
  const s = fresh();
  const guest = { ...s.guests[0] } as never;
  s.guests.push(testGuest({ id: 'gx', typeId: 'standard', state: 'leaving', roomId: null,
    stateSinceTick: s.tick, finishesAtTick: 0, desire: null, patienceUntilTick: 0, everCheckedIn: false }));
  void guest;
  const start = guestPosition(s, s.guests[s.guests.length - 1]!);
  s.tick += Math.round(data.economy.guests.walkAwaySec * TPS * 0.75);
  const later = guestPosition(s, s.guests[s.guests.length - 1]!);
  assert(later.x < start.x, 'a leaving guest did not move away');
  assert(later.opacity < start.opacity, 'a leaving guest did not fade');
});

// ---------------------------------------------------------------- rescue
await check('a leaving guest survives long enough to be grabbed', () => {
  // They used to be culled after one second, which made the signature
  // drag-back interaction physically impossible.
  const s = fresh();
  s.guests.push(testGuest({ id: 'gy', typeId: 'standard', state: 'leaving', roomId: null,
    stateSinceTick: s.tick, finishesAtTick: 0, desire: null, patienceUntilTick: 0, everCheckedIn: false }));
  advance(data, s, 3 * TPS);
  assert(s.guests.some((g) => g.id === 'gy'), 'the guest vanished within three seconds');
  advance(data, s, data.economy.guests.walkAwaySec * TPS);
  assert(!s.guests.some((g) => g.id === 'gy'), 'the guest never left');
});

await check('dragging a leaving guest puts them back in the queue', () => {
  const s = opened();
  s.guests.push(testGuest({ id: 'gz', typeId: 'standard', state: 'leaving', roomId: null,
    stateSinceTick: s.tick, finishesAtTick: 0, desire: null, patienceUntilTick: 0, everCheckedIn: false }));
  const result = execute(data, s, { type: 'DRAG_GUEST', guestId: 'gz' });
  assert(result.ok, `drag failed: ${result.ok === false ? result.reason : ''}`);
  const guest = s.guests.find((g) => g.id === 'gz')!;
  eq(guest.state, 'queued', 'the guest was not queued');
  assert(s.lobbyQueue.includes('gz'), 'the guest is not in the lobby queue');
  assert(guest.patienceUntilTick > s.tick, 'their patience was not reset');
});

await check('a guest already resting cannot be dragged', () => {
  const s = busy();
  const staying = s.guests.find((g) => g.state === 'staying');
  if (!staying) { console.log('      (nobody staying — skipped)'); return; }
  const result = execute(data, s, { type: 'DRAG_GUEST', guestId: staying.id });
  assert(!result.ok && result.reason === 'guestNotDraggable', 'a sleeping guest was dragged out of bed');
});

await check('an unknown guest is refused, not crashed on', () => {
  const result = execute(data, opened(), { type: 'DRAG_GUEST', guestId: 'nobody' });
  assert(!result.ok && result.reason === 'unknownGuest', 'dragging a phantom succeeded');
});

await check('a full lobby refuses more rescues', () => {
  const s = opened();
  const max = data.economy.guests.maxLobbyQueue;
  for (let i = 0; i < max + 1; i++) {
    s.guests.push(testGuest({ id: `q${i}`, typeId: 'standard', state: 'leaving', roomId: null,
      stateSinceTick: s.tick, finishesAtTick: 0, desire: null, patienceUntilTick: 0, everCheckedIn: false }));
  }
  let accepted = 0;
  for (let i = 0; i < max + 1; i++) {
    pastDragCooldown(s);
    if (execute(data, s, { type: 'DRAG_GUEST', guestId: `q${i}` }).ok) accepted++;
  }
  eq(accepted, max, `the lobby took ${accepted} guests but holds ${max}`);
});

await check('the draggable flag matches what the command allows', () => {
  // The renderer must never show a grab handle the simulation will refuse.
  const s = busy();
  for (const view of characterViews(s)) {
    if (view.kind !== 'guest') continue;
    const probe = JSON.parse(JSON.stringify(s)) as GameState;
    const result = execute(data, probe, { type: 'DRAG_GUEST', guestId: view.id });
    eq(result.ok, view.draggable,
      `"${view.id}" draggable=${view.draggable} but the command ${result.ok ? 'accepted' : 'refused'} it`);
  }
});

await check('guestNear finds a rescuable guest and ignores the rest', () => {
  const s = opened();
  s.guests.push(testGuest({ id: 'gn', typeId: 'standard', state: 'leaving', roomId: null,
    stateSinceTick: s.tick, finishesAtTick: 0, desire: null, patienceUntilTick: 0, everCheckedIn: false }));
  const view = characterViews(s).find((v) => v.id === 'gn')!;
  eq(guestNear(s, view.x, view.y)?.id, 'gn', 'a guest under the finger was not found');
  eq(guestNear(s, view.x + 40, view.y), null, 'a guest far away was matched');
});

// ---------------------------------------------------------------- desires
await check('a desire the hotel cannot satisfy is reported', () => {
  const s = fresh();
  s.guests.push(testGuest({ id: 'gd', typeId: 'standard', state: 'arriving', roomId: null,
    stateSinceTick: s.tick, finishesAtTick: 0, desire: 'wellness', patienceUntilTick: s.tick + 600, everCheckedIn: false }));
  eq(unmetDesires(s)['wellness'], 1, 'an unmet desire was not counted');
});

await check('a desire the hotel already meets is not reported', () => {
  const s = fresh();
  s.player.coins = 5_000_000;
  s.player.level = 30;
  // 3B: the spa became the Disco (nightlife) and wellness left the game, so
  // the check now runs on whatever tag the disco actually answers.
  assert(execute(data, s, { type: 'BUILD_ROOM', defId: 'spa' }).ok, 'could not build the disco');
  const disco = data.rooms.find((r) => r.id === 'spa')!;
  if (!isCommercialRoom(disco)) throw new Error('the disco is not a commercial room');
  const tag = disco.desireTag;
  s.guests.push(testGuest({ id: 'gd2', typeId: 'standard', state: 'arriving', roomId: null,
    stateSinceTick: s.tick, finishesAtTick: 0, desire: tag, patienceUntilTick: s.tick + 600, everCheckedIn: false }));
  eq(unmetDesires(s)[tag], undefined, 'a satisfied desire was still flagged');
});

await check('a resting guest stops advertising what they wanted', () => {
  const s = busy();
  for (const view of characterViews(s)) {
    if (view.activity === 'resting') {
      eq(view.desire, null, 'a guest already in bed still shows a want icon');
    }
  }
});

await check('every character asks for an asset the manifest provides', async () => {
  const fs = await import('node:fs');
  const manifest = JSON.parse(fs.readFileSync('public/assets/manifest.json', 'utf8'));
  const keys = new Set(manifest.entries.map((e: { key: string }) => e.key));
  for (const view of characterViews(busy())) {
    assert(keys.has(view.assetKey), `"${view.assetKey}" has no art`);
  }
});

})();

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
