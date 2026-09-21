/**
 * The Pixi side of the effects channel (HC-P2-S4, BL-048, DEC-021).
 *
 * Owns `LAYER.effects` and everything drawn in it: the particles, the
 * floating `+N` labels and the reaction bubbles. Three rules shape the file.
 *
 * **Everything here is a Sprite.** Not one `Graphics` — the import does not
 * even name it, and `tools/selftest/effects.ts` asserts that. On Pixi's
 * CanvasRenderer the Graphics adaptor sets the 2D blend mode inside a
 * `save()`/`restore()` pair (CanvasGraphicsAdaptor.mjs:194/196/335) while the
 * sprite batch sets it in place (CanvasBatchAdaptor.mjs:42) and the context
 * system caches only the mode it last asked for (CanvasContextSystem.mjs:117,
 * byte-identical in 8.20.1 and 8.21.0). So a Graphics drawn after the
 * additive light batch draws correctly and leaves the cache and the real
 * `globalCompositeOperation` disagreeing — and everything after it, every
 * frame after it, composites additively. That is BL-048, and a layer made of
 * sprites cannot start it.
 *
 * **Nothing is allocated per frame.** `tick(dtMs)` walks fixed-capacity
 * arrays with integer keys: no array, no object, no string, no closure. The
 * selftest extracts this body by that exact signature and refuses `new `,
 * `.map(`, `.filter(`, `.slice(`, `.push(`, a backtick and `.visible =`.
 *
 * **A sprite is written only when its drawn step moves.** Every effect is
 * sampled on the one 12 fps grid, so at 60 fps four frames in five write
 * nothing at all to a live particle. A slot is not a particle — the field
 * swap-removes — so the memo is keyed on the particle's own serial as well as
 * its step, or a recycled slot would inherit the dead particle's picture.
 */
import { Container, Sprite } from 'pixi.js';
import { mulberry32 } from '../../core/rng/index.ts';
import type { MotionTier } from '../quality.ts';
import { prefersReducedMotion } from '../characterView.ts';
import { blankTexture } from './glow.ts';
import { fxFrame } from './atlas.ts';
import {
  FRAME_BUBBLE, FRAME_MARK_0, FRAME_PLUS, FRAME_DIGIT_0, GLYPH_ADVANCE_PX,
  GLYPH_H, MARK_CROSS, MARK_QUERY, MARK_SMILE, MARK_STAR, BUBBLE_H,
} from './glyphs.ts';
import {
  FX, createField, resetField, emit, burst, stepField, stepsOf, stepOf,
  frameOf, xOf, yOf, alphaOf, scaleOf, digitsOf, labelOriginX, labelRiseOf,
  labelScaleFor, bubbleAlphaOf, popScaleOf,
  FIELD_CAP_FULL, FIELD_CAP_LITE, FX_LIFE_MS, LABEL_LIFE_MS, BUBBLE_LIFE_MS,
  LABEL_MAX_VALUE, SEED_MIX_A, SEED_MIX_B,
  BURST_SPEED_MIN, BURST_SPEED_SPAN, BURST_SPREAD_RAD,
  LEVEL_SPEED_MIN, LEVEL_SPEED_SPAN, LEVEL_SPREAD_RAD,
  DUST_SPEED_MIN, DUST_SPEED_SPAN, DUST_LIFT_PX_S,
} from './particles.ts';
import type { ParticleField } from './particles.ts';

/**
 * What a cue number means, mirroring `src/bridge/effects.ts`'s `CUE`.
 *
 * Copied rather than imported because `src/render` imports nothing from
 * `src/bridge` — the scene takes its cues structurally, the way it already
 * takes reactions. `tools/selftest/effects.ts` reads both tables and fails if
 * they ever disagree, which is the only thing that makes a copy safe.
 */
export const FX_CUE = {
  payout: 0, clear: 1, refuse: 2, praise: 3, greet: 4, puzzled: 5, triumph: 6,
} as const;

export const LABELS_FULL = 6;
export const LABELS_LITE = 3;
/** Six digits plus one sign sprite: `LABEL_MAX_VALUE` is 999999. */
export const LABEL_DIGITS = 6;
export const BUBBLES_FULL = 4;
export const BUBBLES_LITE = 2;
export const PREWARM = 24;

/** How many particles a cue throws, per tier. */
const COIN_BURST_FULL = 5;
const COIN_BURST_LITE = 3;
const SPARK_BURST_FULL = 6;
const SPARK_BURST_LITE = 3;
const REFUSE_BURST_FULL = 4;
const REFUSE_BURST_LITE = 2;
const LEVEL_BURST_FULL = 18;
const LEVEL_BURST_LITE = 8;
const RING_FULL = 5;
const RING_LITE = 3;
/** Reduced motion still says what happened — it just says it once, in place. */
const REDUCED_BURST = 1;
const REDUCED_LEVEL_BURST = 3;

/** The card hangs this far over the top of the drawn person. */
const BUBBLE_HANG_PX = 4;
/**
 * The mark's offset inside the card. The 28x24 frame is a 19 px card over a
 * 5 px tail, so the card's own centre is above the sprite's.
 */
const BUBBLE_MARK_DY = -2.5;

/** The cleaner's sparkle drifts upward and does not fall. */
const SPARKLE_DRIFT_PX_S = -10;

/**
 * The stride of the per-slot memo key, which packs the position step and the
 * fade step into one Int16.
 *
 * It was a five-bit shift, which is a trap rather than a bound: at 32 steps —
 * a life of 2667 ms, one constant away — `fade` runs into the step field and
 * `(step, 32)` becomes indistinguishable from `(step + 1, 0)`, so the memo
 * skips the write and the sprite holds a stale picture for ever. The stride
 * is named, it is checked at load against the longest life the channel ships,
 * and a designer who lengthens an effect past it gets a failure at boot
 * instead of one frozen particle in a capture.
 */
const KEY_STRIDE = 64;
const LONGEST_LIFE_MS = Math.max(FX_LIFE_MS, LABEL_LIFE_MS, BUBBLE_LIFE_MS);
if (stepsOf(LONGEST_LIFE_MS) >= KEY_STRIDE) {
  throw new Error('an effect life outgrew the memo key; raise KEY_STRIDE in fx/particleLayer.ts');
}

/**
 * One floating number. Seven sprites, made once, parked at alpha 0.
 *
 * The slot holds the **anchor**, not a laid-out position, because the screen
 * -space scale can change under a pinch while the number is in the air: every
 * x, y and scale it draws at is derived from these four numbers and the
 * layer's current `labelScale`, so a re-layout is total and cannot leave half
 * a number at the old size.
 */
interface Label {
  readonly sign: Sprite;
  readonly digits: Sprite[];
  /** Who this number is about, '' for a cue with no person. */
  id: string;
  ageMs: number;
  /** Where the cue happened, in world px. */
  wx: number;
  wy: number;
  /**
   * Whether a reaction card pushed this number down to be read beside it, and
   * where that card's own anchor was — the card's, not the number's, which is
   * what the pre-scale code used and what keeps the two readings identical.
   */
  dropped: boolean;
  dropY: number;
  /** How many digit sprites this label is using; 0 when the slot is free. */
  n: number;
  live: boolean;
  /** The last drawn step, so a still label costs nothing. */
  drawn: number;
}

/** One reaction bubble: a card and a mark, following a person by id. */
interface Bubble {
  readonly card: Sprite;
  readonly mark: Sprite;
  id: string;
  ageMs: number;
  /** The anchor the scene writes every frame through `moveBubble`. */
  ax: number;
  ay: number;
  live: boolean;
}

export class ParticleLayer {
  /**
   * The blend fence: one transparent pixel, always drawn, never toggled.
   *
   * It is not belt-and-braces for the particles — the layer being sprites
   * already makes the leak impossible. What it does is leave the pair
   * agreeing *at 'normal'* after the additive light batch, so that a Graphics
   * drawn later (`showCastSheet`'s, or one somebody adds in 2027) takes the
   * early return at CanvasContextSystem.mjs:117, draws against 'source-over'
   * and restores 'source-over' — harmless instead of fatal. That is why its
   * position at the head of this layer is load-bearing: a fence that is not
   * first protects nothing drawn before it, and why it sits outside the pool
   * container whose `renderable` toggles — the resynchronisation has to
   * happen on every frame, whether or not an effect is live.
   *
   * Its alpha is 1/255 rather than 0 only so that a future culling pass has
   * no reason to drop it; the blend mode is set at CanvasBatchAdaptor.mjs:42,
   * before the `alpha <= 0` skip at :49, so even 0 would resynchronise.
   */
  private readonly fence = new Sprite(blankTexture());
  /** Everything drawn. Its `renderable` flips only on the idle/live edge. */
  private readonly pool = new Container();
  /**
   * Three groups inside the pool, and their order is the draw order.
   *
   * `inspectorFound` emits a payout and a praise on the *same* person in the
   * same batch, and with one flat container the draw order was creation
   * order: the payout's `+25` was made first, the praise card second, and the
   * card — centred at `wy - 16` and 24 px tall — covered the label for its
   * whole life. The number is information and is never withheld, so the
   * groups pin it above the card whatever order the cues arrive in. A
   * container is not a Graphics, so BL-048's structural rule is untouched.
   */
  private readonly parts = new Container();
  private readonly cards = new Container();
  private readonly numbers = new Container();

  private field: ParticleField = createField(FIELD_CAP_FULL);
  private tier: MotionTier = 'full';
  private cap = FIELD_CAP_FULL;

  private readonly sprites: Sprite[] = [];
  /** How many pooled sprites carried a particle last frame. */
  private used = 0;
  /** Per slot: whose picture is on it, and at which step. */
  private lastSerial = new Int32Array(FIELD_CAP_FULL);
  private lastKey = new Int16Array(FIELD_CAP_FULL);
  private lastFrame = new Int16Array(FIELD_CAP_FULL);

  private readonly labels: Label[] = [];
  private labelCap = LABELS_FULL;
  /**
   * How much bigger than its world size a number is drawn right now, from the
   * camera's zoom through `labelScaleFor` (DEC-024, «كبر الرقم»). 1 at and
   * above 2x, where this step changes nothing at all.
   */
  private labelScale = 1;
  /** Reused by every label: the digits, least significant first. */
  private readonly digitBuf = new Int8Array(LABEL_DIGITS);

  private readonly bubbles: Bubble[] = [];
  private bubbleCap = BUBBLES_FULL;
  /** Which bubble slots are live, compacted, so the scene can walk them. */
  private readonly bubbleOrder = new Int16Array(BUBBLES_FULL);
  private bubbleLive = 0;

  /** Written only on the idle/live edge: a real change rebuilds the draw list. */
  private showing = true;

  constructor(effects: Container) {
    this.fence.blendMode = 'normal';
    this.fence.alpha = 1 / 255;
    this.fence.width = 1;
    this.fence.height = 1;
    this.fence.position.set(0, 0);
    this.pool.addChild(this.parts);
    this.pool.addChild(this.cards);
    this.pool.addChild(this.numbers);
    effects.addChild(this.pool);
    effects.addChildAt(this.fence, 0);
    this.grow(PREWARM);
  }

  /** Caps only; the drawing path is the same on both tiers. */
  setTier(tier: MotionTier): void {
    this.tier = tier;
    const cap = tier === 'lite' ? FIELD_CAP_LITE : FIELD_CAP_FULL;
    this.labelCap = tier === 'lite' ? LABELS_LITE : LABELS_FULL;
    this.bubbleCap = tier === 'lite' ? BUBBLES_LITE : BUBBLES_FULL;
    if (cap === this.cap) return;
    this.cap = cap;
    this.field = createField(cap);
    for (let i = 0; i < this.sprites.length; i++) this.park(i);
    this.used = 0;
  }

  /**
   * The camera's zoom, handed in once a frame before `tick` (DEC-024).
   *
   * The `+N` is the one thing this channel draws that is *information* rather
   * than decoration, and information that shrinks with the camera is not
   * information: at the zoom a phone opens the hotel at, 0.40x, a whole `+25`
   * measured 12 x 4.8 CSS px and read as a gold smudge
   * (`docs/HC-P2-S4-REPORT.md`). So the number is pinned to the glass instead
   * of to the world, and this is where the camera reaches it.
   *
   * Written only when the quantised scale actually moves, and then the whole
   * label is re-laid out — position, advance and scale together — because a
   * partial re-layout would leave the digits spaced for the old size. A frame
   * that does not pinch does nothing here but one compare.
   */
  setZoom(zoom: number): void {
    const scale = labelScaleFor(zoom);
    if (scale === this.labelScale) return;
    this.labelScale = scale;
    for (let i = 0; i < this.labels.length; i++) {
      const label = this.labels[i]!;
      if (label.live) this.layoutLabel(label);
    }
  }

  // ------------------------------------------------------------- emitting

  /**
   * Play one resolved cue, in world px.
   *
   * `charId` is who to follow with a bubble, `amount` the coins to float.
   * Under a request for less motion the cue still plays — the player is never
   * told less — but it plays once, in place, on the same fade grid.
   */
  play(cue: number, wx: number, wy: number, amount: number, charId: string, seed: number): void {
    const reduced = prefersReducedMotion();
    const lite = this.tier === 'lite';
    switch (cue) {
      case FX_CUE.payout:
        this.throwBurst(FX.coin, wx, wy, reduced ? REDUCED_BURST : lite ? COIN_BURST_LITE : COIN_BURST_FULL, seed,
          BURST_SPEED_MIN, BURST_SPEED_SPAN, BURST_SPREAD_RAD);
        if (amount > 0) this.label(wx, wy, amount, charId);
        break;
      case FX_CUE.clear:
        this.throwBurst(FX.spark, wx, wy, reduced ? REDUCED_BURST : lite ? SPARK_BURST_LITE : SPARK_BURST_FULL, seed,
          BURST_SPEED_MIN, BURST_SPEED_SPAN, BURST_SPREAD_RAD);
        if (amount > 0) this.label(wx, wy, amount, charId);
        break;
      case FX_CUE.refuse:
        this.throwBurst(FX.spark, wx, wy, reduced ? REDUCED_BURST : lite ? REFUSE_BURST_LITE : REFUSE_BURST_FULL, seed,
          BURST_SPEED_MIN, BURST_SPEED_SPAN, BURST_SPREAD_RAD);
        this.bubble(charId, wx, wy, MARK_CROSS);
        break;
      case FX_CUE.praise:
        this.bubble(charId, wx, wy, MARK_STAR);
        break;
      case FX_CUE.greet:
        this.bubble(charId, wx, wy, MARK_SMILE);
        break;
      case FX_CUE.puzzled:
        this.bubble(charId, wx, wy, MARK_QUERY);
        break;
      case FX_CUE.triumph:
        this.throwBurst(FX.spark, wx, wy,
          reduced ? REDUCED_LEVEL_BURST : lite ? LEVEL_BURST_LITE : LEVEL_BURST_FULL, seed,
          LEVEL_SPEED_MIN, LEVEL_SPEED_SPAN, LEVEL_SPREAD_RAD);
        if (amount > 0) this.label(wx, wy, amount, charId);
        break;
      default:
        break;
    }
  }

  /**
   * The "this room is clean again" ring: sparks spread along the room's top
   * edge. A cue, not an ambient, so it plays on both tiers.
   */
  ring(wx: number, wy: number, spreadPx: number, seed: number): void {
    const reduced = prefersReducedMotion();
    const n = reduced ? REDUCED_BURST : this.tier === 'lite' ? RING_LITE : RING_FULL;
    for (let i = 0; i < n; i++) {
      const at = n > 1 ? (i / (n - 1) - 0.5) * spreadPx : 0;
      const s = (seed + Math.imul(i + 1, SEED_MIX_A)) >>> 0;
      emit(this.field, FX.spark, 1, wx + at, wy, 0, -12 - mulberry32(s) * 10, FX_LIFE_MS, s | 0);
    }
    this.wake();
  }

  /** A puff where a foot landed. Ambient: refused at its share, off on lite. */
  puff(wx: number, wy: number, facing: number, seed: number): void {
    const s = (seed + SEED_MIX_B) >>> 0;
    const speed = DUST_SPEED_MIN + mulberry32(s) * DUST_SPEED_SPAN;
    emit(this.field, FX.dust, 0, wx, wy, -facing * speed, -DUST_LIFT_PX_S, FX_LIFE_MS, s | 0);
    this.wake();
  }

  /** A twinkle at the cleaner's mop. Ambient. */
  sparkle(wx: number, wy: number, seed: number): void {
    emit(this.field, FX.sparkle, 0, wx, wy, 0, SPARKLE_DRIFT_PX_S, FX_LIFE_MS, seed | 0);
    this.wake();
  }

  // ------------------------------------------------- the bubbles' read side

  /** How many bubbles want an anchor this frame. At most `bubbleCap`. */
  bubbleCount(): number {
    return this.bubbleLive;
  }

  /** Which person the i-th live bubble is following. */
  bubbleIdAt(i: number): string {
    const slot = this.bubbleOrder[i] ?? -1;
    return slot >= 0 ? (this.bubbles[slot]?.id ?? '') : '';
  }

  /**
   * Where that person is now, in world px.
   *
   * By slot index rather than by id on purpose: the scene then does at most
   * four map lookups a frame and no string comparison at all.
   */
  moveBubble(i: number, wx: number, wy: number): void {
    const slot = this.bubbleOrder[i] ?? -1;
    if (slot < 0) return;
    const bubble = this.bubbles[slot];
    if (!bubble) return;
    bubble.ax = wx;
    bubble.ay = wy;
  }

  // ----------------------------------------------------------- the frame

  /**
   * One frame. The only per-frame work the channel does, and it allocates
   * nothing: age the field, then write the slots whose drawn step moved.
   */
  tick(dtMs: number): void {
    const reduced = prefersReducedMotion();
    stepField(this.field, dtMs);
    const f = this.field;
    const live = f.live;
    if (live > this.sprites.length) this.grow(live);

    for (let i = 0; i < live; i++) {
      const serial = f.serial[i]!;
      const life = f.lifeMs[i]!;
      const age = f.ageMs[i]!;
      const step = stepOf(age, life, reduced);
      // Two calls, deliberately: the position holds under a request for less
      // motion, the fade does not — the player still sees the thing leave.
      const fade = reduced ? stepOf(age, life, false) : step;
      const key = step * KEY_STRIDE + fade;
      if (this.lastSerial[i] === serial && this.lastKey[i] === key) continue;
      this.lastSerial[i] = serial;
      this.lastKey[i] = key;
      const sprite = this.sprites[i]!;
      const kind = f.kind[i]!;
      const frame = frameOf(kind, step);
      if (this.lastFrame[i] !== frame) {
        this.lastFrame[i] = frame;
        sprite.texture = fxFrame(frame);
      }
      const steps = stepsOf(life);
      sprite.position.set(xOf(f, i, step), yOf(f, i, step));
      sprite.alpha = alphaOf(kind, fade, steps);
      sprite.scale.set(scaleOf(kind, fade, steps));
    }
    for (let i = live; i < this.used; i++) this.park(i);
    this.used = live;

    for (let i = 0; i < this.labels.length; i++) {
      const label = this.labels[i]!;
      if (!label.live) continue;
      label.ageMs += dtMs;
      if (label.ageMs >= LABEL_LIFE_MS) {
        this.parkLabel(label);
        continue;
      }
      const step = stepOf(label.ageMs, LABEL_LIFE_MS, reduced);
      const fade = reduced ? stepOf(label.ageMs, LABEL_LIFE_MS, false) : step;
      const key = step * KEY_STRIDE + fade;
      if (label.drawn === key) continue;
      label.drawn = key;
      const steps = stepsOf(LABEL_LIFE_MS);
      const y = this.labelBaseY(label) - labelRiseOf(step, steps);
      const alpha = alphaOf(FX.label, fade, steps);
      label.sign.y = y;
      label.sign.alpha = alpha;
      for (let d = 0; d < label.n; d++) {
        const digit = label.digits[d]!;
        digit.y = y;
        digit.alpha = alpha;
      }
    }

    let order = 0;
    for (let i = 0; i < this.bubbles.length; i++) {
      const bubble = this.bubbles[i]!;
      if (!bubble.live) continue;
      bubble.ageMs += dtMs;
      if (bubble.ageMs >= BUBBLE_LIFE_MS) {
        this.parkBubble(bubble);
        continue;
      }
      const step = stepOf(bubble.ageMs, BUBBLE_LIFE_MS, reduced);
      const fade = reduced ? stepOf(bubble.ageMs, BUBBLE_LIFE_MS, false) : step;
      const steps = stepsOf(BUBBLE_LIFE_MS);
      const alpha = bubbleAlphaOf(fade, steps);
      const scale = popScaleOf(step);
      // The anchor moves at display rate while the pop and the fade step at
      // 12 fps: the two-clock contract, and why this write is not memoised.
      const y = bubble.ay - BUBBLE_HANG_PX - BUBBLE_H / 2;
      bubble.card.position.set(bubble.ax, y);
      bubble.card.alpha = alpha;
      bubble.card.scale.set(scale);
      bubble.mark.position.set(bubble.ax, y + BUBBLE_MARK_DY);
      bubble.mark.alpha = alpha;
      bubble.mark.scale.set(scale);
      this.bubbleOrder[order] = i;
      order++;
    }
    this.bubbleLive = order;

    const busy = live > 0 || order > 0 || this.labelsLive();
    if (busy !== this.showing) {
      this.showing = busy;
      this.pool.renderable = busy;
    }
  }

  /** What the channel is drawing right now, for `window.hct.fxStats()`. */
  stats(): {
    live: number; labels: number; bubbles: number; cap: number; tier: MotionTier;
    /** The screen-space compensation the numbers *should* be drawn at. */
    labelScale: number;
    /**
     * The compensation a live number is *actually* drawn at, read back off
     * the sprite, and 0 when none is live.
     *
     * Two numbers rather than one because the interesting failure is the one
     * where they disagree: a stored scale that never reached a sprite is
     * exactly the defect this step exists to avoid, and a diagnostic that
     * reports only the intention cannot see it. The browser test asserts they
     * agree; so can an eye on a phone.
     */
    labelScaleDrawn: number;
  } {
    let labels = 0;
    let drawn = 0;
    for (const label of this.labels) {
      if (!label.live) continue;
      labels++;
      if (drawn === 0) drawn = label.sign.scale.x;
    }
    return {
      live: this.field.live, labels, bubbles: this.bubbleLive,
      cap: this.cap, tier: this.tier,
      labelScale: this.labelScale, labelScaleDrawn: drawn,
    };
  }

  destroy(): void {
    resetField(this.field);
    this.sprites.length = 0;
    this.labels.length = 0;
    this.bubbles.length = 0;
    this.bubbleLive = 0;
    this.used = 0;
    this.pool.destroy({ children: true });
    this.fence.destroy();
  }

  // ------------------------------------------------------------- internals

  private labelsLive(): boolean {
    for (const label of this.labels) if (label.live) return true;
    return false;
  }

  /** A dead slot is parked at alpha 0 — never `visible`, which rebuilds the draw list. */
  private park(i: number): void {
    const sprite = this.sprites[i];
    if (sprite) sprite.alpha = 0;
    this.lastSerial[i] = 0;
    this.lastKey[i] = -1;
    this.lastFrame[i] = -1;
  }

  private grow(to: number): void {
    const want = Math.min(this.cap, to);
    while (this.sprites.length < want) {
      // Texture.EMPTY, not a frame of the atlas: the prewarm runs in the
      // constructor and baking the sheet there would move boot work onto a
      // path that draws nothing yet. The first write gives it a real frame.
      const sprite = new Sprite();
      sprite.anchor.set(0.5, 0.5);
      sprite.alpha = 0;
      this.parts.addChild(sprite);
      this.sprites.push(sprite);
    }
    if (this.lastSerial.length < this.cap) {
      this.lastSerial = new Int32Array(this.cap);
      this.lastKey = new Int16Array(this.cap);
      this.lastFrame = new Int16Array(this.cap);
      this.lastKey.fill(-1);
      this.lastFrame.fill(-1);
    }
  }

  private wake(): void {
    if (this.showing) return;
    this.showing = true;
    this.pool.renderable = true;
  }

  private throwBurst(
    kind: number, wx: number, wy: number, n: number, seed: number,
    speedMin: number, speedSpan: number, spread: number,
  ): void {
    burst(this.field, kind, wx, wy, n, seed, speedMin, speedSpan, spread);
    this.wake();
  }

  /**
   * A floating `+N`, laid out by integer arithmetic.
   *
   * No `toString`, no template literal, no `Intl` — a string on this side of
   * the renderer is one `Text` away from the font DEC-021 forbids. The digits
   * come out least significant first and are laid left to right at
   * `GLYPH_ADVANCE_PX`, the whole run centred on the anchor.
   */
  private label(wx: number, wy: number, amount: number, charId: string): void {
    const slot = this.freeLabel();
    if (!slot) return;
    const n = digitsOf(Math.min(amount, LABEL_MAX_VALUE), this.digitBuf);
    slot.sign.texture = fxFrame(FRAME_PLUS);
    slot.sign.alpha = 1;
    for (let d = 0; d < n; d++) {
      const sprite = slot.digits[d]!;
      // Left to right: the most significant digit is the last one written.
      sprite.texture = fxFrame(FRAME_DIGIT_0 + this.digitBuf[n - 1 - d]!);
      sprite.alpha = 1;
    }
    for (let d = n; d < LABEL_DIGITS; d++) slot.digits[d]!.alpha = 0;
    slot.n = n;
    slot.wx = wx;
    slot.wy = wy;
    // A card already over this person's head owns the space the number rises
    // through, so the number starts below it instead of on top of it. The
    // groups keep it drawn over the card either way; this is so that both can
    // be read, not just the one in front.
    slot.dropped = this.liveBubble(charId) !== null;
    slot.dropY = wy;
    slot.id = charId;
    slot.ageMs = 0;
    slot.live = true;
    // Position, advance and scale in one place, so there is exactly one
    // description of where a number is — used here, and again on a pinch.
    this.layoutLabel(slot);
    this.wake();
  }

  /**
   * Where a number sits before it starts rising, in world px.
   *
   * Both seats pin an **edge**, not the centre, and that is the whole of the
   * arithmetic here. A sprite anchored at (0.5, 0.5) grows downward exactly
   * as fast as it grows upward, so a scale of 5 about the cue's own anchor —
   * the top of the drawn head (`scene.ts` `playCues`) — would push 30 world
   * px of ink down over the person the number is about, three quarters of a
   * standing figure, instead of over their head. So:
   *
   * - no card: the number's **bottom** edge stays where it has always been,
   *   `GLYPH_H / 2` below the head, and the number grows upward out of the
   *   person rather than down across them;
   * - a card: the number's **top** edge stays where it has always been,
   *   clear below the card, because there the thing not to cover is above.
   *
   * At scale 1 both reduce to exactly what the channel shipped with — `wy`
   * and `wy + BUBBLE_H` — so the S4 captures still show what they showed.
   */
  private labelBaseY(label: Label): number {
    const grown = (GLYPH_H * (this.labelScale - 1)) / 2;
    if (!label.dropped) return label.wy - grown;
    return label.dropY + BUBBLE_H + grown;
  }

  /**
   * Write a whole number's geometry: origin, advance and scale together.
   *
   * Called on the frame a number is born and on any frame the camera's zoom
   * moved it to another scale. It writes `y` as well as `x` so that a number
   * is never drawn once at last frame's height, and it clears the memo so the
   * next `tick` writes the alpha even though the step has not moved.
   */
  private layoutLabel(label: Label): void {
    const scale = this.labelScale;
    const step = stepOf(label.ageMs, LABEL_LIFE_MS, prefersReducedMotion());
    const y = this.labelBaseY(label) - labelRiseOf(step, stepsOf(LABEL_LIFE_MS));
    const x0 = labelOriginX(label.wx, label.n + 1, scale);
    const advance = GLYPH_ADVANCE_PX * scale;
    label.sign.position.set(x0, y);
    label.sign.scale.set(scale);
    for (let d = 0; d < label.n; d++) {
      const sprite = label.digits[d]!;
      sprite.position.set(x0 + (d + 1) * advance, y);
      sprite.scale.set(scale);
    }
    label.drawn = -1;
  }

  /**
   * A free label slot, or the oldest one recycled.
   *
   * The recycle refuses a slot whose number has not been drawn yet, and that
   * is a fix rather than a nicety. A catch-up batch plays up to
   * `MAX_CUES_PER_BATCH` cues in one synchronous loop, before any `tick`, so
   * every live label in it has `ageMs === 0`; the strict `>` below is never
   * true between equals, so the scan used to return slot 0 every time and
   * cues 7..12 each overwrote the same slot in turn — six payouts drawn, and
   * *which* six an artefact of iteration order rather than of anything the
   * player did. A payout that is never drawn is better than one that erases
   * another for zero frames.
   */
  private freeLabel(): Label | null {
    for (const label of this.labels) if (!label.live) return label;
    if (this.labels.length < this.labelCap) {
      const sign = this.makeSprite(this.numbers);
      const digits: Sprite[] = [];
      for (let i = 0; i < LABEL_DIGITS; i++) digits.push(this.makeSprite(this.numbers));
      const label: Label = {
        sign, digits, id: '', ageMs: 0, wx: 0, wy: 0,
        dropped: false, dropY: 0, n: 0, live: false, drawn: -1,
      };
      this.labels.push(label);
      return label;
    }
    let oldest: Label | null = null;
    for (const label of this.labels) {
      if (!oldest || label.ageMs > oldest.ageMs) oldest = label;
    }
    return oldest && oldest.ageMs > 0 ? oldest : null;
  }

  private parkLabel(label: Label): void {
    label.live = false;
    label.id = '';
    label.n = 0;
    label.dropped = false;
    label.drawn = -1;
    label.sign.alpha = 0;
    for (const digit of label.digits) digit.alpha = 0;
  }

  /** The live card following this person, or null. '' follows nobody. */
  private liveBubble(charId: string): Bubble | null {
    if (!charId) return null;
    for (const bubble of this.bubbles) if (bubble.live && bubble.id === charId) return bubble;
    return null;
  }

  /** A reaction card over somebody's head, following them by id. */
  private bubble(charId: string, wx: number, wy: number, mark: number): void {
    const slot = this.freeBubble(charId);
    if (!slot) return;
    slot.card.texture = fxFrame(FRAME_BUBBLE);
    slot.mark.texture = fxFrame(FRAME_MARK_0 + (mark - MARK_SMILE));
    slot.id = charId;
    slot.ax = wx;
    slot.ay = wy;
    slot.ageMs = 0;
    slot.live = true;
    slot.card.alpha = 1;
    slot.mark.alpha = 1;
    /*
     * The other order. `inspectorFound` pays before it praises, so the number
     * is already rising through this card's space when the card arrives; it
     * is re-seated below rather than left to be read through a smiley. Only a
     * number still at or above the head is moved, so two cards in a row
     * cannot walk one off the bottom of the screen.
     */
    if (charId) {
      for (const label of this.labels) {
        if (!label.live || label.id !== charId || label.dropped || label.wy > wy) continue;
        label.dropped = true;
        label.dropY = wy;
        this.layoutLabel(label);
      }
    }
    this.wake();
  }

  /** The same person's bubble is restarted rather than doubled. */
  private freeBubble(charId: string): Bubble | null {
    if (charId) {
      for (const bubble of this.bubbles) if (bubble.live && bubble.id === charId) return bubble;
    }
    for (const bubble of this.bubbles) if (!bubble.live) return bubble;
    if (this.bubbles.length < this.bubbleCap) {
      const bubble: Bubble = {
        card: this.makeSprite(this.cards), mark: this.makeSprite(this.cards),
        id: '', ageMs: 0, ax: 0, ay: 0, live: false,
      };
      this.bubbles.push(bubble);
      return bubble;
    }
    let oldest: Bubble | null = null;
    for (const bubble of this.bubbles) {
      if (!oldest || bubble.ageMs > oldest.ageMs) oldest = bubble;
    }
    return oldest;
  }

  private parkBubble(bubble: Bubble): void {
    bubble.live = false;
    bubble.id = '';
    bubble.card.alpha = 0;
    bubble.mark.alpha = 0;
  }

  private makeSprite(into: Container): Sprite {
    const sprite = new Sprite();
    sprite.anchor.set(0.5, 0.5);
    sprite.alpha = 0;
    into.addChild(sprite);
    return sprite;
  }
}
