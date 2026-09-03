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
 * The anchors at which this piece is wholly inside the room.
 *
 * DEC-010: "كل قطعة يجب أن تقع داخل مستطيل الغرفة ... لا clipping ولا تسرب
 * إلى الغرفة المجاورة" — the *piece* must fit, and a mask is explicitly not
 * the way to make it. That rule was unenforceable until ART-1: a piece was a
 * 24x18 placeholder box, so any anchor one unit from the edge looked fine. A
 * real armchair is 40px wide and a real bed 57px, and the same anchor hangs
 * them halfway into the room next door.
 *
 * So the inset is the piece's own reach from its anchor, not a flat 1/16
 * block — the flat inset stays as the floor under it.
 */
/** A piece's drawn width in whole anchor units — how far apart two of them
 * have to sit before they read as two things rather than one smudge. */
export function decorWidthUnits(slotType: string | null): number {
  const [pw] = (slotType ? SLOT_SIZE[slotType] : undefined) ?? SLOT_SIZE_DEFAULT;
  return Math.max(1, Math.ceil((pw * DECOR_ART_SCALE) / ANCHOR_PX_X));
}

export function anchorRangeFor(
  bounds: AnchorBounds,
  category: string | null,
  slotType: string | null,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const [pw, ph] = (slotType ? SLOT_SIZE[slotType] : undefined) ?? SLOT_SIZE_DEFAULT;
  const [ax, ay] = decorAnchorFor(category);
  const w = pw * DECOR_ART_SCALE;
  const h = ph * DECOR_ART_SCALE;
  const roomW = bounds.w * ANCHOR_PX_X;
  const roomH = bounds.h * ANCHOR_PX_Y;

  // How far the sprite reaches from its anchor, on each side.
  const left = w * ax, right = w * (1 - ax);
  const up = h * ay, down = h * (1 - ay);

  const inset = clampInset(bounds.w);
  const insetY = clampInset(bounds.h);
  const span = (reachLo: number, reachHi: number, room: number, unit: number, units: number, flat: number) => {
    const lo = Math.max(flat, Math.ceil(reachLo / unit));
    const hi = Math.min(units - 1 - flat, Math.floor((room - reachHi) / unit));
    // A piece too big for the room still gets one legal anchor rather than an
    // empty range: better centred and overhanging than not placed at all.
    return hi >= lo ? { lo, hi } : { lo: Math.floor((units - 1) / 2), hi: Math.floor((units - 1) / 2) };
  };
  const x = span(left, right, roomW, ANCHOR_PX_X, bounds.w, inset);
  const y = span(up, down, roomH, ANCHOR_PX_Y, bounds.h, insetY);
  return { minX: x.lo, maxX: x.hi, minY: y.lo, maxY: y.hi };
}

export interface AnchorBounds {
  /** Room width in anchor units. */
  w: number;
  /** Room height in anchor units. */
  h: number;
}

/**
 * The room's footprint in anchor units, from its definition.
 *
 * Falls back to the smallest legal room (1x1 block) when the room's
 * definition cannot be found — an unknown `data`, or a `defId` a legacy save
 * points at that no longer exists. That fallback is always safe: no real
 * room is smaller than 1x1 block, so an anchor valid there is valid anywhere.
 */
export function anchorBoundsFor(data: SimData | null, roomDefId: string | undefined): AnchorBounds {
  const def = data && roomDefId ? roomById(data, roomDefId) : undefined;
  const w = def?.blocks.w ?? 1;
  const h = def?.blocks.h ?? 1;
  return { w: w * ANCHOR_UNITS_PER_BLOCK, h: h * ANCHOR_UNITS_PER_BLOCK };
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

function clampInset(bound: number): number {
  // A room narrower or shorter than 2 * inset (should not happen at the
  // 1-block floor, but this keeps the scan finite either way) still gets a
  // usable single-cell range instead of an empty one.
  return Math.min(ANCHOR_EDGE_INSET, Math.max(0, Math.floor(bound / 2) - 1));
}

/**
 * The first free anchor for a piece, preferring the surface band its
 * `slotType` belongs on: near the ceiling, mid-wall, or near the floor.
 * `taken` holds `"x,y"` keys already used by other pieces in the same room —
 * the caller decides what counts as "the same room" (a fresh Set per room).
 *
 * The horizontal scan runs *outward from the middle* rather than left to
 * right. Left-to-right put the first piece against the left wall and stacked
 * the next ones beside it, which was invisible while a piece was a 24x18 box
 * and obvious the moment ART-1 gave them real widths: a room's furniture piled
 * into its left quarter with the first piece half in the room next door. From
 * the middle out, the pieces a player is most likely to own spread across the
 * room, and the anchors nearest the walls are used last.
 *
 * Deterministic: the same inputs always produce the same anchor, in the same
 * fixed order. Never throws and never refuses — a piece is always placed
 * somewhere, per DEC-010's "does not delete the piece" rule.
 */
export function firstFreeAnchor(
  bounds: AnchorBounds,
  category: string | null,
  slotType: string | null,
  taken: ReadonlySet<string>,
): { x: number; y: number } {
  const { minX, maxX, minY, maxY } = anchorRangeFor(bounds, category, slotType);

  const preferredY = slotType === 'ceiling' ? minY
    : slotType === 'wall' ? minY + Math.round((maxY - minY) * 0.3)
      // floor, bed, and unknown (no `data`) all default to the floor line —
      // most of the catalogue (bed/seating/table/plant/rug/luxury) stands on
      // it, and a wall piece resting there is still in bounds, just not yet
      // where a human would put it by hand.
      : maxY;

  const rows = [preferredY];
  for (let y = minY; y <= maxY; y++) if (y !== preferredY) rows.push(y);

  /*
   * Middle first, then outward — in strides of one piece width before filling
   * in between.
   *
   * Stepping outward one anchor unit at a time is only 8px, and a piece is
   * 40px wide: the first four pieces a player bought landed almost exactly on
   * top of each other. A stride of the piece's own width spreads them across
   * the room first, and the finer positions stay available afterwards so the
   * room still holds its full decor cap.
   */
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
  return { x: minX, y: minY };
}

/** Convenience: the `"x,y"` key `firstFreeAnchor`'s `taken` set expects. */
export function anchorKey(x: number, y: number): string {
  return `${x},${y}`;
}
