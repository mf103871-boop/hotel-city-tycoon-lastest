import { describe, it, expect } from 'vitest';
import {
  createEffect, resetEffect, advanceEffect, progress, layoutFor, easeOut,
  EFFECT_MS, COIN_RISE_PX, RING_END,
} from '../../src/render/anim/effect.ts';
import type { EffectKind } from '../../src/render/anim/effect.ts';

/**
 * The effect timeline, tested where it can be: this module is pure on purpose,
 * the way motion.ts and clipPlayer.ts are, because the things that go wrong in
 * a transient effect — one that never expires and leaks its pooled view, a
 * fade that ends above zero and pops out, a curve that overshoots — are all
 * arithmetic, and Pixi cannot be loaded here.
 */

const KINDS = Object.keys(EFFECT_MS) as EffectKind[];

describe('an effect expires', () => {
  it('after its own duration and not a frame before', () => {
    for (const kind of KINDS) {
      const e = createEffect(kind);
      const ms = EFFECT_MS[kind];
      // One frame short: still alive.
      expect(advanceEffect(e, ms - 16.7)).toBe(false);
      expect(progress(e)).toBeLessThan(1);
      // The frame that crosses it: over.
      expect(advanceEffect(e, 16.7)).toBe(true);
      expect(progress(e)).toBe(1);
    }
  });

  it('in one step when a backgrounded tab returns with a huge delta', () => {
    // The clock is the display's, as it is for the characters. Five seconds
    // away does not queue five seconds of effects to play on return.
    const e = createEffect('coins');
    expect(advanceEffect(e, 5000)).toBe(true);
  });

  it('is reusable: reset starts the clock again for the next use', () => {
    const e = createEffect('puff');
    advanceEffect(e, 10_000);
    resetEffect(e, 'ripple');
    expect(e.kind).toBe('ripple');
    expect(progress(e)).toBe(0);
    expect(advanceEffect(e, 1)).toBe(false);
  });

  it('never runs backwards', () => {
    const e = createEffect('pulse');
    advanceEffect(e, 100);
    advanceEffect(e, -50);
    expect(e.elapsedMs).toBe(100);
  });
});

describe('every curve is bounded and ends invisible', () => {
  const sweep = Array.from({ length: 101 }, (_, i) => i / 100);

  it('alpha stays in [0, 1] and scale stays positive for every kind and mode', () => {
    for (const kind of KINDS) {
      for (const reduced of [false, true]) {
        for (const t of sweep) {
          const l = layoutFor(kind, t, reduced);
          expect(l.alpha, `${kind} alpha at ${t}`).toBeGreaterThanOrEqual(0);
          expect(l.alpha, `${kind} alpha at ${t}`).toBeLessThanOrEqual(1);
          expect(l.scale, `${kind} scale at ${t}`).toBeGreaterThan(0);
          expect(l.scale, `${kind} scale at ${t}`).toBeLessThanOrEqual(RING_END);
          expect(l.dy, `${kind} dy at ${t}`).toBeLessThanOrEqual(0);
          expect(l.dy, `${kind} dy at ${t}`).toBeGreaterThanOrEqual(-COIN_RISE_PX);
        }
      }
    }
  });

  it('ends at alpha 0, so a finished effect never pops out of existence', () => {
    for (const kind of KINDS) {
      for (const reduced of [false, true]) {
        expect(layoutFor(kind, 1, reduced).alpha, kind).toBe(0);
      }
    }
  });

  it('is clamped outside [0, 1] rather than extrapolated', () => {
    for (const kind of KINDS) {
      expect(layoutFor(kind, -1, false)).toEqual(layoutFor(kind, 0, false));
      expect(layoutFor(kind, 2, false)).toEqual(layoutFor(kind, 1, false));
    }
  });
});

describe('what each effect does', () => {
  it('a coin number is fully readable for two thirds of its life, then fades', () => {
    expect(layoutFor('coins', 0.3, false).alpha).toBe(1);
    expect(layoutFor('coins', 0.6, false).alpha).toBe(1);
    expect(layoutFor('coins', 0.85, false).alpha).toBeLessThan(1);
    expect(layoutFor('coins', 0.85, false).alpha).toBeGreaterThan(0);
  });

  it('a coin number rises the whole way and only upward', () => {
    let last = 0;
    for (let i = 0; i <= 20; i++) {
      const dy = layoutFor('coins', i / 20, false).dy;
      expect(dy).toBeLessThanOrEqual(last);
      last = dy;
    }
    expect(last).toBeCloseTo(-COIN_RISE_PX, 5);
  });

  it('a ring opens from small to past full and never closes', () => {
    let last = 0;
    for (let i = 0; i <= 20; i++) {
      const s = layoutFor('puff', i / 20, false).scale;
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
    expect(layoutFor('puff', 0, false).scale).toBeLessThan(0.5);
    expect(last).toBeCloseTo(RING_END, 5);
  });

  it('the ripple starts from nothing and opens fully', () => {
    expect(layoutFor('ripple', 0, false).scale).toBeLessThanOrEqual(0.05);
    expect(layoutFor('ripple', 1, false).scale).toBe(1);
  });

  it('easeOut is monotonic, starts at 0 and ends at 1', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    let last = 0;
    for (let i = 0; i <= 100; i++) {
      expect(easeOut(i / 100)).toBeGreaterThanOrEqual(last);
      last = easeOut(i / 100);
    }
  });
});

describe('reduced motion', () => {
  it('shows every effect and moves nothing', () => {
    // For somebody motion affects this is whether they can play, not a
    // preference — but the information still has to arrive. The number
    // appears and fades where it is; the ring is drawn open and fades.
    const sweep = Array.from({ length: 41 }, (_, i) => i / 40);
    for (const kind of KINDS) {
      const scale0 = layoutFor(kind, 0, true).scale;
      for (const t of sweep) {
        const l = layoutFor(kind, t, true);
        expect(l.dy, `${kind} travelled under reduced motion`).toBe(0);
        expect(l.scale, `${kind} grew under reduced motion`).toBe(scale0);
      }
      // And it is visible at the start: not "reduced" to nothing.
      expect(layoutFor(kind, 0, true).alpha).toBeGreaterThan(0.5);
    }
  });
});
