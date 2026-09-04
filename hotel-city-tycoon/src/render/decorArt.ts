/**
 * How a placed decor piece hangs off its DEC-010 anchor — HC-P1-S4.
 *
 * DEC-010 (docs/HC-P1-S1-PLACEMENT-DECISION.md) says *where* a piece sits:
 * one anchor point in room-local units. It says nothing about how the picture
 * relates to that point, and a picture needs three more facts before it can
 * be drawn: which corner of it the anchor holds, how big it is relative to
 * the room, and what draws in front of what.
 *
 * Those three come from the delivered art itself. `docs/ART-1_METADATA.md` is
 * Codex's own description of the ten ART-1 pieces, and every one of them falls
 * into a per-category pattern: a bed and a chair are held by the middle of
 * their feet, a poster by its centre, a hanging lamp by the top of its cord.
 * This file is that table, plus the ordering rule it implies. It is plain
 * maths — no Pixi — so `tools/selftest/render.ts` can prove it without a
 * browser, which matters because DEC-009 keeps the canvas out of CI.
 *
 * It is deliberately *not* in `data/`: those files are the balance source of
 * truth, and an anchor is a property of a drawing, not of the economy.
 */

/**
 * Which band of the room a piece draws in.
 *
 * `back` is the room's surfaces — wallpaper, flooring, wall art, a ceiling
 * lamp. Nothing ever walks behind them. `front` is everything that stands in
 * the room and therefore has to sort against the guests walking past it;
 * `docs/ART-1_METADATA.md` calls this layer `room.characters`, footY sorted.
 */
export type DecorBand = 'back' | 'front';

export interface DecorArtSpec {
  /** Sprite anchor X, 0..1. Always 0.5 today: every piece is held mid-width. */
  anchorX: number;
  /** Sprite anchor Y, 0..1. 0 hangs from the anchor, 1 stands on it. */
  anchorY: number;
  band: DecorBand;
  /**
   * Tie-break within a band for pieces at the same height, low draws first.
   * Wallpaper sits behind a poster on the same wall; a rug lies under the
   * chair standing on it.
   */
  depth: number;
}

/**
 * Decor is drawn at the same fraction of its declared size as characters
 * (`characterView.ts`), and for the same reason: the art is drawn at
 * character scale, while a room block is only 128x96 world pixels. At 1:1 a
 * single armchair fills three quarters of a room — see
 * `docs/art-1-shots/compose-1to1.png` against `compose-0.55.png`, which is
 * this number.
 */
export const DECOR_ART_SCALE = 0.55;

/**
 * Per-category art contract, transcribed from `docs/ART-1_METADATA.md`.
 *
 * Keyed by `category` rather than by `defId` because the catalogue's 77 items
 * are ten categories of the same ten shapes: every bed is held by its feet,
 * every wallpaper by its centre. A future piece that genuinely breaks its
 * category's pattern needs its own row here, and the fallback below keeps it
 * on screen until it gets one.
 */
const BY_CATEGORY: Readonly<Record<string, DecorArtSpec>> = {
  // --- room surfaces, behind everything that stands in the room ----------
  wallpaper: { anchorX: 0.5, anchorY: 0.5, band: 'back', depth: 0 },
  // A floor covering lies ON its anchor, like everything else that touches
  // the ground. ART-1 held flooring and rugs by their centre, which put them
  // half a sprite up the wall: the reach that keeps a centred piece inside a
  // one-block room caps its anchor at 11 units, and the floor line of that
  // room is 14. Held by the bottom edge, a rug lands on the floor by
  // construction, and the art is drawn resting on the bottom of its canvas.
  flooring: { anchorX: 0.5, anchorY: 1, band: 'back', depth: 1 },
  wallArt: { anchorX: 0.5, anchorY: 0.5, band: 'back', depth: 2 },
  lighting: { anchorX: 0.5, anchorY: 0, band: 'back', depth: 3 },
  // --- things standing in the room, sorted by how low they sit ----------
  rug: { anchorX: 0.5, anchorY: 1, band: 'front', depth: 0 },
  bed: { anchorX: 0.5, anchorY: 1, band: 'front', depth: 1 },
  table: { anchorX: 0.5, anchorY: 1, band: 'front', depth: 1 },
  seating: { anchorX: 0.5, anchorY: 1, band: 'front', depth: 1 },
  plant: { anchorX: 0.5, anchorY: 1, band: 'front', depth: 1 },
  luxury: { anchorX: 0.5, anchorY: 1, band: 'front', depth: 1 },
  // --- service-room equipment, standing on the floor like the rest ---------
  // A washer and a linen shelf are held by the middle of their base for the
  // same reason a chair is: what the player positions is where the thing
  // touches the ground, and the picture hangs off that.
  appliance: { anchorX: 0.5, anchorY: 1, band: 'front', depth: 1 },
  storage: { anchorX: 0.5, anchorY: 1, band: 'front', depth: 1 },
};

/**
 * Last resort for a category this file has never heard of: place it by the
 * surface its `slotType` already promises. A wall piece is centred on the
 * wall, a ceiling piece hangs, anything else stands on its anchor. Wrong in
 * detail, never wrong enough to throw the piece out of the room.
 */
const BY_SLOT_TYPE: Readonly<Record<string, DecorArtSpec>> = {
  wall: { anchorX: 0.5, anchorY: 0.5, band: 'back', depth: 2 },
  ceiling: { anchorX: 0.5, anchorY: 0, band: 'back', depth: 3 },
  floor: { anchorX: 0.5, anchorY: 1, band: 'front', depth: 1 },
  bed: { anchorX: 0.5, anchorY: 1, band: 'front', depth: 1 },
  equipment: { anchorX: 0.5, anchorY: 1, band: 'front', depth: 1 },
};

const DEFAULT_SPEC: DecorArtSpec = { anchorX: 0.5, anchorY: 1, band: 'front', depth: 1 };

/** The art contract for one piece. Never throws; always returns something drawable. */
export function decorArtSpec(category: string, slotType: string): DecorArtSpec {
  return BY_CATEGORY[category] ?? BY_SLOT_TYPE[slotType] ?? DEFAULT_SPEC;
}

/** Every category this file knows by name — for the coverage check in the self-test. */
export function knownDecorCategories(): string[] {
  return Object.keys(BY_CATEGORY);
}

/** The size a piece is drawn at, from the size its manifest entry declares. */
export function decorDrawSize(declaredW: number, declaredH: number): { w: number; h: number } {
  return { w: declaredW * DECOR_ART_SCALE, h: declaredH * DECOR_ART_SCALE };
}

/** The subset of a placed piece this module needs to order it. */
export interface DecorOrderable {
  id: string;
  category: string;
  slotType: string;
  localY: number;
  zBias: number;
}

/**
 * Back-to-front draw order.
 *
 * Bands first, so nothing standing in the room can slide behind the wallpaper.
 * Inside `back`, the fixed depth order of the surfaces themselves. Inside
 * `front`, the perspective rule: the lower a piece sits in the room, the
 * nearer the viewer it is, so it draws later — `localY` ascending. `zBias`
 * comes after both as the save's own manual override (always 0 today: nothing
 * writes it yet), and `id` last so the order is total and therefore stable
 * across re-renders, which is what keeps RoomView's dirty-key cache honest.
 */
export function compareDecorDraw(a: DecorOrderable, b: DecorOrderable): number {
  const sa = decorArtSpec(a.category, a.slotType);
  const sb = decorArtSpec(b.category, b.slotType);
  if (sa.band !== sb.band) return sa.band === 'back' ? -1 : 1;
  if (sa.band === 'back') {
    if (sa.depth !== sb.depth) return sa.depth - sb.depth;
    if (a.localY !== b.localY) return a.localY - b.localY;
  } else {
    if (a.localY !== b.localY) return a.localY - b.localY;
    if (sa.depth !== sb.depth) return sa.depth - sb.depth;
  }
  if (a.zBias !== b.zBias) return a.zBias - b.zBias;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** A drawn piece's box in room-local pixels. */
export interface DecorBox {
  left: number;
  top: number;
  w: number;
  h: number;
}

/**
 * The box a piece is actually drawn in, never outside its own room.
 *
 * Placement keeps new pieces inside the room by construction
 * (`anchorReachFor` in decorPlacement.ts), so for anything placed since
 * HC-P1-S4 this returns the box unchanged. It exists for the pieces it cannot
 * promise that for: saves anchored by the S3 build, whose flat one-unit inset
 * put a 53px-wide wallpaper 18px into the room next door, and any piece whose
 * art turns out bigger than the room it is in. A room draws its own decor and
 * nothing else's, so the last word on that belongs here rather than in a
 * migration nobody planned.
 *
 * A piece too big for the axis is centred on it — the least wrong answer, and
 * visibly wrong enough to be reported rather than hidden.
 */
export function clampDecorBox(box: DecorBox, roomW: number, roomH: number): DecorBox {
  const axis = (near: number, size: number, bound: number): number => {
    if (size >= bound) return (bound - size) / 2;
    return Math.min(Math.max(near, 0), bound - size);
  };
  return {
    left: axis(box.left, box.w, roomW),
    top: axis(box.top, box.h, roomH),
    w: box.w,
    h: box.h,
  };
}

/** The unclamped box a piece's anchor and art imply, in room-local pixels. */
export function decorBox(
  anchorPx: { x: number; y: number },
  size: { w: number; h: number },
  spec: DecorArtSpec,
): DecorBox {
  return { left: anchorPx.x - size.w * spec.anchorX, top: anchorPx.y - size.h * spec.anchorY, w: size.w, h: size.h };
}
