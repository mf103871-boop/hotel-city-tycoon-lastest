/**
 * The timeline of a transient effect — a coin number rising off a room, the
 * rim of a room pulsing once, a ring spreading from a cleared hazard, the
 * ripple under a tap.
 *
 * Pure maths, no Pixi, the same split `motion.ts` and `clipPlayer.ts` made:
 * the part that can be wrong in a way a test can catch — an effect that never
 * expires, a curve that overshoots, a fade that ends above zero and pops out —
 * lives here and runs headlessly. The view only applies what this returns.
 *
 * An effect is one-shot and presentation-only, exactly as a reaction clip is
 * (`bridge/reactions.ts`): played by the renderer and forgotten, never written
 * into the state, gone on reload. Its clock is the display's `deltaMs`, the
 * clock the characters already move on, so a backgrounded tab returning with
 * a five-second delta simply finds every effect expired — which is right.
 *
 * Under reduced motion an effect still appears — it carries information, "this
 * room earned twelve coins" — but nothing travels or grows: it shows and fades
 * in place.
 */

export type EffectKind = 'coins' | 'pulse' | 'sparkle' | 'puff' | 'ripple';

/**
 * How long each effect plays. Short enough that a busy hotel never stacks
 * them, long enough to read: a number the eye cannot settle on tells the
 * player nothing.
 */
export const EFFECT_MS: Readonly<Record<EffectKind, number>> = {
  coins: 900,
  pulse: 400,
  sparkle: 800,
  puff: 500,
  ripple: 350,
};

/** How far a coin number rises over its life, in world pixels. */
export const COIN_RISE_PX = 24;

/** A ring's spread, as a fraction of its full size: it starts small and opens. */
export const RING_START = 0.3;
export const RING_END = 1.2;

export interface EffectClock {
  kind: EffectKind;
  elapsedMs: number;
}

/** What the view applies: an offset, an opacity and a scale. */
export interface EffectLayout {
  /** Vertical offset from the anchor, world pixels; negative rises. */
  dy: number;
  /** 0..1 */
  alpha: number;
  /** Multiplies the view's own size. */
  scale: number;
}

export function createEffect(kind: EffectKind): EffectClock {
  return { kind, elapsedMs: 0 };
}

export function resetEffect(e: EffectClock, kind: EffectKind): void {
  e.kind = kind;
  e.elapsedMs = 0;
}

/** Advance by the frame's delta. Returns true once the effect is over. */
export function advanceEffect(e: EffectClock, deltaMs: number): boolean {
  if (deltaMs > 0) e.elapsedMs += deltaMs;
  return e.elapsedMs >= EFFECT_MS[e.kind];
}

/** Where in its life the effect is, 0..1. */
export function progress(e: EffectClock): number {
  const t = e.elapsedMs / EFFECT_MS[e.kind];
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Fast start, gentle finish: the shape of something thrown up and settling. */
export function easeOut(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

/**
 * The look of an effect at `t`.
 *
 * Every curve ends at alpha 0, so nothing pops out of existence: an effect
 * that is over is invisible before it is released. Every curve is bounded —
 * alpha in [0, 1], scale positive — whatever `t` is handed in.
 */
export function layoutFor(kind: EffectKind, t: number, reduced: boolean): EffectLayout {
  const p = t < 0 ? 0 : t > 1 ? 1 : t;
  switch (kind) {
    case 'coins': {
      // Readable for two thirds of its life, then gone. The rise is the
      // whole of the motion; under reduced motion the number holds still.
      const alpha = p < 2 / 3 ? 1 : 1 - (p - 2 / 3) * 3;
      // A small pop on arrival, so the number is seen to appear rather than
      // found already there.
      const pop = reduced ? 1 : p < 0.15 ? 0.7 + 0.3 * (p / 0.15) : 1;
      return { dy: reduced ? 0 : -COIN_RISE_PX * easeOut(p), alpha: clamp01(alpha), scale: pop };
    }
    case 'pulse':
      // A rim that is bright for an instant and fades. Nothing moves.
      return { dy: 0, alpha: 0.6 * (1 - p), scale: 1 };
    case 'sparkle': {
      // Twinkle: a scale that breathes twice over the life, under a fade
      // that is slow at first so the stars are actually seen.
      const alpha = 1 - p * p;
      const twinkle = reduced ? 1 : 1 + 0.2 * Math.sin(p * Math.PI * 4);
      return { dy: 0, alpha: clamp01(alpha), scale: twinkle };
    }
    case 'puff': {
      // A ring that opens from the centre and thins as it goes.
      const spread = reduced ? RING_END : RING_START + (RING_END - RING_START) * easeOut(p);
      return { dy: 0, alpha: 0.9 * (1 - p), scale: spread };
    }
    case 'ripple': {
      const spread = reduced ? 1 : easeOut(p);
      return { dy: 0, alpha: 0.8 * (1 - p), scale: Math.max(spread, 0.05) };
    }
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
