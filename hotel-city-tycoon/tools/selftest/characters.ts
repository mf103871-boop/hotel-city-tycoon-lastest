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
import type { GameState, GuestInstance } from '../../src/core/state/types.ts';

import { toBlock, waypoint } from '../../src/core/systems/roomWaypoints.ts';
import { cleaningOrder } from '../../src/core/systems/cleaning.ts';
import { buildStressState } from '../../src/bridge/stress.ts';
import { measure, describe } from './measure.ts';

const data = loadSimData();
const { initSelectors } = await import('../../src/bridge/selectors.ts');
initSelectors(data);
const { characterViews, guestPosition, guestPose, guestNear, unmetDesires, cleanerTarget } =
  await import('../../src/bridge/characters.ts');
const { PAVEMENT_Y, EXIT_BEYOND } = await import('../../src/bridge/paths.ts');
const { reactionsFor } = await import('../../src/bridge/reactions.ts');

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

await check('a guest inside a room is drawn inside that room, in bed, feet on the floor', () => {
  const s = busy();
  const staying = s.guests.filter((g) => g.state === 'staying');
  assert(staying.length > 0, 'nobody checked in');
  let inBed = 0;
  for (const guest of staying) {
    const room = s.hotel.rooms.find((r) => r.id === guest.roomId)!;
    const pose = guestPose(s, guest);
    // On the way up from the desk they are somewhere between; once there,
    // they are in the room, on its painted floor, in the bed or beside it.
    if (pose.activity === 'walking' || pose.activity === 'lift') continue;
    const def = data.rooms.find((r) => r.id === room.defId)!;
    assert(pose.x >= room.x && pose.x <= room.x + def.blocks.w,
      `guest drawn at x=${pose.x} but their room spans ${room.x}..${room.x + def.blocks.w}`);
    const bed = waypoint(room.defId, def.blocks.w, def.blocks.h, 'guestSleep0')!;
    eq(pose.y, toBlock(room, def.blocks.h, bed).y, 'guest drawn off the floor line');
    assert(pose.activity === 'resting' || pose.activity === 'waiting', `a guest in their room is ${pose.activity}`);
    if (pose.activity === 'resting') { eq(pose.clip, 'sleep', 'a guest in bed is not asleep'); inBed++; }
  }
  assert(inBed > 0, 'nobody is in bed after 400 seconds');
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

// ---------------------------------------------------------------- motion (HC-P2-S1)
await check('every clip the bridge asks for is one the character\'s sheet carries', () => {
  for (const s of [busy(), busy(99), opened()]) {
    for (const view of characterViews(s)) {
      const anim = data.animations.find((a) => a.id === view.assetKey.replace(/\.[a-z]+$/, ''));
      assert(anim, `no animation file for ${view.assetKey}`);
      assert(anim.clips[view.clip], `${view.id} asks for "${view.clip}", which ${anim.id} does not carry`);
    }
  }
});

await check('a walk is continuous: one tick moves a person no further than their speed allows', () => {
  const s = busy();
  let walkers = 0;
  for (const guest of s.guests) {
    const before = guestPose(s, guest);
    const later = JSON.parse(JSON.stringify(s)) as GameState;
    later.tick += 1;
    const after = guestPose(later, guest);
    if (before.segment !== after.segment || before.activity === 'lift') continue;
    const moved = Math.hypot(after.x - before.x, after.y - before.y);
    const allowed = Math.hypot(before.vx, before.vy) / TPS + 1e-6;
    assert(moved <= allowed, `${guest.id} jumped ${moved.toFixed(3)} blocks in one tick (speed allows ${allowed.toFixed(3)})`);
    if (moved > 0) walkers++;
  }
  console.log(`      ${walkers} guests in motion, none of them jumping`);
});

await check('feet are on the pavement, not in the road, while waiting outside', () => {
  const s = fresh();
  s.guests.push(testGuest({ id: 'gp', state: 'arriving', stateSinceTick: s.tick - 10_000 }));
  const pose = guestPose(s, s.guests[s.guests.length - 1]!);
  eq(pose.y, PAVEMENT_Y, 'a guest waiting outside stands off the pavement');
  eq(pose.activity, 'waiting', 'a guest who has arrived is still walking');
});

await check('a guest checking in reaches the desk before reception is done with them', () => {
  const s = opened();
  const ticks = Math.round(data.economy.guests.checkInSec * TPS);
  s.guests.push(testGuest({ id: 'gc', state: 'checkingIn', stateSinceTick: s.tick, finishesAtTick: s.tick + ticks, waitedTicks: 0 }));
  const guest = s.guests[s.guests.length - 1]!;
  const start = guestPose(s, guest);
  eq(start.activity, 'walking', 'the walk to the desk never starts');
  s.tick += ticks - 1;
  const end = guestPose(s, guest);
  eq(end.activity, 'waiting', 'still walking when reception finished');
  const lobby = s.hotel.rooms.find((r) => r.defId === 'lobby')!;
  const desk = toBlock(lobby, 1, waypoint('lobby', 2, 1, 'deskFront')!);
  assert(Math.abs(end.x - desk.x) < 1e-6 && Math.abs(end.y - desk.y) < 1e-6, `stopped at (${end.x}, ${end.y}), not the desk (${desk.x}, ${desk.y})`);
  eq(end.facing, 'right', 'not facing the receptionist');
});

await check('the tappable flag matches what TAP_GUEST allows', () => {
  const s = busy();
  let tappable = 0;
  for (const view of characterViews(s)) {
    if (view.kind !== 'guest') continue;
    const probe = JSON.parse(JSON.stringify(s)) as GameState;
    const result = execute(data, probe, { type: 'TAP_GUEST', guestId: view.id });
    eq(result.ok, view.tappable,
      `"${view.id}" tappable=${view.tappable} but the command ${result.ok ? 'accepted' : 'refused'} it`);
    if (view.tappable) tappable++;
  }
  assert(tappable > 0, 'nobody in a busy hotel can be tapped');
});

await check('the receptionist works exactly while somebody is checking in', () => {
  const s = opened();
  const desk = () => characterViews(s).find((v) => v.kind === 'staff' && v.assetKey.startsWith('staff.receptionist'));
  assert(desk(), 'no receptionist on screen');
  eq(desk()!.clip, 'idle', 'the receptionist works at an empty desk');
  s.guests.push(testGuest({ id: 'gr', state: 'checkingIn', stateSinceTick: s.tick, finishesAtTick: s.tick + 60 }));
  eq(desk()!.clip, 'work', 'the receptionist ignores a guest at the desk');
  eq(desk()!.activity, 'working', 'working without the working activity');
});

await check('the cleaner goes to a room below the income gate, and stays put in a clean hotel', () => {
  const s = busy();
  const clean = cleanerTarget(s, 0);
  const later = JSON.parse(JSON.stringify(s)) as GameState;
  later.tick += 100;
  eq(cleanerTarget(later, 0)?.id, clean?.id, 'the cleaner changed rooms within one round');
  const gate = data.economy.cleanliness.incomeGateThreshold;
  const filthy = s.hotel.rooms.find((r) => data.rooms.find((d) => d.id === r.defId)!.category === 'guest')!;
  filthy.cleanliness = gate / 2;
  const target = cleanerTarget(s, 0);
  assert(target, 'nothing to clean with a filthy room in the hotel');
  eq(target.id, cleaningOrder(data, s)[0]!.id, 'the cleaner is not in the room the simulation cleans first');
  // And she is seen there, working, once she has walked over.
  for (let t = 0; t < 200; t += 10) {
    const probe = JSON.parse(JSON.stringify(s)) as GameState;
    probe.tick = Math.floor(s.tick / 200) * 200 + 100;
    const her = characterViews(probe).find((v) => v.assetKey.startsWith('staff.cleaner'));
    assert(her, 'no cleaner on screen');
    eq(her.clip, 'work', `at tick +100 into her round the cleaner is ${her.clip}, not working`);
    break;
  }
});

await check('every sleeper wakes on their own timetable, and the same one every time', () => {
  const s = busy();
  const staying = s.guests.filter((g) => g.state === 'staying');
  assert(staying.length >= 2, 'need two sleepers');
  const schedule = (guest: GuestInstance, state: GameState): string => {
    const out: string[] = [];
    for (let t = 0; t < 2400; t += 20) {
      const probe = JSON.parse(JSON.stringify(state)) as GameState;
      probe.tick = guest.stateSinceTick + 400 + t;
      out.push(guestPose(probe, guest).clip);
    }
    return out.join('');
  };
  const a = schedule(staying[0]!, s);
  const b = schedule(staying[1]!, s);
  assert(a !== b, 'two different guests wake and sleep in lockstep');
  eq(schedule(staying[0]!, s), a, 'the same guest had a different night the second time');
  assert(a.includes('sleep') && a.includes('idle'), 'a guest never wakes, or never sleeps');
});

await check('a leaving guest starts at the door and reaches the edge exactly when the simulation drops them', () => {
  const s = opened();
  s.guests.push(testGuest({ id: 'gl', state: 'leaving', stateSinceTick: s.tick, everCheckedIn: true, leaveReason: 'checkedOut', satisfaction: 90 }));
  const guest = s.guests[s.guests.length - 1]!;
  const lobby = s.hotel.rooms.find((r) => r.defId === 'lobby')!;
  const door = toBlock(lobby, 1, waypoint('lobby', 2, 1, 'door')!);
  const start = guestPose(s, guest);
  assert(Math.abs(start.x - door.x) < 1e-6, `left from x=${start.x}, not the door at ${door.x}`);
  eq(start.mood, 'happy', 'a well-satisfied guest does not leave happy');
  s.tick += Math.round(data.economy.guests.walkAwaySec * TPS);
  const end = guestPose(s, guest);
  // Leg lengths are whole ticks (`walk()` rounds up), so the last stride lands
  // within one tick of the moment the simulation drops them — which is what
  // "walks off exactly as they disappear" can mean on a ten-hertz clock.
  const stride = Math.hypot(end.vx, end.vy) / TPS;
  assert(Math.abs(end.x - (-EXIT_BEYOND)) <= stride + 1e-6,
    `at walkAwaySec the guest is at x=${end.x}, more than one stride (${stride.toFixed(3)}) from the edge`);
  eq(end.y, PAVEMENT_Y, 'walked off somewhere other than the pavement');
  s.tick += 1;
  assert(Math.abs(guestPose(s, guest).x - (-EXIT_BEYOND)) < 1e-6, 'the guest never reaches the edge at all');
});

await check('a guest turned away leaves angry; one who never got a room starts from the street', () => {
  const s = opened();
  s.guests.push(testGuest({ id: 'ga', state: 'leaving', stateSinceTick: s.tick, leaveReason: 'noRoom' }));
  const pose = guestPose(s, s.guests[s.guests.length - 1]!);
  eq(pose.mood, 'angry', 'turned away and not angry');
  eq(pose.y, PAVEMENT_Y, 'a guest who never came in leaves from inside');
});

await check('a reaction goes to the person it is about, and to nobody without the clip', () => {
  const s = busy();
  const guest = s.guests.find((g) => g.state === 'staying')!;
  const hits = reactionsFor(s, [{ type: 'guestCheckedIn', guestId: guest.id, roomId: guest.roomId! }]);
  // Until the sheets carry one-shots (M6) no reaction resolves; once they do,
  // the guest and the receptionist are the only two it may reach.
  for (const r of hits) assert(r.id === guest.id || s.staff.some((x) => x.id === r.id), `reaction reached "${r.id}"`);
  const anim = data.animations.find((a) => a.id === `guest.${guest.typeId}`)!;
  const expects = anim.reactions['guestCheckedIn'];
  eq(hits.some((r) => r.id === guest.id), !!expects && !!anim.clips[expects], 'the guest\'s own reaction did not follow the file');
});

await check('deriving every view of a full hotel is cheap', () => {
  const stress = buildStressState(data, { rooms: 60, seconds: 900, epochMs: 0 });
  const timing = measure(() => stress, (state) => { characterViews(state); }, 9);
  console.log(`      ${characterViews(stress).length} people: ${describe(timing)}`);
  assert(timing.median < 2, `characterViews takes ${timing.median.toFixed(1)}ms median for the stress hotel`);
});

})();

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
