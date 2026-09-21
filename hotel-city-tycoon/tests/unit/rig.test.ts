import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  pose, createRigState, resetRigState, figureFor, ik, cycle, gridT, boundsOf, headExtent, walkSlidePx,
  seedUnit, NEUTRAL_INPUT, GRID_CLIPS,
  RIG_TOTAL_PER_HEIGHT, RIG_HEAD_R, RIG_HEAD_R_CHILD, RIG_HIP, RIG_BODY_TOP, RIG_LEG_REACH, SHOULDER, HIP_SOCKET,
  STAND_SPACE_PX, CELL_HALF_WIDTH_PX, STRIDE_PX, STRIDE_AMP, FOOT_LIFT_MAX, BOB_WALK_MAX, BOB_IDLE_MAX,
  SQUASH_MAX, SQUASH_IDLE, HEAD_LAG_MAX, HEAD_TILT_SLEEP, LEAN_MAX, HOP_MAX, STAMP_MAX, SIT_DROP, SIT_FEET_FORWARD,
  BOB_SIT, WORK_REACH, HOP,
} from '../../src/render/anim/rig.ts';
import type { Pt, Pose, RigClip, RigHold, RigInput, RigMood, RigProportions } from '../../src/render/anim/rig.ts';
import { CAST, PALETTE, PROP_EXTENT, lookFor, castIds, shade, lighten } from '../../src/render/anim/cast.ts';
import type { Look } from '../../src/render/anim/cast.ts';
import { createPlayer, advance, playOnce, progress } from '../../src/render/anim/clipPlayer.ts';
import type { ClipTiming } from '../../src/render/anim/clipPlayer.ts';
import { renderFlags, tierFor, setMotionTier, motionTier } from '../../src/render/quality.ts';
import { BODY_HALF_WIDTH_PX } from '../../src/core/systems/roomWaypoints.ts';
import { MAX_DT_S } from '../../src/render/anim/motion.ts';

/**
 * The live rig, tested where it can be (HC-P2-S3, DEC-020): the pose is
 * arithmetic on a seed, a clip progress and a distance, and everything that
 * goes wrong in a procedural character — a limb that snaps to NaN when its
 * target is out of reach, feet that march on the spot, a bob that lifts the
 * hip past what the legs span, a head that floats off a squashed torso —
 * is a number that can be checked without a browser.
 *
 * The bounds asserted here are the constants DEC-020 signs. They are computed
 * from `pose()` over every clip and phase, never assumed: a first-run failure
 * is a transcription error to fix, not a bound to relax.
 */

const ROOT = path.resolve(import.meta.dirname, '../..');
const readJson = (rel: string): unknown => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const CLIPS: readonly RigClip[] = ['idle', 'walk', 'work', 'sleep', 'sit', 'happy', 'angry', 'scared'];
const MOODS: readonly RigMood[] = ['neutral', 'impatient', 'happy', 'angry'];
const HOLDS: readonly RigHold[] = [null, 'shiftWeight', 'glance'];

/** Frame counts per clip from the animation files, so the grids tested are the shipped ones. */
const animationFiles = fs.readdirSync(path.join(ROOT, 'data/animations')).filter((f) => f.endsWith('.json')).sort();
const animations = animationFiles.map((f) => readJson(`data/animations/${f}`) as {
  id: string; clips: Record<string, ClipTiming>;
});
const framesOf = (clip: RigClip): number => animations[0]?.clips[clip]?.frames ?? 1;

const input = (over: Partial<RigInput> = {}): RigInput => ({ ...NEUTRAL_INPUT, ...over });
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
const NOMINAL = figureFor('normal', 1, 'adult');

function boneLengthsHold(p: Pose, f: RigProportions, eps = 1e-6): void {
  expect(Math.abs(dist(p.kneeL, p.hipL) - f.thigh)).toBeLessThanOrEqual(eps);
  expect(Math.abs(dist(p.kneeR, p.hipR) - f.thigh)).toBeLessThanOrEqual(eps);
  expect(Math.abs(dist(p.footL, p.kneeL) - f.shin)).toBeLessThanOrEqual(eps);
  expect(Math.abs(dist(p.footR, p.kneeR) - f.shin)).toBeLessThanOrEqual(eps);
  expect(Math.abs(dist(p.elbowL, p.shoulderL) - f.upperArm)).toBeLessThanOrEqual(eps);
  expect(Math.abs(dist(p.elbowR, p.shoulderR) - f.upperArm)).toBeLessThanOrEqual(eps);
  expect(Math.abs(dist(p.handL, p.elbowL) - f.foreArm)).toBeLessThanOrEqual(eps);
  expect(Math.abs(dist(p.handR, p.elbowR) - f.foreArm)).toBeLessThanOrEqual(eps);
}

function everyNumber(p: Pose): number[] {
  const out: number[] = [];
  for (const v of Object.values(p)) {
    if (typeof v === 'number') out.push(v);
    else if (typeof v === 'object' && v !== null) out.push((v as Pt).x, (v as Pt).y);
  }
  return out;
}

/** A pose as a string, for byte-identical comparisons. */
const snapshot = (p: Pose): string => JSON.stringify(p);

function walkFor(rs: ReturnType<typeof createRigState>, f: RigProportions, px: number, frames: number, over: Partial<RigInput> = {}): void {
  for (let i = 0; i < frames; i++) {
    pose(rs, f, input({ clip: 'walk', frames: framesOf('walk'), movedPx: px / frames, dtS: 1 / 60, ...over }));
  }
}

const boundsLookFor = (look: Look, clip: RigClip) => {
  const prop = clip === 'work' ? look.propWork : look.prop;
  const ext = prop ? PROP_EXTENT[prop] : { halfWidth: 0, above: 0 };
  return { hairStyle: look.hairStyle, capStyle: look.capStyle, propHalfWidth: ext.halfWidth, propAbove: ext.above };
};

describe('ik', () => {
  const root: Pt = { x: 0, y: -13 };

  it('never returns NaN: out of reach, on top of the root, or with a clamped dt', () => {
    const joint: Pt = { x: 0, y: 0 };
    const end: Pt = { x: 0, y: 0 };
    for (const target of [{ x: 0, y: 40 }, { x: 0, y: -13 }, { x: 1e-9, y: -13 }, { x: 30, y: -13 }, { x: 0, y: 0 }]) {
      ik(root, target, 7, 7, -1, joint, end);
      expect(Number.isFinite(joint.x) && Number.isFinite(joint.y)).toBe(true);
      expect(Number.isFinite(end.x) && Number.isFinite(end.y)).toBe(true);
      expect(Math.abs(dist(joint, root) - 7)).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(dist(end, joint) - 7)).toBeLessThanOrEqual(1e-6);
    }
    // The dt clamp is pose()'s: a 10 s frame and a 0 s frame both pose finitely.
    const f = NOMINAL;
    for (const dtS of [0, 10]) {
      const rs = createRigState(3);
      const p = pose(rs, f, input({ clip: 'walk', frames: 8, movedPx: 500, dtS }));
      for (const v of everyNumber(p)) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('reaches the target when it can, and stops on the ray when it cannot', () => {
    const joint: Pt = { x: 0, y: 0 };
    const end: Pt = { x: 0, y: 0 };
    ik(root, { x: 2, y: -3 }, 7, 7, -1, joint, end);
    expect(end).toEqual({ x: 2, y: -3 });
    ik(root, { x: 0, y: 20 }, 7, 7, -1, joint, end);
    expect(Math.abs(end.x)).toBeLessThanOrEqual(1e-9);
    expect(end.y).toBeCloseTo(-13 + 14 - 0.001, 9);
    // `outEnd` may alias the target.
    const t: Pt = { x: 0, y: 20 };
    ik(root, t, 7, 7, -1, joint, t);
    expect(t.y).toBeCloseTo(-13 + 14 - 0.001, 9);
  });

  it('bendSign picks the mirror solution', () => {
    const a: Pt = { x: 0, y: 0 }; const b: Pt = { x: 0, y: 0 }; const e: Pt = { x: 0, y: 0 };
    ik(root, { x: 0, y: 0 }, 7, 7, -1, a, e);
    ik(root, { x: 0, y: 0 }, 7, 7, 1, b, e);
    expect(a.x).toBeGreaterThan(0);
    expect(b.x).toBeCloseTo(-a.x, 9);
    expect(a.y).toBeCloseTo(b.y, 9);
  });
});

describe('figureFor', () => {
  /** hcstyle `_figure` (hcstyle.py:670-695), in rig coordinates, with its own head ratio. */
  const python = (build: 'slim' | 'normal' | 'broad', height: number, age: 'adult' | 'senior' | 'child', headRatio: number) => {
    const total = 60 * height;
    const headR = total * headRatio;
    const headCy = -total + headR;
    return {
      total, headR, headCy, bodyTop: headCy + headR * 0.86, hipY: -total * 0.215,
      shoulder: { slim: 10, normal: 11.4, broad: 13.2 }[build] * (age === 'child' ? 0.86 : 1),
    };
  };

  it('equals hcstyle _figure on every derived field, with RIG_HEAD_R as the one declared delta', () => {
    for (const build of ['slim', 'normal', 'broad'] as const) {
      for (const height of [0.92, 0.94, 0.98, 1, 1.02, 1.04, 1.08]) {
        for (const age of ['adult', 'senior', 'child'] as const) {
          const f = figureFor(build, height, age);
          const ref = python(build, height, age, age === 'child' ? RIG_HEAD_R_CHILD : RIG_HEAD_R);
          expect(f.total).toBeCloseTo(ref.total, 9);
          expect(f.headR).toBeCloseTo(ref.headR, 9);
          expect(f.headCy).toBeCloseTo(ref.headCy, 9);
          expect(f.bodyTop).toBeCloseTo(ref.bodyTop, 9);
          expect(f.hipY).toBeCloseTo(ref.hipY, 9);
          expect(f.shoulder).toBeCloseTo(ref.shoulder, 9);
          // The rig's own additions, derived from the Python's numbers.
          expect(f.torso).toBeCloseTo(f.hipY - f.bodyTop, 9);
          expect(f.torsoH).toBeCloseTo(f.torso + 1.6, 9);
          expect(f.thigh).toBeCloseTo((-f.hipY / 2) * RIG_LEG_REACH, 9);
          expect(f.shin).toBe(f.thigh);
          expect(f.upperArm).toBeCloseTo((f.torsoH * 0.72) / 2, 9);
          expect(f.foreArm).toBe(f.upperArm);
          expect(f.armY).toBeCloseTo(f.bodyTop + 0.26 * f.torsoH, 9);
          // And hcstyle's own 0.235 would be a different head, so the delta is real.
          const sheet = python(build, height, age, 0.235);
          if (age !== 'child') expect(f.headR).not.toBeCloseTo(sheet.headR, 3);
        }
      }
    }
  });

  it('stands the nominal person at 60 rig px with a 54% head and the signed constants', () => {
    expect(RIG_TOTAL_PER_HEIGHT).toBe(60);
    expect(RIG_HEAD_R).toBe(0.27);
    expect(RIG_HIP).toBe(0.215);
    expect(RIG_BODY_TOP).toBe(0.86);
    expect(SHOULDER).toEqual({ slim: 10, normal: 11.4, broad: 13.2 });
    expect(NOMINAL.total).toBe(60);
    expect((2 * NOMINAL.headR) / NOMINAL.total).toBeCloseTo(0.54, 9);
    expect(-NOMINAL.hipY).toBeCloseTo(0.215 * 60, 9);
    expect(NOMINAL.headR).toBeCloseTo(16.2, 9);
    expect(NOMINAL.bodyTop).toBeCloseTo(-29.868, 3);
    expect(NOMINAL.thigh).toBeCloseTo(6.837, 3);
    expect(NOMINAL.upperArm).toBeCloseTo(6.684, 3);
    expect(NOMINAL.armY).toBeCloseTo(-25.04, 2);
    expect(figureFor('normal', 1, 'child').shoulder).toBeCloseTo(11.4 * 0.86, 9);
    expect(figureFor('normal', 1, 'child').headR).toBeCloseTo(60 * 0.29, 9);
  });
});

describe('cycle and gridT', () => {
  it('returns the table entries on the table\'s own grid and interpolates between', () => {
    const t = [0, -0.4, -0.55, -0.4];
    for (let i = 0; i < 4; i++) expect(cycle(t, i / 4)).toBeCloseTo(t[i]!, 12);
    expect(cycle(t, 0.125)).toBeCloseTo(-0.2, 12);
    expect(cycle(t, 7 / 8)).toBeCloseTo(-0.2, 12); // wraps last → first
    expect(cycle(t, 1)).toBeCloseTo(0, 12);
    expect(cycle([], 0.3)).toBe(0);
  });

  it('snaps to the frame grid', () => {
    expect(gridT(0.3, 4)).toBe(0.25);
    expect(gridT(0.999, 4)).toBe(0.75);
    expect(gridT(0.7, 1)).toBe(0);
    expect(gridT(0.7, 0)).toBe(0);
  });
});

describe('the stride', () => {
  it('advances by distance, not time: STRIDE_PX world px is one cycle at any frame rate', () => {
    for (const frames of [3, 30, 300]) {
      const rs = createRigState(5);
      const start = rs.phase;
      walkFor(rs, NOMINAL, STRIDE_PX, frames);
      const advanced = ((rs.phase - start) % 1 + 1) % 1;
      expect(Math.min(advanced, 1 - advanced)).toBeLessThanOrEqual(1e-9);
    }
    // Standing still for a second, in any clip, leaves the walk phase alone.
    for (const clip of CLIPS) {
      const rs = createRigState(5);
      const start = rs.phase;
      for (let i = 0; i < 60; i++) pose(rs, NOMINAL, input({ clip, frames: framesOf(clip), movedPx: 0, dtS: 1 / 60 }));
      expect(rs.phase).toBe(start);
    }
  });

  it('clamps a teleport to half a stride per frame', () => {
    const rs = createRigState(5);
    const start = rs.phase;
    pose(rs, NOMINAL, input({ clip: 'walk', frames: 8, movedPx: 10_000, dtS: 1 / 60 }));
    expect(((rs.phase - start) % 1 + 1) % 1).toBeCloseTo(0.5, 9);
  });

  it('plants the stance foot at y = 0, lifts the swing foot no higher than FOOT_LIFT_MAX, and keeps the feet half a cycle apart', () => {
    for (const look of Object.values(CAST)) {
      const f = figureFor(look.build, look.height, look.age);
      const rs = createRigState(1);
      for (let i = 0; i < 360; i++) {
        const p = pose(rs, f, input({ clip: 'walk', frames: 8, movedPx: STRIDE_PX / 360, dtS: 1 / 60 }));
        const lower = Math.max(p.footL.y, p.footR.y);
        expect(Math.abs(lower)).toBeLessThanOrEqual(1e-9);
        expect(Math.min(p.footL.y, p.footR.y)).toBeGreaterThanOrEqual(-FOOT_LIFT_MAX * f.total - 1e-9);
        expect(p.hipDrop).toBeGreaterThanOrEqual(-1e-12);
        expect(p.hipDrop).toBeLessThanOrEqual(BOB_WALK_MAX + 1e-12);
        // Neither hip is ever above its nominal height while walking.
        expect(p.hip.y).toBeGreaterThanOrEqual(f.hipY - 1e-12);
        // The pivot is the origin and never moves: the hip stays over it.
        expect(p.hip.x).toBe(0);
        boneLengthsHold(p, f);
      }
      // Half a cycle apart: the left foot now is where the right foot was.
      const rsA = createRigState(1); const rsB = createRigState(1);
      walkFor(rsA, f, STRIDE_PX * 0.3, 30);
      walkFor(rsB, f, STRIDE_PX * 0.8, 80);
      const a = pose(rsA, f, input({ clip: 'walk', frames: 8, dtS: 0 }));
      const ax = a.footL.x - a.hipL.x; const ay = a.footL.y;
      const b = pose(rsB, f, input({ clip: 'walk', frames: 8, dtS: 0 }));
      expect(b.footR.x - b.hipR.x).toBeCloseTo(ax, 6);
      expect(b.footR.y).toBeCloseTo(ay, 6);
    }
  });

  it('never asks a leg to reach further than it does standing (the reach guard)', () => {
    for (const [id, look] of Object.entries(CAST)) {
      const f = figureFor(look.build, look.height, look.age);
      const legs = f.thigh + f.shin;
      expect(-f.hipY, id).toBeLessThanOrEqual(legs - 0.001);
      expect(legs, id).toBeCloseTo(-f.hipY * RIG_LEG_REACH, 9);
      const rs = createRigState(2);
      let worst = 0;
      for (let i = 0; i < 360; i++) {
        const p = pose(rs, f, input({ clip: 'walk', frames: 8, movedPx: STRIDE_PX / 360, dtS: 1 / 60 }));
        worst = Math.max(worst, dist(p.hipL, p.footL), dist(p.hipR, p.footR));
      }
      // Downward-only bob: the furthest a foot ever is from its socket is the nominal hip height.
      expect(worst, id).toBeLessThanOrEqual(-f.hipY + 1e-9);
    }
  });
});

describe('secondary motion stays inside the bounds DEC-020 signs', () => {
  it('head rides the squashed body over a full stride and while breathing', () => {
    for (const clip of ['walk', 'idle'] as const) {
      const rs = createRigState(9);
      for (let i = 0; i < 400; i++) {
        const p = pose(rs, NOMINAL, input({ clip, frames: framesOf(clip), clipT: (i % 100) / 100, movedPx: clip === 'walk' ? 1 : 0, dtS: 1 / 60 }));
        const neckY = (NOMINAL.bodyTop + p.hipDrop) * p.squash;
        expect(Math.abs(p.head.y - rs.headLag.y - (neckY - RIG_BODY_TOP * NOMINAL.headR))).toBeLessThanOrEqual(1e-6);
        expect(p.neck.y).toBeCloseTo(NOMINAL.bodyTop + p.hipDrop, 9);
      }
    }
  });

  it('squash, bob, lean, hop and stamp never exceed their constants', () => {
    let idleMin = Infinity; let idleMax = -Infinity;
    for (const look of Object.values(CAST)) {
      const f = figureFor(look.build, look.height, look.age);
      for (const clip of CLIPS) {
        const rs = createRigState(4);
        for (let i = 0; i < 200; i++) {
          const p = pose(rs, f, input({ clip, frames: framesOf(clip), clipT: i / 200, movedPx: 1, dtS: 1 / 60 }));
          expect(p.squash).toBeGreaterThanOrEqual(1 - SQUASH_MAX - 1e-12);
          expect(p.squash).toBeLessThanOrEqual(1 + SQUASH_IDLE + 1e-12);
          expect(Math.abs(p.lean)).toBeLessThanOrEqual(LEAN_MAX + 1e-12);
          if (clip === 'idle') { idleMin = Math.min(idleMin, p.hipDrop); idleMax = Math.max(idleMax, p.hipDrop); }
          if (clip === 'happy') { expect(-p.hipDrop).toBeLessThanOrEqual(HOP_MAX + 1e-12); expect(p.hipDrop).toBeLessThanOrEqual(0); }
          if (clip === 'angry') { expect(p.hipDrop).toBeLessThanOrEqual(STAMP_MAX + 1e-12); expect(p.hipDrop).toBeGreaterThanOrEqual(0); }
          if (clip === 'walk') { expect(p.hipDrop).toBeGreaterThanOrEqual(0); expect(p.hipDrop).toBeLessThanOrEqual(BOB_WALK_MAX + 1e-12); }
          if (clip === 'scared' || clip === 'sleep' || clip === 'work') expect(p.squash).toBe(1);
        }
      }
    }
    expect(idleMax - idleMin).toBeLessThanOrEqual(BOB_IDLE_MAX);
    expect(idleMax - idleMin).toBeGreaterThan(0);
  });

  it('idle breathing is constant within one grid frame and changes between frames', () => {
    const frames = framesOf('idle');
    const rs = createRigState(4);
    const at = (t: number) => { const p = pose(rs, NOMINAL, input({ clip: 'idle', frames, clipT: t, dtS: 0 })); return [p.hipDrop, p.squash]; };
    expect(at(0.26)).toEqual(at(0.49));
    expect(at(0.26)).not.toEqual(at(0.51));
  });

  it('clamps the head lag to ±HEAD_LAG_MAX under 5 s of 1 kHz jitter', () => {
    const rs = createRigState(6);
    let worst = 0;
    for (let i = 0; i < 5000; i++) {
      // Flip the facing and the flinch every millisecond: the world-space
      // target jumps ±1.44 px each frame, the worst a spring could be fed.
      const facing = i % 2 === 0 ? 1 : -1;
      const p = pose(rs, NOMINAL, input({ clip: 'scared', frames: 2, clipT: i % 2 === 0 ? 0 : 0.5, facing, dtS: 0.001 }));
      worst = Math.max(worst, Math.abs(rs.headLag.x), Math.abs(rs.headLag.y), Math.abs(p.head.x - p.neck.x));
      expect(Math.abs(rs.headLag.x)).toBeLessThanOrEqual(HEAD_LAG_MAX);
      expect(Math.abs(rs.headLag.y)).toBeLessThanOrEqual(HEAD_LAG_MAX);
    }
    expect(worst).toBeGreaterThan(0); // the spring was actually excited
  });

  it('the head genuinely trails the body: a bob moves the target before the head follows', () => {
    const rs = createRigState(6);
    // Settle standing, then start walking: the first stride's bob leaves a lag.
    for (let i = 0; i < 60; i++) pose(rs, NOMINAL, input({ clip: 'idle', frames: 4, dtS: 1 / 60 }));
    let lagged = 0;
    for (let i = 0; i < 30; i++) {
      pose(rs, NOMINAL, input({ clip: 'walk', frames: 8, movedPx: 4, dtS: 1 / 60 }));
      lagged = Math.max(lagged, Math.abs(rs.headLag.y));
    }
    expect(lagged).toBeGreaterThan(0.05);
    expect(lagged).toBeLessThanOrEqual(HEAD_LAG_MAX);
  });
});

describe('no pose is ever NaN', () => {
  it('every clip × mood × hold × facing × tier × reduced × dt yields finite joints with exact bone lengths', () => {
    const f = figureFor('slim', 0.92, 'adult');
    let combos = 0;
    for (const clip of CLIPS) for (const mood of MOODS) for (const holding of HOLDS) {
      for (const facing of [1, -1] as const) for (const lite of [false, true]) for (const reduced of [false, true]) {
        for (const dtS of [0, 1 / 60, 10]) {
          const rs = createRigState(1);
          for (let i = 0; i < 3; i++) {
            const p = pose(rs, f, input({ clip, mood, holding, holdT: 0.5, facing, lite, reduced, dtS, movedPx: 300, frames: framesOf(clip), clipT: 0.37 }));
            for (const v of everyNumber(p)) expect(Number.isFinite(v)).toBe(true);
            boneLengthsHold(p, f);
          }
          combos++;
        }
      }
    }
    expect(combos).toBe(8 * 4 * 3 * 2 * 2 * 2 * 3);
  });
});

describe('reduced motion', () => {
  it('freezes the pose across seeds, frames, distance and dt — squash 1, lag 0, lean 0, bob 0', () => {
    for (const clip of CLIPS) for (const facing of [1, -1] as const) for (const mood of MOODS) {
      const a = createRigState(11);
      const b = createRigState(22);
      // Different prior histories: one walked, one leaned.
      walkFor(a, NOMINAL, 90, 9);
      for (let i = 0; i < 9; i++) pose(b, NOMINAL, input({ clip: 'scared', frames: 2, clipT: 0.5, dtS: 1 / 60 }));
      const phaseA = a.phase; const lagA = { ...a.headLag };
      const pa = snapshot(pose(a, NOMINAL, input({ clip, facing, mood, reduced: true, movedPx: 40, dtS: 1 / 60, clipT: 0.6, frames: framesOf(clip) })));
      const pb = snapshot(pose(b, NOMINAL, input({ clip, facing, mood, reduced: true, movedPx: 3, dtS: 10, clipT: 0.1, frames: framesOf(clip), holding: 'shiftWeight', holdT: 0.5 })));
      expect(pa).toBe(pb);
      const p = a.pose;
      expect(p.squash).toBe(1);
      expect(p.lean).toBe(0);
      expect(p.hipDrop).toBe(clip === 'sit' ? SIT_DROP : 0);
      expect(p.head.x).toBe(p.neck.x);
      expect(p.headTilt).toBe(clip === 'sleep' ? HEAD_TILT_SLEEP : 0);
      // Neither read nor written: the state is untouched.
      expect(a.phase).toBe(phaseA);
      expect(a.headLag).toEqual(lagA);
    }
  });
});

describe('tiers and grids', () => {
  it('lite: no secondary motion, and the pose is identical anywhere inside one quantised frame', () => {
    for (const clip of CLIPS) {
      const frames = framesOf(clip);
      const rs = createRigState(3);
      const at = (t: number) => snapshot(pose(rs, NOMINAL, input({ clip, frames, clipT: t, lite: true, dtS: 1 / 60 })));
      // Frame k spans [k/frames, (k+1)/frames): both ends of frame 0 are one pose.
      const lo = at(1e-6);
      const hi = at(1 / frames - 1e-6);
      expect(lo).toBe(hi);
      // The walk's pose is its distance phase, not its clip progress.
      if (frames > 1 && clip !== 'walk') expect(at(1 / frames + 1e-6)).not.toBe(lo);
      const p = rs.pose;
      expect(p.squash).toBe(1);
      expect(rs.headLag).toEqual({ x: 0, y: 0 });
      if (clip === 'walk') expect(p.hipDrop).toBe(0);
    }
  });

  it('lite: the walk phase is quantised to the walk row\'s frame count', () => {
    const rs = createRigState(3);
    rs.phase = 0.3;
    const a = snapshot(pose(rs, NOMINAL, input({ clip: 'walk', frames: 8, lite: true, movedPx: 0, dtS: 1 / 60 })));
    rs.phase = 0.37;
    const b = snapshot(pose(rs, NOMINAL, input({ clip: 'walk', frames: 8, lite: true, movedPx: 0, dtS: 1 / 60 })));
    expect(a).toBe(b);
    rs.phase = 0.38;
    expect(snapshot(pose(rs, NOMINAL, input({ clip: 'walk', frames: 8, lite: true, movedPx: 0, dtS: 1 / 60 })))).not.toBe(b);
  });

  it('lite: a weight shift is secondary motion, so the hip holds still on the frame grid', () => {
    // The view re-poses a lite person only when its quantised key moves on,
    // and holdT is not in that key: a shift there would freeze mid-sway.
    const still = snapshot(pose(createRigState(3), NOMINAL, input({ clip: 'idle', frames: 4, lite: true, dtS: 1 / 60 })));
    for (const holdT of [0.25, 0.5, 0.75]) {
      const shifted = snapshot(pose(createRigState(3), NOMINAL,
        input({ clip: 'idle', frames: 4, lite: true, dtS: 1 / 60, holding: 'shiftWeight', holdT })));
      expect(shifted).toBe(still);
    }
    // On the full tier the same hold does move the hip.
    const rs = createRigState(3);
    pose(rs, NOMINAL, input({ clip: 'idle', frames: 4, dtS: 1 / 60, holding: 'shiftWeight', holdT: 0.5 }));
    expect(rs.pose.hip.x).not.toBe(0);
  });

  it('idle, sit and sleep are grid-sampled on the full tier too', () => {
    expect([...GRID_CLIPS].sort()).toEqual(['idle', 'sit', 'sleep']);
    for (const clip of GRID_CLIPS) {
      const frames = framesOf(clip);
      const rs = createRigState(3);
      const at = (t: number) => snapshot(pose(rs, NOMINAL, input({ clip, frames, clipT: t, dtS: 0 })));
      expect(at(1e-6)).toBe(at(1 / frames - 1e-6));
      if (frames > 1) expect(at(1 / frames + 1e-6)).not.toBe(at(1e-6));
    }
    // And a continuous clip is not.
    const rs = createRigState(3);
    const at = (t: number) => snapshot(pose(rs, NOMINAL, input({ clip: 'work', frames: 6, clipT: t, dtS: 0 })));
    expect(at(0.1)).not.toBe(at(0.2));
  });
});

describe('seeds', () => {
  it('same seed → identical 300-frame sequence; different seeds → different walk phases', () => {
    const run = (seed: number): string[] => {
      const rs = createRigState(seed);
      const out: string[] = [];
      for (let i = 0; i < 300; i++) {
        const clip = i < 100 ? 'idle' : i < 200 ? 'walk' : 'work';
        out.push(snapshot(pose(rs, NOMINAL, input({ clip, frames: framesOf(clip), clipT: (i % 50) / 50, movedPx: 2, dtS: 1 / 60 }))));
      }
      return out;
    };
    expect(run(11)).toEqual(run(11));
    expect(Math.abs(createRigState(11).phase - createRigState(22).phase)).toBeGreaterThanOrEqual(0.05);
    expect(createRigState(11).phase).toBe(seedUnit(11, 0x21));
    const rs = createRigState(11);
    resetRigState(rs, 22);
    expect(rs.phase).toBe(createRigState(22).phase);
    expect(rs.headLag).toEqual({ x: 0, y: 0 });
  });
});

describe('the other clips', () => {
  it('sleep lies down with the sleeper\'s head tilt; sit drops onto the seat with the feet ahead', () => {
    const rs = createRigState(1);
    const s = pose(rs, NOMINAL, input({ clip: 'sleep', frames: 3 }));
    expect(s.lying).toBe(true);
    expect(s.headTilt).toBe(HEAD_TILT_SLEEP);
    for (const clip of CLIPS.filter((c) => c !== 'sleep')) expect(pose(rs, NOMINAL, input({ clip, frames: framesOf(clip) })).lying).toBe(false);
    for (let i = 0; i < 4; i++) {
      const p = pose(rs, NOMINAL, input({ clip: 'sit', frames: 2, clipT: i / 4 }));
      expect(p.hipDrop).toBeGreaterThanOrEqual(SIT_DROP + Math.min(...BOB_SIT));
      expect(p.hipDrop).toBeLessThanOrEqual(SIT_DROP);
      expect(p.footL.x - p.hipL.x).toBeCloseTo(SIT_FEET_FORWARD, 9);
      expect(p.footR.x - p.hipR.x).toBeCloseTo(SIT_FEET_FORWARD, 9);
      expect(p.footL.y).toBe(0);
    }
  });

  it('the work reach peaks at clipT = 2/6, and happy is the only clip whose top rises above standing', () => {
    const rs = createRigState(1);
    const reachAt = (t: number) => pose(rs, NOMINAL, input({ clip: 'work', frames: 6, clipT: t })).handR.x;
    const peak = reachAt(2 / 6);
    for (let i = 0; i < 60; i++) expect(reachAt(i / 60)).toBeLessThanOrEqual(peak + 1e-9);
    expect(WORK_REACH[2]).toBe(1);
    expect(Math.min(...HOP)).toBe(-HOP_MAX);

    const look = CAST['guest.standard']!;
    const standing = boundsOf(pose(rs, NOMINAL, input({ clip: 'idle', reduced: true })), NOMINAL, boundsLookFor(look, 'idle')).top;
    for (const clip of CLIPS) {
      let top = 0;
      for (let i = 0; i < 64; i++) {
        const p = pose(rs, NOMINAL, input({ clip, frames: framesOf(clip), clipT: i / 64, movedPx: 2, dtS: 1 / 60 }));
        top = Math.max(top, boundsOf(p, NOMINAL, boundsLookFor(look, clip)).top);
      }
      // Breathing (idle, work) lifts the hip a fraction of a px; only the hop
      // rises by more than a head lag could.
      if (clip === 'happy') expect(top - standing).toBeGreaterThan(1.5);
      else expect(top - standing).toBeLessThanOrEqual(BOB_IDLE_MAX + SQUASH_IDLE * -NOMINAL.bodyTop + HEAD_LAG_MAX);
    }
  });
});

describe('every cast member fits the body the rooms assume and the cell a bake would need', () => {
  it('torso half-width, bounds and head ratio, over every clip × 16 phases', () => {
    let tallest = 0; let widest = 0;
    for (const [id, look] of Object.entries(CAST)) {
      const f = figureFor(look.build, look.height, look.age);
      expect((f.shoulder / 2) * 0.82, id).toBeLessThanOrEqual(BODY_HALF_WIDTH_PX);
      expect((2 * f.headR) / f.total, id).toBeCloseTo(0.54, 9);
      const ext = headExtent(look.hairStyle, look.capStyle);
      const ratio = ((ext.up + 1) * f.headR) / (f.total - f.headR + ext.up * f.headR);
      expect(ratio, id).toBeGreaterThanOrEqual(0.5);
      expect(ratio, id).toBeLessThanOrEqual(0.6);
      for (const clip of CLIPS) {
        for (const mood of ['neutral', 'impatient'] as const) for (const holding of [null, 'shiftWeight'] as const) {
          const rs = createRigState(7);
          for (let i = 0; i < 16; i++) {
            const p = pose(rs, f, input({ clip, frames: framesOf(clip), clipT: i / 16, movedPx: STRIDE_PX / 16, dtS: 1 / 60, mood, holding, holdT: i / 16 }));
            const b = boundsOf(p, f, boundsLookFor(look, clip));
            expect(b.top, `${id} ${clip}`).toBeLessThanOrEqual(STAND_SPACE_PX);
            expect(b.halfWidth, `${id} ${clip}`).toBeLessThanOrEqual(CELL_HALF_WIDTH_PX);
            tallest = Math.max(tallest, b.top); widest = Math.max(widest, b.halfWidth);
          }
        }
      }
    }
    // Measured on 21-09-2026: chef 67.8 with the hop; lifeguard 23.9 (ponytail + a weight shift).
    expect(tallest).toBeGreaterThan(67);
    expect(tallest).toBeLessThanOrEqual(STAND_SPACE_PX);
    expect(widest).toBeLessThanOrEqual(CELL_HALF_WIDTH_PX);
  });

  it('the skate DEC-020 declares: ≈57 px per step at STRIDE_PX 128, ≈25 at 64', () => {
    const amp = STRIDE_AMP * NOMINAL.total;
    expect(amp).toBeCloseTo(4.08, 9);
    expect(walkSlidePx(amp, 128, 0.82)).toBeCloseTo(57.3, 1);
    expect(walkSlidePx(amp, 64, 0.82)).toBeCloseTo(25.3, 1);
    expect(HIP_SOCKET).toBe(0.26);
  });
});

describe('cast', () => {
  it('has exactly the ids of data/staff.json roles and data/guests.json types', () => {
    const staff = readJson('data/staff.json') as { roles: { id: string }[] };
    const guests = readJson('data/guests.json') as { types: { id: string }[] };
    const expected = [...staff.roles.map((r) => `staff.${r.id}`), ...guests.types.map((g) => `guest.${g.id}`)].sort();
    expect(castIds().sort()).toEqual(expected);
    expect(animations.map((a) => a.id).sort()).toEqual(expected);
  });

  it('lookFor strips .sheet and .thumb, and knows nobody else', () => {
    expect(lookFor('staff.chef.sheet')).toBe(CAST['staff.chef']);
    expect(lookFor('guest.inspector.thumb')).toBe(CAST['guest.inspector']);
    expect(lookFor('guest.standard')).toBe(CAST['guest.standard']);
    expect(lookFor('nobody.sheet')).toBeNull();
    expect(lookFor('staff.chef.png')).toBeNull();
  });

  it('keeps characters.py\'s own rules: no guest in a cap or apron, no two staff in one uniform', () => {
    // The receptionist and the lifeguard both wear coral; what characters.py
    // keeps unique is the uniform as a whole, so the top/bottom pair is what
    // is pinned here.
    const uniforms = new Set<string>();
    for (const [id, look] of Object.entries(CAST)) {
      if (id.startsWith('guest.')) { expect(look.cap).toBeNull(); expect(look.apron).toBeNull(); expect(look.capStyle).toBeNull(); }
      else { const u = `${look.top}/${look.bottom}`; expect(uniforms.has(u), id).toBe(false); uniforms.add(u); }
      expect(look.cap === null).toBe(look.capStyle === null);
      expect(Object.values(PALETTE)).toContain(look.skin);
      expect(Object.values(PALETTE)).toContain(look.hair);
    }
  });

  it('shade() and lighten() are hcstyle\'s shade and tint', () => {
    const mixPy = (c: number, to: [number, number, number], t: number): number => {
      const ch = (v: number, target: number) => Math.round(v + (target - v) * t);
      return (ch(c >> 16, to[0]) << 16) | (ch((c >> 8) & 0xff, to[1]) << 8) | ch(c & 0xff, to[2]);
    };
    expect(shade(0xffffff, 0.18)).toBe(mixPy(0xffffff, [10, 20, 44], 0.18));
    // 255 + (44 − 255)·0.18 = 217.02 → 0xd9: the Python rounds the same way.
    expect(shade(0xffffff, 0.18)).toBe(0xd3d5d9);
    for (const c of Object.values(PALETTE)) {
      expect(shade(c, 0)).toBe(c);
      expect(lighten(c, 0)).toBe(c);
      expect(shade(c, 0.22)).toBe(mixPy(c, [10, 20, 44], 0.22));
      expect(lighten(c, 0.26)).toBe(mixPy(c, [255, 255, 255], 0.26));
    }
    expect(lighten(0x000000, 1)).toBe(0xffffff);
  });
});

describe('clipPlayer.progress', () => {
  const rows: Record<string, ClipTiming> = {
    walk: { frames: 8, fps: 11, loop: true },
    happy: { frames: 4, fps: 6, loop: false },
    scared: { frames: 2, fps: 4, loop: false },
  };
  const timing = (c: string) => rows[c] ?? null;

  it('is 0 with no row, stays in [0, 1) for a loop, and clamps at 1 for a one-shot', () => {
    const p = createPlayer('nothing');
    advance(p, 500, timing);
    expect(progress(p, timing)).toBe(0);
    const w = createPlayer('walk');
    for (let i = 0; i < 300; i++) {
      advance(w, 16.7, timing);
      const t = progress(w, timing);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(1);
    }
    playOnce(w, 'happy');
    let top = 0;
    for (let i = 0; i < 100; i++) {
      const frame = advance(w, 16.7, timing);
      if (frame.clip !== 'happy') break;
      const t = progress(w, timing);
      expect(t).toBeLessThanOrEqual(1);
      top = Math.max(top, t);
    }
    expect(top).toBeGreaterThan(0.9);
    // A one-shot that never loops reports its clamp at the end.
    const s = createPlayer('scared');
    for (let i = 0; i < 100; i++) advance(s, 16.7, timing);
    expect(progress(s, timing)).toBe(1);
  });

  it('agrees with advance()\'s frame for every shipped clip, ±1 at a boundary', () => {
    let compared = 0;
    for (const a of animations) {
      for (const [name, row] of Object.entries(a.clips)) {
        const t = (c: string) => a.clips[c] ?? null;
        const p = createPlayer(name);
        for (let i = 0; i < 240; i++) {
          const { clip, frame } = advance(p, 16.7, t);
          if (clip !== name) break; // a non-loop clip is done; the base is idle again
          const guess = Math.floor(progress(p, t) * row.frames);
          const through = (p.elapsedMs / 1000 * row.fps);
          const atBoundary = Math.abs(through - Math.round(through)) < 1e-6;
          if (atBoundary) expect(Math.abs(guess - frame)).toBeLessThanOrEqual(1);
          else expect(Math.min(guess, row.frames - 1)).toBe(frame);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(1000);
  });
});

describe('quality', () => {
  it('reads only the literal flags', () => {
    expect(renderFlags('?lite=1')).toEqual({ tier: 'lite', aa: false });
    expect(renderFlags('?lite=0')).toEqual({ tier: 'full', aa: false });
    expect(renderFlags('?lite=yes')).toEqual({ tier: null, aa: false });
    expect(renderFlags('')).toEqual({ tier: null, aa: false });
    expect(renderFlags('?aa=1&stress=60')).toEqual({ tier: null, aa: true });
    expect(renderFlags('?aa=true')).toEqual({ tier: null, aa: false });
    expect(renderFlags('?lite=1&aa=1')).toEqual({ tier: 'lite', aa: true });
  });

  it('forces lite on the canvas lane unless asked otherwise', () => {
    expect(tierFor('canvas', null)).toBe('lite');
    expect(tierFor('canvas', 'full')).toBe('full');
    expect(tierFor('webgl', null)).toBe('full');
    expect(tierFor('webgpu', null)).toBe('full');
    expect(tierFor('webgl', 'lite')).toBe('lite');
    expect(motionTier()).toBe('full');
    setMotionTier('lite');
    expect(motionTier()).toBe('lite');
    setMotionTier('full');
  });

  it('pose() clamps its frame time to MAX_DT_S like motion.step', () => {
    expect(MAX_DT_S).toBeGreaterThan(0);
    const a = createRigState(1); const b = createRigState(1);
    for (let i = 0; i < 10; i++) {
      pose(a, NOMINAL, input({ clip: 'walk', frames: 8, movedPx: 3, dtS: 10 }));
      pose(b, NOMINAL, input({ clip: 'walk', frames: 8, movedPx: 3, dtS: MAX_DT_S }));
    }
    expect(snapshot(a.pose)).toBe(snapshot(b.pose));
    expect(a.ageS).toBeCloseTo(b.ageS, 12);
  });
});
