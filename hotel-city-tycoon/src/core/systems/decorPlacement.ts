/**
 * Decor position — DEC-010 (docs/HC-P1-S1-PLACEMENT-DECISION.md).
 *
 * A piece's `localX`/`localY` are integers in anchor units: 16 per block,
 * measured from the room's own top-left, so a position keeps its meaning
 * whether the room is 1 block or 4. This file is plain maths only — no Pixi,
 * no state mutation — so it can pick an initial anchor from two very
 * different callers: PLACE_DECOR, which always has the full SimData, and the
 * save migration, which sometimes does not (several selftests call
 * `migrate()` bare, and a save can in principle be validated before any
 * SimData is wired up). Without data every piece still lands somewhere valid
 * — the smallest room in the catalogue is 1x1 block, and every real room is
 * at least that big — it is just less tidy about which surface it prefers.
 */
import type { SimData } from '../data-source.ts';
import { roomById } from '../data-source.ts';

/** Anchor units per block, in both axes (DEC-010). */
export const ANCHOR_UNITS_PER_BLOCK = 16;

/** Minimum distance an anchor keeps from the room's own edges. */
export const ANCHOR_EDGE_INSET = 1;

/** One block in pixels. Must match src/render/layout.ts; a selftest checks. */
const BLOCK_W = 128;
const BLOCK_H = 96;
const ANCHOR_PX_X = BLOCK_W / ANCHOR_UNITS_PER_BLOCK;
const ANCHOR_PX_Y = BLOCK_H / ANCHOR_UNITS_PER_BLOCK;

/**
 * How much smaller art is drawn than it is authored.
 *
 * Placement needs this as much as drawing does: an anchor is only legal if
 * the piece hanging off it fits, and how much room a piece takes is its canvas
 * times this. src/render/layout.ts re-exports it as ART_SCALE rather than
 * keeping a second copy, so the two cannot drift.
 */
export const DECOR_ART_SCALE = 0.55;

/**
 * Scene canvas per slotType, in pixels — the same table the asset manifest is
 * generated from (tools/gen-asset-manifest.mjs). A selftest asserts they agree.
 */
const SLOT_SIZE: Record<string, readonly [number, number]> = {
  wall: [96, 72], floor: [72, 72], ceiling: [72, 48], bed: [104, 64],
};
const SLOT_SIZE_DEFAULT = [72, 72] as const;

/**
 * Where a piece is pinned inside its own sprite, by category.
 *
 * The single source for both halves of the problem: the renderer draws the
 * sprite around this point, and the code below uses it to work out which
 * anchors leave the piece inside the room. `slotType` cannot decide it —
 * `floor` covers an armchair, which stands on the contact point under it, and
 * a rug, which is centred on the floor it covers.
 */
const DECOR_ANCHOR: Record<string, readonly [number, number]> = {
  bed: [0.5, 1], seating: [0.5, 1], table: [0.5, 1], plant: [0.5, 1], luxury: [0.5, 1],
  flooring: [0.5, 0.5], rug: [0.5, 0.5], wallpaper: [0.5, 0.5], wallArt: [0.5, 0.5],
  lighting: [0.5, 0],
};
/** Furniture is the safe assumption for a category we have not met. */
const DECOR_ANCHOR_DEFAULT = [0.5, 1] as const;

export function decorAnchorFor(category: string | null): readonly [number, number] {
  return (category ? DECOR_ANCHOR[category] : undefined) ?? DECOR_ANCHOR_DEFAULT;
}

/**
 * Which surface a category belongs to.
 *
 * `slotType` cannot answer this: `floor` covers an armchair, which STANDS on
 * the floor, and a rug, which LIES on it. The two want opposite things from
 * the same band — one puts its base on the floor line, the other puts its
 * middle there — and answering them the same way is why a rug ended up half
 * on the wall.
 */
export type DecorBand = 'ceiling' | 'wall' | 'floorStand' | 'floorFlat';

const DECOR_BAND: Record<string, DecorBand> = {
  lighting: 'ceiling',
  wallpaper: 'wall', wallArt: 'wall',
  bed: 'floorStand', seating: 'floorStand', table: 'floorStand',
  plant: 'floorStand', luxury: 'floorStand',
  flooring: 'floorFlat', rug: 'floorFlat',
};

export function decorBandFor(category: string | null): DecorBand {
  return (category ? DECOR_BAND[category] : undefined) ?? 'floorStand';
}

/**
 * Categories that are a SURFACE rather than a thing standing on one.
 *
 * A wallpaper is the wall's finish and a flooring is the floor's; neither is
 * an object at a coordinate. The delivered art says so plainly — measured,
 * `wallpaper_plain.png` is opaque across its whole canvas (alpha 238-255) and
 * `flooring_concrete.png` is a tiling pattern that fills its own (alpha
 * 79-255), while every other piece has a real transparent surround. Drawn as
 * point sprites they read as a blank panel hung on the wall and a paving slab
 * dropped on the floor, which is exactly what they looked like.
 *
 * So they are drawn as a fill over their band instead, tiled at 1:1. The
 * anchor a surface carries is meaningless and kept only so the save format,
 * the decor meter and the slot accounting do not have to change.
 */
const DECOR_SURFACE = new Set(['wallpaper', 'flooring']);

export function isDecorSurface(category: string | null): boolean {
  return !!category && DECOR_SURFACE.has(category);
}

/** The rectangle a surface finish covers: its whole band, inside the frame. */
export function surfaceRectFor(
  bands: RoomBands,
  category: string | null,
): { x: number; y: number; w: number; h: number } {
  const wall = decorBandFor(category) === 'wall';
  const top = wall ? bands.ceilingBottom : bands.floorTop;
  const bottom = wall ? bands.wallBottom : bands.floorBottom;
  return {
    x: bands.inset,
    y: top,
    w: Math.max(0, bands.width - bands.inset * 2),
    h: Math.max(0, bottom - top + 1),
  };
}

/**
 * A piece's drawn width in whole anchor units — how far apart two of them have
 * to sit before they read as two things rather than one smudge.
 */
export function decorWidthUnits(slotType: string | null): number {
  const [pw] = (slotType ? SLOT_SIZE[slotType] : undefined) ?? SLOT_SIZE_DEFAULT;
  return Math.max(1, Math.ceil((pw * DECOR_ART_SCALE) / ANCHOR_PX_X));
}

/** The piece's drawn size in room pixels. */
export function decorSizePx(slotType: string | null): { w: number; h: number } {
  const [pw, ph] = (slotType ? SLOT_SIZE[slotType] : undefined) ?? SLOT_SIZE_DEFAULT;
  return { w: pw * DECOR_ART_SCALE, h: ph * DECOR_ART_SCALE };
}

/**
 * The anchors at which this piece sits on its own surface, wholly inside the
 * room.
 *
 * Two rules at once, and the old code had neither. DEC-010:159 — the piece is
 * inside the room rectangle, "لا clipping ولا تسرب إلى الغرفة المجاورة" —
 * gives the outer limit. DEC-010:108 and :183 — wall and ceiling pieces on
 * their own surface, floor pieces on the floor region with their contact base
 * on the ground — give the band. The old inset was a flat 1/16 block applied
 * to the anchor POINT, so a 57px bed one unit from the edge hung half of
 * itself into the room next door, and "the floor region" was a fraction of the
 * bounding box that no room's art agreed with.
 */
export function anchorRangeFor(
  bands: RoomBands,
  category: string | null,
  slotType: string | null,
): { minX: number; maxX: number; minY: number; maxY: number; preferredY: number } {
  const { w, h } = decorSizePx(slotType);
  const [ax, ay] = decorAnchorFor(category);
  const band = decorBandFor(category);

  // How far the sprite reaches from its anchor, on each side.
  const left = w * ax, right = w * (1 - ax), up = h * ay, down = h * (1 - ay);

  const minX = Math.ceil((bands.inset + left) / ANCHOR_PX_X);
  const maxX = Math.floor((bands.width - bands.inset - right) / ANCHOR_PX_X);

  /*
   * The band the piece must touch, expressed as the range its ANCHOR may take.
   * A pendant hangs from the cornice line; a picture is centred on the wall; a
   * chair puts its feet on the floor; a rug puts its middle there.
   */
  let bandLo: number, bandHi: number, want: number;
  if (band === 'ceiling') {
    bandLo = bands.ceilingBottom; bandHi = bands.ceilingBottom; want = bands.ceilingBottom;
  } else if (band === 'wall') {
    bandLo = bands.ceilingBottom + up; bandHi = bands.wallBottom - down;
    want = (bands.ceilingBottom + bands.wallBottom) / 2;
  } else if (band === 'floorStand') {
    bandLo = bands.floorTop; bandHi = bands.floorBottom; want = bands.floorBottom;
  } else {
    bandLo = bands.floorTop + up; bandHi = bands.floorBottom - down;
    /*
     * Centred on the floor when the floor is big enough to centre on, and
     * otherwise sitting on its front edge.
     *
     * Several rooms draw fixtures over most of their floor — the cafe's
     * counter leaves a 5px strip, the lobby 7 — and a 40px rug centred on a
     * 7px strip is three quarters wall. Aligning its bottom with the floor's
     * front edge instead is both what a floor covering does and the position
     * that overlaps the floor most.
     */
    want = Math.min((bands.floorTop + bands.floorBottom) / 2, bands.floorBottom - down);
  }

  /*
   * Containment beats the band, always.
   *
   * Several rooms draw a floor thinner than a decor piece is tall — the cafe's
   * counter leaves 5px, the cinema's seating 7 — and no anchor puts a 40px rug
   * inside a 5px band. Given the choice, the piece stays in the room and sits
   * as close to its surface as it can: a rug slightly overlapping the skirting
   * is a blemish, a rug drawn into the room next door is the bug DEC-010:159
   * exists to forbid. So the room's limits are computed first and the band's
   * preference is fitted inside them, never the other way round.
   */
  const rowLo = Math.ceil(up / ANCHOR_PX_Y);
  const rowHi = Math.max(rowLo, Math.floor((bands.height - down) / ANCHOR_PX_Y));
  /*
   * Which way to round onto the 6px lattice matters at the edges of a band.
   * A pendant rounded to the nearest row hangs 1px ABOVE the cornice in a room
   * whose cornice ends at 25; it must land on the trim or below it, never over
   * it. Feet round the other way for the same reason.
   */
  const snap = band === 'ceiling' ? Math.ceil : band === 'floorStand' ? Math.floor : Math.round;
  const clampRow = (px: number) => Math.min(rowHi, Math.max(rowLo, snap(px / ANCHOR_PX_Y)));

  let minY = Math.max(rowLo, Math.ceil(bandLo / ANCHOR_PX_Y));
  let maxY = Math.min(rowHi, Math.floor(bandHi / ANCHOR_PX_Y));
  if (maxY < minY) { minY = maxY = clampRow(want); }
  const preferredY = Math.min(maxY, Math.max(minY, clampRow(want)));

  return { minX, maxX: Math.max(minX, maxX), minY, maxY, preferredY };
}

/**
 * Where the surfaces of one room are, in room-local pixels.
 *
 * This is the thing the old code did not have and could not do without. It
 * placed against the room's bounding box, splitting it into fractions — and
 * the floor line is at 0.70 of room height in the ART-1 economy interior and
 * 0.95 in the cafe. Every piece that is supposed to touch a surface therefore
 * touched an imaginary one: flooring painted 16px of concrete onto the wall,
 * rugs floated above the floorboards, ceiling lamps hung over the cornice.
 */
export interface RoomBands {
  /** Room size in room-local pixels. */
  width: number;
  height: number;
  /** Usable interior in pixels: [inset, width - inset). */
  inset: number;
  /** Last row of the cornice. The wall band runs (ceilingBottom, wallBottom]. */
  ceilingBottom: number;
  wallBottom: number;
  /** The floor surface, inclusive both ends. Furniture stands on it. */
  floorTop: number;
  floorBottom: number;
  /** Room footprint in anchor units, for the lattice `localX`/`localY` live on. */
  unitsW: number;
  unitsH: number;
  /** False when the room's art has no measured interior and this is a guess. */
  declared: boolean;
}

/**
 * Proportions for a room whose interior has never been measured.
 *
 * Only reachable for a `defId` no longer in the catalogue — every shipped room
 * declares an `interior` and the schema requires it. Kept because a legacy save
 * can point at a room that has been removed, and DEC-010 says a piece is always
 * placed somewhere rather than deleted.
 */
const UNMEASURED = { inset: 2, ceilingBottom: 0.11, wallBottom: 0.66, floorTop: 0.70, floorBottom: 0.97 };

export function roomBandsFor(data: SimData | null, roomDefId: string | undefined): RoomBands {
  const def = data && roomDefId ? roomById(data, roomDefId) : undefined;
  const blocksW = def?.blocks.w ?? 1;
  const blocksH = def?.blocks.h ?? 1;
  const width = blocksW * BLOCK_W;
  const height = blocksH * BLOCK_H;
  const i = def?.interior;
  const base = {
    width, height,
    unitsW: blocksW * ANCHOR_UNITS_PER_BLOCK,
    unitsH: blocksH * ANCHOR_UNITS_PER_BLOCK,
  };
  if (!i) {
    return {
      ...base,
      inset: UNMEASURED.inset,
      ceilingBottom: Math.round(height * UNMEASURED.ceilingBottom),
      wallBottom: Math.round(height * UNMEASURED.wallBottom),
      floorTop: Math.round(height * UNMEASURED.floorTop),
      floorBottom: Math.round(height * UNMEASURED.floorBottom),
      declared: false,
    };
  }
  return {
    ...base,
    inset: i.inset,
    ceilingBottom: i.ceilingBottom,
    wallBottom: i.wallBottom,
    floorTop: i.floorTop,
    floorBottom: i.floorBottom,
    declared: true,
  };
}

/** A decor definition's `slotType` (wall/ceiling/floor/bed), or null without `data`. */
export function slotTypeFor(data: SimData | null, defId: string): string | null {
  if (!data) return null;
  return data.decor.find((d) => d.id === defId)?.slotType ?? null;
}

/** A decor definition's `category`, or null without `data`. */
export function categoryFor(data: SimData | null, defId: string): string | null {
  if (!data) return null;
  return data.decor.find((d) => d.id === defId)?.category ?? null;
}

/**
 * The first free anchor for a piece, on the surface its category belongs to.
 *
 * The horizontal scan runs outward from the middle in strides of one piece
 * width. Left to right put a room's furniture against its left wall and
 * stacked the rest beside it; outward in single anchor units then stacked it
 * in the middle, because one unit is 8px and an armchair is 40px wide.
 *
 * Deterministic: the same inputs always produce the same anchor. Never throws
 * and never refuses — a piece is always placed somewhere, per DEC-010's
 * "does not delete the piece" rule.
 */
export function firstFreeAnchor(
  bands: RoomBands,
  category: string | null,
  slotType: string | null,
  taken: ReadonlySet<string>,
): { x: number; y: number } {
  const { minX, maxX, minY, maxY, preferredY } = anchorRangeFor(bands, category, slotType);

  const rows = [preferredY];
  for (let y = minY; y <= maxY; y++) if (y !== preferredY) rows.push(y);

  const mid = Math.round((minX + maxX) / 2);
  const columns: number[] = [];
  const push = (x: number) => { if (x >= minX && x <= maxX && !columns.includes(x)) columns.push(x); };
  for (const stride of [decorWidthUnits(slotType), 1]) {
    push(mid);
    for (let step = stride; step <= maxX - minX; step += stride) {
      push(mid - step);
      push(mid + step);
    }
  }

  for (const y of rows) {
    for (const x of columns) {
      const key = `${x},${y}`;
      if (!taken.has(key)) return { x, y };
    }
  }
  return { x: minX, y: preferredY };
}

/**
 * Where a stored anchor actually draws, in room-local pixels.
 *
 * Total: any integer pair resolves to a rectangle on the right band and inside
 * the room. That is what lets the save format stay untouched — a piece stored
 * against the old fractional bands is repaired when it is drawn, rather than
 * migrated. The renderer calls this and nothing else.
 */
export function resolveDecorRect(
  bands: RoomBands,
  category: string | null,
  slotType: string | null,
  localX: number,
  localY: number,
): { x: number; y: number; w: number; h: number } {
  const { w, h } = decorSizePx(slotType);
  const [ax, ay] = decorAnchorFor(category);
  const range = anchorRangeFor(bands, category, slotType);
  const x = Math.min(range.maxX, Math.max(range.minX, localX)) * ANCHOR_PX_X;
  const y = Math.min(range.maxY, Math.max(range.minY, localY)) * ANCHOR_PX_Y;
  return { x: x - w * ax, y: y - h * ay, w, h };
}

/** Convenience: the `"x,y"` key `firstFreeAnchor`'s `taken` set expects. */
export function anchorKey(x: number, y: number): string {
  return `${x},${y}`;
}
