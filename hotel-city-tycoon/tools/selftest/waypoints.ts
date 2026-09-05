/**
 * The movement points, checked against the rooms they were written for.
 *
 * `src/core/systems/roomWaypoints.ts` says where every person in the game
 * stands, sits, sleeps and works. Half of it is derived from the slot plans
 * and half is measured by hand, and both halves describe pictures drawn in a
 * different language in a different directory — the same situation the slot
 * plans were in before `slots.ts`, and the same fix: `room-fixtures.json`
 * records what each room paints, and every point is compared to it here.
 *
 * Run: node --experimental-strip-types tools/selftest/waypoints.ts
 */
import {
  waypointsFor, waypoint, waypointsNamed, toBlock, measuredRooms, BODY_HALF_WIDTH_PX,
} from '../../src/core/systems/roomWaypoints.ts';
import type { Waypoint } from '../../src/core/systems/roomWaypoints.ts';
import { layoutFor, floorLineFor } from '../../src/core/systems/roomAnchors.ts';
import { ANCHOR_PX_X, ANCHOR_PX_Y, BLOCK_W, BLOCK_H } from '../../src/render/layout.ts';
import { loadSimData } from '../balance-sim/load-data.ts';
import fs from 'node:fs';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void {
  if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`);
}

interface Fixture { name: string; x0: number; y0: number; x1: number; y1: number; standing?: boolean }

const data = loadSimData();
const painted = JSON.parse(fs.readFileSync('tools/selftest/room-fixtures.json', 'utf8')) as { rooms: Record<string, Fixture[]> };
const points = (id: string) => {
  const room = data.rooms.find((r) => r.id === id)!;
  return waypointsFor(room.id, room.blocks.w, room.blocks.h);
};
/** Kinds of point where a body actually stands still on the floor. */
const OCCUPIES = (p: Waypoint): boolean => !p.name.startsWith('edge') && p.name !== 'door';

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — movement points against the rooms');
console.log(line);

check('every room has its ways in and out and somewhere to stand', () => {
  for (const room of data.rooms) {
    const ps = points(room.id);
    for (const name of ['edgeLeft', 'edgeRight', 'standLeft', 'standRight', 'clean']) {
      assert(ps.some((p) => p.name === name), `${room.id} has no ${name}`);
    }
  }
  // Reception: a desk to check in at and a queue in front of it.
  const lobby = points('lobby');
  assert(lobby.some((p) => p.name === 'deskFront'), 'the lobby has no deskFront');
  assert(lobby.filter((p) => p.name.startsWith('queue')).length >= 3, 'the lobby queues fewer than three inside');
});

check('every guest room has a bed for every guest, and a place to stand beside it', () => {
  for (const room of data.rooms) {
    if (room.category !== 'guest') continue;
    const beds = waypointsNamed(room.id, room.blocks.w, room.blocks.h, 'guestSleep');
    assert(beds.length >= room.beds, `${room.id} sleeps ${room.beds} but has ${beds.length} bed points`);
    for (let i = 0; i < beds.length; i++) {
      assert(waypoint(room.id, room.blocks.w, room.blocks.h, `standNearBed${i}`), `${room.id} has nowhere to stand beside bed ${i}`);
      eq(beds[i]!.pose, 'sleep', `${room.id}'s bed ${i} is not a sleeping place`);
      eq(beds[i]!.facing, 'right', `${room.id}'s sleeper ${i} would be flipped — the head is painted on the left`);
    }
  }
});

check('every commercial room seats its customers, and the bar shares its stools', () => {
  // A room offers as many places as its floor allows. The bar is the one room
  // whose picture is mostly counter: five customers share four places, and
  // the bridge spreads the sharers a few pixels apart.
  const short: string[] = [];
  for (const room of data.rooms) {
    if (room.category !== 'commercial') continue;
    const use = waypointsNamed(room.id, room.blocks.w, room.blocks.h, 'guestUse');
    assert(use.length >= 2, `${room.id} has ${use.length} places for customers`);
    if (use.length < room.capacity) short.push(`${room.id} ${use.length}/${room.capacity}`);
  }
  console.log(`      ${short.length} room(s) with fewer places than seats: ${short.join(', ') || 'none'}`);
  assert(short.length <= 1, `too many rooms are short of places: ${short.join(', ')}`);
});

check('every staffed room has a work point for its role, and a patrol for the wanderers', () => {
  for (const room of data.rooms) {
    if (!('staffRole' in room) || !room.staffRole) continue;
    const work = waypoint(room.id, room.blocks.w, room.blocks.h, 'staffWork');
    assert(work, `${room.id} is worked by a ${room.staffRole} with nowhere to stand`);
    const anim = data.animations.find((a) => a.id === `staff.${room.staffRole}`);
    assert(anim, `no animation file for staff.${room.staffRole}`);
    for (const name of anim.behaviour.patrol?.points ?? []) {
      assert(waypoint(room.id, room.blocks.w, room.blocks.h, name),
        `${room.staffRole} patrols to "${name}", which ${room.id} does not have`);
    }
  }
});

check('every point is inside its room, on a standing line', () => {
  for (const room of data.rooms) {
    const width = room.blocks.w * 16;
    const floor = floorLineFor(room.id, room.blocks.h);
    const lines = new Set(layoutFor(room.id, room.blocks.w, room.blocks.h)
      .filter((s) => s.kind === 'ground' || s.kind === 'bed').map((s) => s.y));
    lines.add(floor);
    for (const p of points(room.id)) {
      assert(p.x >= 2 - 0.001 && p.x <= width - 2 + 0.001, `${room.id}'s ${p.name} at x=${p.x} is outside the room (0..${width})`);
      assert(lines.has(p.y), `${room.id}'s ${p.name} stands at y=${p.y}, which is no standing line (${[...lines].join(', ')})`);
      assert(p.y <= floor, `${room.id}'s ${p.name} is below the floor`);
    }
  }
});

check('nobody stands in the building', () => {
  // A 14-px body centred on the point must not cross a painted fixture that
  // stands on the same line — a desk, a door, a counter, a stair, the pool.
  // The door point is the one exception: that is what a door is for.
  let compared = 0;
  for (const room of data.rooms) {
    const fixtures = painted.rooms[room.id] ?? [];
    for (const p of points(room.id)) {
      if (!OCCUPIES(p)) continue;
      const cx = p.x * ANCHOR_PX_X;
      const floorPx = p.y * ANCHOR_PX_Y;
      for (const f of fixtures) {
        if (!f.standing) continue;
        if (!(f.y0 <= floorPx + 6 && f.y1 >= floorPx - 6)) continue;
        compared++;
        assert(!(cx - BODY_HALF_WIDTH_PX < f.x1 - 0.001 && cx + BODY_HALF_WIDTH_PX > f.x0 + 0.001),
          `${room.id} stands ${p.name} (x=${p.x}, ${cx}px) in the ${f.name} (${f.x0}..${f.x1})`);
      }
    }
  }
  console.log(`      ${compared} point-against-fixture comparisons`);
});

check('a door point is on the door, when the room paints one', () => {
  for (const room of data.rooms) {
    const door = waypoint(room.id, room.blocks.w, room.blocks.h, 'door');
    const fixture = (painted.rooms[room.id] ?? []).find((f) => /door/.test(f.name) && f.standing && !/balcony/.test(f.name));
    if (!door) {
      assert(!fixture, `${room.id} paints a door (${fixture?.name}) but has no door point`);
      continue;
    }
    assert(fixture, `${room.id} has a door point but paints no door`);
    const cx = door.x * ANCHOR_PX_X;
    assert(cx >= fixture.x0 && cx <= fixture.x1, `${room.id}'s door point (${cx}px) misses the painted ${fixture.name} (${fixture.x0}..${fixture.x1})`);
  }
});

check('a seat or a bed is a piece of furniture, not a patch of floor', () => {
  for (const room of data.rooms) {
    const layout = layoutFor(room.id, room.blocks.w, room.blocks.h);
    for (const p of points(room.id)) {
      if (p.pose === 'stand') continue;
      const slot = layout.find((s) => s.x === p.x && s.y === p.y && !!s.fixture);
      assert(slot, `${room.id}'s ${p.name} (${p.pose}) is not on a built-in piece`);
      if (p.pose === 'sleep') assert(slot.kind === 'bed', `${room.id}'s ${p.name} sleeps on a ${slot.kind}`);
      if (p.pose === 'sit') assert(slot.fixture!.startsWith('seating_'), `${room.id}'s ${p.name} sits on ${slot.fixture}`);
    }
  }
});

check('two guests are never given the same patch of floor', () => {
  for (const room of data.rooms) {
    const guests = points(room.id).filter((p) => /^guest(Sleep|Use)/.test(p.name));
    for (let i = 0; i < guests.length; i++) {
      for (let j = i + 1; j < guests.length; j++) {
        const a = guests[i]!;
        const b = guests[j]!;
        if (a.y !== b.y) continue;
        assert(Math.abs(a.x - b.x) * ANCHOR_PX_X >= 12,
          `${room.id} puts ${a.name} and ${b.name} within 12px of each other`);
      }
    }
  }
});

check('the block conversion puts feet on the painted floor', () => {
  // For a one-block-high room the floor line is 14 units = 84 px, so a
  // character stands 12 px above the block's bottom edge, on the floor the
  // art paints, rather than on the edge below it as the old renderer did.
  const room = { x: 3, y: 1 };
  const p = toBlock(room, 1, { x: 8, y: floorLineFor('standard', 1) });
  eq(p.x, 3.5, 'x did not convert');
  eq(p.y, 1 + 1 - 14 / 16, 'y did not land on the floor line');
  // Feet in world pixels, the way characterView places them: (plotHeight - y) * BLOCK_H.
  const worldY = (5 - p.y) * BLOCK_H;
  const blockBottom = (5 - 1) * BLOCK_H;
  eq(blockBottom - worldY, BLOCK_H - 14 / 16 * BLOCK_H, 'feet are not 12 px above the block edge');
  // A mezzanine point in the presidential suite is a storey up.
  const up = toBlock({ x: 0, y: 0 }, 2, { x: 6, y: 16 });
  eq(up.y, 1, 'the mezzanine is not one block up');
  eq(BLOCK_W / 16, ANCHOR_PX_X, 'anchor width drifted');
});

check('every hand-measured room exists in the catalogue', () => {
  const ids = new Set(data.rooms.map((r) => r.id));
  for (const id of measuredRooms()) assert(ids.has(id), `"${id}" is measured but is not a room`);
});

check('the points are the same on every call', () => {
  for (const room of data.rooms) {
    const a = JSON.stringify(points(room.id));
    const b = JSON.stringify(waypointsFor(room.id, room.blocks.w, room.blocks.h));
    eq(a, b, `${room.id}'s points changed between calls`);
  }
  const total = data.rooms.reduce((n, r) => n + points(r.id).length, 0);
  console.log(`      ${total} points across ${data.rooms.length} rooms`);
});

console.log(line);
console.log(failures.length === 0
  ? `  ${passed} checks passed`
  : `  ${passed} passed, ${failures.length} FAILED\n${failures.map((f) => `    ✗ ${f}`).join('\n')}`);
console.log(line);
process.exit(failures.length ? 1 : 0);
