/**
 * One piece of standing furniture, drawn in the band it shares with the people.
 *
 * `decorArt.ts` divides a room's decor into two bands. `back` is the room's
 * surfaces — wallpaper, flooring, wall art, a ceiling lamp — and nothing ever
 * walks behind those, so `RoomView` still draws them inside itself. `front` is
 * everything that stands on the floor, and the contract there has always been
 * that it "has to sort against the guests walking past it, footY sorted".
 *
 * It never did. A front piece was drawn inside its RoomView in the `roomShell`
 * layer and every character was in `characters` above it, so a guest passed in
 * front of the bed they were about to sleep in, in front of the sofa, in front
 * of every plant in the hotel. Two fixed layers cannot interleave.
 *
 * So a front piece is a view of its own now, a sibling of the characters in
 * their sortable layer, carrying the same `bandDepth` its neighbours do. The
 * geometry — which box, fitted how, clamped to which room — is unchanged and
 * still comes from `decorArt.ts`; what changed is where the result is parented
 * and that it sorts.
 */
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { texture, entryFor } from './assets.ts';
import { INK, NIGHT_TINT, nightfall } from './backdrop.ts';
import { bandDepth } from './layout.ts';

/** A front-band piece, placed and ready to draw, in world pixels. */
export interface DecorPlacement {
  /** `${roomId}:${pieceId}` — unique across the hotel, stable across frames. */
  key: string;
  assetKey: string | null;
  /** Centre of the piece's box. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The floor line the piece stands on: its box's bottom edge. */
  footY: number;
  /** Ordering inside one foot line — a rug draws under the bed on it. */
  depth: number;
  flipX: boolean;
  night: boolean;
  /** For the stand-in when a piece has no art yet. */
  slotType: string;
  category: string;
}

/** Fallback colours for a piece whose art has not been drawn yet. */
const PLACEHOLDER: Record<string, number> = {
  wall: 0x8fa8c8,
  ceiling: 0x8fa8c8,
  floor: 0xd9954e,
  bed: 0xd9954e,
};
const PLACEHOLDER_DEFAULT = 0xc3ccd8;

/**
 * A rug and the bed standing on it share a foot line, and must not share a
 * depth. Kept well under `DEPTH_CHARACTER_BIAS` so no piece of furniture ever
 * outranks a person standing on the same line.
 */
const DEPTH_STEP = 0.1;

export class DecorView extends Container {
  private readonly sprite = new Sprite();
  private placeholder: Container | null = null;
  private lastKey = '';

  constructor() {
    super();
    this.sprite.anchor.set(0.5);
    this.sprite.visible = false;
    this.addChild(this.sprite);
  }

  /**
   * Redraw only when the piece actually changed.
   *
   * Rooms are static most of the time and this runs for every piece of
   * furniture in the hotel, so the dirty key is what keeps a still hotel from
   * rebuilding its own scenery.
   */
  update(piece: DecorPlacement): void {
    // The position and the sort are cheap and must follow the camera-independent
    // truth every time, so they are set outside the dirty check.
    this.position.set(piece.x, piece.y);
    this.scale.x = piece.flipX ? -1 : 1;
    this.zIndex = bandDepth(piece.x, piece.footY, piece.depth * DEPTH_STEP);

    const key = `${piece.assetKey ?? ''}:${piece.w.toFixed(1)}x${piece.h.toFixed(1)}`
      + `:${piece.night ? 'n' : 'd'}:${piece.slotType}:${piece.category}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const art = piece.assetKey ? texture(piece.assetKey) : null;
    if (this.placeholder) {
      this.removeChild(this.placeholder);
      this.placeholder.destroy({ children: true });
      this.placeholder = null;
    }
    if (art) {
      this.sprite.texture = art;
      this.sprite.width = piece.w;
      this.sprite.height = piece.h;
      this.sprite.tint = piece.night ? NIGHT_TINT : 0xffffff;
      this.sprite.visible = true;
      return;
    }
    this.sprite.visible = false;
    this.placeholder = this.buildPlaceholder(piece);
    this.addChild(this.placeholder);
  }

  /** The stand-in for a piece with no art, in the box its art will occupy. */
  private buildPlaceholder(piece: DecorPlacement): Container {
    const holder = new Container();
    const base = PLACEHOLDER[piece.slotType] ?? PLACEHOLDER_DEFAULT;
    const fill = piece.night ? nightfall(base) : base;
    const g = new Graphics();
    g.roundRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h, 3)
      .fill({ color: fill, alpha: 0.85 })
      .stroke({ width: 1, color: piece.night ? nightfall(INK) : INK });
    holder.addChild(g);

    const label = new Text({
      text: piece.category.slice(0, 4).toUpperCase(),
      style: { fontSize: 7, fill: INK, fontFamily: 'system-ui, sans-serif' },
    });
    label.resolution = 2;
    label.anchor.set(0.5);
    holder.addChild(label);
    return holder;
  }

  /** Pooled views are reused across rooms; nothing may survive the handover. */
  reset(): void {
    this.lastKey = '';
    this.sprite.visible = false;
    this.sprite.tint = 0xffffff;
    this.scale.x = 1;
    if (this.placeholder) {
      this.removeChild(this.placeholder);
      this.placeholder.destroy({ children: true });
      this.placeholder = null;
    }
    this.visible = true;
    this.renderable = true;
  }
}

/** What the manifest says a piece's art measures, for sizing without loading it. */
export function declaredSize(assetKey: string | null): { width: number; height: number } | null {
  if (!assetKey) return null;
  const entry = entryFor(assetKey);
  return entry ? { width: entry.width, height: entry.height } : null;
}
