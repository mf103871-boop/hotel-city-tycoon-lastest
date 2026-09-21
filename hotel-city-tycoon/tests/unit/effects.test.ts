import { describe, it, expect } from 'vitest';
import {
  FX, FX_FPS, FX_LIFE_MS, FX_STEPS, BUBBLE_LIFE_MS,
  FIELD_CAP_LITE, AMBIENT_SHARE, DUST_SHARE, LABEL_MAX_VALUE, LABEL_RISE_PX,
  PULSE_ALPHA_PEAK, PULSE_REDUCED_FRAC, BUBBLE_POP_SCALE, DUST_ALPHA_PEAK,
  GRAVITY_PX_S2, BURST_SPEED_MIN, BURST_SPEED_SPAN, BURST_SPREAD_RAD,
  createField, resetField, emit, burst, stepField, ambientCap, dustCap,
  stepsOf, stepOf, frameOf, xOf, yOf, alphaOf, scaleOf, bubbleAlphaOf, popScaleOf,
  labelRiseOf, labelOriginX, digitsOf, pulseAlphaAt,
  labelScaleFor, LABEL_SCREEN_PX, LABEL_SCALE_STEPS, LABEL_SCALE_MAX, LABEL_SCALE_ROOM_MAX,
} from '../../src/render/fx/particles.ts';
import { MIN_ZOOM, MAX_ZOOM, clampZoom } from '../../src/render/camera.ts';
import { BLOCK_H, BLOCK_W } from '../../src/render/layout.ts';
import type { ParticleField } from '../../src/render/fx/particles.ts';
import {
  GLYPHS, GLYPH_COUNT, DIGIT_COUNT, GLYPH_W, GLYPH_H, GLYPH_ADVANCE_PX,
  GLYPH_DIGIT_0, GLYPH_PLUS, MARK_SMILE, MARK_SPARKLE,
  FRAME_DIGIT_0, FRAME_PLUS, FRAME_COIN_0, FRAME_SPARK_0, FRAME_DUST_0,
  FRAME_MARK_0, FRAME_BLANK, FRAME_BUBBLE, FRAME_COUNT, FX_FRAMES,
  CELL, ATLAS_COLS, ATLAS_W, ATLAS_H, ATLAS_RES, BUBBLE_Y, BUBBLE_H, frameForGlyph,
} from '../../src/render/fx/glyphs.ts';
import {
  CUE, MAX_CUES_PER_BATCH, DIRTY_REARM_SNAPSHOTS,
  effectsFor, nextDirtyCount, ringFires,
} from '../../src/bridge/effects.ts';
import { POOL_ALPHA_OPEN } from '../../src/render/lighting.ts';
import type { GameState, SimEvent } from '../../src/core/state/types.ts';

/**
 * The effects channel, tested where it can be (HC-P2-S4, DEC-021): the whole
 * pure half — what an event asks the canvas to play, and what a particle
 * draws at a given age — is arithmetic over integers and seeds, and every
 * failure worth catching here is a number.
 *
 * The property the architecture exists for is in 'the closed form': the
 * drawn picture is a function of (spawn parameters, step) and of nothing
 * else, so a replay is identical at any frame rate. A refactor that starts
 * integrating positions per frame passes every other test in this file.
 */

/** effectsFor reads one field. Nothing else in GameState reaches it. */
const stateAt = (tick: number): GameState => ({ tick } as unknown as GameState);

const checkedOut = (roomId: string, guestId: string, coins: number): SimEvent =>
  ({ type: 'guestCheckedOut', guestId, roomId, coins, xp: 1 });

/** Drop a cue particle in with a known launch. */
function spawn(f: ParticleField, kind: number, lifeMs = FX_LIFE_MS): void {
  emit(f, kind, 1, 100, 200, 30, -40, lifeMs, 77);
}

describe('the field', () => {
  it('starts empty and comes back empty', () => {
    const f = createField(FIELD_CAP_LITE);
    expect(f.cap).toBe(FIELD_CAP_LITE);
    expect(f.live).toBe(0);
    spawn(f, FX.coin);
    expect(f.live).toBe(1);
    resetField(f);
    expect(f.live).toBe(0);
    expect(f.ambient).toBe(0);
    expect(f.dust).toBe(0);
  });

  it('never exceeds its capacity, and never loses a cue to ambience', () => {
    const f = createField(FIELD_CAP_LITE);
    for (let i = 0; i < 400; i++) emit(f, FX.dust, 0, i, i, 1, -1, FX_LIFE_MS, i);
    expect(f.live).toBeLessThanOrEqual(FIELD_CAP_LITE);
    expect(f.dust).toBeLessThanOrEqual(dustCap(FIELD_CAP_LITE));
    expect(f.dust).toBe(dustCap(FIELD_CAP_LITE));

    // Ambience of another kind still fits, up to the shared ambient ceiling.
    for (let i = 0; i < 400; i++) emit(f, FX.sparkle, 0, i, i, 0, -8, FX_LIFE_MS, i);
    expect(f.ambient).toBe(ambientCap(FIELD_CAP_LITE));
    expect(f.ambient).toBe(Math.floor(FIELD_CAP_LITE * AMBIENT_SHARE));
    expect(dustCap(FIELD_CAP_LITE)).toBe(Math.floor(FIELD_CAP_LITE * DUST_SHARE));

    // Cues fill the rest, and the next one in evicts the oldest ambient
    // rather than being refused: a player never loses the feedback for
    // something they did because somebody walked past.
    const held = f.ambient;
    for (let i = f.live; i < FIELD_CAP_LITE; i++) emit(f, FX.coin, 1, i, i, 1, -1, FX_LIFE_MS, i);
    expect(f.live).toBe(FIELD_CAP_LITE);
    expect(f.ambient).toBe(held);
    expect(emit(f, FX.coin, 1, 5, 5, 1, -1, FX_LIFE_MS, 5)).toBe(true);
    expect(f.live).toBe(FIELD_CAP_LITE);
    expect(f.ambient).toBe(held - 1);
  });

  it('refuses a cue only when every live slot is another cue', () => {
    const f = createField(4);
    for (let i = 0; i < 4; i++) expect(emit(f, FX.coin, 1, i, i, 0, 0, FX_LIFE_MS, i)).toBe(true);
    expect(emit(f, FX.coin, 1, 9, 9, 0, 0, FX_LIFE_MS, 9)).toBe(false);
    expect(emit(f, FX.dust, 0, 9, 9, 0, 0, FX_LIFE_MS, 9)).toBe(false);
    expect(f.live).toBe(4);
  });

  it('swap-removes exactly the particles whose life ran out', () => {
    const f = createField(8);
    emit(f, FX.coin, 1, 1, 1, 0, 0, 100, 1);
    emit(f, FX.coin, 1, 2, 2, 0, 0, 400, 2);
    emit(f, FX.coin, 1, 3, 3, 0, 0, 100, 3);
    emit(f, FX.coin, 1, 4, 4, 0, 0, 400, 4);
    stepField(f, 200);
    expect(f.live).toBe(2);
    const left = [f.seed[0], f.seed[1]].sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(left).toEqual([2, 4]);
    stepField(f, 300);
    expect(f.live).toBe(0);
  });

  it('keeps the ambient counters honest across death and eviction', () => {
    const f = createField(8);
    emit(f, FX.dust, 0, 0, 0, 0, 0, 100, 1);
    emit(f, FX.sparkle, 0, 0, 0, 0, 0, 100, 2);
    expect(f.ambient).toBe(2);
    expect(f.dust).toBe(1);
    stepField(f, 150);
    expect(f.ambient).toBe(0);
    expect(f.dust).toBe(0);
  });

  it('replays a burst byte for byte from the same seed', () => {
    const a = createField(32);
    const b = createField(32);
    const made = burst(a, FX.spark, 10, 20, 6, 4242, BURST_SPEED_MIN, BURST_SPEED_SPAN, BURST_SPREAD_RAD);
    burst(b, FX.spark, 10, 20, 6, 4242, BURST_SPEED_MIN, BURST_SPEED_SPAN, BURST_SPREAD_RAD);
    expect(made).toBe(6);
    for (let i = 0; i < 200; i++) { stepField(a, 16.7); stepField(b, 16.7); }
    expect(Array.from(a.vx)).toEqual(Array.from(b.vx));
    expect(Array.from(a.vy)).toEqual(Array.from(b.vy));
    expect(a.live).toBe(b.live);
  });
});

describe('the one clock', () => {
  it('gives a one-shot six steps over 500 ms', () => {
    expect(FX_FPS).toBe(12);
    expect(stepsOf(FX_LIFE_MS)).toBe(FX_STEPS);
    expect(FX_STEPS).toBe(6);
    expect(stepsOf(BUBBLE_LIFE_MS)).toBe(12);
    expect(stepsOf(0)).toBe(1);
    // The layer memoises a slot on `step * 64 + fade`, so no life may reach
    // 64 steps (5333 ms) without that stride moving with it. The longest
    // shipped life is the bubble's; particleLayer.ts throws at load if this
    // ever stops holding, and this is the same guard where a reader looks.
    for (const life of [FX_LIFE_MS, BUBBLE_LIFE_MS]) expect(stepsOf(life)).toBeLessThan(64);
  });

  it('advances exactly once per 1000/FX_FPS ms and never past the last step', () => {
    const ms = 1000 / FX_FPS;
    let last = -1;
    for (let age = 0; age < FX_LIFE_MS; age += 1) {
      const s = stepOf(age, FX_LIFE_MS, false);
      expect(s).toBe(Math.min(FX_STEPS - 1, Math.floor(age / ms)));
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
    expect(stepOf(0, FX_LIFE_MS, false)).toBe(0);
    expect(stepOf(FX_LIFE_MS * 10, FX_LIFE_MS, false)).toBe(FX_STEPS - 1);
    expect(stepOf(-5, FX_LIFE_MS, false)).toBe(0);
  });

  it('pins the position step under a request for less motion, and lets alpha run', () => {
    const f = createField(8);
    spawn(f, FX.coin);
    for (let age = 0; age < FX_LIFE_MS; age += 20) {
      expect(stepOf(age, FX_LIFE_MS, true)).toBe(0);
    }
    // Nothing travels, and no drawn frame cycles…
    expect(xOf(f, 0, 0)).toBe(100);
    expect(yOf(f, 0, 0)).toBe(200);
    expect(frameOf(FX.coin, 0)).toBe(FRAME_COIN_0);
    // …but the fade still reaches the eye, because a one-shot that never
    // leaves is worse than one that never moved.
    const late = stepOf(FX_LIFE_MS - 1, FX_LIFE_MS, false);
    expect(alphaOf(FX.coin, late, FX_STEPS)).toBeLessThan(alphaOf(FX.coin, 0, FX_STEPS));
  });
});

describe('the closed form', () => {
  it('draws the same picture however the time was chopped up', () => {
    const chunkings: number[][] = [];
    for (const dt of [400, 400 / 24, 400 / 240]) {
      const f = createField(8);
      spawn(f, FX.coin);
      const n = Math.round(400 / dt);
      for (let i = 0; i < n; i++) stepField(f, dt);
      expect(f.live).toBe(1);
      const step = stepOf(f.ageMs[0]!, f.lifeMs[0]!, false);
      chunkings.push([
        step, xOf(f, 0, step), yOf(f, 0, step),
        alphaOf(FX.coin, step, FX_STEPS), scaleOf(FX.coin, step, FX_STEPS), frameOf(FX.coin, step),
      ]);
    }
    expect(chunkings[1]).toEqual(chunkings[0]);
    expect(chunkings[2]).toEqual(chunkings[0]);
  });

  it('puts every kind on its own path, and none of them anywhere near NaN', () => {
    const f = createField(16);
    for (const kind of [FX.coin, FX.spark, FX.dust, FX.sparkle, FX.label]) {
      emit(f, kind, 1, 100, 200, 30, -40, FX_LIFE_MS, 3);
    }
    for (let i = 0; i < f.live; i++) {
      for (let step = 0; step < FX_STEPS; step++) {
        expect(Number.isFinite(xOf(f, i, step))).toBe(true);
        expect(Number.isFinite(yOf(f, i, step))).toBe(true);
      }
    }
    const coin = 0;
    const dust = 2;
    // The coin is on an arc: it rises, and gravity takes a little more of
    // each step's rise than the step before it. (Whether it lands again
    // inside 500 ms is a question for its launch speed, not for the maths:
    // this one leaves at 40 px/s, so its apex is at 267 ms and the fall back
    // would need 533. How far a real burst throws is the next describe.)
    expect(yOf(f, coin, FX_STEPS - 1)).toBeLessThan(200);
    for (let step = 2; step < FX_STEPS; step++) {
      const now = yOf(f, coin, step - 1) - yOf(f, coin, step);
      const before = yOf(f, coin, step - 2) - yOf(f, coin, step - 1);
      expect(now).toBeLessThan(before);
    }
    // Dust lifts and drags to a stop rather than flying off.
    expect(yOf(f, dust, FX_STEPS - 1)).toBeLessThan(200);
    expect(Math.abs(xOf(f, dust, FX_STEPS - 1) - 100)).toBeLessThan(30 / 3.7 + 0.001);
  });

  it('fades every kind to nothing and never below it', () => {
    for (const kind of [FX.coin, FX.spark, FX.dust, FX.sparkle, FX.label]) {
      let prev = Infinity;
      for (let step = 0; step <= FX_STEPS; step++) {
        const a = alphaOf(kind, step, FX_STEPS);
        expect(a).toBeLessThanOrEqual(1);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(prev);
        prev = a;
      }
      expect(alphaOf(kind, 0, FX_STEPS)).toBeGreaterThan(0);
      expect(alphaOf(kind, FX_STEPS, FX_STEPS)).toBe(0);
      expect(Number.isFinite(alphaOf(kind, 0, 1))).toBe(true);
    }
  });

  it('cycles a strip once and holds a mark', () => {
    for (let step = 0; step < FX_FRAMES; step++) {
      expect(frameOf(FX.coin, step)).toBe(FRAME_COIN_0 + step);
      expect(frameOf(FX.spark, step)).toBe(FRAME_SPARK_0 + step);
      expect(frameOf(FX.dust, step)).toBe(FRAME_DUST_0 + step);
    }
    expect(frameOf(FX.coin, 99)).toBe(FRAME_COIN_0 + FX_FRAMES - 1);
    expect(frameOf(FX.sparkle, 3)).toBe(frameForGlyph(MARK_SPARKLE));
    expect(frameOf(FX.label, 0)).toBe(FRAME_BLANK);
  });

  it('shrinks the sparkle and pops the bubble once', () => {
    expect(scaleOf(FX.sparkle, 0, 10)).toBeCloseTo(1, 6);
    expect(scaleOf(FX.sparkle, 10, 10)).toBeCloseTo(0.6, 6);
    expect(scaleOf(FX.coin, 3, 6)).toBe(1);
    expect(popScaleOf(0)).toBe(1);
    expect(popScaleOf(1)).toBe(BUBBLE_POP_SCALE);
    expect(popScaleOf(2)).toBe(1);
    const steps = stepsOf(BUBBLE_LIFE_MS);
    expect(bubbleAlphaOf(0, steps)).toBe(1);
    expect(bubbleAlphaOf(steps, steps)).toBe(0);
  });
});

describe('the puff and the throw', () => {
  it('fades the dust exactly once, and not while it is growing', () => {
    /*
     * `atlas.ts` bakes the strip opaque, so this ramp is the only fade the
     * puff has. The first cut had both — a falling opacity in the strip and
     * this multiplier — and the product peaked at 0.275 on the 2 px frame and
     * reached 0.0067 on the 6 px one, which is a puff that measures as
     * present and cannot be seen.
     */
    for (let step = 0; step <= 3; step++) {
      expect(alphaOf(FX.dust, step, FX_STEPS)).toBeCloseTo(DUST_ALPHA_PEAK, 6);
    }
    expect(alphaOf(FX.dust, 4, FX_STEPS)).toBeLessThan(DUST_ALPHA_PEAK);
    // The last drawn frame is the widest one; it is still on screen.
    expect(alphaOf(FX.dust, FX_STEPS - 1, FX_STEPS)).toBeGreaterThan(0.1);
    expect(alphaOf(FX.dust, FX_STEPS, FX_STEPS)).toBe(0);
  });

  it('throws the coins far enough to read as a throw', () => {
    /*
     * Apogee is v²/2g. At the 26–72 px/s this first shipped with, the slowest
     * coin rose 2.25 px against a coin 9 px across and the fastest 17 px, and
     * the drawn picture was a near-vertical column about one coin wide.
     */
    const apogeeMin = (BURST_SPEED_MIN * BURST_SPEED_MIN) / (2 * GRAVITY_PX_S2);
    expect(apogeeMin).toBeGreaterThan(GLYPH_W);
    const f = createField(32);
    expect(burst(f, FX.coin, 0, 0, 12, 20260921, BURST_SPEED_MIN, BURST_SPEED_SPAN, BURST_SPREAD_RAD)).toBe(12);
    let lo = Infinity;
    let hi = -Infinity;
    let top = Infinity;
    for (let i = 0; i < f.live; i++) {
      const x = xOf(f, i, FX_STEPS - 1);
      if (x < lo) lo = x;
      if (x > hi) hi = x;
      const y = yOf(f, i, FX_STEPS - 1);
      if (y < top) top = y;
    }
    // A fan several coins wide by the last drawn step, and a rise of more
    // than two coins: a throw rather than a pile.
    expect(hi - lo).toBeGreaterThan(3 * GLYPH_W);
    expect(-top).toBeGreaterThan(2 * GLYPH_W);
  });
});

describe('the floating number', () => {
  it('decomposes a value into digits without ever making a string', () => {
    const buf = new Int8Array(6);
    const read = (v: number): number[] => {
      const n = digitsOf(v, buf);
      const out: number[] = [];
      for (let i = n - 1; i >= 0; i--) out.push(buf[i]!);
      return out;
    };
    expect(read(0)).toEqual([0]);
    expect(read(7)).toEqual([7]);
    expect(read(25)).toEqual([2, 5]);
    expect(read(999)).toEqual([9, 9, 9]);
    expect(read(LABEL_MAX_VALUE)).toEqual([9, 9, 9, 9, 9, 9]);
    expect(read(1_000_000)).toEqual([9, 9, 9, 9, 9, 9]);
    expect(read(-5)).toEqual([0]);
  });

  it('centres the label on its anchor and never overlaps two digits', () => {
    expect(labelOriginX(100, 1)).toBe(100);
    expect(labelOriginX(100, 3)).toBe(100 - GLYPH_ADVANCE_PX);
    expect(labelOriginX(100, 7)).toBe(100 - 3 * GLYPH_ADVANCE_PX);
    expect(GLYPH_ADVANCE_PX).toBeGreaterThanOrEqual(GLYPH_W);
  });

  it('centres a magnified label too, and keeps its digits apart', () => {
    // The advance carries the scale, or the digits of a 5x number sit on top
    // of one another — the whole run has to grow, not just each glyph.
    for (const scale of [1, 2.5, LABEL_SCALE_MAX]) {
      expect(labelOriginX(100, 1, scale)).toBe(100);
      expect(labelOriginX(100, 3, scale)).toBe(100 - GLYPH_ADVANCE_PX * scale);
      // The run is centred: the midpoint of first and last sprite is the anchor.
      const n = 4;
      const x0 = labelOriginX(100, n, scale);
      const last = x0 + (n - 1) * GLYPH_ADVANCE_PX * scale;
      expect((x0 + last) / 2).toBeCloseTo(100, 10);
      // Neighbouring glyph boxes still cannot touch.
      expect(GLYPH_ADVANCE_PX * scale).toBeGreaterThanOrEqual(GLYPH_W * scale);
    }
  });

  it('rises 24 px in six steps, easing out', () => {
    expect(labelRiseOf(0, FX_STEPS)).toBe(0);
    expect(labelRiseOf(FX_STEPS, FX_STEPS)).toBeCloseTo(LABEL_RISE_PX, 6);
    // Ease-out: more than half the rise is done by the halfway step.
    expect(labelRiseOf(3, FX_STEPS)).toBeGreaterThan(LABEL_RISE_PX / 2);
    for (let s = 1; s <= FX_STEPS; s++) {
      expect(labelRiseOf(s, FX_STEPS)).toBeGreaterThan(labelRiseOf(s - 1, FX_STEPS));
    }
    // And the rise is NOT scaled by the screen-space compensation: the size
    // is pinned to the glass, the travel stays in the world, which is what
    // keeps a magnified number inside the room that earned it and below the
    // reaction card it was re-seated under (HC-P2-S4 §9).
    expect(labelRiseOf.length).toBe(2);
  });
});

describe('the number is pinned to the glass, not to the world («كبر الرقم»)', () => {
  it('never shrinks the number, and changes nothing at or above room zoom', () => {
    // The whole promise of the clamp: at the zoom the S4 evidence was shot at
    // the channel draws exactly what it drew before, so no capture, no
    // measurement and no test taken there is invalidated by this step.
    expect(labelScaleFor(LABEL_SCREEN_PX / GLYPH_H)).toBe(1);
    expect(labelScaleFor(2.02)).toBe(1);
    expect(labelScaleFor(3)).toBe(1);
    expect(labelScaleFor(MAX_ZOOM)).toBe(1);
    for (let z = 2; z <= MAX_ZOOM; z += 0.05) expect(labelScaleFor(z)).toBe(1);
  });

  it('never draws a digit smaller than LABEL_SCREEN_PX, everywhere the pin can reach', () => {
    // The property the whole step is, written as the inequality it claims to
    // be. It holds only because the quantisation rounds UP: rounded to
    // nearest the digit falls to 23.27 CSS px at zoom 1.9394 and the promise
    // — 'its world size or LABEL_SCREEN_PX, whichever is larger' — would be
    // false almost everywhere off the grid.
    const pinFloor = LABEL_SCREEN_PX / (GLYPH_H * LABEL_SCALE_MAX);   // 0.5x today
    for (let z = pinFloor; z <= MAX_ZOOM + 1e-9; z += 0.0005) {
      expect(labelScaleFor(z) * GLYPH_H * z).toBeGreaterThanOrEqual(LABEL_SCREEN_PX - 1e-9);
    }
    // And it is not larger than it needs to be: within one step of the grid.
    const step = 1 / LABEL_SCALE_STEPS;
    for (const zoom of [0.5, 0.75, 1, 1.5, 1.9]) {
      expect(labelScaleFor(zoom) * GLYPH_H * zoom)
        .toBeLessThanOrEqual(LABEL_SCREEN_PX + step * GLYPH_H * zoom + 1e-9);
    }
    // Below that floor the world's ceiling binds instead, and says so in
    // numbers: at the phone's fit zoom the digit is 19.2 CSS px, four times
    // the 4.8 it was, and half a storey tall in the world.
    expect(labelScaleFor(0.4)).toBe(LABEL_SCALE_ROOM_MAX);
    expect(labelScaleFor(0.4) * GLYPH_H * 0.4).toBeCloseTo(19.2, 10);
  });

  it('never lets a number outgrow the room it is about', () => {
    // The ceiling that is not about the glass at all. A `+N` says *this room
    // paid*; a number taller than half a storey is read against the floor
    // above as readily as against the room that earned it, and one wider than
    // a room stops pointing at anything. Half a storey is the rule, the width
    // is the consequence, and both are measured here rather than trusted.
    expect(LABEL_SCALE_ROOM_MAX).toBe(BLOCK_H / (2 * GLYPH_H));
    for (let z = MIN_ZOOM; z <= MAX_ZOOM + 1e-9; z += 0.001) {
      expect(GLYPH_H * labelScaleFor(z)).toBeLessThanOrEqual(BLOCK_H / 2 + 1e-9);
    }
    // The common three-sprite `+NN` stays inside one room's width at the
    // camera floor; a four-sprite amount does not, which is recorded rather
    // than hidden (the step report's own measurement).
    const k = labelScaleFor(MIN_ZOOM);
    const cell = (n: number): number => (n - 1) * GLYPH_ADVANCE_PX * k + GLYPH_W * k;
    expect(cell(3)).toBeLessThanOrEqual(BLOCK_W);
    expect(cell(4)).toBeGreaterThan(BLOCK_W);
    // And the number's whole travel — its own half-height plus its rise —
    // never climbs a storey, because the rise is not scaled.
    expect((GLYPH_H * k) / 2 + LABEL_RISE_PX).toBeLessThanOrEqual(BLOCK_H);
  });

  it('is magnified from the sheet no more than the owner already read without effort', () => {
    // ATLAS_RES stays 2, and this is the number that says why. A pinned digit
    // on the phone in the evidence (412x915 at device pixel ratio 2) asks for
    // LABEL_SCREEN_PX * 2 = 48 device px from GLYPH_H * ATLAS_RES = 24
    // texels: a 2:1 magnification. That is the same 2:1 the same phone
    // already applied at the room zoom of `burst-room-phone-full-withhud.png`
    // — 12 * 2.02 * 2 = 48.5 device px from the same 24 texels — which
    // docs/HC-P2-S4-REPORT.md calls «مقروء بلا جهد». Raising ATLAS_RES to 4
    // would fix nothing measured and would minify 2:1 on the desktop lane,
    // where there is no mip chain. If either constant moves, this says so.
    const DPR = 2;                       // src/render/app.ts caps the renderer here
    expect((LABEL_SCREEN_PX * DPR) / (GLYPH_H * ATLAS_RES)).toBeLessThanOrEqual(2);
    // And at the phone's fit zoom, where the world's ceiling binds, it is
    // less again: 12 * 4 * 0.4 * 2 = 38.4 device px from the same 24 texels.
    expect((GLYPH_H * labelScaleFor(MIN_ZOOM) * MIN_ZOOM * DPR) / (GLYPH_H * ATLAS_RES))
      .toBeCloseTo(1.6, 10);
  });

  it('is bounded by the camera, and answers 1 to anything that is not a camera', () => {
    // The ceiling is the smaller of the two, rounded onto the grid so that
    // the quantised answer cannot step over it (`24 / (12 * 0.4)` is not 5 in
    // binary floating point, and a clamp its own value can exceed is not one).
    expect(LABEL_SCALE_MAX)
      .toBeCloseTo(Math.min(LABEL_SCREEN_PX / (GLYPH_H * MIN_ZOOM), LABEL_SCALE_ROOM_MAX), 10);
    expect(LABEL_SCALE_MAX * LABEL_SCALE_STEPS).toBe(Math.round(LABEL_SCALE_MAX * LABEL_SCALE_STEPS));
    // The camera cannot ask for more than the floor of its own zoom range.
    for (let z = MIN_ZOOM; z <= MAX_ZOOM; z += 0.01) {
      const k = labelScaleFor(clampZoom(z));
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k).toBeLessThanOrEqual(LABEL_SCALE_MAX);
    }
    expect(labelScaleFor(MIN_ZOOM / 10)).toBe(LABEL_SCALE_MAX);
    // A camera change is the one edit that can silently double the number.
    expect(LABEL_SCALE_MAX).toBeLessThanOrEqual(6);
    for (const bad of [0, -1, NaN, Infinity, -Infinity]) expect(labelScaleFor(bad)).toBe(1);
  });

  it('answers on a grid, so a pinch does not re-lay out every frame', () => {
    const seen = new Set<number>();
    for (let z = MIN_ZOOM; z <= MAX_ZOOM; z += 0.001) seen.add(labelScaleFor(z));
    // Every answer sits on the quantisation grid...
    for (const k of seen) expect(Math.abs(k * LABEL_SCALE_STEPS - Math.round(k * LABEL_SCALE_STEPS))).toBeLessThan(1e-9);
    // ...and the whole zoom range yields a bounded number of them, which is
    // the bound on how often a pinch re-lays out a live number.
    expect(seen.size).toBeLessThanOrEqual(Math.round((LABEL_SCALE_MAX - 1) * LABEL_SCALE_STEPS) + 1);
    // Monotone: zooming out never makes the number smaller.
    let prev = labelScaleFor(MAX_ZOOM);
    for (let z = MAX_ZOOM; z >= MIN_ZOOM; z -= 0.001) {
      const k = labelScaleFor(z);
      expect(k).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = k;
    }
  });
});

describe('the glyph tables', () => {
  it('holds one entry per glyph, and a drawable path in each', () => {
    expect(GLYPHS.length).toBe(GLYPH_COUNT);
    // Ten digits, a plus and six marks. There is no sleeper's `z`: the rig
    // draws a lying sleeper two of its own (HC-P2-S4 §9 row 1).
    expect(GLYPH_COUNT).toBe(17);
    for (let i = 0; i < GLYPHS.length; i++) {
      const strokes = GLYPHS[i]!;
      expect(strokes.length).toBeGreaterThan(0);
      for (const s of strokes) {
        expect(s.points.length).toBeGreaterThanOrEqual(4);
        expect(s.points.length % 2).toBe(0);
        expect(s.fill !== null || s.stroke !== null).toBe(true);
        for (let k = 0; k < s.points.length; k += 2) {
          expect(s.points[k]!).toBeGreaterThanOrEqual(0);
          expect(s.points[k]!).toBeLessThanOrEqual(GLYPH_W);
          expect(s.points[k + 1]!).toBeGreaterThanOrEqual(0);
          expect(s.points[k + 1]!).toBeLessThanOrEqual(GLYPH_H);
        }
      }
    }
    for (let d = 0; d < DIGIT_COUNT; d++) expect(GLYPHS[GLYPH_DIGIT_0 + d]!.length).toBeGreaterThan(0);
  });

  it('paints every ink rim before any cream body', () => {
    /*
     * The order is `expand()`'s whole job. Rim-then-body *per shape* lets the
     * second shape's rim — `PEN_RIM_EXTRA` wider than its body, so 1.6 px
     * either side of the line — paint over the first shape's cream: it cost
     * the plus its arms and ate the joins of 1, 4, 8 and 9. Rims first means
     * the widths fall monotonically across a glyph, which is checkable
     * without knowing which stroke is which.
     */
    for (let g = 0; g < GLYPH_COUNT; g++) {
      let prev = Infinity;
      for (const s of GLYPHS[g]!) {
        expect(s.width).toBeLessThanOrEqual(prev);
        prev = s.width;
      }
    }
  });

  it('draws the plus as a cross, not a bar with two nubs', () => {
    const strokes = GLYPHS[GLYPH_PLUS]!;
    expect(strokes.length).toBe(4);
    const rim = strokes[0]!;
    const bodyA = strokes[2]!;
    const bodyB = strokes[3]!;
    expect(strokes[1]!.stroke).toBe(rim.stroke);
    expect(bodyB.stroke).toBe(bodyA.stroke);
    expect(rim.width).toBeGreaterThan(bodyA.width);
    // The arm is the body whose two ends share a y; the stem is the other.
    const arm = bodyA.points[1] === bodyA.points[3] ? bodyA : bodyB;
    const stem = arm === bodyA ? bodyB : bodyA;
    const armLeft = Math.min(arm.points[0]!, arm.points[2]!) - arm.width / 2;
    const armRight = Math.max(arm.points[0]!, arm.points[2]!) + arm.width / 2;
    const stemRimLeft = stem.points[0]! - rim.width / 2;
    const stemRimRight = stem.points[0]! + rim.width / 2;
    // More than a pixel of cream outside the stem's ink rim on each side.
    expect(stemRimLeft - armLeft).toBeGreaterThan(1.2);
    expect(armRight - stemRimRight).toBeGreaterThan(1.2);
  });

  it('keeps the smile a face: the eyes and the mouth never touch', () => {
    // Three strokes with round caps inside one 9x12 box. At the digits' 1.8
    // pen the eyes' caps reached y 6.1 and the mouth's started at 5.9, and
    // the card carried a dark blob instead of a face.
    const strokes = GLYPHS[MARK_SMILE]!;
    expect(strokes.length).toBe(3);
    const w = strokes[0]!.width;
    for (const s of strokes) expect(s.width).toBe(w);
    let eyeBottom = -Infinity;
    for (const eye of [strokes[0]!, strokes[1]!]) {
      for (let k = 1; k < eye.points.length; k += 2) eyeBottom = Math.max(eyeBottom, eye.points[k]!);
    }
    let mouthTop = Infinity;
    const mouth = strokes[2]!;
    for (let k = 1; k < mouth.points.length; k += 2) mouthTop = Math.min(mouthTop, mouth.points[k]!);
    expect(mouthTop - w / 2 - (eyeBottom + w / 2)).toBeGreaterThanOrEqual(w);
  });

  it('maps every glyph to its own atlas frame, inside the grid', () => {
    const seen = new Set<number>();
    for (let g = 0; g < GLYPH_COUNT; g++) {
      const frame = frameForGlyph(g);
      expect(frame).toBeGreaterThanOrEqual(0);
      expect(frame).toBeLessThan(FRAME_BLANK);
      expect(seen.has(frame)).toBe(false);
      seen.add(frame);
    }
    expect(frameForGlyph(GLYPH_DIGIT_0 + 4)).toBe(FRAME_DIGIT_0 + 4);
    expect(frameForGlyph(GLYPH_PLUS)).toBe(FRAME_PLUS);
    expect(frameForGlyph(MARK_SMILE)).toBe(FRAME_MARK_0);
    expect(frameForGlyph(-1)).toBe(FRAME_BLANK);
  });

  it('fits the grid and the bubble inside one atlas', () => {
    expect(ATLAS_W).toBe(CELL * ATLAS_COLS);
    const rows = Math.ceil((FRAME_BLANK + 1) / ATLAS_COLS);
    expect(rows * CELL).toBeLessThanOrEqual(BUBBLE_Y);
    expect(BUBBLE_Y + BUBBLE_H).toBeLessThanOrEqual(ATLAS_H);
    expect(FRAME_COUNT).toBe(FRAME_BUBBLE + 1);
    expect(FRAME_SPARK_0).toBe(FRAME_COIN_0 + FX_FRAMES);
    expect(FRAME_DUST_0).toBe(FRAME_SPARK_0 + FX_FRAMES);
    expect(FRAME_MARK_0).toBe(FRAME_DUST_0 + FX_FRAMES);
  });
});

describe('the room pulse', () => {
  it('never pushes a room past the light that already ships', () => {
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      expect(pulseAlphaAt(u, 0, false)).toBeLessThanOrEqual(PULSE_ALPHA_PEAK + 1e-9);
      expect(pulseAlphaAt(u, 0.4, false)).toBeLessThanOrEqual(POOL_ALPHA_OPEN - 0.4 + 1e-9);
      expect(pulseAlphaAt(u, POOL_ALPHA_OPEN, false)).toBe(0);
      expect(pulseAlphaAt(u, POOL_ALPHA_OPEN + 0.1, false)).toBe(0);
    }
    expect(pulseAlphaAt(0.5, 0, false)).toBeCloseTo(PULSE_ALPHA_PEAK, 6);
    expect(pulseAlphaAt(0, 0, false)).toBe(0);
    expect(pulseAlphaAt(1, 0, false)).toBeCloseTo(0, 9);
  });

  it('holds one alpha for its whole life under a request for less motion', () => {
    const held = pulseAlphaAt(0, 0, true);
    expect(held).toBeCloseTo(PULSE_ALPHA_PEAK * PULSE_REDUCED_FRAC, 6);
    for (let i = 0; i <= 10; i++) expect(pulseAlphaAt(i / 10, 0, true)).toBe(held);
    expect(pulseAlphaAt(0.5, POOL_ALPHA_OPEN - 0.01, true)).toBeCloseTo(0.01, 6);
  });
});

describe('effectsFor', () => {
  it('answers every event in the table, and nothing else', () => {
    const one = (event: SimEvent): ReturnType<typeof effectsFor> => effectsFor(stateAt(3), [event]);
    expect(one(checkedOut('r1', 'g1', 25))[0]).toMatchObject({ kind: CUE.payout, roomId: 'r1', charId: 'g1', amount: 25 });
    expect(one({ type: 'guestPoked', guestId: 'g2', coins: 4 })[0]).toMatchObject({ kind: CUE.payout, roomId: '', charId: 'g2', amount: 4 });
    expect(one({ type: 'starBonusPaid', stars: 3, coins: 900 })[0]).toMatchObject({ kind: CUE.payout, amount: 900 });
    expect(one({ type: 'hazardCleared', roomId: 'r2', hazard: 'pest', coins: 12 })[0]).toMatchObject({ kind: CUE.clear, roomId: 'r2', amount: 12 });
    expect(one({ type: 'guestLeftAngry', guestId: 'g3', reason: 'noRoom' })[0]).toMatchObject({ kind: CUE.refuse, charId: 'g3', amount: 0 });
    expect(one({ type: 'guestCheckedIn', guestId: 'g4', roomId: 'r3' })[0]).toMatchObject({ kind: CUE.greet, roomId: 'r3', charId: 'g4' });
    expect(one({ type: 'nothingFound', guestId: 'g5' })[0]).toMatchObject({ kind: CUE.puzzled, charId: 'g5' });
    expect(one({ type: 'desireUnmet', guestId: 'g6', tag: 'gym' })[0]).toMatchObject({ kind: CUE.puzzled, charId: 'g6' });
    expect(one({ type: 'levelUp', level: 4, rewardCoins: 500, rewardGems: 2 })[0]).toMatchObject({ kind: CUE.triumph, amount: 500 });

    // The inspector pays and is praised: two cues, one event.
    const inspector = one({ type: 'inspectorFound', guestId: 'g7', coins: 60, xp: 5, boost: 1 });
    expect(inspector.map((c) => c.kind)).toEqual([CUE.payout, CUE.praise]);
    expect(inspector[0]!.amount).toBe(60);
    expect(inspector[1]!.amount).toBe(0);

    // A service call is money going the other way: a clear, and no number.
    const service = one({ type: 'serviceCalled', service: 'repair', coins: 250, cleared: 1 });
    expect(service).toHaveLength(1);
    expect(service[0]).toMatchObject({ kind: CUE.clear, roomId: '', amount: 0 });

    // Stars only celebrate upward.
    expect(one({ type: 'starsChanged', from: 2, to: 3 })).toHaveLength(1);
    expect(one({ type: 'starsChanged', from: 3, to: 2 })).toHaveLength(0);

    // Everything else is the HUD's business, not the canvas's.
    expect(one({ type: 'guestArrived', guestId: 'g8', typeId: 'tourist' })).toHaveLength(0);
    expect(one({ type: 'incomeBlocked', roomId: 'r1', reason: 'dirty' })).toHaveLength(0);
    expect(one({ type: 'shopPurchase', defId: 'd', price: 1, saved: 0 })).toHaveLength(0);
  });

  it('merges same-room checkouts and sums their coins', () => {
    const cues = effectsFor(stateAt(9), [
      checkedOut('r1', 'g1', 25), checkedOut('r2', 'g2', 10), checkedOut('r1', 'g3', 5),
    ]);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ roomId: 'r1', charId: 'g1', amount: 30 });
    expect(cues[1]).toMatchObject({ roomId: 'r2', amount: 10 });
  });

  it('plays nothing at all for a batch that came back from being away', () => {
    const settled: SimEvent[] = [checkedOut('r1', 'g1', 25), checkedOut('r2', 'g2', 25), checkedOut('r3', 'g3', 25)];
    expect(effectsFor(stateAt(1), settled)).toHaveLength(3);
    expect(effectsFor(stateAt(1), [...settled, { type: 'offlineResolved', elapsedMs: 9e6, coins: 75, xp: 9, guestsServed: 3 }])).toEqual([]);
    expect(effectsFor(stateAt(1), [...settled, { type: 'graceEnded', settled: 3 }])).toEqual([]);
    // The order inside the batch does not matter: the scan runs first.
    expect(effectsFor(stateAt(1), [{ type: 'graceEnded', settled: 3 }, ...settled])).toEqual([]);
  });

  it('keeps the newest cues when a catch-up batch floods it', () => {
    const events: SimEvent[] = [];
    for (let i = 0; i < 40; i++) events.push(checkedOut(`r${i}`, `g${i}`, i + 1));
    const cues = effectsFor(stateAt(2), events);
    expect(cues).toHaveLength(MAX_CUES_PER_BATCH);
    expect(cues[0]!.roomId).toBe('r28');
    expect(cues[MAX_CUES_PER_BATCH - 1]!.roomId).toBe('r39');
  });

  it('replays the same batch identically', () => {
    const events: SimEvent[] = [
      checkedOut('r1', 'g1', 25),
      { type: 'levelUp', level: 2, rewardCoins: 100, rewardGems: 1 },
      { type: 'hazardCleared', roomId: 'r2', hazard: 'fire', coins: 30 },
    ];
    expect(JSON.stringify(effectsFor(stateAt(1234), events))).toBe(JSON.stringify(effectsFor(stateAt(1234), events)));
    // …and differently from another tick, so two bursts a second apart are
    // not the same burst twice.
    expect(effectsFor(stateAt(1234), events)[0]!.seed).not.toBe(effectsFor(stateAt(1235), events)[0]!.seed);
    for (const cue of effectsFor(stateAt(1234), events)) {
      expect(Number.isInteger(cue.seed)).toBe(true);
      expect(cue.seed).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('the cleaning latch', () => {
  it('fires once, after the room has been dirty long enough', () => {
    let count = 0;
    for (let i = 0; i < DIRTY_REARM_SNAPSHOTS; i++) {
      expect(ringFires(count, true, false)).toBe(false);
      count = nextDirtyCount(count, true);
    }
    expect(count).toBe(DIRTY_REARM_SNAPSHOTS);
    expect(ringFires(count, false, false)).toBe(true);
    count = nextDirtyCount(count, false);
    expect(count).toBe(0);
    // And not again on the next clean snapshot.
    expect(ringFires(count, false, false)).toBe(false);
  });

  it('says nothing about a flap inside the re-arm window', () => {
    let count = 0;
    count = nextDirtyCount(count, true);
    count = nextDirtyCount(count, true);
    expect(ringFires(count, false, false)).toBe(false);
  });

  it('stays quiet for a room that already has a clear cue this batch', () => {
    let count = 0;
    for (let i = 0; i < DIRTY_REARM_SNAPSHOTS + 2; i++) count = nextDirtyCount(count, true);
    expect(ringFires(count, false, true)).toBe(false);
    expect(ringFires(count, false, false)).toBe(true);
  });
});
