/**
 * Placeholder room graphics.
 *
 * Flat coloured shells with a decor meter and hazard badges. They are here so
 * that layout, camera, culling and interaction can be built and felt before
 * any art exists — the real room sprites replace this in P3b, and nothing
 * outside this file should need to change when they do.
 */
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { texture, assetGeneration } from './assets.ts';
import type { Rect } from '../core/state/grid.ts';
import { roomWorldRect, BLOCK_W, BLOCK_H, anchorToLocalPx } from './layout.ts';

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
 * PLACEHOLDER decor colours — a technical stand-in for ART-1
 * (docs/ASSET_REQUEST-ART-1.md, still `REQUESTED`), not a palette decision.
 * §5A forbids Fable from generating final art or letting a placeholder pass
 * as one; nothing here is meant to be read as a finished look. It exists so
 * DEC-010's position/flip/save pipeline can be proven end to end before any
 * art exists. Swapping to `texture(defId's assetKey)` is the follow-up once
 * Codex delivers ART-1.
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
      .map((p) => `${p.id}:${p.localX}:${p.localY}:${p.flipX ? 1 : 0}:${p.zBias}`)
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

    this.drawDecor(data.decor);

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
   * PLACEHOLDER decor (see DECOR_PLACEHOLDER above) at each piece's DEC-010
   * anchor. Rebuilt in full on every dirty update — the catalogue caps a room
   * at 24 pieces (data/economy.json limits.maxDecorPerRoom), cheap enough
   * that this does not need RoomView's own texture-reuse tricks.
   */
  private drawDecor(pieces: RoomViewDecorItem[]): void {
    this.decorLayer.removeChildren();
    // zBias breaks ties among pieces that would otherwise overlap; Pixi
    // draws children back-to-front in addChild order, so lowest goes first.
    const ordered = [...pieces].sort((a, b) => a.zBias - b.zBias);
    for (const piece of ordered) {
      const at = anchorToLocalPx(piece.localX, piece.localY);
      const box = new Container();
      box.position.set(at.x, at.y);
      box.scale.x = piece.flipX ? -1 : 1;

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
