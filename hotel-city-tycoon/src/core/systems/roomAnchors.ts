/**
 * Where a piece of furniture actually goes when the player buys it.
 *
 * DEC-010 gave a placed piece an anchor; `decorPlacement.ts` picks one by
 * scanning the room row by row for the first free cell. That is correct and it
 * is deterministic, and it looks like what it is: furniture queueing up along
 * a grid. A bed lands wherever the scan reached, a lamp lands beside it, and a
 * room the player has spent 40,000 coins on looks like a warehouse.
 *
 * This file is the missing half: a designed set of *placement points* per room
 * type. Buying a bed puts it against the wall where a bed goes; buying a lamp
 * hangs it from the middle of the ceiling; buying a rug lays it on the floor
 * in front of the bed. The player never positions anything by hand, so the
 * points are the only thing standing between a purchase and a tidy room.
 *
 * ### How a point is chosen
 *
 * A piece asks for the kind of spot its category needs — a bed asks for `bed`,
 * a washing machine for `ground`, a chandelier for `ceiling` — and takes the
 * first point of that kind nobody else in the room is standing on. When the
 * designed points run out, the room keeps going along the same lines
 * (`extend`), and only if *that* is exhausted does the caller fall back to the
 * old scan. Nothing is ever refused: DEC-010's rule that a placed piece is
 * never deleted still holds.
 *
 * ### Why the numbers are here rather than in `data/`
 *
 * A placement point is a fact about the *picture* — it exists because the
 * laundry's washing machines are painted along the back wall and the lobby's
 * desk occupies the right third, so furniture has to go somewhere else. Room
 * art and these numbers change together; the economy does not care. That is
 * the same reasoning that keeps `decorArt.ts` out of `data/`.
 *
 * Units are DEC-010 anchor units: 16 per block in both axes, measured from the
 * room's own top-left, so `y: 14` is the floor line of any one-block-high room
 * and `x: 8` is the middle of its first block.
 */
import type { SimData } from '../data-source.ts';
import { roomById } from '../data-source.ts';
import {
  ANCHOR_UNITS_PER_BLOCK, anchorBoundsFor, anchorRange, anchorReachFor, anchorKey,
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
 * A room's designed points, plus the rule for carrying on when they run out.
 *
 * `points` is the ordered list a room actually wants filled — first purchase
 * to the best spot. `extend` describes the line those points sit on so the
 * room can keep offering sensible positions past the end of the list: a
 * ground line marches along the floor, a wall line along the picture rail.
 */
interface KindLayout {
  points: Spot[];
  extend?: { y: number; from: number; step: number };
}

type Layout = Partial<Record<SpotKind, KindLayout>>;

/** Ground line for a room whose floor is `h` blocks down. */
const FLOOR_Y = (blocksH: number): number => blocksH * ANCHOR_UNITS_PER_BLOCK - 2;

/**
 * The default layout of a room nobody has drawn a plan for.
 *
 * Derived from the footprint rather than typed out: a bed centred on the first
 * block, floor pieces spread along the floor line either side of it, pictures
 * at eye height, one lamp on the ceiling, a rug in the middle of the floor.
 * Every room in the catalogue has an entry below, so this only ever runs for a
 * room added after this file — which is exactly when a sensible default beats
 * a crash.
 */
function defaultLayout(blocksW: number, blocksH: number): Layout {
  const w = blocksW * ANCHOR_UNITS_PER_BLOCK;
  const floor = FLOOR_Y(blocksH);
  const beds: Spot[] = [];
  const ground: Spot[] = [];
  for (let b = 0; b < blocksW; b++) {
    beds.push({ x: b * ANCHOR_UNITS_PER_BLOCK + 8, y: floor });
    ground.push({ x: b * ANCHOR_UNITS_PER_BLOCK + 4, y: floor });
    ground.push({ x: b * ANCHOR_UNITS_PER_BLOCK + 12, y: floor });
  }
  return {
    bed: { points: beds, extend: { y: floor, from: 8, step: 16 } },
    ground: { points: ground, extend: { y: floor, from: 4, step: 6 } },
    surface: { points: [{ x: Math.round(w / 2), y: floor }], extend: { y: floor, from: 6, step: 8 } },
    wall: {
      points: [{ x: 5, y: 6 }, { x: w - 5, y: 6 }],
      extend: { y: 6, from: 5, step: 8 },
    },
    ceiling: {
      points: [{ x: Math.round(w / 2), y: 2 }],
      extend: { y: 2, from: 8, step: 12 },
    },
  };
}

/**
 * The plans.
 *
 * Each room's points dodge what is painted into its own picture — the lobby's
 * desk and key wall, the laundry's row of washers, the pool's water — and put
 * the first purchase where a person would put it. The order matters: point one
 * is where the first bed, the first lamp and the first rug go, and most rooms
 * never see their tenth purchase.
 */
const LAYOUTS: Readonly<Record<string, Layout>> = {
  // --- back of house ------------------------------------------------------
  // The desk and key wall own the right half, so furniture lives on the left.
  lobby: {
    ground: { points: [{ x: 6, y: 14 }, { x: 13, y: 14 }, { x: 19, y: 14 }, { x: 26, y: 14 }],
              extend: { y: 14, from: 6, step: 7 } },
    surface: { points: [{ x: 12, y: 14 }, { x: 22, y: 14 }] },
    wall: { points: [{ x: 6, y: 5 }, { x: 15, y: 5 }, { x: 26, y: 8 }],
            extend: { y: 5, from: 6, step: 9 } },
    ceiling: { points: [{ x: 12, y: 2 }, { x: 22, y: 2 }], extend: { y: 2, from: 6, step: 10 } },
    bed: { points: [{ x: 8, y: 14 }] },
  },
  // Shelving fills the upper two thirds; the floor in front of it is free.
  housekeeping: {
    ground: { points: [{ x: 5, y: 14 }, { x: 11, y: 14 }], extend: { y: 14, from: 5, step: 6 } },
    surface: { points: [{ x: 8, y: 14 }] },
    wall: { points: [{ x: 8, y: 11 }], extend: { y: 11, from: 5, step: 7 } },
    ceiling: { points: [{ x: 8, y: 2 }] },
    bed: { points: [{ x: 8, y: 14 }] },
  },
  // Washers stand along the back wall; a cart or a board goes between them.
  laundry: {
    ground: { points: [{ x: 8, y: 14 }, { x: 16, y: 14 }, { x: 24, y: 14 }],
              extend: { y: 14, from: 8, step: 8 } },
    surface: { points: [{ x: 16, y: 14 }] },
    wall: { points: [{ x: 8, y: 10 }, { x: 24, y: 10 }], extend: { y: 10, from: 8, step: 8 } },
    ceiling: { points: [{ x: 16, y: 2 }] },
    bed: { points: [{ x: 16, y: 14 }] },
  },
  // The kitchenette holds the left; lockers and seating take the right.
  staffRoom: {
    ground: { points: [{ x: 20, y: 14 }, { x: 26, y: 14 }, { x: 13, y: 14 }],
              extend: { y: 14, from: 13, step: 7 } },
    surface: { points: [{ x: 20, y: 14 }] },
    wall: { points: [{ x: 24, y: 6 }, { x: 8, y: 6 }], extend: { y: 6, from: 8, step: 8 } },
    ceiling: { points: [{ x: 20, y: 2 }] },
    bed: { points: [{ x: 20, y: 14 }] },
  },
  // The bench and pegboard own the left; the tool rack and boxes go right.
  maintenance: {
    ground: { points: [{ x: 22, y: 14 }, { x: 28, y: 14 }, { x: 14, y: 14 }],
              extend: { y: 14, from: 14, step: 7 } },
    surface: { points: [{ x: 22, y: 14 }] },
    wall: { points: [{ x: 24, y: 8 }], extend: { y: 8, from: 16, step: 8 } },
    ceiling: { points: [{ x: 22, y: 3 }] },
    bed: { points: [{ x: 22, y: 14 }] },
  },
  // Three blocks: whiteboard centre, workstation right, so the left is open.
  business: {
    ground: { points: [{ x: 6, y: 14 }, { x: 13, y: 14 }, { x: 20, y: 14 }, { x: 42, y: 14 }],
              extend: { y: 14, from: 6, step: 7 } },
    surface: { points: [{ x: 13, y: 14 }, { x: 34, y: 14 }] },
    wall: { points: [{ x: 6, y: 6 }, { x: 42, y: 6 }, { x: 13, y: 10 }],
            extend: { y: 6, from: 6, step: 9 } },
    ceiling: { points: [{ x: 13, y: 2 }, { x: 34, y: 2 }], extend: { y: 2, from: 8, step: 12 } },
    bed: { points: [{ x: 13, y: 14 }] },
  },

  // --- guest rooms -------------------------------------------------------
  // One block: the bed against the back wall, one thing either side of it.
  economy: {
    bed: { points: [{ x: 7, y: 14 }] },
    ground: { points: [{ x: 13, y: 14 }, { x: 4, y: 14 }], extend: { y: 14, from: 4, step: 5 } },
    surface: { points: [{ x: 9, y: 14 }] },
    wall: { points: [{ x: 6, y: 6 }, { x: 12, y: 6 }], extend: { y: 6, from: 6, step: 6 } },
    ceiling: { points: [{ x: 8, y: 2 }] },
  },
  standard: {
    bed: { points: [{ x: 7, y: 14 }] },
    ground: { points: [{ x: 13, y: 14 }, { x: 4, y: 14 }], extend: { y: 14, from: 4, step: 5 } },
    surface: { points: [{ x: 9, y: 14 }] },
    wall: { points: [{ x: 6, y: 6 }, { x: 12, y: 6 }], extend: { y: 6, from: 6, step: 6 } },
    ceiling: { points: [{ x: 8, y: 2 }] },
  },
  // Two blocks, two beds: one per block, with the middle left as a walkway.
  double: {
    bed: { points: [{ x: 7, y: 14 }, { x: 25, y: 14 }] },
    ground: { points: [{ x: 16, y: 14 }, { x: 13, y: 14 }, { x: 19, y: 14 }],
              extend: { y: 14, from: 5, step: 6 } },
    surface: { points: [{ x: 16, y: 14 }] },
    wall: { points: [{ x: 6, y: 6 }, { x: 26, y: 6 }, { x: 16, y: 6 }],
            extend: { y: 6, from: 6, step: 7 } },
    ceiling: { points: [{ x: 16, y: 2 }], extend: { y: 2, from: 8, step: 12 } },
  },
  family: {
    bed: { points: [{ x: 7, y: 14 }, { x: 25, y: 14 }] },
    ground: { points: [{ x: 16, y: 14 }, { x: 12, y: 14 }, { x: 20, y: 14 }],
              extend: { y: 14, from: 5, step: 6 } },
    surface: { points: [{ x: 16, y: 14 }] },
    wall: { points: [{ x: 6, y: 6 }, { x: 26, y: 6 }, { x: 16, y: 5 }],
            extend: { y: 6, from: 6, step: 7 } },
    ceiling: { points: [{ x: 16, y: 2 }], extend: { y: 2, from: 8, step: 12 } },
  },
  deluxe: {
    bed: { points: [{ x: 8, y: 14 }] },
    ground: { points: [{ x: 20, y: 14 }, { x: 26, y: 14 }, { x: 15, y: 14 }],
              extend: { y: 14, from: 5, step: 6 } },
    surface: { points: [{ x: 18, y: 14 }] },
    wall: { points: [{ x: 8, y: 6 }, { x: 24, y: 6 }], extend: { y: 6, from: 6, step: 7 } },
    ceiling: { points: [{ x: 16, y: 2 }], extend: { y: 2, from: 8, step: 12 } },
  },
  // Three blocks: sleeping left, sitting middle, working right.
  executive: {
    bed: { points: [{ x: 8, y: 14 }] },
    ground: { points: [{ x: 22, y: 14 }, { x: 30, y: 14 }, { x: 40, y: 14 }, { x: 16, y: 14 }],
              extend: { y: 14, from: 6, step: 6 } },
    surface: { points: [{ x: 26, y: 14 }, { x: 8, y: 14 }] },
    wall: { points: [{ x: 8, y: 6 }, { x: 26, y: 6 }, { x: 42, y: 6 }],
            extend: { y: 6, from: 6, step: 8 } },
    ceiling: { points: [{ x: 26, y: 2 }, { x: 10, y: 2 }], extend: { y: 2, from: 8, step: 12 } },
  },
  honeymoon: {
    bed: { points: [{ x: 24, y: 14 }] },
    ground: { points: [{ x: 8, y: 14 }, { x: 40, y: 14 }, { x: 14, y: 14 }, { x: 34, y: 14 }],
              extend: { y: 14, from: 6, step: 6 } },
    surface: { points: [{ x: 24, y: 14 }] },
    wall: { points: [{ x: 24, y: 5 }, { x: 8, y: 6 }, { x: 40, y: 6 }],
            extend: { y: 6, from: 6, step: 8 } },
    ceiling: { points: [{ x: 24, y: 2 }], extend: { y: 2, from: 10, step: 14 } },
  },
  // Four blocks. A suite reads as rooms-within-a-room: bed, lounge, study.
  luxurySuite: {
    bed: { points: [{ x: 8, y: 14 }, { x: 56, y: 14 }] },
    ground: { points: [{ x: 24, y: 14 }, { x: 32, y: 14 }, { x: 40, y: 14 }, { x: 48, y: 14 },
                       { x: 16, y: 14 }],
              extend: { y: 14, from: 6, step: 6 } },
    surface: { points: [{ x: 32, y: 14 }, { x: 8, y: 14 }] },
    wall: { points: [{ x: 8, y: 6 }, { x: 32, y: 5 }, { x: 56, y: 6 }, { x: 20, y: 7 }],
            extend: { y: 6, from: 6, step: 8 } },
    ceiling: { points: [{ x: 32, y: 2 }, { x: 12, y: 2 }, { x: 52, y: 2 }],
               extend: { y: 2, from: 8, step: 12 } },
  },
  // Two storeys. The upper floor is a mezzanine, so it gets its own ground
  // line at y=14 while the main floor sits at y=30.
  presidential: {
    bed: { points: [{ x: 8, y: 30 }, { x: 40, y: 14 }] },
    ground: { points: [{ x: 22, y: 30 }, { x: 30, y: 30 }, { x: 38, y: 30 },
                       { x: 10, y: 14 }, { x: 18, y: 14 }, { x: 28, y: 14 }],
              extend: { y: 30, from: 6, step: 6 } },
    surface: { points: [{ x: 26, y: 30 }, { x: 20, y: 14 }] },
    wall: { points: [{ x: 8, y: 22 }, { x: 34, y: 22 }, { x: 14, y: 6 }, { x: 34, y: 6 }],
            extend: { y: 22, from: 6, step: 8 } },
    ceiling: { points: [{ x: 24, y: 2 }, { x: 24, y: 18 }], extend: { y: 2, from: 10, step: 14 } },
  },

  // --- commercial --------------------------------------------------------
  // The counter owns the left; tables and plants fill the room in front.
  cafe: {
    ground: { points: [{ x: 20, y: 14 }, { x: 27, y: 14 }, { x: 14, y: 14 }],
              extend: { y: 14, from: 14, step: 6 } },
    surface: { points: [{ x: 20, y: 14 }] },
    wall: { points: [{ x: 22, y: 6 }, { x: 8, y: 5 }], extend: { y: 6, from: 8, step: 8 } },
    ceiling: { points: [{ x: 20, y: 2 }, { x: 10, y: 2 }], extend: { y: 2, from: 8, step: 10 } },
    bed: { points: [{ x: 20, y: 14 }] },
  },
  // Mirror wall behind; equipment stands out on the floor.
  gym: {
    ground: { points: [{ x: 8, y: 14 }, { x: 16, y: 14 }, { x: 24, y: 14 }],
              extend: { y: 14, from: 8, step: 8 } },
    surface: { points: [{ x: 16, y: 14 }] },
    wall: { points: [{ x: 16, y: 6 }], extend: { y: 6, from: 8, step: 8 } },
    ceiling: { points: [{ x: 16, y: 2 }] },
    bed: { points: [{ x: 16, y: 14 }] },
  },
  restaurant: {
    ground: { points: [{ x: 12, y: 14 }, { x: 22, y: 14 }, { x: 32, y: 14 }, { x: 40, y: 14 }],
              extend: { y: 14, from: 6, step: 7 } },
    surface: { points: [{ x: 24, y: 14 }] },
    wall: { points: [{ x: 10, y: 6 }, { x: 24, y: 5 }, { x: 40, y: 6 }],
            extend: { y: 6, from: 8, step: 8 } },
    ceiling: { points: [{ x: 14, y: 2 }, { x: 34, y: 2 }], extend: { y: 2, from: 8, step: 12 } },
    bed: { points: [{ x: 24, y: 14 }] },
  },
  bar: {
    ground: { points: [{ x: 22, y: 14 }, { x: 28, y: 14 }, { x: 16, y: 14 }],
              extend: { y: 14, from: 10, step: 6 } },
    surface: { points: [{ x: 22, y: 14 }] },
    wall: { points: [{ x: 24, y: 6 }], extend: { y: 6, from: 10, step: 8 } },
    ceiling: { points: [{ x: 10, y: 2 }, { x: 22, y: 2 }], extend: { y: 2, from: 8, step: 10 } },
    bed: { points: [{ x: 22, y: 14 }] },
  },
  arcade: {
    ground: { points: [{ x: 8, y: 14 }, { x: 16, y: 14 }, { x: 24, y: 14 }],
              extend: { y: 14, from: 8, step: 8 } },
    surface: { points: [{ x: 16, y: 14 }] },
    wall: { points: [{ x: 16, y: 6 }], extend: { y: 6, from: 8, step: 8 } },
    ceiling: { points: [{ x: 16, y: 2 }] },
    bed: { points: [{ x: 16, y: 14 }] },
  },
  // The screen owns the back wall, so nothing hangs on it: seating only.
  cinema: {
    ground: { points: [{ x: 10, y: 14 }, { x: 18, y: 14 }, { x: 26, y: 14 }, { x: 34, y: 14 },
                       { x: 42, y: 14 }],
              extend: { y: 14, from: 6, step: 7 } },
    surface: { points: [{ x: 24, y: 14 }] },
    wall: { points: [{ x: 6, y: 8 }, { x: 42, y: 8 }], extend: { y: 8, from: 6, step: 10 } },
    ceiling: { points: [{ x: 24, y: 2 }] },
    bed: { points: [{ x: 24, y: 14 }] },
  },
  // The disco: the dance floor is the middle, so furniture hugs the sides.
  spa: {
    ground: { points: [{ x: 8, y: 14 }, { x: 40, y: 14 }, { x: 16, y: 14 }, { x: 32, y: 14 }],
              extend: { y: 14, from: 6, step: 7 } },
    surface: { points: [{ x: 24, y: 14 }] },
    wall: { points: [{ x: 8, y: 6 }, { x: 40, y: 6 }], extend: { y: 6, from: 8, step: 10 } },
    ceiling: { points: [{ x: 24, y: 2 }, { x: 10, y: 2 }, { x: 38, y: 2 }],
               extend: { y: 2, from: 8, step: 12 } },
    bed: { points: [{ x: 24, y: 14 }] },
  },
  // Four blocks of water in the middle: everything goes to the two ends.
  pool: {
    ground: { points: [{ x: 6, y: 14 }, { x: 58, y: 14 }, { x: 12, y: 14 }, { x: 52, y: 14 }],
              extend: { y: 14, from: 6, step: 8 } },
    surface: { points: [{ x: 8, y: 14 }, { x: 56, y: 14 }] },
    wall: { points: [{ x: 8, y: 6 }, { x: 56, y: 6 }, { x: 32, y: 5 }],
            extend: { y: 6, from: 8, step: 12 } },
    ceiling: { points: [{ x: 32, y: 2 }, { x: 12, y: 2 }, { x: 52, y: 2 }],
               extend: { y: 2, from: 8, step: 12 } },
    bed: { points: [{ x: 8, y: 14 }] },
  },
};

/** Every room this file has a plan for — for the self-test's coverage check. */
export function plannedRooms(): string[] {
  return Object.keys(LAYOUTS);
}

/** The plan for one room, falling back to a footprint-derived default. */
export function layoutFor(roomDefId: string, blocksW: number, blocksH: number): Layout {
  return LAYOUTS[roomDefId] ?? defaultLayout(blocksW, blocksH);
}

/**
 * The points of one kind, designed ones first, then the line they sit on.
 *
 * `limit` bounds the generated tail — a room can be asked for at most as many
 * points as `data/economy.json` lets it hold pieces, so this never runs away.
 */
export function spotsOfKind(layout: Layout, kind: SpotKind, roomW: number, limit: number): Spot[] {
  const plan = layout[kind];
  if (!plan) return [];
  const out = [...plan.points];
  // A rug or a second bed with no line of its own follows the floor line the
  // room's other standing pieces use. Every kind could carry its own numbers,
  // but three copies of the same y is three chances to mistype it.
  const extend = plan.extend
    ?? ((kind === 'surface' || kind === 'bed') ? layout.ground?.extend : undefined);
  if (extend) {
    for (let x = extend.from; x < roomW && out.length < limit; x += extend.step) {
      if (!out.some((s) => s.x === x && s.y === extend.y)) out.push({ x, y: extend.y });
    }
  }
  return out.slice(0, limit);
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
 * The horizontal span a floor-standing piece occupies, in anchor units.
 *
 * Only the horizontal one, and only for pieces on the floor: everything
 * standing in a room shares one floor line, so what decides whether two of
 * them collide is whether their widths overlap. A poster hung above a bed is
 * not a collision, and treating it as one would empty every wall.
 */
function floorSpan(data: SimData, defId: string, x: number): [number, number] | null {
  const def = data.decor.find((d) => d.id === defId);
  if (!def) return null;
  if (!STANDS_ON_FLOOR.has(spotKindFor(def.category, def.slotType))) return null;
  const reach = anchorReachFor(data, defId);
  return reach ? [x - reach.left, x + reach.right] : [x - 3, x + 3];
}

/**
 * Where this piece goes in this room, or null if the plan has nothing left.
 *
 * Null is not a failure: it is this file saying it has no opinion, and the
 * caller falling back to `firstFreeAnchor`'s scan — which always answers. Each
 * candidate is pulled inside the room's legal range for that piece's own reach
 * before it is offered, so a number typed into a layout above can be wrong
 * about a room's size without ever putting furniture through a wall.
 *
 * `placed` is what the room already holds. Two passes: the first offers only
 * points where this piece's picture does not overlap another piece standing on
 * the same floor, and the second drops that condition. That order is the whole
 * difference between a bed with a side table beside it and a side table
 * standing in the middle of the bed — an exact-anchor check alone cannot see
 * the collision, because a 57-pixel bed and a 40-pixel table one anchor apart
 * have different anchors and the same floor.
 *
 * The second pass matters as much as the first: an economy room is one block
 * wide and holds four pieces, so at some point they *must* overlap, and a
 * piece is never refused (DEC-010).
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
  const reach = anchorReachFor(data, defId);
  const range = anchorRange(bounds, reach);
  const layout = layoutFor(roomDefId, room.blocks.w, room.blocks.h);
  const spots = spotsOfKind(layout, kind, bounds.w, maxPieces);

  const occupied = STANDS_ON_FLOOR.has(kind)
    ? placed.map((p) => floorSpan(data, p.defId, p.localX)).filter((s): s is [number, number] => !!s)
    : [];

  /*
   * A rug is allowed to share its anchor with the chair standing on it.
   *
   * Floor coverings draw first inside the front band (decorArt.ts gives them
   * depth 0), so a rug under a table is the arrangement, not a clash — and
   * treating the table's anchor as occupied pushed every rug off to a corner
   * of the room by itself, which is the one place a rug never goes.
   */
  const blocked: ReadonlySet<string> = kind === 'surface'
    ? new Set(placed
      .filter((p) => {
        const other = data.decor.find((d) => d.id === p.defId);
        return other && spotKindFor(other.category, other.slotType) === 'surface';
      })
      .map((p) => anchorKey(p.localX, p.localY)))
    : taken;
  const clear = (x: number): boolean => {
    if (occupied.length === 0) return true;
    const lo = x - (reach?.left ?? 3);
    const hi = x + (reach?.right ?? 3);
    return !occupied.some(([a, b]) => lo < b && hi > a);
  };

  for (const wantClear of [true, false]) {
    for (const spot of spots) {
      const x = Math.min(Math.max(spot.x, range.minX), range.maxX);
      const y = Math.min(Math.max(spot.y, range.minY), range.maxY);
      if (blocked.has(anchorKey(x, y))) continue;
      if (wantClear && !clear(x)) continue;
      return { x, y };
    }
  }
  return null;
}
