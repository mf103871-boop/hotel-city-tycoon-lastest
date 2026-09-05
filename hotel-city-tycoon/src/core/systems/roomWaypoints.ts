/**
 * Where a person stands in a room — the movement points (HC-P2-S1, DEC-012).
 *
 * `roomAnchors.ts` says where the furniture goes. This says where the people
 * go: the bed a guest sleeps in, the stool they sit on, the spot behind which
 * the receptionist works, the two ends of the gym the trainer walks between,
 * the door everyone comes in by. ART-0 §5 asks for exactly this vocabulary
 * (stand, sit, sleep, work, clean, wait) and §5 line 148 forbids the
 * alternative: "do not drop a character in the middle of the room at random".
 *
 * ### Units
 *
 * DEC-010 anchor units, the same as the slot plans: 16 per block, so one unit
 * is 8 px across and 6 px down, measured from the room's own top-left. A
 * point's `y` is a standing line — `floorLineFor` for the floor, the
 * mezzanine for the presidential suite's upper bed — and the feet go there,
 * which is 13 px above the bottom of the block the room sits on. That is the
 * painted floor; the old renderer stood everyone on the block edge below it.
 *
 * ### Where the numbers come from
 *
 * Most points are derived from the slot plan: every built-in bed is a
 * `guestSleep`, every built-in seat is a `guestUse` you sit on, every
 * built-in machine is one you stand at. The rest — where staff work and
 * patrol, where a guest stands when a room's floor is mostly counter — are
 * measured against `tools/selftest/room-fixtures.json`, the record of what
 * each room's picture paints, and `tools/selftest/waypoints.ts` re-checks
 * every one of them on every run: a point typed here that would stand a guest
 * inside the reception desk fails the build rather than shipping.
 *
 * ### Why here and not in `data/`
 *
 * The same reason `roomAnchors.ts` gives at its top: a standing spot is a
 * fact about the picture. The lobby's desk occupies the right third, the bar
 * is mostly counter, the pool is mostly water — and so the people have to go
 * where the art leaves them room. Room art and these numbers change together.
 */
import { layoutFor, floorLineFor } from './roomAnchors.ts';
import type { Slot } from './roomAnchors.ts';
import { ANCHOR_UNITS_PER_BLOCK } from './decorPlacement.ts';

export type WaypointPose = 'stand' | 'sit' | 'sleep';

export interface Waypoint {
  name: string;
  /** Anchor units from the room's top-left (8 px across, 6 px down). */
  x: number;
  y: number;
  facing: 'left' | 'right';
  pose: WaypointPose;
}

/**
 * How wide a person is for the purposes of "does this spot clash with the
 * building": the torso of a 48-px frame drawn at the game's scale.
 */
export const BODY_HALF_WIDTH_PX = 7;

/** A stand point this far in from either wall. */
const EDGE_INSET = 3;
/** Where a character crosses a room's edge on the way in or out. */
const EDGE_ENTRY = 2.5;

/**
 * Per-room measurements, in anchor units, for what cannot be derived.
 *
 * `door` is the centre of the painted door; rooms without one are entered at
 * the edge nearest the lobby, which the bridge decides. `use` are places a
 * guest occupies in a commercial room over and above its built-in seats and
 * machines. `stand` overrides the default inset stand points where the
 * picture paints something there.
 */
interface RoomPoints {
  door?: { x: number; y?: number };
  standLeft?: number;
  standRight?: number;
  staffWork?: { x: number; facing: 'left' | 'right' };
  patrol?: number[];
  use?: Array<{ x: number; pose?: WaypointPose; facing?: 'left' | 'right' }>;
  clean?: number;
  /** Where to stand beside each bed, by bed index, when the derived spot clashes. */
  nearBed?: Record<number, number>;
  /** The lobby only: where a guest checks in, and where the queue waits. */
  deskFront?: number;
  queue?: number[];
}

const POINTS: Readonly<Record<string, RoomPoints>> = {
  // Entrance doors 4..40 px on the left, desk 142..206 px on the right. The
  // receptionist stands at the desk's end — the desk is painted into the
  // room and nothing draws behind it yet (BL-035) — and guests check in from
  // the front, at 128 px. The three queue places are in front of the bench.
  lobby: {
    door: { x: 2.75 },
    standLeft: 6.5, standRight: 29.5,
    // Behind the desk, not at the end of it. The lobby paints its desk on a
    // front layer now (BL-035), so the receptionist stands on the desk's own
    // floor line at its centre and the desk hides them from the waist down.
    // Before that layer existed every character was drawn over the desk, and
    // the only way to look like staff was to stand clear of it at x=29.5.
    staffWork: { x: 21.75, facing: 'left' },
    deskFront: 16, queue: [12.5, 9.25, 6.5],
    clean: 6.5,
  },
  housekeeping: { standLeft: 3, standRight: 13, staffWork: { x: 12.5, facing: 'right' }, clean: 13 },
  staffRoom: { standLeft: 13, standRight: 29 },
  maintenance: { standLeft: 13, standRight: 26 },
  business: { standLeft: 3, standRight: 45 },
  economy: { door: { x: 12.5 }, standRight: 7 },
  standard: { door: { x: 12 }, standRight: 9 },
  double: { door: { x: 26.5 }, standRight: 30 },
  family: { door: { x: 28 }, standRight: 25 },
  deluxe: { door: { x: 25.5 } },
  executive: { door: { x: 44.5 }, standLeft: 15, standRight: 41 },
  honeymoon: { door: { x: 44 }, standRight: 28 },
  luxurySuite: { door: { x: 56.75 }, standRight: 51 },
  // Two storeys: the entrance doors and the stair are on the ground floor,
  // the second bed is on the mezzanine (standing line 16).
  presidential: { door: { x: 8.5 }, standLeft: 15, standRight: 45, nearBed: { 0: 21 } },
  // The counter covers the left half, so everything happens on the right.
  cafe: { standLeft: 17.5, standRight: 30, use: [{ x: 17.5 }, { x: 27 }, { x: 30 }], clean: 17.5 },
  // The treadmill is a place to stand at; the dumbbell rack (storage) is too.
  gym: { staffWork: { x: 12, facing: 'left' }, patrol: [24], use: [{ x: 9 }], clean: 12 },
  // The banquette is painted across the left third.
  restaurant: {
    standLeft: 17.5, standRight: 45,
    staffWork: { x: 37.25, facing: 'left' }, patrol: [17.5],
    use: [{ x: 19 }, { x: 32.5 }], clean: 17.5,
  },
  // The counter runs to 168 px; the stools stand beyond it.
  bar: {
    standLeft: 22, standRight: 29,
    // Behind the counter, facing the customers on the far side of it. Same
    // change as the lobby desk, same reason (BL-035).
    staffWork: { x: 11, facing: 'right' }, patrol: [27],
    use: [{ x: 27 }], clean: 22,
  },
  arcade: { use: [{ x: 12 }, { x: 19 }], clean: 12 },
  // Three rows of seats with an aisle between each; the usher walks the aisles.
  cinema: {
    standRight: 45,
    staffWork: { x: 32, facing: 'left' }, patrol: [16, 24],
    use: [{ x: 36 }], clean: 32,
  },
  // Speaker stacks stand at both ends of the dance floor (standing line 12).
  spa: { standLeft: 11, standRight: 39, use: [{ x: 11 }, { x: 15 }, { x: 26 }, { x: 30 }, { x: 35 }], clean: 11 },
  // The basin spans 70..442 px; people are on the two decks (standing line 10).
  pool: {
    standLeft: 7.5, standRight: 62,
    staffWork: { x: 62, facing: 'left' }, patrol: [7.5],
    use: [{ x: 57 }, { x: 60 }], clean: 57,
  },
};

const cache = new Map<string, readonly Waypoint[]>();

function point(name: string, x: number, y: number, facing: 'left' | 'right', pose: WaypointPose = 'stand'): Waypoint {
  return { name, x, y, facing, pose };
}

/**
 * Every movement point a room has, derived once per room definition.
 *
 * Order is stable and meaningful: `guestSleep0` is the first bed in the
 * plan, `guestUse0` the first seat, `patrol1` the first patrol stop after
 * `staffWork` (which is `patrol0` in a patrol route).
 */
export function waypointsFor(roomDefId: string, blocksW: number, blocksH: number): readonly Waypoint[] {
  const key = `${roomDefId}:${blocksW}x${blocksH}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const floor = floorLineFor(roomDefId, blocksH);
  const width = blocksW * ANCHOR_UNITS_PER_BLOCK;
  const layout = layoutFor(roomDefId, blocksW, blocksH);
  const own = POINTS[roomDefId] ?? {};
  const out: Waypoint[] = [];

  // --- the ways in and out ------------------------------------------------
  out.push(point('edgeLeft', EDGE_ENTRY, floor, 'right'));
  out.push(point('edgeRight', width - EDGE_ENTRY, floor, 'left'));
  if (own.door) {
    const doorY = own.door.y ?? floor;
    // Face into the room: a door on the left half looks right, and vice versa.
    out.push(point('door', own.door.x, doorY, own.door.x < width / 2 ? 'right' : 'left'));
  }

  // --- free standing ------------------------------------------------------
  const standLeft = own.standLeft ?? EDGE_INSET;
  const standRight = own.standRight ?? width - EDGE_INSET;
  out.push(point('standLeft', standLeft, floor, 'right'));
  out.push(point('standRight', standRight, floor, 'left'));

  // --- beds: floor-line beds first, then any on an upper standing line -----
  const beds = layout.filter((s): s is Slot & { fixture: string } => s.kind === 'bed' && !!s.fixture);
  beds.sort((a, b) => (a.y === floor ? 0 : 1) - (b.y === floor ? 0 : 1));
  beds.forEach((bed, i) => {
    // Facing right: the painted bed's head is on the left, and the sleeper
    // is drawn with its head on the left too, so a sleeper is never flipped.
    out.push(point(`guestSleep${i}`, bed.x, bed.y, 'right', 'sleep'));
    // Beside the bed, on the side away from the headboard, one step clear of
    // the mattress. Overridden where a door or a stair is painted there.
    const beside = own.nearBed?.[i] ?? bed.x + bed.w / 2 + 1;
    out.push(point(`standNearBed${i}`, beside, bed.y, beside > bed.x ? 'left' : 'right'));
  });

  // --- seats and machines, then the room's own extra places ---------------
  // Only where a guest is a customer. A bench in the lobby is furniture to
  // queue past, not a place the simulation ever puts anyone.
  let use = 0;
  if (own.use || roomDefId === 'gym' || roomDefId === 'arcade' || roomDefId === 'cafe'
      || roomDefId === 'restaurant' || roomDefId === 'bar' || roomDefId === 'cinema'
      || roomDefId === 'spa' || roomDefId === 'pool') {
    for (const slot of layout) {
      if (!slot.fixture || slot.y !== floor) continue;
      if (slot.fixture.startsWith('seating_')) {
        out.push(point(`guestUse${use++}`, slot.x, floor, 'right', 'sit'));
      } else if (slot.fixture.startsWith('appliance_') && (roomDefId === 'gym' || roomDefId === 'arcade')) {
        // Equipment a guest uses by standing at it. Elsewhere a built-in
        // machine is furniture (a washer, a DJ booth), not a place for a guest.
        out.push(point(`guestUse${use++}`, slot.x, floor, slot.x < width / 2 ? 'right' : 'left'));
      }
    }
    for (const u of own.use ?? []) {
      out.push(point(`guestUse${use++}`, u.x, floor, u.facing ?? (u.x < width / 2 ? 'right' : 'left'), u.pose ?? 'stand'));
    }
  }

  // --- reception ------------------------------------------------------------
  if (own.deskFront !== undefined) out.push(point('deskFront', own.deskFront, floor, 'right'));
  (own.queue ?? []).forEach((x, i) => out.push(point(`queue${i}`, x, floor, 'right')));

  // --- staff ---------------------------------------------------------------
  if (own.staffWork) {
    out.push(point('staffWork', own.staffWork.x, floor, own.staffWork.facing));
    (own.patrol ?? []).forEach((x, i) => {
      out.push(point(`patrol${i + 1}`, x, floor, x < own.staffWork!.x ? 'right' : 'left'));
    });
  }
  const clean = own.clean ?? (beds.length > 0 ? (own.nearBed?.[0] ?? beds[0]!.x + beds[0]!.w / 2 + 1) : standLeft);
  out.push(point('clean', clean, floor, clean < width / 2 ? 'right' : 'left'));

  const frozen = Object.freeze(out);
  cache.set(key, frozen);
  return frozen;
}

/** One named point, or null when the room has no such place. */
export function waypoint(roomDefId: string, blocksW: number, blocksH: number, name: string): Waypoint | null {
  return waypointsFor(roomDefId, blocksW, blocksH).find((p) => p.name === name) ?? null;
}

/** Every point whose name starts with `prefix`, in plan order. */
export function waypointsNamed(roomDefId: string, blocksW: number, blocksH: number, prefix: string): Waypoint[] {
  return waypointsFor(roomDefId, blocksW, blocksH).filter((p) => p.name.startsWith(prefix));
}

/**
 * A room-local point as fractional block coordinates on the hotel grid — the
 * one conversion the bridge uses, and the inverse of `roomWorldRect`'s
 * arithmetic: the room's top-left is `(room.x, room.y + blocksH)` in block
 * space with y growing upward, so a point `y` units down from the top is
 * `blocksH - y/16` blocks above the room's own row.
 */
export function toBlock(room: { x: number; y: number }, blocksH: number,
                        p: { x: number; y: number }): { x: number; y: number } {
  return {
    x: room.x + p.x / ANCHOR_UNITS_PER_BLOCK,
    y: room.y + blocksH - p.y / ANCHOR_UNITS_PER_BLOCK,
  };
}

/** Rooms with a hand-measured entry in the table above, for the self-test. */
export function measuredRooms(): string[] {
  return Object.keys(POINTS);
}
