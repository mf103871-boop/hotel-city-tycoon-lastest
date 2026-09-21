/**
 * The live rig: a character as joints, posed by arithmetic every frame.
 *
 * HC-P2-S3 (DEC-020, owner: «هيكل حي»). The sheets drew a person as a strip
 * of pictures; here a person is fourteen joints and four two-bone chains, and
 * the picture is computed. The stride is driven by distance travelled, not by
 * time, so feet never march on the spot; the head is sprung a beat behind the
 * body; the body squashes a little on contact. Changing the walk is changing a
 * number. The renderer (characterRig.ts) only positions fixed parts on these
 * joints — nothing here knows what a part looks like.
 *
 * Two sources are transcribed and cited line by line. The figure and the
 * per-clip motion tables are tools/art/hcstyle.py — `_figure` (670-695),
 * `_BOB` (699-719), `cycle` (721-745), `draw_person` (748-869) and
 * `_draw_sleeper` (1075-1120) — so the rig and the sheets it replaces are the
 * same person with the same gestures. The dynamics are the prototype
 * (prototypes/next-render/src/rig.ts): two-bone IK (72-86), the stride phase
 * by distance (102, 109), the walk bob and contact squash (121-124), the head
 * spring (143-155). Where this file departs from either, the comment at the
 * departure says why.
 *
 * Coordinates: rig px at scale 1, the sheets' 48×72 frame with the origin at
 * the feet (the frame's pivot, y = 0 ≡ FOOT_Y 70) and −y up. The pose is
 * always computed FACING +x; the renderer mirrors the whole rig for the other
 * facing, exactly as it flips the sheet sprite today. So `R` is the front
 * side (+x) and `L` the back, on either facing.
 *
 * The clip's own duration is the clock: `clipT` arrives from clipPlayer's
 * `progress()`, so data/animations/*.json still decides how long a work
 * cycle or a cheer takes (DEC-012). The rig adds nothing timed of its own.
 *
 * Pure: no Pixi, no DOM, no Math.random — the idle phase and the desync
 * between people come from mulberry32 on the entity's seed, as the scheduler's
 * blinks do. Every constant is exported and bounded by tests/unit/rig.test.ts
 * and tools/selftest/animations.ts.
 */
import { mulberry32 } from '../../core/rng/index.ts';
import { MAX_DT_S } from './motion.ts';
import type { CapStyle, HairStyle } from './cast.ts';

export interface Pt { x: number; y: number }

export type RigClip = 'idle' | 'walk' | 'work' | 'sleep' | 'sit' | 'happy' | 'angry' | 'scared';
export type RigHold = 'shiftWeight' | 'glance' | null;
export type RigMood = 'neutral' | 'impatient' | 'happy' | 'angry';
export type Build = 'slim' | 'normal' | 'broad';
export type Age = 'adult' | 'senior' | 'child';

// ---------------------------------------------------------------- the figure
// hcstyle `_figure` (hcstyle.py:670-695) with ONE declared delta: the head is
// 0.27 of the figure rather than 0.235, which lifts the head from 47% to 54%
// of the height — HC-VIS-001 :22 asks for 50–60%. Everything else is the
// Python's number, so the rig and its sheet fallback stand the same height
// on the same floor line.
export const RIG_TOTAL_PER_HEIGHT = 60;
export const RIG_HEAD_R = 0.27;
export const RIG_HEAD_R_CHILD = 0.29;
export const RIG_HIP = 0.215;
export const RIG_BODY_TOP = 0.86;
/** Legs are 6% longer than the hip is high, so a planted foot always reaches. */
export const RIG_LEG_REACH = 1.06;
export const SHOULDER: Readonly<Record<Build, number>> = { slim: 10, normal: 11.4, broad: 13.2 };
/** Where each leg roots and where an idle foot stands: hcstyle's `hx = ox ± shoulder·0.26`. */
export const HIP_SOCKET = 0.26;

/** The cell a baked frame would need: asserted from the pose, never assumed. */
export const STAND_SPACE_PX = 70;
export const CELL_HALF_WIDTH_PX = 24;

// ---------------------------------------------------------------- the motion
/** World px per full walk cycle — the JSON walk row's cadence at 1.375 blocks/s. */
export const STRIDE_PX = 128;
/** Foot half-amplitude on the stride ellipse, as a fraction of the height. */
export const STRIDE_AMP = 0.068;
/** How high the swing foot lifts, as a fraction of the height. */
export const FOOT_LIFT_MAX = 0.05;
/** The hip dips this much at double support and is at its nominal height mid-stance. */
export const BOB_WALK_MAX = 2.1;
export const BOB_IDLE_MAX = 0.6;
export const SQUASH_MAX = 0.055;
export const SQUASH_IDLE = 0.018;
export const HEAD_SPRING_K = 190;
export const HEAD_SPRING_DAMP = 17;
export const HEAD_STEP_MAX_S = 1 / 30;
export const HEAD_LAG_MAX = 2.5;
export const HEAD_TILT_WALK = 0.06;
export const HEAD_TILT_GLANCE = 0.12;
export const HEAD_TILT_SLEEP = 0.45;
export const LEAN_MAX = 1.6;
export const HOP_MAX = 2.0;
export const STAMP_MAX = 0.8;
export const SIT_DROP = 5;
export const SIT_FEET_FORWARD = 3.2;
/** The weight shift of a fidget, in rig px at its peak. */
export const SHIFT_WEIGHT_PX = 1.2;

/** Clips whose motion is a breath: sampled on the clip's frame grid on every tier. */
export const GRID_CLIPS: ReadonlySet<RigClip> = new Set<RigClip>(['idle', 'sit', 'sleep']);

// The motion tables, hcstyle's rings (hcstyle.py:699-719 `_BOB`, 796-859
// `draw_person`, 1075-1120 `_draw_sleeper`). Negative is up, as in the Python.
export const BOB_IDLE: readonly number[] = [0, -0.4, -0.55, -0.4];
export const BOB_WORK: readonly number[] = [0, -0.6, -0.3];
export const BOB_SIT: readonly number[] = [0, -0.5];
export const HOP: readonly number[] = [0, -1.4, -2.0, -0.7];
export const STAMP: readonly number[] = [0, 0.8, 0, 0.4];
export const ANGRY_SWING: readonly number[] = [1.4, 2.6, 1.4, 0.6];
export const WORK_REACH: readonly number[] = [0, 0.55, 1, 0.75, 0.3, 0.1];
export const HAPPY_RAISE: readonly number[] = [0, 0.7, 1, 0.45];
export const SLEEP_BREATH: readonly number[] = [0, -0.5, -0.2];
export const SLEEP_DRIFT: readonly number[] = [0, -1.1, -2.2];
export const SQUASH_BREATH: readonly number[] = [0, SQUASH_IDLE, 0, -SQUASH_IDLE * 0.5];
export const IMPATIENT_SHIFT: readonly number[] = [0, 0.5, 0, -0.5];
export const LEAN_FLINCH: readonly number[] = [0, -LEAN_MAX];

// Stroke half-widths that a bounds check has to count (hcstyle.py:190-193).
const HALF_LW_PROP = 0.7;
const HALF_LW_DETAIL = 0.5;
const HALF_LW_FACE = 0.45;

export interface RigProportions {
  total: number;
  headR: number;
  headCy: number;
  bodyTop: number;
  hipY: number;
  torso: number;
  torsoH: number;
  shoulder: number;
  thigh: number;
  shin: number;
  upperArm: number;
  foreArm: number;
  armY: number;
}

/** hcstyle `_figure` in rig coordinates, plus the bone lengths the rig needs. */
export function figureFor(build: Build, height: number, age: Age): RigProportions {
  const child = age === 'child';
  const total = RIG_TOTAL_PER_HEIGHT * height;
  const headR = total * (child ? RIG_HEAD_R_CHILD : RIG_HEAD_R);
  const headCy = -total + headR;
  const bodyTop = headCy + RIG_BODY_TOP * headR;
  const hipY = -RIG_HIP * total;
  const torso = hipY - bodyTop;
  const torsoH = torso + 1.6;
  const shoulder = SHOULDER[build] * (child ? 0.86 : 1);
  const leg = (-hipY / 2) * RIG_LEG_REACH;
  const arm = (torsoH * 0.72) / 2;
  return {
    total, headR, headCy, bodyTop, hipY, torso, torsoH, shoulder,
    thigh: leg, shin: leg, upperArm: arm, foreArm: arm,
    armY: bodyTop + 0.26 * torsoH,
  };
}

// ---------------------------------------------------------------- the pose
export interface Pose {
  /** The pelvis centre, already dropped or lifted by the clip's bob. */
  hip: Pt;
  /** Where each leg roots: `hip.x ± HIP_SOCKET·shoulder` (hcstyle's parallel legs). */
  hipL: Pt; hipR: Pt;
  chest: Pt; neck: Pt; head: Pt;
  shoulderL: Pt; elbowL: Pt; handL: Pt;
  shoulderR: Pt; elbowR: Pt; handR: Pt;
  kneeL: Pt; footL: Pt;
  kneeR: Pt; footR: Pt;
  /** Rotation of the whole head group, radians, in the facing-+x frame. */
  headTilt: number;
  /** Vertical scale of everything below the neck, about the feet: 1 neutral, <1 compressed. */
  squash: number;
  /** The flinch: how far the head has moved back from over the hips. */
  lean: number;
  /** The hip's displacement from its nominal height: +down (contact), −up (a hop, a breath). */
  hipDrop: number;
  lying: boolean;
  /** The sleeper's quilt rising with a breath (rig px, ≤ 0) and the Zs drifting up. */
  quiltBreath: number;
  zDrift: number;
}

export interface RigState {
  /** Walk-cycle phase 0..1, advanced by distance travelled. Seeded per person. */
  phase: number;
  /** Seconds this person has been posed on the full tier — the spring's clock. */
  ageS: number;
  /** Spring-damped head lag in WORLD px (the facing applied), so a turn is felt. */
  headLag: Pt;
  headVel: Pt;
  /** The head target last frame, world space; NaN until the first frame. */
  headPrev: Pt;
  readonly pose: Pose;
}

export interface RigInput {
  clip: RigClip;
  /** Progress through the clip, 0..1, from clipPlayer `progress()`. */
  clipT: number;
  /** The clip's frame count from the manifest: the grid breathing is sampled on. */
  frames: number;
  oneShot: boolean;
  /** World px travelled since the last frame; drives the stride. */
  movedPx: number;
  /** The world facing. The pose faces +x regardless; this only orients the head spring. */
  facing: 1 | -1;
  dtS: number;
  holding: RigHold;
  /** Progress through the hold, 0..1. */
  holdT: number;
  mood: RigMood;
  reduced: boolean;
  lite: boolean;
}

export const NEUTRAL_INPUT: Readonly<RigInput> = {
  clip: 'idle', clipT: 0, frames: 1, oneShot: false, movedPx: 0, facing: 1,
  dtS: 0, holding: null, holdT: 0, mood: 'neutral', reduced: false, lite: false,
};

const pt = (): Pt => ({ x: 0, y: 0 });

function createPose(): Pose {
  return {
    hip: pt(), hipL: pt(), hipR: pt(), chest: pt(), neck: pt(), head: pt(),
    shoulderL: pt(), elbowL: pt(), handL: pt(), shoulderR: pt(), elbowR: pt(), handR: pt(),
    kneeL: pt(), footL: pt(), kneeR: pt(), footR: pt(),
    headTilt: 0, squash: 1, lean: 0, hipDrop: 0, lying: false, quiltBreath: 0, zDrift: 0,
  };
}

/** A unit in [0, 1) from a seed and a salt, the scheduler's recipe (scheduler.ts). */
export function seedUnit(seed: number, salt: number): number {
  return mulberry32((seed + Math.imul(salt, 0x9e3779b9)) >>> 0);
}

export function createRigState(seed: number): RigState {
  const rs: RigState = {
    phase: 0, ageS: 0, headLag: pt(), headVel: pt(), headPrev: { x: NaN, y: NaN }, pose: createPose(),
  };
  resetRigState(rs, seed);
  return rs;
}

/** Re-seed for a different person: the pool hands one view to many. */
export function resetRigState(rs: RigState, seed: number): void {
  rs.phase = seedUnit(seed, 0x21);
  rs.ageS = seedUnit(seed, 0x22) * 6;
  rs.headLag.x = 0; rs.headLag.y = 0;
  rs.headVel.x = 0; rs.headVel.y = 0;
  rs.headPrev.x = NaN; rs.headPrev.y = NaN;
}

/**
 * Two-bone IK, the prototype's (rig.ts:72-86), writing both the joint and the
 * end the chain actually reaches.
 *
 * `bendSign` picks one of the two mirror solutions: with +y down and the
 * target below the root, +1 puts the joint toward −x and −1 toward +x. The
 * distance is clamped to what the chain can span, so the cosine never leaves
 * [−1, 1] and no limb ever snaps to NaN; when the target is out of reach the
 * end lies on the root→target ray at full extension, otherwise it is the
 * target itself. `outEnd` may be the same object as `target`.
 */
export function ik(
  root: Pt, target: Pt, a: number, b: number, bendSign: 1 | -1, outJoint: Pt, outEnd: Pt,
): void {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const raw = Math.hypot(dx, dy);
  const max = a + b - 0.001;
  const d = raw > max ? max : raw < 0.001 ? 0.001 : raw;
  const cos = Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d)));
  const base = Math.atan2(dy, dx);
  const angle = base + Math.acos(cos) * bendSign;
  outJoint.x = root.x + Math.cos(angle) * a;
  outJoint.y = root.y + Math.sin(angle) * a;
  if (d !== raw) {
    // Out of reach (or on top of the root): the hand or foot stops where the
    // straight chain ends, on the ray toward where it was asked to go.
    outEnd.x = root.x + Math.cos(base) * d;
    outEnd.y = root.y + Math.sin(base) * d;
  } else {
    outEnd.x = target.x;
    outEnd.y = target.y;
  }
}

/**
 * hcstyle `cycle` (hcstyle.py:721-745) with a continuous phase: the ring is
 * read at `t·n`, linearly between entries, and the last entry wraps to the
 * first — so the shape of a gesture is the same curve at any frame count and
 * a loop still meets itself. On a frame grid of the table's own length the
 * table's own values come back exactly.
 */
export function cycle(table: readonly number[], t: number): number {
  const n = table.length;
  if (n === 0) return 0;
  const u = t - Math.floor(t);
  const at = u * n;
  const lo = Math.floor(at) % n;
  const hi = (lo + 1) % n;
  const f = at - Math.floor(at);
  return table[lo]! * (1 - f) + table[hi]! * f;
}

/** Snap a clip progress to its frame grid, the sheets' own cadence. */
export function gridT(t: number, frames: number): number {
  const n = frames >= 1 ? Math.floor(frames) : 1;
  return Math.floor(t * n) / n;
}

const TAU = Math.PI * 2;
const scratch: Pt = { x: 0, y: 0 };

/**
 * Pose the person for this frame. Mutates and returns `rs.pose`; allocates
 * nothing.
 *
 * Reduced motion takes φ = 0 and t = 0 as literals and neither reads nor
 * writes `rs`: the drawn pose is then a pure function of the clip, the
 * proportions and the mood, identical across seeds and frames, while the
 * position still travels through motion.step (the sheet path's semantics,
 * tools/selftest/animations.ts). The lite tier — the DEC-009 canvas lane —
 * samples every clip on its frame grid and turns the springs, the walk bob
 * and the squash off; the flinch and the hop stay, because they are the
 * clip's own drawn motion, not the rig's secondary motion.
 */
export function pose(rs: RigState, p: RigProportions, inp: RigInput): Pose {
  const out = rs.pose;
  const { clip, reduced, lite } = inp;
  const dt = Math.min(Math.max(inp.dtS, 0), MAX_DT_S);
  const grid = lite || GRID_CLIPS.has(clip);
  const frames = inp.frames >= 1 ? inp.frames : 1;

  let t: number;
  let phi: number;
  if (reduced) {
    t = 0;
    phi = 0;
  } else {
    t = grid ? gridT(inp.clipT, frames) : inp.clipT;
    if (clip === 'walk') {
      // Distance, not time: a slower person takes the same steps, fewer per second.
      const moved = Math.min(Math.max(inp.movedPx, 0), STRIDE_PX / 2);
      rs.phase = (rs.phase + moved / STRIDE_PX) % 1;
    }
    phi = lite ? gridT(rs.phase, frames) : rs.phase;
    if (!lite) rs.ageS += dt;
  }

  const walking = clip === 'walk';
  const sleeping = clip === 'sleep';
  const secondary = !reduced && !lite;

  // --- the body: bob, squash, lean, weight ---------------------------------
  // Walk bob is downward only (hip = nominal − BOB·(1 − |sin 2πφ|)): the hip
  // is at its nominal height exactly when a foot is under it, so the legs are
  // never asked to reach further than they do standing, and the figure's top
  // never rises while walking. The prototype centred its bob (rig.ts:121);
  // that raised the hip 1 px above what the legs can span.
  let hipDrop = 0;
  let squash = 1;
  let lean = 0;
  let hipX = 0;
  let quiltBreath = 0;
  let zDrift = 0;
  if (!reduced) {
    switch (clip) {
      case 'walk':
        if (secondary) {
          hipDrop = BOB_WALK_MAX * (1 - Math.abs(Math.sin(TAU * phi)));
          squash = 1 - Math.max(0, Math.cos(2 * TAU * phi)) * SQUASH_MAX;
        }
        break;
      case 'idle':
        hipDrop = cycle(BOB_IDLE, t);
        if (secondary) squash = 1 + cycle(SQUASH_BREATH, t);
        if (inp.mood === 'impatient') hipX += cycle(IMPATIENT_SHIFT, t);
        break;
      case 'work':
        hipDrop = cycle(BOB_WORK, t);
        break;
      case 'sit':
        hipDrop = SIT_DROP + cycle(BOB_SIT, t);
        break;
      case 'happy':
        hipDrop = cycle(HOP, t);
        break;
      case 'angry':
        hipDrop = cycle(STAMP, t);
        break;
      case 'scared':
        lean = cycle(LEAN_FLINCH, t);
        break;
      case 'sleep':
        quiltBreath = cycle(SLEEP_BREATH, t);
        zDrift = cycle(SLEEP_DRIFT, t);
        break;
    }
    if (inp.holding === 'shiftWeight') hipX += SHIFT_WEIGHT_PX * Math.sin(Math.PI * inp.holdT);
  } else if (clip === 'sit') {
    hipDrop = SIT_DROP;
  }

  // A hop lifts the whole figure, feet included; every other bob keeps the
  // feet on the floor and moves the hip toward or away from them.
  const feetY = clip === 'happy' ? hipDrop : 0;

  const hip = out.hip;
  hip.x = hipX;
  hip.y = p.hipY + hipDrop;
  const socket = HIP_SOCKET * p.shoulder;
  out.hipL.x = hip.x - socket; out.hipL.y = hip.y;
  out.hipR.x = hip.x + socket; out.hipR.y = hip.y;

  out.chest.x = hip.x + 0.4 * lean;
  out.chest.y = hip.y - 0.55 * p.torso;
  out.neck.x = hip.x + 0.9 * lean;
  out.neck.y = hip.y - p.torso;

  // --- legs: feet on the floor or on the stride ellipse, knees from IK -------
  // Each leg roots at its own socket and the feet stand under them, so an idle
  // person has hcstyle's parallel legs and the knee bend is the same on both.
  const amp = STRIDE_AMP * p.total;
  const lift = FOOT_LIFT_MAX * p.total;
  for (const side of [-1, 1] as const) {
    const root = side < 0 ? out.hipL : out.hipR;
    const knee = side < 0 ? out.kneeL : out.kneeR;
    const foot = side < 0 ? out.footL : out.footR;
    const standX = side * socket;
    if (walking) {
      // The back foot is half a cycle behind the front one; each swings about
      // its own socket, and swings only while it is off the ground.
      const theta = TAU * phi + (side < 0 ? Math.PI : 0);
      const s = Math.sin(theta);
      scratch.x = standX + Math.cos(theta) * amp;
      scratch.y = -Math.max(0, s) * lift;
    } else if (clip === 'sit') {
      scratch.x = standX + SIT_FEET_FORWARD;
      scratch.y = feetY;
    } else if (clip === 'angry' && !reduced) {
      // hcstyle widens the stance on both sides (`fx = hx + swing·side`).
      scratch.x = standX + side * cycle(ANGRY_SWING, t);
      scratch.y = feetY;
    } else {
      scratch.x = standX;
      scratch.y = feetY;
    }
    // The knee bends forward (+x): with the target below the root that is the
    // −1 solution.
    ik(root, scratch, p.thigh, p.shin, -1, knee, foot);
  }

  // --- arms: hcstyle's hand targets per pose, elbows from IK -----------------
  const armLen = p.upperArm + p.foreArm;
  const armY = p.armY + hipDrop;
  for (const side of [-1, 1] as const) {
    const sh = side < 0 ? out.shoulderL : out.shoulderR;
    const elbow = side < 0 ? out.elbowL : out.elbowR;
    const hand = side < 0 ? out.handL : out.handR;
    const ax = hip.x + side * (p.shoulder / 2 - 0.6) + 0.4 * lean;
    sh.x = ax;
    sh.y = armY;
    let hx: number;
    let hy: number;
    if (walking) {
      // Counter-swing: the hand goes back as the same-side foot goes forward.
      const theta = TAU * phi + (side < 0 ? Math.PI : 0);
      hx = ax - Math.cos(theta) * 2.4;
      hy = armY + armLen;
    } else if (clip === 'work') {
      const reach = reduced ? 0 : cycle(WORK_REACH, t);
      if (side > 0) {
        hx = ax + (3.4 + 2.4 * reach);
        hy = armY + armLen * (0.46 - 0.22 * reach);
      } else {
        hx = ax - 1.6;
        hy = armY + armLen * 0.9;
      }
    } else if (clip === 'sit') {
      hx = ax + side * 2.2;
      hy = armY + armLen * 0.68;
    } else if (clip === 'happy') {
      const raise = reduced ? 0 : cycle(HAPPY_RAISE, t);
      hx = ax + side * (1.3 + 2.4 * raise);
      hy = armY + armLen * (1 - 1.55 * raise);
    } else if (clip === 'angry') {
      hx = ax + side * 0.4;
      hy = armY + armLen * 0.52;
    } else if (clip === 'scared') {
      hx = ax + side * 0.9;
      hy = armY + armLen * 0.4;
    } else if (clip === 'idle' && inp.mood === 'impatient') {
      // Arms folded (the prototype's 'wait'): both hands forward at the chest.
      hx = ax + 2.2;
      hy = armY + p.upperArm * 0.95;
    } else {
      hx = ax + side * 1.3;
      hy = armY + armLen;
    }
    scratch.x = hx;
    scratch.y = hy;
    // The elbow points away from the body's centre line, on both sides, for a
    // hand below the shoulder and for one raised over it.
    const bend: 1 | -1 = (hy >= armY ? -side : side) as 1 | -1;
    ik(sh, scratch, p.upperArm, p.foreArm, bend, elbow, hand);
  }

  // --- head: rides the squashed neck, a beat behind it ----------------------
  // The target is the neck's DRAWN position: the renderer scales the body
  // about the feet, so the neck sits at neck.y·squash, and the head's
  // diameter never changes while the torso under it compresses.
  const targetX = out.neck.x;
  const targetY = out.neck.y * squash - RIG_BODY_TOP * p.headR;
  let lagX = 0;
  let lagY = 0;
  if (secondary) {
    // A spring on the head's absolute position, kept as its offset from the
    // target: when the target moves the head stays put for an instant (the
    // lag grows by the target's motion) and the spring then pulls it after.
    // The prototype measured the lag from the current target and never added
    // the target's motion (rig.ts:143-150), so its head could not lag at all.
    const worldX = targetX * inp.facing;
    const lag = rs.headLag;
    const vel = rs.headVel;
    if (!Number.isNaN(rs.headPrev.x)) {
      lag.x += rs.headPrev.x - worldX;
      lag.y += rs.headPrev.y - targetY;
    }
    rs.headPrev.x = worldX;
    rs.headPrev.y = targetY;
    const h = Math.min(dt, HEAD_STEP_MAX_S);
    const accX = -lag.x * HEAD_SPRING_K - vel.x * HEAD_SPRING_DAMP;
    const accY = -lag.y * HEAD_SPRING_K - vel.y * HEAD_SPRING_DAMP;
    vel.x += accX * h;
    vel.y += accY * h;
    lag.x += vel.x * h;
    lag.y += vel.y * h;
    lag.x = lag.x < -HEAD_LAG_MAX ? -HEAD_LAG_MAX : lag.x > HEAD_LAG_MAX ? HEAD_LAG_MAX : lag.x;
    lag.y = lag.y < -HEAD_LAG_MAX ? -HEAD_LAG_MAX : lag.y > HEAD_LAG_MAX ? HEAD_LAG_MAX : lag.y;
    lagX = lag.x * inp.facing;
    lagY = lag.y;
  } else if (lite) {
    rs.headLag.x = 0; rs.headLag.y = 0;
    rs.headVel.x = 0; rs.headVel.y = 0;
    rs.headPrev.x = NaN; rs.headPrev.y = NaN;
  }
  out.head.x = targetX + lagX;
  out.head.y = targetY + lagY;

  let tilt = lagX * 0.055 + (walking && !reduced ? HEAD_TILT_WALK : 0);
  if (!reduced && inp.holding === 'glance') tilt += HEAD_TILT_GLANCE;
  if (sleeping) tilt = HEAD_TILT_SLEEP;

  out.headTilt = tilt;
  out.squash = squash;
  out.lean = lean;
  out.hipDrop = hipDrop;
  out.lying = sleeping;
  out.quiltBreath = quiltBreath;
  out.zDrift = zDrift;
  return out;
}

// ---------------------------------------------------------------- bounds
export interface BoundsLook {
  hairStyle: HairStyle;
  capStyle: CapStyle | null;
  /** From cast.ts PROP_EXTENT for the tool in the front hand, or 0 with no tool. */
  propHalfWidth: number;
  propAbove: number;
}

export interface RigBounds {
  /** Widest point either side of the pivot, rig px, strokes included. */
  halfWidth: number;
  /** Highest point above the feet, rig px, strokes included. */
  top: number;
}

export interface HeadExtent {
  /** Highest point of hair or hat above the skull's centre, in head radii (no stroke). */
  up: number;
  /** Widest point of hair or hat from the skull's centre, in head radii (no stroke). */
  side: number;
  /** The ink half-width on that highest / widest mark, rig px (hcstyle's LW_* lines). */
  upStroke: number;
  sideStroke: number;
}

/**
 * How far hair and headwear reach beyond the skull, from hcstyle's shapes
 * (`_draw_hair_back` 878-892, `_draw_hair_front` 895-938, `_draw_cap`
 * 941-974): a bun sits at cy − 1.06r with radius 0.44r, a toque's crown at
 * cy − 1.42r, a ponytail out to cx + 1.34r. Curls and tufts are unstroked
 * fills; everything with an ink outline carries LW_FACE. The skull itself is
 * 1r with LW_PROP.
 */
export function headExtent(hairStyle: HairStyle, capStyle: CapStyle | null): HeadExtent {
  let up = 1;
  let upStroke = HALF_LW_PROP;
  let side = 1;
  let sideStroke = HALF_LW_PROP;
  const raise = (u: number, stroke: number): void => {
    if (u + stroke / 8 > up + upStroke / 8) { up = u; upStroke = stroke; }
  };
  const widen = (w: number, stroke: number): void => {
    if (w + stroke / 8 > side + sideStroke / 8) { side = w; sideStroke = stroke; }
  };
  switch (hairStyle) {
    case 'bun': raise(1.50, HALF_LW_FACE); break;
    case 'curly': raise(1.22, 0); widen(1.18, 0); break;
    case 'long': widen(1.02, HALF_LW_FACE); break;
    case 'ponytail': widen(1.34, HALF_LW_FACE); break;
    case 'pigtails': widen(1.48, HALF_LW_FACE); break;
    default: break;
  }
  switch (capStyle) {
    case 'toque': raise(1.42, HALF_LW_FACE); break;
    case 'pillbox': raise(1.22, HALF_LW_FACE); break;
    case 'peaked': raise(1.10, HALF_LW_FACE); widen(1.06, HALF_LW_FACE); break;
    case 'beanie': raise(1.08, HALF_LW_FACE); break;
    default: break;
  }
  return { up, side, upStroke, sideStroke };
}

/**
 * The rig px box a pose occupies, from the joints and hcstyle's part sizes —
 * what a 48×72 cell would have to hold. The sleeper is measured from
 * hcstyle's own sleeper numbers (hcstyle.py:1075-1120), which never depended
 * on the person's height.
 */
export function boundsOf(pose: Pose, p: RigProportions, look: BoundsLook): RigBounds {
  if (pose.lying) {
    // Pillow left edge −19.9, quilt right edge +20.5, shadow ±19; the Zs are
    // the highest mark, above a head whose centre follows the quilt's breath.
    const quiltTop = -(15 - pose.quiltBreath) - 1 + pose.quiltBreath;
    const cy = quiltTop - 4;
    const zTop = cy - 19 + pose.zDrift * 1.4 - 2.2 * 0.72 - 0.6;
    return {
      halfWidth: Math.max(19.9 + HALF_LW_DETAIL, 20.5 + HALF_LW_PROP, 19),
      top: Math.max(-(cy - 11.4 - HALF_LW_PROP), -zTop),
    };
  }
  const r = p.headR;
  const head = headExtent(look.hairStyle, look.capStyle);
  let top = -pose.head.y + head.up * r + head.upStroke;
  let half = Math.abs(pose.head.x) + head.side * r + head.sideStroke;
  const torsoHalf = p.shoulder / 2 + HALF_LW_PROP;
  half = Math.max(half, Math.abs(pose.chest.x) + torsoHalf, Math.abs(pose.hip.x) + torsoHalf);
  for (const hand of [pose.handL, pose.handR]) {
    top = Math.max(top, -hand.y + 1.9 + HALF_LW_FACE);
    half = Math.max(half, Math.abs(hand.x) + 1.9 + HALF_LW_FACE);
  }
  for (const foot of [pose.footL, pose.footR]) {
    half = Math.max(half, Math.abs(foot.x) + 2.4 + HALF_LW_FACE);
  }
  if (look.propHalfWidth > 0) {
    half = Math.max(half, Math.abs(pose.handR.x) + look.propHalfWidth);
    top = Math.max(top, -pose.handR.y + look.propAbove);
  }
  return { halfWidth: half, top };
}

/**
 * How far the stance foot skates per step on screen: a step carries the body
 * half a stride while the foot moves back only twice its amplitude. Legs of
 * 13 px cannot plant a 64 px step; this is the number DEC-020 declares.
 */
export function walkSlidePx(strideAmpPx: number, stridePx: number, scale: number): number {
  return stridePx / 2 - 2 * strideAmpPx * scale;
}
