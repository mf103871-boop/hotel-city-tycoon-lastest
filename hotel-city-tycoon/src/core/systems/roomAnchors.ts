/**
 * Where a piece of furniture goes, and how big it is drawn — the room plans.
 *
 * DEC-010 gave a placed piece an anchor; `decorPlacement.ts` picks one by
 * scanning the room row by row for the first free cell. That is correct and it
 * is deterministic, and it looks like what it is: furniture queueing up along
 * a grid. HC-P1-S5 replaced the scan's opinion with a *designed slot table*.
 *
 * ### What a slot is
 *
 * One row per place a room keeps something, in the order the room wants them
 * filled. A slot carries four numbers rather than two:
 *
 *   - `x`, `y` — the anchor, in DEC-010 units (16 per block, 8px across and
 *     6px down), measured from the room's own top-left. This is the point the
 *     sprite hangs from, exactly as before.
 *   - `w`, `h` — the BOX the sprite is fitted inside, in the same units. The
 *     picture is scaled down to fit, keeping its aspect ratio, and never
 *     scaled up past its natural size.
 *
 * The box is why the plan can promise the player specific sizes as well as
 * specific places. Before it, every floor piece in the game — a stool, a
 * grand piano, a marble floor — was drawn at exactly 39.6x39.6px, because
 * the only size in the system came from the sprite's slot type. A room's
 * narrow strip of free floor got the same 40px box as a ballroom, and the
 * overflow simply hung over whatever was painted next to it.
 *
 * ### Where the numbers come from
 *
 * Each room's own picture. `tools/selftest/room-fixtures.json` records what
 * every room paints and where, and `tools/selftest/slots.ts` proves that no
 * slot in this file stands a sprite on top of the building or hangs one
 * outside the room. Those two files are the reason these numbers can be
 * trusted: they were measured against the art rather than guessed, and the
 * measurement is re-checked on every run.
 *
 * That check found what the player was complaining about. Under the old
 * point list the laundry stood furniture inside two of its own washing
 * machines, the gym put a treadmill in the middle of the mirror, the cinema
 * put five pieces under the screen, and the pool put two of them in the
 * water.
 *
 * ### Why the numbers are here rather than in `data/`
 *
 * A placement slot is a fact about the *picture* — it exists because the
 * lobby's desk occupies the right third and the pool is mostly water, so
 * furniture has to go somewhere else. Room art and these numbers change
 * together; the economy does not care. That is the same reasoning that keeps
 * `decorArt.ts` out of `data/`.
 */
import type { SimData } from '../data-source.ts';
import { roomById } from '../data-source.ts';
import {
  ANCHOR_UNITS_PER_BLOCK, anchorBoundsFor, anchorKey,
} from './decorPlacement.ts';

/**
 * The five kinds of place a piece can occupy.
 *
 * Fewer kinds than categories on purpose: a table, an armchair, a palm and a
 * washing machine all want the same thing — a clear patch of floor to stand
 * on — and giving each its own list would mean four sets of numbers that have
 * to agree with each other.
 */
export type SpotKind = 'wall' | 'ceiling' | 'ground' | 'bed' | 'surface';

export interface Spot {
  x: number;
  y: number;
}

/** A designed place in a room: an anchor, and the box the art is fitted into. */
export interface Slot extends Spot {
  kind: SpotKind;
  /** Box width in anchor units (8px each). */
  w: number;
  /** Box height in anchor units (6px each). */
  h: number;
  /**
   * The piece the building itself puts here — the laundry's washing machines,
   * the gym's treadmill, the bed in a bedroom.
   *
   * A fixture is drawn, and nothing else. It is not in `room.decor`, it costs
   * nothing, it scores no decor points, it cannot be sold and it does not use
   * up a slot the player paid for, so it moves no number in the economy. What
   * it does is stop a newly built room looking like an empty box, and give the
   * player something to upgrade: buying a piece of the same category takes the
   * fixture's place, which is what "replace what is already in the room"
   * means from the inside.
   */
  fixture?: string;
}

/** Which kind of spot each decor category asks for. */
const KIND_BY_CATEGORY: Readonly<Record<string, SpotKind>> = {
  wallpaper: 'wall',
  wallArt: 'wall',
  lighting: 'ceiling',
  flooring: 'surface',
  rug: 'surface',
  bed: 'bed',
  seating: 'ground',
  table: 'ground',
  plant: 'ground',
  luxury: 'ground',
  appliance: 'ground',
  storage: 'ground',
};

/** Fallback for a category nobody has classified: go by the surface it names. */
const KIND_BY_SLOT_TYPE: Readonly<Record<string, SpotKind>> = {
  wall: 'wall',
  ceiling: 'ceiling',
  floor: 'ground',
  bed: 'bed',
  equipment: 'ground',
};

export function spotKindFor(category: string, slotType: string): SpotKind {
  return KIND_BY_CATEGORY[category] ?? KIND_BY_SLOT_TYPE[slotType] ?? 'ground';
}

/**
 * When a room runs out of slots of the kind a piece wants, it is offered the
 * next best surface rather than dropped straight to the scan. A rug and a
 * chair both live on the floor; a poster and a wallpaper panel both live on
 * the wall. Nothing here ever moves a piece between the floor and the wall.
 */
const NEIGHBOURING_KINDS: Readonly<Record<SpotKind, SpotKind[]>> = {
  ground: ['bed', 'surface'],
  bed: ['ground', 'surface'],
  surface: ['ground', 'bed'],
  wall: [],
  ceiling: [],
};

type Layout = Readonly<Record<string, readonly Slot[]>>;

const s = (kind: SpotKind, x: number, y: number, w: number, h: number,
           fixture?: string): Slot =>
  (fixture === undefined ? { kind, x, y, w, h } : { kind, x, y, w, h, fixture });

/**
 * The painted floor line of a room, in anchor units.
 *
 * `hcstyle.room_shell` puts it at `h - max(9, h * 0.14)`, which is 82.56px —
 * 13.76 units — in every one-block-high room. Three rooms override it: the
 * disco's dance floor is deeper, and the pool's deck deeper still, so a
 * sunbed standing at unit 14 stood two units inside the water. The
 * presidential suite is the only two-storey room and has a second standing
 * line, the mezzanine deck at unit 16, which its plan uses directly.
 */
const FLOOR_LINE: Readonly<Record<string, number>> = { spa: 12, pool: 10 };

export function floorLineFor(roomDefId: string, blocksH: number): number {
  return FLOOR_LINE[roomDefId] ?? blocksH * ANCHOR_UNITS_PER_BLOCK - 2;
}

/**
 * The plans, one ordered list per room.
 *
 * Generated against `tools/selftest/room-fixtures.json` and then checked by
 * `tools/selftest/slots.ts` on every run, so a number typed here that would
 * put a sofa through the reception desk fails the build rather than shipping.
 */
const LAYOUTS: Layout = {
  lobby: [
    s('ground', 7, 14, 4, 7),
    s('ground', 11, 14, 4, 7),
    s('ground', 15, 14, 4, 7),
    s('ground', 29, 14, 4, 7),
    s('surface', 11, 14, 6, 7),
    s('surface', 29, 14, 6, 7),
    s('wall', 8, 8, 5, 6),
    s('wall', 15, 8, 5, 6),
    s('wall', 29, 8, 5, 6),
    s('ceiling', 9, 2, 4, 5),
    s('ceiling', 17, 2, 4, 5),
  ],
  housekeeping: [
    s('ground', 3, 14, 5, 7),
    s('ground', 8, 14, 5, 7),
    s('ground', 13, 14, 5, 7),
    s('surface', 8, 14, 6, 7),
    s('wall', 4, 11, 7, 6),
    s('wall', 12, 11, 7, 6),
    s('ceiling', 12, 2, 5, 5),
  ],
  laundry: [
    s('ground', 5, 14, 6, 7),
    s('ground', 16, 14, 6, 7),
    s('ground', 27, 14, 6, 7),
    s('surface', 16, 14, 6, 7),
    s('wall', 9, 8, 3, 6),
    s('wall', 29, 8, 3, 6),
    s('ceiling', 16, 2, 5, 5),
  ],
  staffRoom: [
    s('ground', 14, 14, 5, 7),
    s('ground', 19, 14, 5, 7),
    s('ground', 24, 14, 5, 7),
    s('ground', 29, 14, 5, 7),
    s('surface', 16, 14, 6, 7),
    s('surface', 27, 14, 6, 7),
    s('wall', 16, 11, 7, 6),
    s('wall', 27, 11, 7, 6),
    s('ceiling', 12, 2, 3, 5),
    s('ceiling', 25, 2, 3, 5),
  ],
  maintenance: [
    s('ground', 15, 14, 5, 7),
    s('ground', 20, 14, 5, 7),
    s('ground', 25, 14, 5, 7),
    s('surface', 20, 14, 6, 7),
    s('wall', 17, 8, 7, 6),
    s('wall', 27, 8, 7, 6),
    s('ceiling', 21, 2, 5, 5),
  ],
  business: [
    s('ground', 3, 14, 5, 7),
    s('ground', 8, 14, 5, 7),
    s('ground', 14, 14, 5, 7),
    s('ground', 28, 14, 5, 7),
    s('ground', 44, 14, 5, 7),
    s('surface', 8, 14, 6, 7),
    s('surface', 44, 14, 6, 7),
    s('wall', 11, 8, 7, 6),
    s('wall', 28, 8, 7, 6),
    s('wall', 44, 8, 7, 6),
    s('ceiling', 11, 2, 5, 5),
    s('ceiling', 36, 2, 5, 5),
  ],
  economy: [
    s('bed', 6, 14, 8, 6),
    s('surface', 6, 14, 6, 7),
    s('wall', 3, 11, 5, 6),
    s('wall', 8, 11, 5, 6),
    s('ceiling', 11, 2, 5, 5),
  ],
  standard: [
    s('bed', 5, 14, 8, 6),
    s('surface', 5, 14, 6, 7),
    s('wall', 9, 8, 2, 6),
    s('wall', 15, 8, 2, 6),
    s('ceiling', 9, 1, 4, 5),
    s('ceiling', 14, 1, 4, 5),
  ],
  double: [
    s('bed', 6, 14, 8, 6),
    s('bed', 18, 14, 8, 6),
    s('ground', 12, 14, 4, 7),
    s('surface', 6, 14, 6, 7),
    s('surface', 18, 14, 6, 7),
    s('wall', 11, 8, 2, 6),
    s('wall', 22, 8, 2, 6),
    s('wall', 30, 8, 2, 6),
    s('ceiling', 22, 2, 3, 5),
    s('ceiling', 30, 2, 3, 5),
  ],
  family: [
    s('bed', 7, 14, 8, 6),
    s('bed', 20, 14, 8, 6),
    s('bed', 20, 10, 8, 4),
    s('surface', 7, 14, 6, 7),
    s('surface', 20, 14, 6, 7),
    s('wall', 1, 8, 2, 6),
    s('wall', 13, 8, 2, 6),
    s('ceiling', 1, 2, 2, 5),
    s('ceiling', 13, 2, 2, 5),
  ],
  deluxe: [
    s('bed', 12, 14, 8, 6),
    s('ground', 4, 14, 4, 7),
    s('ground', 20, 14, 4, 7),
    s('ground', 30, 14, 4, 7),
    s('surface', 4, 14, 6, 7),
    s('surface', 12, 14, 6, 7),
    s('surface', 20, 14, 6, 7),
    s('wall', 2, 8, 2, 6),
    s('wall', 10, 8, 2, 6),
    s('wall', 20, 8, 2, 6),
    s('wall', 30, 8, 2, 6),
    s('ceiling', 2, 2, 2, 5),
    s('ceiling', 10, 2, 2, 5),
    s('ceiling', 30, 2, 2, 5),
  ],
  executive: [
    s('bed', 28, 14, 8, 6),
    s('ground', 17, 14, 5, 7),
    s('ground', 35, 14, 5, 7),
    s('ground', 40, 14, 5, 7),
    s('surface', 19, 14, 6, 7),
    s('surface', 28, 14, 6, 7),
    s('surface', 38, 14, 6, 7),
    s('wall', 15, 8, 2, 6),
    s('wall', 24, 8, 2, 6),
    s('wall', 34, 8, 2, 6),
    s('ceiling', 15, 2, 2, 5),
    s('ceiling', 24, 2, 2, 5),
    s('ceiling', 34, 2, 2, 5),
  ],
  honeymoon: [
    s('bed', 15, 14, 8, 6),
    s('ground', 3, 14, 5, 7),
    s('ground', 8, 14, 5, 7),
    s('ground', 26, 14, 5, 7),
    s('surface', 5, 14, 6, 7),
    s('surface', 15, 14, 6, 7),
    s('surface', 24, 14, 6, 7),
    s('wall', 1, 8, 2, 6),
    s('wall', 3, 8, 2, 6),
    s('wall', 11, 8, 2, 6),
    s('wall', 21, 8, 2, 6),
    s('wall', 26, 8, 2, 6),
    s('ceiling', 2, 2, 2, 5),
    s('ceiling', 11, 2, 2, 5),
    s('ceiling', 21, 2, 2, 5),
    s('ceiling', 27, 2, 2, 5),
  ],
  luxurySuite: [
    s('bed', 13, 14, 8, 6),
    s('bed', 39, 14, 8, 6),
    s('ground', 2, 14, 4, 7),
    s('ground', 7, 14, 4, 7),
    s('ground', 19, 14, 4, 7),
    s('ground', 24, 14, 4, 7),
    s('ground', 28, 14, 4, 7),
    s('ground', 33, 14, 4, 7),
    s('ground', 45, 14, 4, 7),
    s('ground', 50, 14, 4, 7),
    s('surface', 7, 14, 6, 7),
    s('surface', 20, 14, 6, 7),
    s('surface', 33, 14, 6, 7),
    s('surface', 46, 14, 6, 7),
    s('wall', 2, 8, 3, 6),
    s('wall', 12, 8, 3, 6),
    s('wall', 16, 8, 3, 6),
    s('wall', 19, 8, 3, 6),
    s('wall', 45, 8, 3, 6),
    s('wall', 50, 8, 3, 6),
    s('ceiling', 2, 2, 2, 5),
    s('ceiling', 18, 2, 2, 5),
    s('ceiling', 45, 2, 2, 5),
    s('ceiling', 63, 2, 2, 5),
  ],
  presidential: [
    s('bed', 18, 30, 8, 6),
    s('bed', 27, 30, 8, 6),
    s('ground', 46, 30, 4, 7),
    s('ground', 6, 16, 5, 6),
    s('ground', 12, 16, 5, 6),
    s('ground', 18, 16, 5, 6),
    s('ground', 24, 16, 5, 6),
    s('surface', 17, 30, 6, 7),
    s('surface', 28, 30, 6, 7),
    s('surface', 15, 16, 6, 6),
    s('wall', 1, 8, 2, 6),
    s('wall', 4, 8, 2, 6),
    s('wall', 13, 8, 2, 6),
    s('wall', 16, 8, 2, 6),
    s('wall', 27, 8, 2, 6),
    s('wall', 33, 8, 2, 6),
    s('wall', 46, 8, 2, 6),
    s('ceiling', 3, 2, 4, 5),
    s('ceiling', 15, 2, 4, 5),
    s('ceiling', 27, 2, 4, 5),
    s('ceiling', 33, 2, 4, 5),
    s('ceiling', 46, 2, 4, 5),
  ],
  cafe: [
    s('ground', 18, 14, 4, 7),
    s('ground', 22, 14, 4, 7),
    s('ground', 26, 14, 4, 7),
    s('ground', 30, 14, 4, 7),
    s('surface', 20, 14, 6, 7),
    s('surface', 28, 14, 6, 7),
    s('wall', 1, 5, 2, 6),
    s('wall', 17, 5, 2, 6),
    s('wall', 31, 5, 2, 6),
    s('ceiling', 1, 2, 2, 5),
    s('ceiling', 17, 2, 2, 5),
  ],
  gym: [
    s('ground', 3, 14, 6, 7),
    s('ground', 10, 14, 6, 7),
    s('ground', 16, 14, 6, 7),
    s('ground', 22, 14, 6, 7),
    s('ground', 29, 14, 6, 7),
    s('surface', 8, 14, 6, 7),
    s('surface', 24, 14, 6, 7),
    s('wall', 17, 10, 2, 6),
    s('wall', 28, 10, 2, 6),
    s('wall', 31, 10, 2, 6),
    s('ceiling', 17, 2, 3, 5),
  ],
  restaurant: [
    s('ground', 19, 14, 4, 7),
    s('ground', 23, 14, 4, 7),
    s('ground', 28, 14, 4, 7),
    s('ground', 32, 14, 4, 7),
    s('ground', 37, 14, 4, 7),
    s('ground', 41, 14, 4, 7),
    s('ground', 46, 14, 4, 7),
    s('surface', 22, 14, 6, 7),
    s('surface', 32, 14, 6, 7),
    s('surface', 43, 14, 6, 7),
    s('wall', 18, 8, 2, 6),
    s('wall', 23, 8, 2, 6),
    s('wall', 27, 8, 2, 6),
    s('wall', 47, 8, 2, 6),
    s('ceiling', 5, 2, 5, 5),
    s('ceiling', 15, 2, 5, 5),
    s('ceiling', 24, 2, 5, 5),
  ],
  bar: [
    s('ground', 24, 14, 5, 7),
    s('ground', 29, 14, 5, 7),
    s('surface', 27, 14, 6, 7),
    s('wall', 23, 8, 3, 6),
    s('wall', 27, 8, 3, 6),
    s('wall', 30, 8, 3, 6),
    s('ceiling', 1, 2, 2, 5),
    s('ceiling', 21, 2, 2, 5),
  ],
  arcade: [
    s('ground', 3, 14, 6, 7),
    s('ground', 10, 14, 6, 7),
    s('ground', 16, 14, 6, 7),
    s('ground', 22, 14, 6, 7),
    s('ground', 29, 14, 6, 7),
    s('surface', 8, 14, 6, 7),
    s('surface', 24, 14, 6, 7),
    s('wall', 3, 8, 4, 6),
    s('wall', 13, 8, 4, 6),
    s('wall', 17, 8, 4, 6),
    s('ceiling', 3, 2, 5, 5),
    s('ceiling', 15, 2, 5, 5),
  ],
  cinema: [
    s('ground', 2, 14, 4, 7),
    s('ground', 13, 14, 5, 7),
    s('ground', 20, 14, 5, 7),
    s('ground', 28, 14, 5, 7),
    s('ground', 35, 14, 5, 7),
    s('ground', 46, 14, 4, 7),
    s('surface', 17, 14, 6, 7),
    s('surface', 31, 14, 6, 7),
    s('wall', 1, 10, 2, 6),
    s('wall', 4, 10, 2, 6),
    s('wall', 46, 10, 2, 6),
    s('ceiling', 44, 2, 2, 5),
    s('ceiling', 47, 2, 2, 5),
  ],
  spa: [
    s('ground', 12, 12, 4, 7),
    s('ground', 16, 12, 4, 7),
    s('ground', 20, 12, 4, 7),
    s('ground', 25, 12, 4, 7),
    s('ground', 29, 12, 4, 7),
    s('ground', 34, 12, 4, 7),
    s('ground', 38, 12, 4, 7),
    s('surface', 14, 12, 6, 7),
    s('surface', 25, 12, 6, 7),
    s('surface', 35, 12, 6, 7),
    s('wall', 13, 11, 7, 6),
    s('wall', 21, 11, 7, 6),
    s('wall', 29, 11, 7, 6),
    s('wall', 37, 11, 7, 6),
    s('ceiling', 16, 2, 5, 5),
    s('ceiling', 29, 2, 5, 5),
    s('ceiling', 37, 2, 5, 5),
  ],
  pool: [
    s('ground', 2, 10, 4, 7),
    s('ground', 6, 10, 4, 7),
    s('ground', 58, 10, 4, 7),
    s('ground', 62, 10, 4, 7),
    s('surface', 4, 10, 6, 7),
    s('surface', 60, 10, 6, 7),
    s('wall', 18, 5, 7, 6),
    s('wall', 26, 5, 7, 6),
    s('wall', 38, 5, 7, 6),
    s('wall', 46, 5, 7, 6),
    s('ceiling', 3, 2, 5, 5),
    s('ceiling', 22, 2, 5, 5),
    s('ceiling', 42, 2, 5, 5),
  ],
};

/**
 * A room nobody has drawn a plan for, derived from its footprint.
 *
 * Every room in the catalogue has an entry above, so this only ever runs for a
 * room added after this file — which is exactly when a sensible default beats
 * a crash.
 */
function defaultLayout(roomDefId: string, blocksW: number, blocksH: number): readonly Slot[] {
  const w = blocksW * ANCHOR_UNITS_PER_BLOCK;
  const floor = floorLineFor(roomDefId, blocksH);
  const out: Slot[] = [];
  for (let b = 0; b < blocksW; b++) {
    const mid = b * ANCHOR_UNITS_PER_BLOCK + 8;
    out.push(s('bed', mid, floor, 8, 6));
    out.push(s('ground', mid - 4, floor, 5, 7));
    out.push(s('ground', mid + 4, floor, 5, 7));
    out.push(s('surface', mid, floor, 6, 7));
    out.push(s('wall', mid, 8, 5, 6));
    out.push(s('ceiling', mid, 2, 5, 5));
  }
  return out.length > 0 ? out : [s('ground', Math.round(w / 2), floor, 5, 7)];
}

/** Every room this file has a plan for — for the self-test's coverage check. */
export function plannedRooms(): string[] {
  return Object.keys(LAYOUTS);
}

/** The plan for one room, falling back to a footprint-derived default. */
export function layoutFor(roomDefId: string, blocksW: number, blocksH: number): readonly Slot[] {
  return LAYOUTS[roomDefId] ?? defaultLayout(roomDefId, blocksW, blocksH);
}

/**
 * The slots of one kind, in the order the room wants them filled.
 *
 * `limit` bounds the list — a room can be asked for at most as many slots as
 * `data/economy.json` lets it hold pieces.
 */
export function slotsOfKind(layout: readonly Slot[], kind: SpotKind, limit: number): Slot[] {
  return layout.filter((slot) => slot.kind === kind).slice(0, limit);
}

/** Back-compatible view of `slotsOfKind` for callers that only want positions. */
export function spotsOfKind(layout: readonly Slot[], kind: SpotKind, _roomW: number,
                            limit: number): Spot[] {
  return slotsOfKind(layout, kind, limit).map((slot) => ({ x: slot.x, y: slot.y }));
}

/**
 * The slot a piece standing at this anchor occupies, if the room designed one
 * there. This is how the renderer finds a piece's box: the anchor is the
 * identity, so nothing new has to be written into the save.
 */
export function slotAt(roomDefId: string, blocksW: number, blocksH: number,
                       x: number, y: number): Slot | null {
  const layout = layoutFor(roomDefId, blocksW, blocksH);
  return layout.find((slot) => slot.x === x && slot.y === y) ?? null;
}

/** What the building puts in this room before the player buys anything. */
export interface RoomFixture {
  /** Stable within a room: the slot's index in its plan. */
  slot: number;
  defId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The fixtures of a room that nothing is standing in front of.
 *
 * `occupied` is the set of anchors the room's own pieces hold, in the
 * `anchorKey` form. A bought piece standing in a fixture's slot hides it —
 * that is the upgrade the player can see.
 */
export function fixturesFor(roomDefId: string, blocksW: number, blocksH: number,
                            occupied: ReadonlySet<string>): RoomFixture[] {
  const out: RoomFixture[] = [];
  const layout = layoutFor(roomDefId, blocksW, blocksH);
  for (let i = 0; i < layout.length; i++) {
    const slot = layout[i]!;
    if (!slot.fixture) continue;
    if (occupied.has(anchorKey(slot.x, slot.y))) continue;
    out.push({ slot: i, defId: slot.fixture, x: slot.x, y: slot.y, w: slot.w, h: slot.h });
  }
  return out;
}

/** A piece already in the room, as this file needs to see it. */
export interface PlacedPiece {
  defId: string;
  localX: number;
  localY: number;
}

/** Kinds that stand on the floor and therefore compete for the same span of it. */
const STANDS_ON_FLOOR: ReadonlySet<SpotKind> = new Set<SpotKind>(['ground', 'bed']);

/**
 * Where this piece goes in this room, or null if the plan has nothing left.
 *
 * Null is not a failure: it is this file saying it has no opinion, and the
 * caller falling back to `firstFreeAnchor`'s scan — which always answers.
 * Each candidate is pulled inside the room's legal range for that piece's own
 * reach before it is offered, so a number typed into a layout above can be
 * wrong about a room's size without ever putting furniture through a wall.
 *
 * `placed` is what the room already holds; a slot another piece is standing
 * in is skipped. Floor coverings are the one exception, and it is the point of
 * the rule rather than a hole in it: a rug is *supposed* to share its place
 * with the chair standing on it (decorArt.ts draws it first), so a surface
 * slot only avoids other surfaces.
 *
 * Deterministic by construction: an ordered array, scanned in order, with no
 * randomness and no dependence on object key order.
 */
export function anchorFor(
  data: SimData | null,
  roomDefId: string | undefined,
  defId: string,
  taken: ReadonlySet<string>,
  maxPieces = 24,
  placed: readonly PlacedPiece[] = [],
): Spot | null {
  if (!data || !roomDefId) return null;
  const def = data.decor.find((d) => d.id === defId);
  const room = roomById(data, roomDefId);
  if (!def || !room) return null;

  const kind = spotKindFor(def.category, def.slotType);
  const bounds = anchorBoundsFor(data, roomDefId);
  const layout = layoutFor(roomDefId, room.blocks.w, room.blocks.h);

  const blocked: ReadonlySet<string> = kind === 'surface'
    ? new Set(placed
      .filter((p) => {
        const other = data.decor.find((d) => d.id === p.defId);
        return other && spotKindFor(other.category, other.slotType) === 'surface';
      })
      .map((p) => anchorKey(p.localX, p.localY)))
    : taken;

  /*
   * A slot is offered as it was designed, pulled back only inside the room's
   * own footprint.
   *
   * It used to be clamped by the piece's category reach instead
   * (`anchorRange`), which was right while the reach was the only description
   * of how big a piece is drawn, and became wrong the moment the slot carried
   * its own box: a bed asking for the business centre's first floor slot was
   * pushed one unit right of it, so the armchair that took the same slot next
   * ended up standing across the bed. The slot's box is the size now, and
   * `tools/selftest/slots.ts` proves every box is inside its room, so there is
   * nothing left for the reach to correct.
   */
  const clamp = (slot: Slot): Spot => ({
    x: Math.min(Math.max(slot.x, 0), bounds.w - 1),
    y: Math.min(Math.max(slot.y, 0), bounds.h - 1),
  });

  /*
   * Three passes over the slots of each kind, and the order is the whole
   * behaviour a player sees.
   *
   * First the places the room left empty, so a bought plant does not evict the
   * laundry's washing machine. Then the places whose fixture is the same
   * category as the piece being bought — a better washer standing where the
   * built-in washer stood, which is the upgrade. Only then anything else.
   */
  const sameCategory = (slot: Slot): boolean => {
    if (!slot.fixture) return false;
    const built = data.decor.find((d) => d.id === slot.fixture);
    return !!built && built.category === def.category;
  };
  const passes: Array<(slot: Slot) => boolean> = [
    (slot) => !slot.fixture,
    sameCategory,
    () => true,
  ];

  for (const accepts of passes) {
    for (const candidateKind of [kind, ...NEIGHBOURING_KINDS[kind]]) {
      for (const slot of slotsOfKind(layout, candidateKind, maxPieces)) {
        if (!accepts(slot)) continue;
        const spot = clamp(slot);
        if (blocked.has(anchorKey(spot.x, spot.y))) continue;
        return spot;
      }
    }
  }
  return null;
}

/**
 * The box a piece standing at this anchor is drawn in, in room-local pixels,
 * or null when no slot was designed there.
 *
 * Pixels rather than anchor units because the only caller is the renderer, and
 * `anchorToLocalPx`'s two constants live on the render side. The core keeps
 * the units; the conversion is the same 8 and 6 the whole file is built on.
 */
export function slotBoxPx(roomDefId: string, blocksW: number, blocksH: number,
                          x: number, y: number): { w: number; h: number } | null {
  const slot = slotAt(roomDefId, blocksW, blocksH, x, y);
  if (!slot) return null;
  return { w: slot.w * 8, h: slot.h * 6 };
}

/** Every kind that stands on the floor — exported for the self-tests. */
export function standsOnFloor(kind: SpotKind): boolean {
  return STANDS_ON_FLOOR.has(kind);
}
