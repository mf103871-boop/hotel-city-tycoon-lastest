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
import { INK, NIGHT_TINT, nightfall } from './backdrop.ts';
import type { Rect } from '../core/state/grid.ts';
import { roomWorldRect, BLOCK_W, BLOCK_H, anchorToLocalPx } from './layout.ts';
import {
  decorArtSpec, fitDecorSize, compareDecorDraw, decorBox, clampDecorBox,
} from './decorArt.ts';
import type { DecorBox } from './decorArt.ts';
import type { DecorPlacement } from './decorView.ts';

/**
 * Category colours, chosen to read at a glance while zoomed out.
 *
 * Pastels from the art palette rather than the three warm browns that used to
 * be here. Those were chosen when the renderer drew rooms on a warm charcoal
 * clear colour; the world behind them is now sky, and a brown box on a pastel
 * street was the wrong picture even for a room with no art yet.
 */
const SHELL = {
  guest: 0xfbe7b8,        // wallCream
  commercial: 0xc9c2ec,   // wallLilac
  functional: 0xbfe0fa,   // wallSky
} as const;

const BORDER = INK;

/**
 * The decor meter.
 *
 * The track was a near-black warm brown from a palette the art no longer
 * shares — the darkest thing in the picture, painted across the lightest.
 * Ink at 22% was the first repair and it was not one: a translucent track
 * takes the wall's own colour, so the fill was measured against a different
 * ground in every room and landed at 1.01:1 on rose and teal. A meter whose
 * fill is the same luminance as its track is a blank strip.
 *
 * It is solid ink now — one ground, every room — so the fills hold 5.5:1
 * (coral) and 7.6:1 (green) against it wherever the bar is drawn, well past
 * WCAG 1.4.11's 3:1 for a graphic. The rim is what keeps the bar itself
 * visible on the four dark walls, where ink on ink is only 2.2:1.
 */
const METER_BG = INK;
const METER_RIM = 0xdde2df;    // warmWhite
const METER_LOW = 0xed5c47;    // coral
const METER_HIGH = 0x5bb877;   // green

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
  wall: 0x8fa8c8,     // wallSlate
  ceiling: 0x8fa8c8,
  floor: 0xd9954e,    // wood
  bed: 0xd9954e,
} as const;
const DECOR_PLACEHOLDER_DEFAULT = 0xc3ccd8;   // metal
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
  /** The box the room's plan gives this spot, in room-local pixels. 0 = none. */
  boxW: number;
  boxH: number;
  /** The building's own furniture rather than something the player bought. */
  builtIn: boolean;
}

export interface RoomViewData {
  /** The room's own id, so the furniture it hands the scene can be keyed by it. */
  id: string;
  /** Asset key for the finished art. Falls back to a drawn shell when absent. */
  assetKey?: string;
  /**
   * That picture already has the night wash baked into it.
   *
   * False while the hotel is shut means the room is showing its `dirty`
   * picture, which is only drawn for daylight — so the renderer washes it,
   * rather than letting the one room that needs cleaning be the only lit thing
   * in a dark hotel.
   */
  artIsNight?: boolean;
  /**
   * The room's own furniture that stands in front of the people — a reception
   * desk, a bar counter. Drawn by the scene in `LAYER.roomFront`, not here:
   * inside the RoomView it would be under every character, which is the whole
   * reason it was split out of the room's one picture.
   */
  frontKey?: string;
  /**
   * Transparent roach layer, stretched over the room's own art. Empty when the
   * room is clean. It is a separate picture rather than a fifth room variant
   * so a room can be dirty and infested at the same time without a combination
   * of the two having to be drawn.
   */
  pestKey?: string;
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
  /**
   * The hotel is shut, so this room is showing its `*_night` picture.
   *
   * Decor is day-lit art composited on top of that picture, so without this a
   * fully lit sofa stood in a dark room. The room's own art needs nothing —
   * the wash is already baked into the file.
   */
  night?: boolean;
}

export class RoomView extends Container {
  private readonly shell = new Graphics();
  private readonly art = new Sprite();
  /** The roach layer, over the room's own art and under its decor. */
  private readonly pestArt = new Sprite();
  /** DEC-010 decor, drawn above the room's own art/shell and below badges. */
  private readonly decorLayer = new Container();
  /**
   * The room's standing furniture, measured but not drawn here.
   *
   * The scene reads this after `update` and draws the pieces in the band the
   * characters share (`decorView.ts`). Rewritten in place rather than
   * reallocated: `update` is dirty-key guarded, so a still hotel touches this
   * array once and then never again.
   */
  readonly front: DecorPlacement[] = [];
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
      // On the pastel fallback shell, not on the art: ink, not cream.
      style: { fontSize: 13, fill: INK, fontFamily: 'system-ui, sans-serif' },
    });
    this.caption.resolution = 2;
    this.art.visible = false;
    this.pestArt.visible = false;
    this.addChild(this.shell, this.art, this.pestArt, this.decorLayer, this.meter, this.caption,
      this.badges, this.fireBadge, this.ghostBadge, this.pestBadge);
  }

  /**
   * Redraw only when something actually changed. Rooms are static most of the
   * time, and re-tessellating a hundred of them every frame is the single
   * easiest way to lose 60fps.
   */
  update(data: RoomViewData, plotHeight: number): void {
    const decorKey = data.decor
      .map((p) => `${p.id}:${p.assetKey}:${p.localX}:${p.localY}:${p.flipX ? 1 : 0}:${p.zBias}`
        + `:${p.boxW}x${p.boxH}`)
      .join('|');
    const key = `${assetGeneration()},${data.rect.x},${data.rect.y},${data.rect.w},${data.rect.h},${data.category},` +
      `${data.fill.toFixed(2)},${data.showMeter},${data.hasPest},${data.hasFire},${data.hasGhost},${data.occupants},` +
      `${data.label},${data.assetKey ?? ''},${data.pestKey ?? ''},${data.night ? 'n' : 'd'},` +
      `${data.artIsNight ? 'N' : 'D'},${decorKey}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const world = roomWorldRect(data.rect, plotHeight);
    this.position.set(world.x, world.y);

    const w = data.rect.w * BLOCK_W;
    const h = data.rect.h * BLOCK_H;

    // Real art when it exists, drawn shell when it does not. The game runs
    // identically either way, which is what lets art land one file at a time.
    const art = data.assetKey ? texture(data.assetKey) : null;
    const night = data.night === true;
    if (art) {
      this.art.texture = art;
      this.art.width = w;
      this.art.height = h;
      // Only a picture that is not already a night picture needs washing.
      this.art.tint = night && !data.artIsNight ? NIGHT_TINT : 0xffffff;
      this.art.visible = true;
      // No stroke over finished art: every room image carries its own dark
      // frame (tools/art/hcstyle.py's room_frame), and a second brown outline
      // on top of it read as a seam between the room and itself.
      this.shell.clear();
    } else {
      this.art.visible = false;
      this.shell.clear();
      const shell = SHELL[data.category];
      this.shell.roundRect(1, 1, w - 2, h - 2, 6)
        .fill(night ? nightfall(shell) : shell)
        .stroke({ width: 2, color: night ? nightfall(BORDER) : BORDER });
    }

    const pest = data.pestKey ? texture(data.pestKey) : null;
    if (pest) {
      this.pestArt.texture = pest;
      this.pestArt.width = w;
      this.pestArt.height = h;
      // The roach layer is one picture for both day and night, so it always
      // needs the wash when the rest of the room has had it.
      this.pestArt.tint = night ? NIGHT_TINT : 0xffffff;
      this.pestArt.visible = true;
    } else {
      this.pestArt.visible = false;
    }

    this.drawDecor(data.decor, w, h, night, data.id, world.x, world.y);

    this.meter.clear();
    if (data.showMeter) {
      const mw = w - 16;
      const rim = night ? nightfall(METER_RIM) : METER_RIM;
      this.meter.roundRect(7, 7, mw + 2, 8, 4).fill({ color: rim, alpha: 0.55 });
      this.meter.roundRect(8, 8, mw, 6, 3).fill(night ? nightfall(METER_BG) : METER_BG);
      if (data.fill > 0) {
        const base = data.fill >= 0.999 ? METER_HIGH : METER_LOW;
        this.meter.roundRect(8, 8, Math.max(3, mw * data.fill), 6, 3)
          .fill(night ? nightfall(base) : base);
      }
    }

    // The room's name is a placeholder affordance: it tells the player what an
    // untextured box is. Over finished art it is a debug label sitting across
    // the floor of every room in the hotel, so it goes when the art arrives.
    this.caption.text = art ? '' : data.label;
    this.caption.position.set(8, h - 22);

    // 5A: the incident art itself, drawn on the room. The coloured circle
    // stays as the placeholder the texture contract promises on a miss.
    this.badges.clear();
    let bx = w - 18;
    const marks: Array<[Sprite, boolean, string, number]> = [
      [this.fireBadge, data.hasFire, 'event.fire.overlay', 0xed5c47],
      [this.ghostBadge, data.hasGhost, 'event.ghost.overlay', 0xa7a1d3],
      [this.pestBadge, data.hasPest, 'event.pest.overlay', 0x77cb8d],
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
        this.badges.circle(bx, 20, 7).fill(fallback).stroke({ width: 1.5, color: INK });
      }
      bx -= 20;
    }
    // Gold with an ink rim: an unrimmed orange dot vanished against the warm
    // walls of half the catalogue and glared against the cool half.
    for (let i = 0; i < Math.min(data.occupants, 4); i++) {
      this.badges.circle(14 + i * 12, h - 34, 4)
        .fill(0xf5c24d)
        .stroke({ width: 1, color: INK });
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
   * Only the `back` band is drawn here. A `front` piece stands on the floor
   * and has to sort against the people walking past it, which two fixed
   * layers cannot do, so it is measured here and handed to the scene as a
   * `DecorPlacement` to be drawn in the band the characters live in
   * (`decorView.ts`). The geometry is identical either way — the same anchor,
   * the same fitted box, the same clamp to the room — so a piece does not
   * move when it changes band.
   *
   * Rebuilt in full on every dirty update — the catalogue caps a room at 24
   * pieces (data/economy.json limits.maxDecorPerRoom), cheap enough that this
   * does not need RoomView's own texture-reuse tricks.
   */
  private drawDecor(pieces: RoomViewDecorItem[], roomW: number, roomH: number,
                    night: boolean, roomId: string, worldX: number, worldY: number): void {
    this.decorLayer.removeChildren();
    this.front.length = 0;
    // Pixi draws children back-to-front in addChild order, so the comparator's
    // "lowest first" is literally the draw order.
    const ordered = [...pieces].sort(compareDecorDraw);
    for (const piece of ordered) {
      const spec = decorArtSpec(piece.category, piece.slotType);
      const art = piece.assetKey ? texture(piece.assetKey) : null;
      // Sized from what the manifest declares, not from the texture: a file
      // that ships one pixel off must not shift the room's layout.
      const entry = piece.assetKey ? entryFor(piece.assetKey) : undefined;
      // Fitted into the room's own box for this spot when the plan designed
      // one (roomAnchors.ts) — that is what makes a piece the size the room
      // has space for rather than the size every piece in the game is.
      const fitBox = piece.boxW > 0 && piece.boxH > 0
        ? { w: piece.boxW, h: piece.boxH }
        : null;
      const size = entry
        ? fitDecorSize(entry.width, entry.height, fitBox)
        : art
          ? fitDecorSize(art.width, art.height, fitBox)
          : fitBox
            ? { w: Math.min(DECOR_PLACEHOLDER_W, fitBox.w), h: Math.min(DECOR_PLACEHOLDER_H, fitBox.h) }
            : { w: DECOR_PLACEHOLDER_W, h: DECOR_PLACEHOLDER_H };
      // A room draws its own decor and nobody else's, whatever anchor an older
      // save handed it (decorArt.ts's clampDecorBox).
      const box = clampDecorBox(
        decorBox(anchorToLocalPx(piece.localX, piece.localY), size, spec),
        roomW, roomH,
      );

      if (spec.band === 'front') {
        // Measured here, drawn by the scene among the people. The world
        // position is the room's own origin plus the box the room measured,
        // so a piece is in exactly the place it was before it changed band.
        this.front.push({
          key: `${roomId}:${piece.id}`,
          assetKey: piece.assetKey ?? null,
          x: worldX + box.left + box.w / 2,
          y: worldY + box.top + box.h / 2,
          w: box.w,
          h: box.h,
          footY: worldY + box.top + box.h,
          depth: spec.depth,
          flipX: piece.flipX,
          night,
          slotType: piece.slotType,
          category: piece.category,
        });
        continue;
      }

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
        if (night) sprite.tint = NIGHT_TINT;
        holder.addChild(sprite);
      } else {
        holder.addChild(this.decorPlaceholder(piece, box, night));
      }

      this.decorLayer.addChild(holder);
    }
  }

  /** The stand-in for a piece with no art, in the box its art will occupy. */
  private decorPlaceholder(piece: RoomViewDecorItem, box: DecorBox, night: boolean): Container {
    const holder = new Container();
    const base = DECOR_PLACEHOLDER[piece.slotType as keyof typeof DECOR_PLACEHOLDER] ?? DECOR_PLACEHOLDER_DEFAULT;
    const fill = night ? nightfall(base) : base;
    const g = new Graphics();
    g.roundRect(-box.w / 2, -box.h / 2, box.w, box.h, 3)
      .fill({ color: fill, alpha: 0.85 })
      .stroke({ width: 1, color: night ? nightfall(INK) : INK });
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

  reset(): void {
    this.lastKey = '';
    this.front.length = 0;
    this.art.visible = false;
    this.pestArt.visible = false;
    this.visible = true;
    this.renderable = true;
  }
}
