/**
 * Which frame of which clip a character is showing.
 *
 * Two clocks, deliberately apart (ART-0 §11): the engine draws at the
 * display's rate, but the frames themselves step at 8 to 12 a second, because
 * that is what hand-drawn motion looks like. This owns the slower one.
 *
 * A character always has a base clip, chosen by the bridge from what the
 * simulation says they are doing — walking, sleeping, working. On top of it a
 * one-shot may play: a blink, a cheer, a flinch. When the one-shot ends the
 * base clip is simply there again; nothing has to remember to restore it,
 * which is why there is no `returnTo` in the animation files.
 *
 * Pure maths, no Pixi.
 */

/** A clip's timing, as the manifest declares it. */
export interface ClipTiming {
  frames: number;
  fps: number;
  loop: boolean;
}

export interface PlayerState {
  base: string;
  /** The one-shot in progress, or null. */
  oneShot: string | null;
  /** Milliseconds into whichever clip is showing. */
  elapsedMs: number;
}

/** What to draw this frame. */
export interface PlayerFrame {
  clip: string;
  frame: number;
}

export function createPlayer(base = 'idle'): PlayerState {
  return { base, oneShot: null, elapsedMs: 0 };
}

export function resetPlayer(p: PlayerState, base = 'idle'): void {
  p.base = base;
  p.oneShot = null;
  p.elapsedMs = 0;
}

/**
 * Change the base clip. The phase restarts only when the clip actually
 * changes, so a character who keeps walking keeps walking rather than
 * stuttering back to the first frame on every snapshot.
 */
export function setBase(p: PlayerState, clip: string): void {
  if (p.base === clip) return;
  p.base = clip;
  if (!p.oneShot) p.elapsedMs = 0;
}

/**
 * Play a one-shot over the base clip. Ignored while another is running: a
 * character reacting to two things at once should finish the first reaction,
 * not twitch between them.
 */
export function playOnce(p: PlayerState, clip: string): void {
  if (p.oneShot) return;
  p.oneShot = clip;
  p.elapsedMs = 0;
}

export function isPlayingOneShot(p: PlayerState): boolean {
  return p.oneShot !== null;
}

/**
 * Advance by `dtMs` and report the frame to draw.
 *
 * `timing(clip)` answers with the clip's row, or null when this character's
 * sheet has no such row — in which case the base clip is used, and if that is
 * missing too, frame 0 of whatever was asked for.
 *
 * `hold` freezes the drawn frame at 0 without stopping the state machine:
 * that is reduced motion, where a character still changes what they are doing
 * but nothing cycles.
 */
export function advance(
  p: PlayerState,
  dtMs: number,
  timing: (clip: string) => ClipTiming | null,
  hold = false,
): PlayerFrame {
  p.elapsedMs += Math.max(0, dtMs);

  if (p.oneShot) {
    const row = timing(p.oneShot);
    if (!row) {
      p.oneShot = null;
      p.elapsedMs = 0;
    } else {
      const lengthMs = (row.frames / row.fps) * 1000;
      if (p.elapsedMs >= lengthMs) {
        // Done: the base clip is underneath, and its own phase carries on
        // from where the one-shot's did — near enough for a half-second beat.
        p.oneShot = null;
        p.elapsedMs = 0;
      } else {
        const frame = hold ? 0 : Math.min(row.frames - 1, Math.floor(p.elapsedMs / 1000 * row.fps));
        return { clip: p.oneShot, frame };
      }
    }
  }

  const row = timing(p.base);
  if (!row) return { clip: p.base, frame: 0 };
  if (hold || row.frames <= 1) return { clip: p.base, frame: 0 };

  const lengthMs = (row.frames / row.fps) * 1000;
  if (row.loop) {
    p.elapsedMs %= lengthMs;
    return { clip: p.base, frame: Math.floor(p.elapsedMs / 1000 * row.fps) % row.frames };
  }
  return { clip: p.base, frame: Math.min(row.frames - 1, Math.floor(p.elapsedMs / 1000 * row.fps)) };
}
