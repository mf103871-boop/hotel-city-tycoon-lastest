/**
 * A skeletal rig for a chibi character, posed procedurally.
 *
 * This is the part of the prototype that answers the question it was built to
 * answer. The shipped renderer plays frame sheets: a character is a strip of
 * drawn images, so a new gait, a limp, a heavier walk under a suitcase, or a
 * head that turns to follow the player all mean drawing the strip again.
 *
 * Here a character is nine joints and two bone chains. Motion is computed —
 * feet follow a stride ellipse, knees and elbows fall out of two-bone IK, the
 * body bobs and squashes on contact, the head lags a frame behind the torso.
 * Changing the walk is changing a number. That is precisely what Spine and
 * Rive sell, and what this file exists to put on screen next to the rest of
 * the game so the difference is arguable from something real.
 *
 * Angles are radians, +x is right, +y is DOWN (canvas convention).
 */

export interface Pose {
  /** Joint positions in character space: origin at the feet, -y is up. */
  hip: Pt; chest: Pt; neck: Pt; head: Pt;
  shoulderL: Pt; elbowL: Pt; handL: Pt;
  shoulderR: Pt; elbowR: Pt; handR: Pt;
  kneeL: Pt; footL: Pt;
  kneeR: Pt; footR: Pt;
  /** Head tilt, drawn as a rotation of the whole head group. */
  headTilt: number;
  /** Vertical squash: 1 = neutral, <1 = compressed on foot contact. */
  squash: number;
  /** Which way the character faces: 1 right, -1 left. */
  facing: number;
}

export interface Pt { x: number; y: number }

export interface RigState {
  /** Walk-cycle phase, 0..1, advanced by distance travelled not by time. */
  phase: number;
  /** Spring-damped head lag, in character-space px. */
  headLag: Pt;
  headVel: Pt;
  /** Blink timer in seconds; the eyes shut when it dips below the blink len. */
  blink: number;
}

export const newRigState = (seed = 0): RigState => ({
  phase: seed % 1,
  headLag: { x: 0, y: 0 },
  headVel: { x: 0, y: 0 },
  blink: 1 + (seed * 7) % 4,
});

/** Proportions, in px at scale 1. Chibi: the head is nearly half the figure. */
const LEG = 13;        // hip height above the ground
const THIGH = 7.2;
const SHIN = 7.2;
const TORSO = 11;      // hip to shoulders
const UPPER_ARM = 6;
const FOREARM = 6;
const HEAD_R = 9.5;

export const RIG_HEIGHT = LEG + TORSO + HEAD_R * 2;

/**
 * Two-bone IK.
 *
 * Given a root, a target and two bone lengths, return the joint between them.
 * `bendSign` picks which of the two mirror solutions to take — the knee bends
 * forward, the elbow back, and that is the only difference between a leg and
 * an arm here.
 */
function ik(root: Pt, target: Pt, a: number, b: number, bendSign: number): Pt {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  let d = Math.hypot(dx, dy);
  // Never let the target out-reach the chain, or the cosine below leaves [-1,1]
  // and the joint snaps to NaN — the classic way an IK limb disappears.
  const max = a + b - 0.001;
  if (d > max) d = max;
  if (d < 0.001) d = 0.001;

  const cos = Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d)));
  const base = Math.atan2(dy, dx);
  const off = Math.acos(cos) * bendSign;
  return { x: root.x + Math.cos(base + off) * a, y: root.y + Math.sin(base + off) * a };
}

export interface PoseInput {
  /** World px travelled since the last frame; drives the cycle. */
  speed: number;
  facing: number;
  dt: number;
  /** 'walk' | 'idle' | 'sleep' | 'cheer' | 'wait' */
  action: Action;
  /** Seconds since the actor spawned — de-syncs idle motion between actors. */
  age: number;
}

export type Action = 'walk' | 'idle' | 'sleep' | 'cheer' | 'wait';

/** Stride length in px: how far the feet carry the body in one full cycle. */
const STRIDE = 17;

export function pose(rs: RigState, inp: PoseInput): Pose {
  const { speed, facing, dt, action, age } = inp;

  // Phase advances with DISTANCE, not time. This is why the feet never skate:
  // a slower character takes the same steps, just fewer per second.
  if (action === 'walk') rs.phase = (rs.phase + speed / STRIDE) % 1;
  else rs.phase += dt * 0.35, rs.phase %= 1;

  rs.blink -= dt;
  if (rs.blink < -0.12) rs.blink = 2.2 + Math.random() * 3.5;

  const p = rs.phase * Math.PI * 2;
  const walking = action === 'walk';
  const sleeping = action === 'sleep';

  // --- body ---------------------------------------------------------
  // Two bobs per cycle: the body rises over each supporting leg.
  const bob = walking ? -Math.abs(Math.sin(p)) * 2.1 + 1.0 : Math.sin(age * 2.1) * 0.5;
  const squash = walking
    ? 1 - Math.max(0, Math.cos(p * 2)) * 0.055
    : 1 + Math.sin(age * 2.1 + 1) * 0.018;   // breathing

  const lean = walking ? facing * 0.10 : 0;

  const hipY = -(LEG) + bob;
  const hip: Pt = { x: walking ? facing * 0.6 : 0, y: hipY };

  const chest: Pt = {
    x: hip.x + Math.sin(lean) * TORSO * 0.55,
    y: hip.y - TORSO * 0.55,
  };
  const neck: Pt = {
    x: hip.x + Math.sin(lean) * TORSO,
    y: hip.y - TORSO,
  };

  // --- head, with a spring that lags the neck ------------------------
  // The whole reason a hand-drawn frame sheet looks stiff: nothing lags.
  const targetX = neck.x, targetY = neck.y - HEAD_R * 0.95;
  const k = 190, damp = 17;
  const ax = (targetX - (neck.x + rs.headLag.x)) * k - rs.headVel.x * damp;
  const ay = (targetY - (neck.y - HEAD_R * 0.95 + rs.headLag.y)) * k - rs.headVel.y * damp;
  // Clamp the step: a long frame (a backgrounded tab) must not blow the spring up.
  const h = Math.min(dt, 1 / 30);
  rs.headVel.x += ax * h; rs.headVel.y += ay * h;
  rs.headLag.x += rs.headVel.x * h; rs.headLag.y += rs.headVel.y * h;
  rs.headLag.x = clamp(rs.headLag.x, -2.5, 2.5);
  rs.headLag.y = clamp(rs.headLag.y, -2.5, 2.5);

  const head: Pt = { x: targetX + rs.headLag.x, y: targetY + rs.headLag.y };
  let headTilt = rs.headLag.x * 0.055 + (walking ? facing * 0.06 : 0);
  if (sleeping) headTilt = facing * 0.45;

  // --- legs: feet on a stride ellipse, knees from IK -----------------
  const foot = (ph: number): Pt => {
    if (!walking) {
      const spread = 3.6;
      return { x: hip.x + (ph < Math.PI ? spread : -spread) * 0.9, y: 0 };
    }
    const s = Math.sin(ph), c = Math.cos(ph);
    // Swing phase lifts the foot; stance phase drags it along the ground.
    const lift = Math.max(0, s) * 4.2;
    return { x: hip.x + c * (STRIDE / 2) * facing, y: -lift };
  };

  const footL = foot(p);
  const footR = foot(p + Math.PI);
  const kneeL = ik(hip, footL, THIGH, SHIN, facing > 0 ? 1 : -1);
  const kneeR = ik(hip, footR, THIGH, SHIN, facing > 0 ? 1 : -1);

  // --- arms: counter-swing to the legs -------------------------------
  const shoulderL: Pt = { x: chest.x - 0.5, y: chest.y };
  const shoulderR: Pt = { x: chest.x + 0.5, y: chest.y };

  const hand = (ph: number, sh: Pt): Pt => {
    if (sleeping) return { x: sh.x + facing * 1.5, y: sh.y + UPPER_ARM * 1.3 };
    if (action === 'cheer') {
      const up = Math.sin(age * 9 + ph) * 0.35;
      return { x: sh.x + Math.sin(ph) * 3, y: sh.y - UPPER_ARM - FOREARM * (0.75 + up) };
    }
    if (action === 'wait') {
      // Arms folded, with a slow impatient shift of weight.
      return { x: sh.x + facing * 2.2, y: sh.y + UPPER_ARM * 0.95 + Math.sin(age * 1.6) * 0.5 };
    }
    const swing = walking ? Math.cos(ph) * 4.6 * facing : Math.sin(age * 2 + ph) * 0.6;
    return { x: sh.x - swing, y: sh.y + UPPER_ARM + FOREARM * 0.88 };
  };

  const handL = hand(p + Math.PI, shoulderL);
  const handR = hand(p, shoulderR);
  const elbowL = ik(shoulderL, handL, UPPER_ARM, FOREARM, facing > 0 ? -1 : 1);
  const elbowR = ik(shoulderR, handR, UPPER_ARM, FOREARM, facing > 0 ? -1 : 1);

  return {
    hip, chest, neck, head, headTilt, squash, facing,
    shoulderL, elbowL, handL, shoulderR, elbowR, handR,
    kneeL, footL, kneeR, footR,
  };
}

export const eyesShut = (rs: RigState) => rs.blink < 0;

export const clamp = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v;
