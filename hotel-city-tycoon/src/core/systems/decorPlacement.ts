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

/**
 * How far a piece's picture reaches from its anchor, in anchor units.
 *
 * HC-P1-S4. S3 picked anchors with a flat one-unit inset, which was right
 * while every piece was a small placeholder box and wrong the moment real art
 * arrived: an anchor one unit from the left wall put a 53px-wide wallpaper
 * 18px outside its own room, over the neighbouring one. An anchor is only
 * legal if the whole picture hanging off it fits in the room, so the picture's
 * reach has to be part of the placement maths.
 *
 * The numbers are the render contract (`src/render/decorArt.ts` anchors and
 * scale, applied to the manifest's declared sprite sizes) converted to anchor
 * units and rounded up. They live here in units rather than pixels because the
 * core may not import the renderer, and `tools/selftest/render.ts` cross-checks
 * the two tables against each other on every run so they cannot drift apart.
 */
export interface AnchorReach {
  left: number;
  right: number;
  up: number;
  down: number;
}

const REACH_BY_CATEGORY: Readonly<Record<string, AnchorReach>> = {
  wallpaper: { left: 4, right: 4, up: 4, down: 4 },
  wallArt: { left: 4, right: 4, up: 4, down: 4 },
  // Floor coverings are held by their bottom edge now (decorArt.ts), so their
  // reach is the same shape as a chair's rather than a poster's.
  flooring: { left: 3, right: 3, up: 7, down: 0 },
  rug: { left: 3, right: 3, up: 7, down: 0 },
  lighting: { left: 3, right: 3, up: 0, down: 5 },
  bed: { left: 4, right: 4, up: 6, down: 0 },
  seating: { left: 3, right: 3, up: 7, down: 0 },
  table: { left: 3, right: 3, up: 7, down: 0 },
  plant: { left: 3, right: 3, up: 7, down: 0 },
  luxury: { left: 3, right: 3, up: 7, down: 0 },
  // Equipment is drawn on the 96x72 wall canvas rather than the 72x72 floor
  // one — a washing machine is a tall box — so it reaches one unit further
  // sideways and one further up than a chair does.
  appliance: { left: 4, right: 4, up: 7, down: 0 },
  storage: { left: 4, right: 4, up: 7, down: 0 },
};

/** Fallback for a category with no row: the widest reach its surface can need. */
const REACH_BY_SLOT_TYPE: Readonly<Record<string, AnchorReach>> = {
  wall: { left: 4, right: 4, up: 4, down: 4 },
  ceiling: { left: 3, right: 3, up: 0, down: 5 },
  floor: { left: 3, right: 3, up: 7, down: 0 },
  bed: { left: 4, right: 4, up: 6, down: 0 },
  equipment: { left: 4, right: 4, up: 7, down: 0 },
};

/**
 * The reach of one decor definition, or null when `data` cannot say — the
 * migration's bare-`migrate()` path. Null means the old flat inset, which is
 * what every save written before this step was anchored with anyway.
 */
export function anchorReachFor(data: SimData | null, defId: string): AnchorReach | null {
  if (!data) return null;
  const def = data.decor.find((d) => d.id === defId);
  if (!def) return null;
  return REACH_BY_CATEGORY[def.category] ?? REACH_BY_SLOT_TYPE[def.slotType] ?? null;
}

/** Every category with an explicit reach — for the self-test's coverage check. */
export function reachedCategories(): string[] {
  return Object.keys(REACH_BY_CATEGORY);
}

/** The reach a category is given, for the self-test's cross-check. Null if unknown. */
export function reachForCategory(category: string): AnchorReach | null {
  return REACH_BY_CATEGORY[category] ?? null;
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

function clampInset(bound: number): number {
  // A room narrower or shorter than 2 * inset (should not happen at the
  // 1-block floor, but this keeps the scan finite either way) still gets a
  // usable single-cell range instead of an empty one.
  return Math.min(ANCHOR_EDGE_INSET, Math.max(0, Math.floor(bound / 2) - 1));
}

export interface AnchorRange {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * The anchors a piece with this reach may legally occupy in this room.
 *
 * Split out of `firstFreeAnchor` because two callers now need the same
 * arithmetic: the scan below, and `roomAnchors.ts`, which has a designed spot
 * in mind and must pull it back inside these bounds rather than trusting that
 * a number typed into a layout table fits the room it was written for.
 */
export function anchorRange(bounds: AnchorBounds, reach?: AnchorReach | null): AnchorRange {
  const insetX = clampInset(bounds.w);
  const insetY = clampInset(bounds.h);
  // A reach never shrinks the inset below the flat one, and never grows it
  // past what the room can hold: a piece too big for its room is clamped to
  // the middle of the axis it does not fit on rather than pushed outside it.
  const fit = (near: number, far: number, bound: number, flat: number): [number, number] => {
    const lo = Math.max(flat, near);
    const hi = Math.min(bound - 1 - Math.max(flat, far), bound - 1);
    return lo <= hi ? [lo, hi] : [Math.floor((bound - 1) / 2), Math.floor((bound - 1) / 2)];
  };
  const [minX, maxX] = reach
    ? fit(reach.left, reach.right, bounds.w, insetX)
    : [insetX, Math.max(insetX, bounds.w - insetX - 1)];
  const [minY, maxY] = reach
    ? fit(reach.up, reach.down, bounds.h, insetY)
    : [insetY, Math.max(insetY, bounds.h - insetY - 1)];
  return { minX, maxX, minY, maxY };
}

/**
 * The first anchor that is not already in `taken`, preferring the surface
 * band `slotType` belongs on: near the ceiling, mid-wall, or near the floor.
 * `taken` holds `"x,y"` keys already used by other pieces in the same room —
 * the caller decides what counts as "the same room" (a fresh Set per room).
 *
 * `reach` (HC-P1-S4) is how far the piece's picture extends from the anchor,
 * from `anchorReachFor`. Given it, the scan is inset by the picture's own
 * extents instead of a flat unit, so the whole piece lands inside the room.
 * Omitted, the old flat inset applies — that path is only for callers with no
 * SimData, and it is what pre-S4 saves were anchored with.
 *
 * Deterministic: the same bounds, slotType, taken set and reach always produce
 * the same anchor, in the same fixed scan order (row-major from the preferred
 * band, then the rest of the room top-to-bottom). Never throws and never
 * refuses — a piece is always placed somewhere, per DEC-010's "does not
 * delete the piece" rule; the room's own top-left corner is the last resort
 * if every anchor in bounds is somehow already taken.
 */
export function firstFreeAnchor(
  bounds: AnchorBounds,
  slotType: string | null,
  taken: ReadonlySet<string>,
  reach?: AnchorReach | null,
): { x: number; y: number } {
  const { minX, maxX, minY, maxY } = anchorRange(bounds, reach);

  const preferredY = slotType === 'ceiling' ? minY
    : slotType === 'wall' ? minY + Math.round((maxY - minY) * 0.3)
      // floor, bed, and unknown (no `data`) all default to the floor line —
      // most of the catalogue (bed/seating/table/plant/rug/luxury) stands on
      // it, and a wall piece resting there is still in bounds, just not yet
      // where a human would put it by hand.
      : maxY;

  const rows = [preferredY];
  for (let y = minY; y <= maxY; y++) if (y !== preferredY) rows.push(y);

  for (const y of rows) {
    for (let x = minX; x <= maxX; x++) {
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
