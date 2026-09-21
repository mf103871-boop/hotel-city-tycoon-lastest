/**
 * The room's flash when it earns (HC-P2-S4, BL-048).
 *
 * A sibling of `LightLayer` inside `LAYER.overlays`, built on the line after
 * it, so the two additive groups are contiguous: the pulse joins the additive
 * region rather than following it. That is the whole reason this is a layer
 * of its own and not a third kind of particle — the pulse is the one effect
 * that wants `blendMode = 'add'`, and on Pixi's CanvasRenderer anything
 * additive drawn *after* the light batch is one `Graphics` away from BL-048.
 * Sprites only; the import does not name `Graphics`.
 *
 * The texture is a rim, not a pool: `roomRimTexture()` is transparent over
 * the whole interior, so a character standing in a flashing room receives no
 * added light at all. That replaces an arithmetic argument about how much a
 * pool would brighten an ink outline — an argument whose answer depends on
 * the camera's zoom — with a structural one.
 *
 * And the alpha is clamped against the light that already ships:
 * `pulseAlphaAt()` never lets pool plus pulse exceed `POOL_ALPHA_OPEN`, the
 * ceiling S2 signed. The scene passes in what `LightLayer` is drawing on that
 * room this snapshot, computed from the same `poolAlpha()` call, so
 * `lightLayer.ts` is not opened and the two cannot drift.
 */
import { Container, Sprite } from 'pixi.js';
import type { Rect } from '../../core/state/grid.ts';
import { roomWorldRect } from '../layout.ts';
import { prefersReducedMotion } from '../characterView.ts';
import { roomRimTexture } from './glow.ts';
import { PULSE_LIFE_MS, stepOf, stepsOf, pulseAlphaAt } from './particles.ts';
import type { MotionTier } from '../quality.ts';

export const PULSES_FULL = 12;
export const PULSES_LITE = 4;

/** One room, flashing. Dead slots sit at alpha 0, never `visible = false`. */
interface Pulse {
  readonly sprite: Sprite;
  roomId: string;
  ageMs: number;
  /** What the room's light pool is already drawing, so the sum stays bounded. */
  poolAlpha: number;
  live: boolean;
  /** The last drawn step: the flash moves twelve times a second, not sixty. */
  drawn: number;
}

export class PulseLayer {
  private readonly root = new Container();
  private readonly pulses: Pulse[] = [];
  private cap = PULSES_FULL;

  constructor(overlays: Container) {
    overlays.addChild(this.root);
  }

  /** Caps only; the drawing path is the same on both tiers. */
  setTier(tier: MotionTier): void {
    this.cap = tier === 'lite' ? PULSES_LITE : PULSES_FULL;
  }

  /**
   * Flash one room. A room already flashing restarts its own clock rather
   * than taking a second slot: two payouts in one room are one brighter
   * moment, not two overlapping ones.
   */
  pulse(roomId: string, rect: Rect, plotHeight: number, poolAlphaNow: number): void {
    const slot = this.slotFor(roomId);
    if (!slot) return;
    const world = roomWorldRect(rect, plotHeight);
    // Texture before size: a sprite's width is a scale of its texture.
    slot.sprite.texture = roomRimTexture(world.width, world.height);
    slot.sprite.position.set(world.x, world.y);
    slot.sprite.width = world.width;
    slot.sprite.height = world.height;
    slot.roomId = roomId;
    slot.ageMs = 0;
    slot.poolAlpha = poolAlphaNow;
    slot.live = true;
    slot.drawn = -1;
  }

  /** One frame. Allocation-free: a fixed array of slots and integer keys. */
  tick(dtMs: number): void {
    const reduced = prefersReducedMotion();
    const steps = stepsOf(PULSE_LIFE_MS);
    for (let i = 0; i < this.pulses.length; i++) {
      const slot = this.pulses[i]!;
      if (!slot.live) continue;
      slot.ageMs += dtMs;
      if (slot.ageMs >= PULSE_LIFE_MS) {
        slot.live = false;
        slot.roomId = '';
        slot.sprite.alpha = 0;
        slot.drawn = -1;
        continue;
      }
      // Reduced motion holds one alpha for the whole life: one appearance and
      // one disappearance, no ramp — but the room still says that it earned.
      const step = reduced ? 0 : stepOf(slot.ageMs, PULSE_LIFE_MS, false);
      if (slot.drawn === step) continue;
      slot.drawn = step;
      slot.sprite.alpha = pulseAlphaAt(step / steps, slot.poolAlpha, reduced);
    }
  }

  /** How many rooms are flashing right now, for `window.hct.fxStats()`. */
  activeCount(): number {
    let n = 0;
    for (const slot of this.pulses) if (slot.live) n++;
    return n;
  }

  destroy(): void {
    this.pulses.length = 0;
    this.root.destroy({ children: true });
  }

  /** This room's slot, a free one, a new one, or the oldest recycled. */
  private slotFor(roomId: string): Pulse | null {
    for (const slot of this.pulses) if (slot.live && slot.roomId === roomId) return slot;
    for (const slot of this.pulses) if (!slot.live) return slot;
    if (this.pulses.length < this.cap) {
      const sprite = new Sprite();
      // Additive, so the rim brightens the room's edge rather than painting a
      // gold frame over it. The Canvas2D lane maps this to 'lighter'.
      sprite.blendMode = 'add';
      sprite.alpha = 0;
      this.root.addChild(sprite);
      const slot: Pulse = { sprite, roomId: '', ageMs: 0, poolAlpha: 0, live: false, drawn: -1 };
      this.pulses.push(slot);
      return slot;
    }
    let oldest: Pulse | null = null;
    for (const slot of this.pulses) {
      if (!oldest || slot.ageMs > oldest.ageMs) oldest = slot;
    }
    return oldest;
  }
}
