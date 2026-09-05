/**
 * Turning ten snapshots a second into motion at the display's rate.
 *
 * The simulation ticks at 10Hz and the bridge derives an exact position for
 * each tick. Writing that straight into the sprite is what made the hotel look
 * mechanical: a walking guest sat still for 100ms and then jumped a sixth of a
 * block. This closes the gap without inventing anything the simulation did not
 * say.
 *
 * Two steps per frame, in this order:
 *
 *   1. **Carry.** Move along the velocity the bridge reported for the current
 *      leg, clamped so it can never pass the leg's end. Between samples the
 *      character advances at the speed the simulation actually means, so the
 *      motion is continuous rather than a staircase.
 *   2. **Correct.** Close whatever gap is left to the authoritative position
 *      over one sample interval. The correction is a geometric approach with a
 *      factor in (0, 1], so it converges and never overshoots.
 *
 * A jump — a lift between floors, a rescued guest reappearing at the door, a
 * pooled view handed to a different person — is not smoothed: past
 * `SNAP_BLOCKS` a new leg snaps, under a short cross-fade so the eye reads a
 * cut rather than a glitch.
 *
 * Pure maths, no Pixi, so `tools/selftest/animations.ts` and Vitest can both
 * prove it without a browser — the pattern `decorArt.ts` and `camera.ts` set.
 */

/** What the bridge reported at the last snapshot. */
export interface MotionSample {
  x: number;
  y: number;
  /** Blocks per second along the current leg; zero while standing still. */
  vx: number;
  vy: number;
  /** Where the current leg ends. Carrying never goes past it. */
  toX: number;
  toY: number;
  /** Changes when a new leg begins. */
  segment: string;
}

/** What the view remembers between frames. */
export interface MotionState {
  /** The drawn position, in blocks. */
  x: number;
  y: number;
  segment: string;
  /** True until the first sample lands, so a fresh view appears in place. */
  fresh: boolean;
  /** Remaining cross-fade after a snap, 1 → 0. */
  fade: number;
}

/** The engine's cadence, in seconds: `data/economy.json` simulation.tickMs. */
export const SAMPLE_S = 0.1;
/** A new leg further than this from the drawn position is a cut, not a walk. */
export const SNAP_BLOCKS = 0.75;
/** A hitch or a backgrounded tab must not fling anybody across the plot. */
export const MAX_DT_S = 0.05;
/** How long the cross-fade after a snap lasts. */
export const SNAP_FADE_S = 0.12;

export function createMotion(): MotionState {
  return { x: 0, y: 0, segment: '', fresh: true, fade: 0 };
}

/** Put a view back to its just-created condition. Pools reuse views. */
export function resetMotion(m: MotionState): void {
  m.x = 0;
  m.y = 0;
  m.segment = '';
  m.fresh = true;
  m.fade = 0;
}

/** Drop the view exactly on the sample, with no fade. For an off-screen view. */
export function snapTo(m: MotionState, s: MotionSample): void {
  m.x = s.x;
  m.y = s.y;
  m.segment = s.segment;
  m.fresh = false;
  m.fade = 0;
}

/**
 * Advance the drawn position by `dtMs` towards what the simulation says.
 *
 * Returns nothing; `m` is mutated in place, because this runs once per
 * character per frame and the render loop allocates nothing.
 */
export function step(m: MotionState, s: MotionSample, dtMs: number): void {
  const dt = Math.min(Math.max(dtMs, 0) / 1000, MAX_DT_S);

  const jumped = m.segment !== s.segment
    && Math.hypot(s.x - m.x, s.y - m.y) > SNAP_BLOCKS;
  if (m.fresh || jumped) {
    const fade = m.fresh ? 0 : 1;
    snapTo(m, s);
    m.fade = fade;
    return;
  }
  m.segment = s.segment;

  // 1. Carry along the leg, never past its end.
  if (s.vx !== 0) {
    m.x += s.vx * dt;
    m.x = s.vx > 0 ? Math.min(m.x, s.toX) : Math.max(m.x, s.toX);
  }
  if (s.vy !== 0) {
    m.y += s.vy * dt;
    m.y = s.vy > 0 ? Math.min(m.y, s.toY) : Math.max(m.y, s.toY);
  }

  // 2. Close the residual over one sample interval. `k` is in (0, 1], so this
  //    approaches the target and cannot cross it.
  const k = Math.min(1, dt / SAMPLE_S);
  m.x += (s.x - m.x) * k;
  m.y += (s.y - m.y) * k;

  if (m.fade > 0) m.fade = Math.max(0, m.fade - dt / SNAP_FADE_S);
}

/** What to multiply the character's own opacity by while a snap fades in. */
export function fadeAlpha(m: MotionState): number {
  return 1 - m.fade;
}
