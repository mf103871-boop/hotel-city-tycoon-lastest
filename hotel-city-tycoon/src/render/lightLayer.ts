/**
 * The light inside the rooms (DEC-018).
 *
 * The approved reference is a lit building under a dark sky: every occupied
 * room and the lobby glow from within. The room pictures cannot do it — a
 * `*_night` image is the same dark picture whether or not anyone is in the
 * room — so the glow is one additive sprite per lit room, laid over the room
 * in `LAYER.overlays`, with a flat two-stop wash and no shadow (HC-VIS-001
 * row 13). The texture is baked once per room size by `fx/glow.ts`.
 *
 * Synced from `setSnapshot` only, behind a dirty key: nothing here runs per
 * frame, and a still hotel at a fixed hour costs nothing.
 */
import { Container, Sprite } from 'pixi.js';
import type { Rect } from '../core/state/grid.ts';
import { KeyedPool } from './pool.ts';
import { roomWorldRect } from './layout.ts';
import { radialPoolTexture } from './fx/glow.ts';
import { poolAlpha } from './lighting.ts';

export interface LitRoom {
  id: string;
  rect: Rect;
  category: string;
  occupants: number;
  label: string;
}

export class LightLayer {
  private readonly root = new Container();
  private readonly pool: KeyedPool<Sprite>;
  private lastKey = '';
  private shown = 0;
  /** Reused across syncs: the room ids the pool should hold. */
  private readonly ids: string[] = [];

  constructor(overlays: Container) {
    overlays.addChild(this.root);
    this.pool = new KeyedPool<Sprite>({
      create: () => {
        const s = new Sprite();
        // Additive, so the pool brightens what is under it rather than
        // painting a yellow rectangle over the furniture. The Canvas2D lane
        // maps this to 'lighter'.
        s.blendMode = 'add';
        s.visible = false;
        this.root.addChild(s);
        return s;
      },
      activate: (s) => { s.visible = false; },
      reset: (s) => { s.visible = false; },
      prewarm: 24,
    });
  }

  /**
   * Reconcile the pools with the rooms: which are lit, how big, how dark it
   * is outside. `closed` is the hotel's own night; `dusk` is the sky's.
   */
  sync(rooms: ReadonlyArray<LitRoom>, plotHeight: number, dusk: number, closed: boolean): void {
    let key = `${dusk},${closed},${plotHeight},`;
    this.ids.length = 0;
    for (const room of rooms) {
      const lit = room.occupants > 0;
      key += `${room.id}:${room.rect.x},${room.rect.y},${room.rect.w},${room.rect.h}:${lit ? 1 : 0};`;
      this.ids.push(room.id);
    }
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.pool.sync(this.ids);
    let shown = 0;
    for (const room of rooms) {
      const sprite = this.pool.get(room.id);
      if (!sprite) continue;
      const alpha = poolAlpha(dusk, room.occupants > 0, room.label === 'lobby', closed);
      if (alpha <= 0) {
        sprite.visible = false;
        continue;
      }
      const world = roomWorldRect(room.rect, plotHeight);
      // Texture before size: a sprite's width is a scale of its texture.
      sprite.texture = radialPoolTexture(world.width, world.height);
      sprite.position.set(world.x, world.y);
      sprite.width = world.width;
      sprite.height = world.height;
      sprite.alpha = alpha;
      sprite.visible = true;
      shown++;
    }
    this.shown = shown;
  }

  /** How many pools were lit at the last sync, for the badge and diagnostics. */
  visibleCount(): number {
    return this.shown;
  }

  destroy(): void {
    this.pool.clear();
    this.lastKey = '';
    this.shown = 0;
    this.root.destroy({ children: true });
  }
}
