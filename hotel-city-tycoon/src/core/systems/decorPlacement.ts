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

/**
 * The first anchor that is not already in `taken`, preferring the surface
 * band `slotType` belongs on: near the ceiling, mid-wall, or near the floor.
 * `taken` holds `"x,y"` keys already used by other pieces in the same room —
 * the caller decides what counts as "the same room" (a fresh Set per room).
 *
 * Deterministic: the same bounds, slotType and taken set always produce the
 * same anchor, in the same fixed scan order (row-major from the preferred
 * band, then the rest of the room top-to-bottom). Never throws and never
 * refuses — a piece is always placed somewhere, per DEC-010's "does not
 * delete the piece" rule; the room's own top-left corner is the last resort
 * if every anchor in bounds is somehow already taken.
 */
export function firstFreeAnchor(
  bounds: AnchorBounds,
  slotType: string | null,
  taken: ReadonlySet<string>,
): { x: number; y: number } {
  const insetX = clampInset(bounds.w);
  const insetY = clampInset(bounds.h);
  const minX = insetX;
  const maxX = Math.max(minX, bounds.w - insetX - 1);
  const minY = insetY;
  const maxY = Math.max(minY, bounds.h - insetY - 1);

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
