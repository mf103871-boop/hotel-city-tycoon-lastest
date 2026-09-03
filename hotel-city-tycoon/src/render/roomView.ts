/**
 * One room on screen: its art, the decor placed in it, its meter and badges.
 *
 * Every layer here reaches for a texture first and falls back to something
 * drawn. That contract is why art can land one file at a time — a flat shell
 * stood in for the room interiors until they were drawn, and a labelled box
 * stood in for decor until ART-1 arrived — and it is why a file that fails to
 * load costs a picture rather than the room.
 */
import { Container, Graphics, Sprite, Text, TilingSprite } from 'pixi.js';
import { texture, assetGeneration } from './assets.ts';
import type { Rect } from '../core/state/grid.ts';
import { roomWorldRect, BLOCK_W, BLOCK_H, orderDecor } from './layout.ts';
import { resolveDecorRect, isDecorSurface, surfaceRectFor } from '../core/systems/decorPlacement.ts';
import type { RoomBands } from '../core/systems/decorPlacement.ts';

/** Category colours, chosen to read at a glance while zoomed out. */
const SHELL = {
  guest: 0x3a2b24,
  commercial: 0x40302a,
  functional: 0x2e2420,
} as const;

const BORDER = 0x5a463c;
const METER_BG = 0x1a1210;
const METER_LOW = 0xf07858;
const METER_HIGH = 0x7fc4a0;

/**
 * PLACEHOLDER decor colours, kept as the miss fallback and nothing more.
 *
 * Until ART-1 landed this box *was* the decor: §5A allows an explicitly named
 * placeholder to prove a pipeline, and DEC-010's position/flip/save path was
 * proven on it in HC-P1-S3. The art is here now and `drawDecor` reaches for
 * the texture first. This survives because the loader's contract is that a
 * missing texture never crashes and never blanks — the same reason the rooms
 * keep their drawn shell.
 */
const DECOR_PLACEHOLDER = {
  wall: 0x6c8ebf,
  ceiling: 0x6c8ebf,
  floor: 0xd98a4f,
  bed: 0xd98a4f,
} as const;
const DECOR_PLACEHOLDER_DEFAULT = 0x8a8478;
const DECOR_PLACEHOLDER_BORDER = 0x241b14;
/** Half-extents of the placeholder box, in world pixels. */
const DECOR_PLACEHOLDER_HALF_W = 12;
const DECOR_PLACEHOLDER_HALF_H = 9;

/** One placed decor piece, as RoomView needs it. See RoomSummaryDecor. */
export interface RoomViewDecorItem {
  id: string;
  defId: string;
  category: string;
  slotType: string;
  /** Art for this piece; empty falls back to the placeholder box. */
  assetKey: string;
  localX: number;
  localY: number;
  flipX: boolean;
  zBias: number;
}

export interface RoomViewData {
  /** Asset key for the finished art. Falls back to a drawn shell when absent. */
  assetKey?: string;
  /** Where this room's own art puts its ceiling, wall and floor. */
  bands: RoomBands;
  rect: Rect;
  category: 'guest' | 'commercial' | 'functional';
  label: string;
  /** 0..1 decor meter. Functional rooms pass 1 and the meter is hidden. */
  fill: number;
  showMeter: boolean;
  hasPest: boolean;
  hasFire: boolean;
  hasGhost: boolean;
  occupants: number;
  decor: RoomViewDecorItem[];
}

export class RoomView extends Container {
  private readonly shell = new Graphics();
  private readonly art = new Sprite();
  /** DEC-010 decor, drawn above the room's own art/shell and below badges. */
  private readonly decorLayer = new Container();
  private readonly meter = new Graphics();
  private readonly caption: Text;
  private readonly badges = new Graphics();
  private readonly fireBadge = new Sprite();
  private readonly ghostBadge = new Sprite();
  private readonly pestBadge = new Sprite();
  private lastKey = '';

  constructor() {
    super();
    this.caption = new Text({
      text: '',
      style: { fontSize: 13, fill: 0xf8f0d8, fontFamily: 'system-ui, sans-serif' },
    });
    this.caption.resolution = 2;
    this.art.visible = false;
    this.addChild(this.shell, this.art, this.decorLayer, this.meter, this.caption, this.badges,
      this.fireBadge, this.ghostBadge, this.pestBadge);
  }

  /**
   * Redraw only when something actually changed. Rooms are static most of the
   * time, and re-tessellating a hundred of them every frame is the single
   * easiest way to lose 60fps.
   */
  update(data: RoomViewData, plotHeight: number): void {
    const decorKey = data.decor
      .map((p) => `${p.id}:${p.localX}:${p.localY}:${p.flipX ? 1 : 0}:${p.zBias}`)
      .join('|');
    const key = `${assetGeneration()},${data.rect.x},${data.rect.y},${data.rect.w},${data.rect.h},${data.category},` +
      `${data.fill.toFixed(2)},${data.showMeter},${data.hasPest},${data.hasFire},${data.hasGhost},${data.occupants},` +
      `${data.label},${data.assetKey ?? ''},${data.bands.floorTop},${decorKey}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const world = roomWorldRect(data.rect, plotHeight);
    this.position.set(world.x, world.y);

    const w = data.rect.w * BLOCK_W;
    const h = data.rect.h * BLOCK_H;

    // Real art when it exists, drawn shell when it does not. The game runs
    // identically either way, which is what lets art land one file at a time.
    const art = data.assetKey ? texture(data.assetKey) : null;
    if (art) {
      this.art.texture = art;
      this.art.width = w;
      this.art.height = h;
      this.art.visible = true;
      this.shell.clear();
      this.shell.roundRect(1, 1, w - 2, h - 2, 6).stroke({ width: 1, color: BORDER, alpha: 0.4 });
    } else {
      this.art.visible = false;
      this.shell.clear();
      this.shell.roundRect(1, 1, w - 2, h - 2, 6).fill(SHELL[data.category]).stroke({ width: 2, color: BORDER });
    }

    this.drawDecor(data.decor, data.bands);

    this.meter.clear();
    if (data.showMeter) {
      const mw = w - 16;
      this.meter.roundRect(8, 8, mw, 6, 3).fill(METER_BG);
      if (data.fill > 0) {
        const colour = data.fill >= 0.999 ? METER_HIGH : METER_LOW;
        this.meter.roundRect(8, 8, Math.max(3, mw * data.fill), 6, 3).fill(colour);
      }
    }

    this.caption.text = data.label;
    this.caption.position.set(8, h - 22);

    // 5A: the incident art itself, drawn on the room. The coloured circle
    // stays as the placeholder the texture contract promises on a miss.
    this.badges.clear();
    let bx = w - 18;
    const marks: Array<[Sprite, boolean, string, number]> = [
      [this.fireBadge, data.hasFire, 'event.fire.overlay', 0xf07858],
      [this.ghostBadge, data.hasGhost, 'event.ghost.overlay', 0xcabcf5],
      [this.pestBadge, data.hasPest, 'event.pest.overlay', 0x8d9a4a],
    ];
    for (const [badge, on, key, fallback] of marks) {
      badge.visible = false;
      if (!on) continue;
      const art = texture(key);
      if (art) {
        badge.texture = art;
        badge.width = 18;
        badge.height = 18;
        badge.position.set(bx - 9, 11);
        badge.visible = true;
      } else {
        this.badges.circle(bx, 20, 7).fill(fallback);
      }
      bx -= 20;
    }
    for (let i = 0; i < Math.min(data.occupants, 4); i++) {
      this.badges.circle(14 + i * 12, h - 34, 4).fill(0xe08030);
    }
  }

  /**
   * ART-1 decor at each piece's DEC-010 anchor.
   *
   * Rebuilt in full on every dirty update — the catalogue caps a room at 24
   * pieces (data/economy.json limits.maxDecorPerRoom), cheap enough that this
   * does not need RoomView's own texture-reuse tricks.
   */
  private drawDecor(pieces: RoomViewDecorItem[], bands: RoomBands): void {
    this.decorLayer.removeChildren();

    /*
     * Surface finishes first, and as a fill rather than a sprite.
     *
     * A wallpaper is the wall's finish, not an object hung on it, and the art
     * was drawn that way — a swatch that fills its own canvas edge to edge.
     * Blitting that at 53x40 in the middle of a 124x54 wall is what made it
     * read as a blank panel. Tiled across the band at 1:1 it reads as what it
     * is. Only the topmost of each kind is drawn: stacking four wallpapers
     * paints the same region four times, and one of them is enough.
     */
    for (const kind of ['wallpaper', 'flooring']) {
      const piece = pieces.filter((p) => p.category === kind).sort((a, b) => a.zBias - b.zBias).pop();
      if (!piece) continue;
      const art = piece.assetKey ? texture(piece.assetKey) : null;
      if (!art) continue;
      const rect = surfaceRectFor(bands, piece.category);
      if (rect.w <= 0 || rect.h <= 0) continue;
      const fill = new TilingSprite({ texture: art, width: rect.w, height: rect.h });
      fill.position.set(rect.x, rect.y);
      /*
       * A floor swatch is phased from the BOTTOM of its band and a wall swatch
       * from the top, so the edge of the pattern that meets the room's own trim
       * is the edge the artist drew as an edge.
       */
      if (kind === 'flooring') fill.tilePosition.y = rect.h % art.height;
      this.decorLayer.addChild(fill);
    }

    for (const piece of orderDecor(pieces)) {
      if (isDecorSurface(piece.category)) continue;
      /*
       * The rectangle comes from the placement rules, not from the stored
       * anchor directly.
       *
       * `resolveDecorRect` is the same function that chose the anchor in the
       * first place, and it is total: it puts the piece on the surface its
       * category belongs to and inside the room whatever integers it is
       * handed. Drawing at the raw anchor instead is what put concrete on the
       * wall and hung lamps over the cornice — and going through the resolver
       * is also why saves written against the old fractional bands need no
       * migration. They are repaired as they are drawn.
       */
      const rect = resolveDecorRect(bands, piece.category, piece.slotType, piece.localX, piece.localY);
      const box = new Container();
      box.position.set(rect.x + rect.w / 2, rect.y + rect.h);
      // The container flips about the contact point, so a mirrored piece keeps
      // its footing rather than sliding half its width sideways.
      box.scale.x = piece.flipX ? -1 : 1;

      const art = piece.assetKey ? texture(piece.assetKey) : null;
      if (art) {
        const sprite = new Sprite(art);
        sprite.anchor.set(0.5, 1);
        sprite.width = rect.w;
        sprite.height = rect.h;
        box.addChild(sprite);
      } else {
        const fill = DECOR_PLACEHOLDER[piece.slotType as keyof typeof DECOR_PLACEHOLDER] ?? DECOR_PLACEHOLDER_DEFAULT;
        const g = new Graphics();
        g.roundRect(
          -DECOR_PLACEHOLDER_HALF_W, -DECOR_PLACEHOLDER_HALF_H,
          DECOR_PLACEHOLDER_HALF_W * 2, DECOR_PLACEHOLDER_HALF_H * 2, 3,
        ).fill({ color: fill, alpha: 0.85 }).stroke({ width: 1, color: DECOR_PLACEHOLDER_BORDER });
        box.addChild(g);

        const label = new Text({
          text: piece.category.slice(0, 4).toUpperCase(),
          style: { fontSize: 7, fill: 0x1a130e, fontFamily: 'system-ui, sans-serif' },
        });
        label.resolution = 2;
        label.anchor.set(0.5);
        box.addChild(label);
      }

      this.decorLayer.addChild(box);
    }
  }

  reset(): void {
    this.lastKey = '';
    this.art.visible = false;
    this.visible = true;
    this.renderable = true;
  }
}
