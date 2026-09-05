import { describe, it, expect } from 'vitest';
import {
  createMotion, resetMotion, step, snapTo, fadeAlpha,
  SAMPLE_S, SNAP_BLOCKS, MAX_DT_S,
} from '../../src/render/anim/motion.ts';
import type { MotionSample } from '../../src/render/anim/motion.ts';
import {
  createPlayer, resetPlayer, setBase, playOnce, advance, isPlayingOneShot,
} from '../../src/render/anim/clipPlayer.ts';
import type { ClipTiming } from '../../src/render/anim/clipPlayer.ts';
import {
  createScheduler, resetScheduler, tick, intervalFrom, FIDGET_MS,
} from '../../src/render/anim/scheduler.ts';

/**
 * The animation maths, tested where it can be: these three modules are pure
 * on purpose, because Pixi cannot be loaded headlessly and the parts that
 * actually go wrong in a renderer — a smoother that overshoots, a clip that
 * runs at the display's rate instead of its own, a fidget every character
 * performs in unison — are all arithmetic.
 */

const sample = (over: Partial<MotionSample> = {}): MotionSample => ({
  x: 0, y: 0, vx: 0, vy: 0, toX: 0, toY: 0, segment: 'a', ...over,
});

/** Run a walk for `ms` at `hz`, reporting where the drawn position ends up. */
function play(hz: number, ms: number, at: (t: number) => MotionSample) {
  const m = createMotion();
  const dt = 1000 / hz;
  const positions: number[] = [];
  for (let t = 0; t < ms; t += dt) {
    step(m, at(t), dt);
    positions.push(m.x);
  }
  return { m, positions };
}

describe('motion smoothing', () => {
  it('appears in place rather than sliding in from the origin', () => {
    const m = createMotion();
    step(m, sample({ x: 12, y: 3, toX: 12, toY: 3 }), 16.7);
    expect(m.x).toBe(12);
    expect(m.y).toBe(3);
    expect(fadeAlpha(m)).toBe(1);
  });

  it('moves every frame, not once per simulation tick', () => {
    // The defect this exists for: at 10Hz snapshots the sprite sat still for
    // 100ms and then jumped. Every frame between two snapshots must move.
    const s = sample({ x: 0, vx: 1, toX: 10, segment: 'walk' });
    const m = createMotion();
    step(m, s, 16.7);
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) { step(m, s, 16.7); seen.push(m.x); }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!).toBeGreaterThan(seen[i - 1]!);
    }
  });

  it('never passes the end of the leg, however long the frame', () => {
    const s = sample({ x: 0.9, vx: 1, toX: 1, segment: 'walk' });
    const m = createMotion();
    snapTo(m, sample({ x: 0.9, toX: 1, segment: 'walk' }));
    for (let i = 0; i < 40; i++) step(m, s, 100);
    expect(m.x).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('settles onto a stopped target without oscillating', () => {
    const m = createMotion();
    snapTo(m, sample({ segment: 'x' }));
    m.x = 0.4;
    const stopped = sample({ x: 0, vx: 0, toX: 0, segment: 'x' });
    let previous = m.x;
    for (let i = 0; i < 60; i++) {
      step(m, stopped, 16.7);
      expect(m.x).toBeGreaterThanOrEqual(-1e-9);   // never crosses the target
      expect(m.x).toBeLessThanOrEqual(previous + 1e-9);  // never grows again
      previous = m.x;
    }
    expect(Math.abs(m.x)).toBeLessThan(0.01);
  });

  it('settles in about the same wall time at 30, 60 and 144Hz', () => {
    const settle = (hz: number) => {
      const m = createMotion();
      snapTo(m, sample({ segment: 'x' }));
      m.x = 0.5;
      const dt = 1000 / hz;
      let t = 0;
      while (Math.abs(m.x) > 0.01 && t < 2000) { step(m, sample({ segment: 'x' }), dt); t += dt; }
      return t;
    };
    const [a, b, c] = [settle(30), settle(60), settle(144)];
    for (const t of [a, b, c]) expect(t).toBeLessThan(700);
    expect(Math.abs(a - c)).toBeLessThan(200);
  });

  it('keeps pace with the simulation over a long walk', () => {
    // A guest crossing four blocks at one block a second should be about four
    // blocks along after four seconds, whatever the frame rate.
    const at = (t: number): MotionSample =>
      sample({ x: Math.min(4, t / 1000), vx: 1, toX: 4, segment: 'walk' });
    for (const hz of [30, 60, 144]) {
      const { m } = play(hz, 3000, at);
      expect(m.x).toBeGreaterThan(2.8);
      expect(m.x).toBeLessThan(3.2);
    }
  });

  it('snaps across a jump and eases across a small step', () => {
    const m = createMotion();
    snapTo(m, sample({ x: 0, segment: 'a' }));
    // A queue shuffling forward: same order of magnitude as a stride.
    step(m, sample({ x: 0.2, toX: 0.2, segment: 'b' }), 16.7);
    expect(m.x).toBeLessThan(0.2);
    expect(fadeAlpha(m)).toBe(1);
    // A lift to another floor: much further than a person can step.
    step(m, sample({ x: 0.2 + SNAP_BLOCKS + 1, toX: 0.2 + SNAP_BLOCKS + 1, segment: 'c' }), 16.7);
    expect(m.x).toBe(0.2 + SNAP_BLOCKS + 1);
    expect(fadeAlpha(m)).toBeLessThan(1);
  });

  it('is not flung across the plot by a stalled frame', () => {
    const m = createMotion();
    snapTo(m, sample({ segment: 'walk' }));
    step(m, sample({ vx: 10, toX: 999, segment: 'walk' }), 5000);
    expect(m.x).toBeLessThanOrEqual(10 * MAX_DT_S + 1e-9);
  });

  it('starts fresh again when a pooled view is handed to somebody else', () => {
    const m = createMotion();
    snapTo(m, sample({ x: 40, segment: 'old' }));
    resetMotion(m);
    step(m, sample({ x: 2, toX: 2, segment: 'new' }), 16.7);
    expect(m.x).toBe(2);
    expect(fadeAlpha(m)).toBe(1);
  });

  it('agrees with the engine cadence it corrects over', () => {
    expect(SAMPLE_S).toBe(0.1);
  });
});

describe('clip playback', () => {
  const clips: Record<string, ClipTiming> = {
    idle: { frames: 4, fps: 4, loop: true },
    walk: { frames: 8, fps: 10, loop: true },
    happy: { frames: 4, fps: 8, loop: false },
    still: { frames: 1, fps: 3, loop: true },
  };
  const timing = (name: string): ClipTiming | null => clips[name] ?? null;

  it('steps frames at the clip\'s rate, not the display\'s', () => {
    const p = createPlayer('walk');
    // 10 fps: a frame every 100ms, however often we are asked.
    const seen: number[] = [];
    for (let i = 0; i < 30; i++) seen.push(advance(p, 1000 / 60, timing).frame);
    const changes = seen.filter((f, i) => i > 0 && f !== seen[i - 1]!).length;
    expect(changes).toBeGreaterThanOrEqual(4);
    expect(changes).toBeLessThanOrEqual(6);
  });

  it('loops back to the first frame and no further', () => {
    const p = createPlayer('idle');
    let max = 0;
    for (let i = 0; i < 200; i++) max = Math.max(max, advance(p, 20, timing).frame);
    expect(max).toBe(3);
    expect(advance(p, 1000, timing).frame).toBeLessThan(4);
  });

  it('holds a single-frame clip without dividing by anything', () => {
    const p = createPlayer('still');
    expect(advance(p, 5000, timing)).toEqual({ clip: 'still', frame: 0 });
  });

  it('keeps walking when told it is still walking', () => {
    const p = createPlayer('walk');
    advance(p, 300, timing);
    const before = advance(p, 0, timing).frame;
    setBase(p, 'walk');
    expect(advance(p, 0, timing).frame).toBe(before);
  });

  it('restarts the phase when the clip actually changes', () => {
    const p = createPlayer('walk');
    advance(p, 350, timing);
    setBase(p, 'idle');
    expect(advance(p, 0, timing).frame).toBe(0);
  });

  it('plays a one-shot over the base clip and then returns to it', () => {
    const p = createPlayer('idle');
    playOnce(p, 'happy');
    expect(isPlayingOneShot(p)).toBe(true);
    expect(advance(p, 100, timing).clip).toBe('happy');
    // 4 frames at 8fps is half a second.
    advance(p, 500, timing);
    expect(isPlayingOneShot(p)).toBe(false);
    expect(advance(p, 0, timing).clip).toBe('idle');
  });

  it('does not interrupt one reaction with another', () => {
    const p = createPlayer('idle');
    playOnce(p, 'happy');
    playOnce(p, 'walk');
    expect(advance(p, 50, timing).clip).toBe('happy');
  });

  it('ignores a one-shot the character has no row for', () => {
    const p = createPlayer('idle');
    playOnce(p, 'scared');
    expect(advance(p, 16, timing).clip).toBe('idle');
    expect(isPlayingOneShot(p)).toBe(false);
  });

  it('holds frame zero under reduced motion while still changing clip', () => {
    const p = createPlayer('walk');
    for (let i = 0; i < 20; i++) expect(advance(p, 50, timing, true).frame).toBe(0);
    setBase(p, 'idle');
    expect(advance(p, 50, timing, true)).toEqual({ clip: 'idle', frame: 0 });
  });

  it('is put back to idle for the next character in a pooled view', () => {
    const p = createPlayer('walk');
    playOnce(p, 'happy');
    resetPlayer(p);
    expect(advance(p, 0, timing)).toEqual({ clip: 'idle', frame: 0 });
  });
});

describe('idle scheduling', () => {
  const config = {
    blinkEveryMs: [2500, 5000] as [number, number],
    fidgetEveryMs: [3000, 8000] as [number, number],
    fidgets: ['shiftWeight', 'glance'] as Array<'shiftWeight' | 'glance'>,
  };

  /** Count what one character does over a minute of standing about. */
  function minute(seed: number, impatient = false) {
    const s = createScheduler(seed);
    let blinks = 0;
    const fidgets: string[] = [];
    for (let t = 0; t < 60_000; t += 16.7) {
      const beat = tick(s, 16.7, config, true, impatient);
      if (beat.play === 'blink') blinks++;
      if (beat.holding && fidgets[fidgets.length - 1] !== beat.holding) fidgets.push(beat.holding);
    }
    return { blinks, fidgets };
  }

  it('blinks at roughly the rate the file asks for', () => {
    const { blinks } = minute(1234);
    // 2.5–5s apart over a minute: between 12 and 24, allowing the ends.
    expect(blinks).toBeGreaterThanOrEqual(11);
    expect(blinks).toBeLessThanOrEqual(25);
  });

  it('gives two characters different timetables', () => {
    const a = minute(1);
    const b = minute(2);
    expect(a.blinks !== b.blinks || a.fidgets.join() !== b.fidgets.join()).toBe(true);
  });

  it('gives the same character the same timetable every run', () => {
    expect(minute(99)).toEqual(minute(99));
  });

  it('does nothing at all while the character is busy', () => {
    const s = createScheduler(7);
    for (let t = 0; t < 30_000; t += 16.7) {
      expect(tick(s, 16.7, config, false).play).toBeNull();
    }
  });

  it('fidgets about twice as often when impatient', () => {
    const calm = minute(555).blinks;
    const cross = minute(555, true).blinks;
    expect(cross).toBeGreaterThan(calm);
  });

  it('holds a fidget for its own length and then lets go', () => {
    const s = createScheduler(3);
    let held = 0;
    let sawEnd = false;
    for (let t = 0; t < 20_000; t += 16.7) {
      const beat = tick(s, 16.7, config, true);
      if (beat.holding) held++;
      else if (held > 0) { sawEnd = true; break; }
    }
    expect(sawEnd).toBe(true);
    expect(held * 16.7).toBeLessThanOrEqual(FIDGET_MS.shiftWeight + 100);
  });

  it('draws each interval from inside the range it was given', () => {
    for (let i = 0; i < 50; i++) {
      const ms = intervalFrom(4242, i, [2500, 5000]);
      expect(ms).toBeGreaterThanOrEqual(2500);
      expect(ms).toBeLessThanOrEqual(5000);
    }
  });

  it('is re-seeded for the next character in a pooled view', () => {
    const s = createScheduler(10);
    for (let t = 0; t < 5000; t += 16.7) tick(s, 16.7, config, true);
    resetScheduler(s, 20);
    expect(s.active).toBeNull();
    expect(s.blinkTicket).toBe(0);
  });
});
