/**
 * Placeholder room graphics.
 *
 * Flat coloured shells with a decor meter and hazard badges. They are here so
 * that layout, camera, culling and interaction can be built and felt before
 * any art exists — the real room sprites replace this in P3b, and nothing
 * outside this file should need to change when they do.
 */
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { texture, assetGeneration, entryFor } from './assets.ts';
import type { Rect } from '../core/state/grid.ts';
import { roomWorldRect, BLOCK_W, BLOCK_H, anchorToLocalPx } from './layout.ts';
import {
  decorArtSpec, decorDrawSize, compareDecorDraw, decorBox, clampDecorBox,
} from './decorArt.ts';
import type { DecorBox } from './decorArt.ts';

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
 * PLACEHOLDER decor colours — a technical stand-in, not a palette decision.
 *
 * Since HC-P1-S4 a piece is drawn with its real ART-1 texture whenever one is
 * loaded; this box is what the other 67 catalogue entries still get, and what
 * any piece gets while its bundle is still loading. §5A forbids letting a
 * placeholder pass as finished art, so it stays a flat labelled box — but it
 * is now laid out by the same anchor and scale contract as the real sprite
 * (decorArt.ts), so it stands where its art will stand and takes up the room
 * its art will take up.
 */
const DECOR_PLACEHOLDER = {
  wall: 0x6c8ebf,
  ceiling: 0x6c8ebf,
  floor: 0xd98a4f,
  bed: 0xd98a4f,
} as const;
const DECOR_PLACEHOLDER_DEFAULT = 0x8a8478;
const DECOR_PLACEHOLDER_BORDER = 0x241b14;
/** Fallback box size when the piece has no manifest entry to size it from. */
const DECOR_PLACEHOLDER_W = 24;
const DECOR_PLACEHOLDER_H = 18;

/** One placed decor piece, as RoomView needs it. See RoomSummaryDecor. */
export interface RoomViewDecorItem {
  id: string;
  defId: string;
  category: string;
  slotType: string;
  /** ART-1 art for this piece. Empty or unloaded falls back to the placeholder. */
  assetKey: string;
  localX: number;
  localY: number;
  flipX: boolean;
  zBias: number;
}

export interface RoomViewData {
  /** Asset key for the finished art. Falls back to a drawn shell when absent. */
  assetKey?: string;
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
      .map((p) => `${p.id}:${p.assetKey}:${p.localX}:${p.localY}:${p.flipX ? 1 : 0}:${p.zBias}`)
      .join('|');
    const key = `${assetGeneration()},${data.rect.x},${data.rect.y},${data.rect.w},${data.rect.h},${data.category},` +
      `${data.fill.toFixed(2)},${data.showMeter},${data.hasPest},${data.hasFire},${data.hasGhost},${data.occupants},` +
      `${data.label},${data.assetKey ?? ''},${decorKey}`;
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

    this.drawDecor(data.decor, w, h);

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
   * The room's decor, at each piece's DEC-010 anchor.
   *
   * HC-P1-S4: real ART-1 art when the texture is loaded, the labelled
   * placeholder box when it is not — the catalogue still has 67 pieces Codex
   * has not drawn. Both paths use the same anchor, scale and ordering
   * contract (decorArt.ts), so a piece does not jump when its art lands.
   *
   * Rebuilt in full on every dirty update — the catalogue caps a room at 24
   * pieces (data/economy.json limits.maxDecorPerRoom), cheap enough that this
   * does not need RoomView's own texture-reuse tricks.
   */
  private drawDecor(pieces: RoomViewDecorItem[], roomW: number, roomH: number): void {
    this.decorLayer.removeChildren();
    // Pixi draws children back-to-front in addChild order, so the comparator's
    // "lowest first" is literally the draw order.
    const ordered = [...pieces].sort(compareDecorDraw);
    for (const piece of ordered) {
      const spec = decorArtSpec(piece.category, piece.slotType);
      const art = piece.assetKey ? texture(piece.assetKey) : null;
      // Sized from what the manifest declares, not from the texture: a file
      // that ships one pixel off must not shift the room's layout.
      const entry = piece.assetKey ? entryFor(piece.assetKey) : undefined;
      const size = entry
        ? decorDrawSize(entry.width, entry.height)
        : art
          ? decorDrawSize(art.width, art.height)
          : { w: DECOR_PLACEHOLDER_W, h: DECOR_PLACEHOLDER_H };
      // A room draws its own decor and nobody else's, whatever anchor an older
      // save handed it (decorArt.ts's clampDecorBox).
      const box = clampDecorBox(
        decorBox(anchorToLocalPx(piece.localX, piece.localY), size, spec),
        roomW, roomH,
      );

      const holder = new Container();
      // Mirroring around the box's own centre is what flipX means: the piece
      // turns in place, it does not slide.
      holder.position.set(box.left + box.w / 2, box.top + box.h / 2);
      holder.scale.x = piece.flipX ? -1 : 1;

      if (art) {
        const sprite = new Sprite(art);
        sprite.anchor.set(0.5);
        sprite.width = box.w;
        sprite.height = box.h;
        holder.addChild(sprite);
      } else {
        holder.addChild(this.decorPlaceholder(piece, box));
      }

      this.decorLayer.addChild(holder);
    }
  }

  /** The stand-in for a piece with no art, in the box its art will occupy. */
  private decorPlaceholder(piece: RoomViewDecorItem, box: DecorBox): Container {
    const holder = new Container();
    const fill = DECOR_PLACEHOLDER[piece.slotType as keyof typeof DECOR_PLACEHOLDER] ?? DECOR_PLACEHOLDER_DEFAULT;
    const g = new Graphics();
    g.roundRect(-box.w / 2, -box.h / 2, box.w, box.h, 3)
      .fill({ color: fill, alpha: 0.85 })
      .stroke({ width: 1, color: DECOR_PLACEHOLDER_BORDER });
    holder.addChild(g);

    const label = new Text({
      text: piece.category.slice(0, 4).toUpperCase(),
      style: { fontSize: 7, fill: 0x1a130e, fontFamily: 'system-ui, sans-serif' },
    });
    label.resolution = 2;
    label.anchor.set(0.5);
    holder.addChild(label);
    return holder;
  }

  reset(): void {
    this.lastKey = '';
    this.art.visible = false;
    this.visible = true;
    this.renderable = true;
  }
}
