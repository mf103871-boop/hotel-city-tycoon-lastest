/**
 * The particle field, and the one clock everything the effects draw runs on
 * (HC-P2-S4).
 *
 * Two ideas carry this file.
 *
 * **Nothing is integrated.** A particle stores where it started, how fast it
 * left and how old it is; where it *is* is computed from its age, in closed
 * form, every time it is asked. So the picture is a pure function of
 * `(spawn parameters, step)`: a replay at 30 fps and a replay at 144 fps draw
 * the same frames, a dropped frame moves nothing off its arc, and there is no
 * accumulated state a long session can corrupt. `tests/unit/effects.test.ts`
 * asserts exactly that, because it is the property a future refactor is most
 * likely to take away by accident.
 *
 * **There is one clock, and it ticks 12 times a second.** ART-0 §11 asks for
 * drawn motion at 8–12 fps and the effects are drawn motion, so every effect
 * — coin, spark, dust, floating number, room pulse — is sampled on the same
 * `FX_FPS` grid. At 60 fps that means four frames in five write nothing to
 * any sprite, because the step has not changed. The renderer's side of that
 * bargain is in `particleLayer.ts`.
 *
 * PURE MATHS. No Pixi, no DOM, no ambient clock, no `Math.random` — the
 * seeded `mulberry32` the scheduler already uses (anim/scheduler.ts:19) is
 * the only source of variation here. The module is in the pure list in
 * `tools/selftest/animations.ts` and loads under strip-types.
 *
 * Every typed-array read carries a non-null assertion: `tsconfig.json:15`
 * sets `noUncheckedIndexedAccess`, so a bare `f.x0[i]` is `number | undefined`
 * and no arithmetic can be written against it. `tests/e2e/game.spec.ts:321`
 * is the house precedent for the shape.
 */
import { mulberry32 } from '../../core/rng/index.ts';
import { MIN_ZOOM } from '../camera.ts';
import { BLOCK_H } from '../layout.ts';
import { POOL_ALPHA_OPEN } from '../lighting.ts';
import {
  FRAME_BLANK, FRAME_COIN_0, FRAME_DUST_0, FRAME_SPARK_0, FX_FRAMES,
  GLYPH_ADVANCE_PX, GLYPH_H, MARK_SPARKLE, frameForGlyph,
} from './glyphs.ts';

/**
 * What a slot in the field is drawing. Integer keys, never a string.
 *
 * There is no sleeper's `z` here: the rig already draws a lying sleeper two
 * of them from `pose.zDrift` at both tiers, so this channel adding a third
 * at a *standing* figure's head height was one mark too many in the wrong
 * place (HC-P2-S4 §9 row 1).
 */
export const FX = { coin: 0, spark: 1, dust: 2, sparkle: 3, label: 4 } as const;
export const FX_KINDS = 5;

export const FIELD_CAP_FULL = 192;
export const FIELD_CAP_LITE = 48;
/** Ambience may hold half the field; the other half is always there for a cue. */
export const AMBIENT_SHARE = 0.5;
/** Dust's own sub-share, so a crowd walking cannot starve the cleaner's sparkle. */
export const DUST_SHARE = 0.25;

/** One clock for the whole channel (ART-0 §11 :260 — inside 8–12). */
export const FX_FPS = 12;
/** Every one-shot: 6 steps over 500 ms (ART-0 §11 "Coins/XP FX | 6–10 | 0.35–0.5s | One-shot"). */
export const FX_LIFE_MS = 500;
export const FX_STEPS = 6;
export const LABEL_LIFE_MS = 500;
export const PULSE_LIFE_MS = 500;
/** No §11 row names this one; its nearest row's band is quoted in DEC-021. */
export const BUBBLE_LIFE_MS = 1000;   // Happy/Angry row: 0.6–1 s

export const GRAVITY_PX_S2 = 150;     // prototype main.ts:794
/**
 * The throw.
 *
 * Apogee is `v²/2g`, so the launch speed is the whole of whether a burst
 * reads as a throw or as a pile: at the 26–72 px/s this shipped with, the
 * slowest coin rose 2.25 px against a coin 9 px across and the fastest 17 px,
 * and the drawn picture was a vertical column about one coin wide. At 70–130
 * the apogee is 16–56 px (mean 33) and the lateral travel over the drawn life
 * is ~35 px, so the coins separate by several of their own widths and the
 * gravity term bends the path by about a third of its rise before the last
 * frame. The level-up keeps its place above the payout on the same ladder.
 */
export const BURST_SPREAD_RAD = 2.0;
export const BURST_SPEED_MIN = 70;
export const BURST_SPEED_SPAN = 60;
export const LEVEL_SPREAD_RAD = 2.6;
export const LEVEL_SPEED_MIN = 90;
export const LEVEL_SPEED_SPAN = 90;
export const DUST_SPEED_MIN = 6;
export const DUST_SPEED_SPAN = 8;
export const DUST_LIFT_PX_S = 12;
export const DUST_DRAG_PER_S = 3.7;   // the prototype's 0.94 per 1/60 s, per second
/**
 * The puff's peak opacity, and the only fade it has.
 *
 * The strip in `atlas.ts` is baked flat (one opaque disc per step) precisely
 * so that this is the single ramp: the first cut baked a falling opacity into
 * the strip *and* multiplied it here, and the product peaked at 0.275 when
 * the puff was 2 px across and reached 0.0067 by the 6 px frame — a puff
 * nobody could see on the shipped lane. `holdThenFade` keeps it flat across
 * the four growing frames and takes it out over the last two, so the largest
 * frame is still one of the visible ones.
 */
export const DUST_ALPHA_PEAK = 0.5;   // prototype main.ts:815
export const LABEL_RISE_PX = 24;
export const LABEL_MAX_VALUE = 999999;
/**
 * The height a floating number is held at on the glass, in CSS px.
 *
 * Not a number somebody liked the look of. The one capture in this project's
 * evidence that the owner looked at and called readable is
 * `docs/hc-p2-s4-shots/burst-room-phone-full-withhud.png`, taken at room zoom
 * 2.02x, where a digit stands `GLYPH_H * 2.02 = 24.2` CSS px tall and the
 * step report's verdict on that very picture is «الرقم مقروء بلا جهد». This
 * is that height, floored to an integer: the number is never smaller on the
 * glass than the size that was read without effort.
 */
export const LABEL_SCREEN_PX = 24;
/**
 * The quantisation grid of the label's scale, in steps per unit of scale.
 *
 * A pinch moves the zoom every frame and a label's layout is written only
 * when its scale moves, so an unquantised scale would re-lay out every live
 * number on every frame of a pinch. Sixteen steps per unit is 6.25% at scale
 * 1 and 1.25% at scale 5 — below what an eye resolves on a 24 px digit — and
 * bounds a whole pinch to some sixty re-layouts. The same reasoning that put
 * `DUSK_STEPS` in `src/render/lighting.ts`.
 */
export const LABEL_SCALE_STEPS = 16;
/**
 * The world's own ceiling on the number: **half a floor**, never more.
 *
 * The glass wants the number one size; the hotel wants it another, and the
 * hotel's rule is the one that stops the number meaning something else. A
 * `+N` says *this room paid* — so a number taller than half a storey is a
 * number the eye reads against the floor above as readily as against the
 * room that earned it. It was measured: pinned at `LABEL_SCREEN_PX` with no
 * world ceiling, the digit at the camera's floor is 60 world px against a
 * 96 px storey and a `+25` is 145 px wide against a 128 px room — a gold
 * banner wider than the room it is about, which is not what «كبر الرقم»
 * asked for.
 */
export const LABEL_SCALE_ROOM_MAX = BLOCK_H / (2 * GLYPH_H);

/**
 * The largest scale anything can ask for: the smaller of the two ceilings.
 *
 * The screen side is derived from the camera's own floor rather than written
 * down, so moving `MIN_ZOOM` moves it instead of leaving a constant quietly
 * stale; the world side is `LABEL_SCALE_ROOM_MAX`. Today the world's ceiling
 * is the binding one (4 against 5), which is why a digit at the phone's fit
 * zoom measures 19.2 CSS px and not `LABEL_SCREEN_PX` — stated here because
 * the alternative is a reader deriving 24 and finding 19.2.
 *
 * Rounded up onto the quantisation grid, and that is not tidiness. `24 / (12
 * * 0.4)` is `4.999999999999999` in binary floating point, so an un-gridded
 * ceiling is a ceiling the quantised answer steps straight over — the
 * function would return 5 while claiming a maximum of 4.999999999999999, and
 * a clamp that the value it clamps can exceed is not a clamp. Up rather than
 * down for the same reason the function below rounds up: the promise is a
 * floor on the size, so every rounding in the chain has to go the way that
 * keeps it.
 */
export const LABEL_SCALE_MAX = Math.ceil(
  Math.min(LABEL_SCREEN_PX / (GLYPH_H * MIN_ZOOM), LABEL_SCALE_ROOM_MAX) * LABEL_SCALE_STEPS,
) / LABEL_SCALE_STEPS;
export const PULSE_ALPHA_PEAK = 0.30;
/** Reduced motion holds the pulse at one alpha for its whole life. */
export const PULSE_REDUCED_FRAC = 0.6;
/** The reaction bubble's pop, a single step wide. */
export const BUBBLE_POP_SCALE = 1.08;

/**
 * Eight hex digits on purpose: the palette check in `tools/selftest/effects.ts`
 * matches exactly six, so these two cannot be mistaken for a colour the
 * palette does not have. They are the golden-ratio mixers `anim/scheduler.ts`
 * and `anim/rig.ts` already seed with.
 */
export const SEED_MIX_A = 0x9e3779b9;
export const SEED_MIX_B = 0x85ebca6b;


/**
 * The field: a structure of arrays, allocated once, with `live` as its only
 * length and a swap-remove for death. `ambient` and `dust` are running counts
 * of the live particles in those two classes — kept rather than recomputed so
 * that a share ceiling costs an integer compare instead of a scan.
 */
export interface ParticleField {
  readonly cap: number;
  live: number;
  ambient: number;
  dust: number;
  /**
   * The next identity to hand out.
   *
   * A slot is not a particle: death is a swap-remove, so slot `i` can hold a
   * different particle from one frame to the next. `particleLayer.ts` skips
   * writing a sprite whose drawn step has not advanced, and that is only
   * sound if it can tell the two apart — hence an identity per particle, not
   * per slot. Wraps at 32 bits and never takes 0, which is the layer's
   * "nothing drawn here yet".
   */
  nextSerial: number;
  readonly kind: Int8Array;
  /** 0 ambient, 1 cue. */
  readonly prio: Int8Array;
  readonly x0: Float32Array;
  readonly y0: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly ageMs: Float32Array;
  readonly lifeMs: Float32Array;
  readonly seed: Int32Array;
  /** Which particle is in this slot; see `nextSerial`. */
  readonly serial: Int32Array;
}

export function createField(cap: number): ParticleField {
  const n = Math.max(1, cap | 0);
  return {
    cap: n, live: 0, ambient: 0, dust: 0, nextSerial: 1,
    kind: new Int8Array(n),
    prio: new Int8Array(n),
    x0: new Float32Array(n),
    y0: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    ageMs: new Float32Array(n),
    lifeMs: new Float32Array(n),
    seed: new Int32Array(n),
    serial: new Int32Array(n),
  };
}

/** Forget every particle. The arrays keep their storage. */
export function resetField(f: ParticleField): void {
  f.live = 0;
  f.ambient = 0;
  f.dust = 0;
}

/** How many ambient particles this field will hold at once. */
export function ambientCap(cap: number): number {
  return Math.floor(cap * AMBIENT_SHARE);
}

/** How many of those may be dust. */
export function dustCap(cap: number): number {
  return Math.floor(cap * DUST_SHARE);
}

/** The oldest live ambient slot, or -1 when every live particle is a cue. */
function oldestAmbient(f: ParticleField): number {
  let at = -1;
  let age = -1;
  for (let i = 0; i < f.live; i++) {
    if (f.prio[i]! !== 0) continue;
    const a = f.ageMs[i]!;
    if (a > age) { age = a; at = i; }
  }
  return at;
}

function forget(f: ParticleField, i: number): void {
  if (f.prio[i]! !== 0) return;
  f.ambient--;
  if (f.kind[i]! === FX.dust) f.dust--;
}

/**
 * Add one particle. False when the field refused it.
 *
 * Ambience is refused at its share of the cap, and dust again at its own; a
 * cue at a full field recycles the oldest ambient particle, and is refused
 * only when every live slot is another cue. That ordering is the whole
 * policy: the player never loses the feedback for something they did because
 * somebody walked past.
 */
export function emit(
  f: ParticleField, kind: number, prio: number,
  x: number, y: number, vx: number, vy: number, lifeMs: number, seed: number,
): boolean {
  if (prio === 0) {
    if (f.ambient >= ambientCap(f.cap)) return false;
    if (kind === FX.dust && f.dust >= dustCap(f.cap)) return false;
  }
  let at = f.live;
  if (at >= f.cap) {
    if (prio === 0) return false;
    at = oldestAmbient(f);
    if (at < 0) return false;
    forget(f, at);
  } else {
    f.live = at + 1;
  }
  f.kind[at] = kind;
  f.prio[at] = prio;
  f.x0[at] = x;
  f.y0[at] = y;
  f.vx[at] = vx;
  f.vy[at] = vy;
  f.ageMs[at] = 0;
  f.lifeMs[at] = lifeMs;
  f.seed[at] = seed | 0;
  f.serial[at] = f.nextSerial;
  f.nextSerial = (f.nextSerial + 1) | 0;
  if (f.nextSerial === 0) f.nextSerial = 1;
  if (prio === 0) {
    f.ambient++;
    if (kind === FX.dust) f.dust++;
  }
  return true;
}

/**
 * A whole burst from one seed. Returns how many the field accepted.
 *
 * Two draws per particle, from two mixers, because one `mulberry32` call is
 * one number and a launch needs an angle and a speed. The same `seed` and the
 * same `n` therefore replay the same burst, which is what makes a capture
 * reproducible.
 */
export function burst(
  f: ParticleField, kind: number, x: number, y: number, n: number,
  seed: number, speedMin: number, speedSpan: number, spread: number,
): number {
  let made = 0;
  for (let i = 0; i < n; i++) {
    const s = (seed + Math.imul(i, SEED_MIX_A)) >>> 0;
    const angle = -Math.PI / 2 + (mulberry32(s) - 0.5) * spread;
    const speed = speedMin + mulberry32((seed + Math.imul(i, SEED_MIX_B)) >>> 0) * speedSpan;
    if (emit(f, kind, 1, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, FX_LIFE_MS, s | 0)) made++;
  }
  return made;
}

/**
 * The only per-frame work: age everything, swap-remove the dead.
 *
 * Allocation-free, and asserted so — `tools/selftest/effects.ts` extracts this
 * body and refuses `new `, `.map(`, `.filter(`, `.slice(`, `.push(`, a
 * backtick and `.visible =`.
 */
export function stepField(f: ParticleField, dtMs: number): void {
  for (let i = 0; i < f.live; i++) {
    const age = f.ageMs[i]! + dtMs;
    f.ageMs[i] = age;
    if (age < f.lifeMs[i]!) continue;
    forget(f, i);
    const last = f.live - 1;
    f.kind[i] = f.kind[last]!;
    f.prio[i] = f.prio[last]!;
    f.x0[i] = f.x0[last]!;
    f.y0[i] = f.y0[last]!;
    f.vx[i] = f.vx[last]!;
    f.vy[i] = f.vy[last]!;
    f.ageMs[i] = f.ageMs[last]!;
    f.lifeMs[i] = f.lifeMs[last]!;
    f.seed[i] = f.seed[last]!;
    f.serial[i] = f.serial[last]!;
    f.live = last;
    i--;
  }
}

/** How many drawn steps a life of this length gets on the 12 fps grid. */
export function stepsOf(lifeMs: number): number {
  return Math.max(1, Math.round((lifeMs * FX_FPS) / 1000));
}

/**
 * The one clock.
 *
 * `reduced` pins the **position** step to 0: a one-shot under a request for
 * less motion is its first frame, held where it was born. Alpha is not
 * position — the player still has to see the thing arrive and leave — so the
 * layer asks twice, once with `reduced` for where to draw and once with
 * `false` for how faded it is.
 */
export function stepOf(ageMs: number, lifeMs: number, reduced: boolean): number {
  if (reduced) return 0;
  const steps = stepsOf(lifeMs);
  const raw = Math.floor((ageMs * FX_FPS) / 1000);
  if (raw < 0) return 0;
  return raw < steps ? raw : steps - 1;
}

/** Which atlas frame this kind shows at this step. */
export function frameOf(kind: number, step: number): number {
  const s = step < 0 ? 0 : step < FX_FRAMES ? step : FX_FRAMES - 1;
  if (kind === FX.coin) return FRAME_COIN_0 + s;
  if (kind === FX.spark) return FRAME_SPARK_0 + s;
  if (kind === FX.dust) return FRAME_DUST_0 + s;
  if (kind === FX.sparkle) return frameForGlyph(MARK_SPARKLE);
  // A label is drawn as digit sprites of its own, never as a field slot.
  return FRAME_BLANK;
}

/**
 * How much larger than its world size a floating number is drawn, so that it
 * holds `LABEL_SCREEN_PX` on the glass however far out the camera is
 * («كبر الرقم», 21-09-2026).
 *
 * `max(1, ...)` and never less. At and above zoom `LABEL_SCREEN_PX / GLYPH_H`
 * — that is 2x, below the room zoom the evidence was shot at — this returns
 * exactly 1 and the channel draws precisely what it drew before this step: no
 * new picture where the number was already read without effort. Below it the
 * number grows until, at the camera's own floor, it is `LABEL_SCALE_MAX`.
 *
 * The quantisation rounds **up**, which is the difference between a promise
 * and an approximation. Rounded to nearest, the drawn digit falls below
 * `LABEL_SCREEN_PX` almost everywhere it is not exactly on the grid — worst
 * measured 23.27 CSS px at zoom 1.9394 — so "at its world size or at
 * `LABEL_SCREEN_PX`, whichever is larger" would be false by up to 3% and the
 * one property worth testing could not be written as an inequality. Rounding
 * up costs at most 1/16 of a glyph and makes `labelScaleFor(z) * GLYPH_H * z
 * >= LABEL_SCREEN_PX` true at every zoom **the pin can reach** — that is,
 * down to `LABEL_SCREEN_PX / (GLYPH_H * LABEL_SCALE_MAX)`, 0.5x today.
 * Below that the world's ceiling binds and the digit is what half a storey
 * allows: 19.2 CSS px at the phone's fit zoom, four times what it was.
 *
 * A zoom that is not a positive finite number is nobody's camera and answers
 * 1, which is the size the label had before any of this existed.
 */
export function labelScaleFor(zoom: number): number {
  if (!(zoom > 0)) return 1;
  const want = LABEL_SCREEN_PX / (GLYPH_H * zoom);
  if (!(want > 1)) return 1;
  const capped = want < LABEL_SCALE_MAX ? want : LABEL_SCALE_MAX;
  return Math.ceil(capped * LABEL_SCALE_STEPS) / LABEL_SCALE_STEPS;
}

/**
 * How far a floating number has risen by this step, in world px.
 *
 * **Not** scaled by the screen-space compensation, and that is a decision
 * rather than an omission. The size is pinned to the glass because a number
 * nobody can read is not information; the *travel* is what ties the number to
 * the room that earned it, and it belongs to the world. Scaling it by 5 was
 * measured doing two things wrong at the phone's fit zoom: a number rose 120
 * world px against a 96 px floor and ended up drawn over the room one storey
 * up (`docs/hc-p2-s4a-shots/plusN-*-still-phonefit-full-t250ms.png` caught it
 * above the roof), and it climbed back through the reaction card that
 * HC-P2-S4 §9 re-seated it below. Left in world px, the number's top edge
 * follows exactly the path it followed before this step at every zoom —
 * which is why the card clearance needs no new arithmetic and S4's
 * `inspector-paid-and-praised-*` captures still describe what happens.
 */
export function labelRiseOf(step: number, steps: number): number {
  const u = steps > 0 ? step / steps : 0;
  const rest = 1 - u;
  return LABEL_RISE_PX * (1 - rest * rest);
}

export function xOf(f: ParticleField, i: number, step: number): number {
  const qt = step / FX_FPS;
  const kind = f.kind[i]!;
  const x0 = f.x0[i]!;
  if (kind === FX.label) return x0;
  if (kind === FX.dust) {
    const k = DUST_DRAG_PER_S;
    return x0 + (f.vx[i]! / k) * (1 - Math.exp(-k * qt));
  }
  return x0 + f.vx[i]! * qt;
}

export function yOf(f: ParticleField, i: number, step: number): number {
  const qt = step / FX_FPS;
  const kind = f.kind[i]!;
  const y0 = f.y0[i]!;
  if (kind === FX.label) return y0 - labelRiseOf(step, stepsOf(f.lifeMs[i]!));
  if (kind === FX.dust) {
    const k = DUST_DRAG_PER_S;
    return y0 - (DUST_LIFT_PX_S / k) * (1 - Math.exp(-k * qt));
  }
  // The cleaner's sparkle drifts; it does not fall.
  if (kind === FX.sparkle) return y0 + f.vy[i]! * qt;
  return y0 + f.vy[i]! * qt + 0.5 * GRAVITY_PX_S2 * qt * qt;
}

/** Full alpha until `hold`, then straight down to nothing at `steps`. */
function holdThenFade(step: number, steps: number, holdFrac: number): number {
  const hold = Math.floor(steps * holdFrac);
  if (step <= hold) return 1;
  const span = steps - hold;
  const left = steps - step;
  return left > 0 ? left / span : 0;
}

export function alphaOf(kind: number, step: number, steps: number): number {
  const u = steps > 0 ? step / steps : 1;
  // One fade for the puff, never two: the strip it draws is baked flat.
  if (kind === FX.dust) return DUST_ALPHA_PEAK * holdThenFade(step, steps, 0.5);
  if (kind === FX.label) return holdThenFade(step, steps, 0.5);
  return 1 - u * u;
}

/** The bubble is not a field kind; it fades on the same rule as the label. */
export function bubbleAlphaOf(step: number, steps: number): number {
  return holdThenFade(step, steps, 0.75);
}

/** The bubble's 1 → 1.08 → 1 pop, one step wide. Reduced motion never sees it. */
export function popScaleOf(step: number): number {
  return step === 1 ? BUBBLE_POP_SCALE : 1;
}

export function scaleOf(kind: number, step: number, steps: number): number {
  const u = steps > 0 ? step / steps : 1;
  if (kind === FX.sparkle) return 1 - 0.4 * u;
  // The coin, the spark and the dust carry their size in their own frames.
  return 1;
}

/**
 * The room pulse's alpha, clamped against the light that already ships.
 *
 * `u` is the pulse's progress through its life. The flash is additive and it
 * sits in `LAYER.overlays` beside `LightLayer`, so the honest ceiling for
 * pool plus pulse over one room is the one S2 signed — `POOL_ALPHA_OPEN`.
 * Above that the additive total over a lit room would exceed what the
 * shipped picture already reaches, and the ink-outline gate in
 * `tests/e2e/game.spec.ts` would be answering a question nobody asked.
 */
export function pulseAlphaAt(u: number, poolAlphaNow: number, reduced: boolean): number {
  const head = POOL_ALPHA_OPEN - poolAlphaNow;
  if (head <= 0) return 0;
  const want = reduced ? PULSE_ALPHA_PEAK * PULSE_REDUCED_FRAC : PULSE_ALPHA_PEAK * Math.sin(Math.PI * u);
  if (want <= 0) return 0;
  return want < head ? want : head;
}

/**
 * The digits of `value`, least significant first, into `out`. Returns how
 * many were written.
 *
 * Integer arithmetic on purpose: `toString`, a template literal and `Intl`
 * all produce a string, and a string on this side of the renderer is one
 * `Text` away from the font DEC-021 forbids. Zero is one digit; anything
 * above `LABEL_MAX_VALUE` clamps rather than growing the label.
 */
export function digitsOf(value: number, out: Int8Array): number {
  let n = Math.floor(value);
  if (!(n > 0)) { out[0] = 0; return 1; }
  if (n > LABEL_MAX_VALUE) n = LABEL_MAX_VALUE;
  let k = 0;
  while (n > 0 && k < out.length) {
    out[k] = n % 10;
    n = (n / 10) | 0;
    k++;
  }
  return k;
}

/**
 * Where the leftmost sprite of an `n`-sprite label goes, so the whole label
 * is centred on its anchor. Every sprite is anchored at its own centre, so
 * this is the anchor minus half the run of advances — and the advance carries
 * the screen-space scale, or a magnified label's digits would sit on top of
 * one another.
 */
export function labelOriginX(anchorX: number, n: number, scale = 1): number {
  return anchorX - ((n - 1) * GLYPH_ADVANCE_PX * scale) / 2;
}
