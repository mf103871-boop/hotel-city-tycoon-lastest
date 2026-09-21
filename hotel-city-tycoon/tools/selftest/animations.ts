/**
 * Headless tests for the character animation contract (HC-P2-S1, DEC-012).
 *
 * The contract has three parties — the animation files in `data/animations/`,
 * the sheets the art pipeline draws from them, and the manifest the renderer
 * reads — and every one of them can drift from the others without anything
 * crashing. A clip the file promises and the sheet lacks is a frozen character;
 * a frame count the manifest gets wrong is a character sliced mid-body.
 *
 * Zod cannot run here (this suite is for a cold checkout), so the structural
 * rules are restated by hand against the raw JSON, the way integrity.mjs does.
 *
 * Run: node --experimental-strip-types tools/selftest/animations.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadSimData } from '../balance-sim/load-data.ts';
import { createMotion, resetMotion, step, snapTo } from '../../src/render/anim/motion.ts';
import { createPlayer, advance, progress } from '../../src/render/anim/clipPlayer.ts';
import { createScheduler, tick } from '../../src/render/anim/scheduler.ts';
import {
  pose, createRigState, figureFor, boundsOf, headExtent, walkSlidePx, NEUTRAL_INPUT,
  STRIDE_PX, STRIDE_AMP, BOB_WALK_MAX, BOB_IDLE_MAX, SQUASH_MAX, SQUASH_IDLE, HEAD_LAG_MAX, HOP_MAX, LEAN_MAX,
  STAND_SPACE_PX, CELL_HALF_WIDTH_PX, RIG_BODY_TOP,
} from '../../src/render/anim/rig.ts';
import type { Pose, Pt, RigClip, RigHold, RigInput, RigMood, RigProportions } from '../../src/render/anim/rig.ts';
import { CAST, PROP_EXTENT, castIds } from '../../src/render/anim/cast.ts';
import type { Look } from '../../src/render/anim/cast.ts';
import { BODY_HALF_WIDTH_PX } from '../../src/core/systems/roomWaypoints.ts';
import { readPng } from './png.ts';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }

const data = loadSimData();
const files = fs.readdirSync('data/animations').filter((f) => f.endsWith('.json')).sort();
const raw = new Map(files.map((f) => [f, JSON.parse(fs.readFileSync(path.join('data/animations', f), 'utf8'))]));

/** Every source file under a directory, joined. */
function sources(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) sources(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — character animation contract');
console.log(line);

// ---------------------------------------------------------------- the cast
check('one animation file per staff role and guest type, and no strays', () => {
  const expected = new Set([
    ...data.staffRoles.map((r) => `staff_${r.id}.json`),
    ...data.guestTypes.map((g) => `guest_${g.id}.json`),
  ]);
  for (const f of expected) assert(raw.has(f), `data/animations/${f} is missing`);
  for (const f of files) assert(expected.has(f), `data/animations/${f} names nobody in the cast`);
  eq(files.length, expected.size, 'file count differs from the cast');
  console.log(`      ${files.length} files for ${data.staffRoles.length} roles and ${data.guestTypes.length} guest types`);
});

check('every file carries the id its name promises', () => {
  for (const [f, a] of raw) {
    eq(a.id, f.replace('.json', '').replace('_', '.'), `${f} carries a different id`);
  }
});

check('the loader hands the bridge the same files', () => {
  eq(data.animations.length, files.length, 'SimData.animations differs from the directory');
  const ids = new Set(data.animations.map((a) => a.id));
  for (const [, a] of raw) assert(ids.has(a.id), `"${a.id}" was not loaded`);
});

// ---------------------------------------------------------------- the contract
check('every character keeps the ART-0 §17 frame contract', () => {
  for (const [f, a] of raw) {
    eq(a.frame.w, 48, `${f}: frame width`);
    eq(a.frame.h, 72, `${f}: frame height`);
    eq(a.frame.pivot.x, 24, `${f}: pivot x`);
    eq(a.frame.pivot.y, 70, `${f}: pivot y`);
    eq(a.frame.facing, 'right', `${f}: base facing`);
  }
});

check('every character has idle and walk; staff work, guests sleep', () => {
  for (const [f, a] of raw) {
    assert(a.clips.idle, `${f}: no idle clip`);
    assert(a.clips.walk, `${f}: no walk clip`);
    if (a.id.startsWith('staff.')) assert(a.clips.work, `${f}: staff without a work clip`);
    if (a.id.startsWith('guest.')) assert(a.clips.sleep, `${f}: guest without a sleep clip`);
  }
});

check('drawn motion stays inside ART-0 §11: 1–12 frames, 1–12 fps', () => {
  for (const [f, a] of raw) {
    for (const [name, clip] of Object.entries(a.clips as Record<string, { frames: number; fps: number; loop: boolean }>)) {
      assert(Number.isInteger(clip.frames) && clip.frames >= 1 && clip.frames <= 12, `${f}: ${name} has ${clip.frames} frames`);
      assert(Number.isInteger(clip.fps) && clip.fps >= 1 && clip.fps <= 12, `${f}: ${name} runs at ${clip.fps} fps`);
      const seconds = clip.frames / clip.fps;
      if (clip.loop && clip.frames > 1) assert(seconds >= 0.3 && seconds <= 2.0, `${f}: ${name} loops in ${seconds.toFixed(2)} s`);
      if (!clip.loop) assert(seconds >= 0.1 && seconds <= 1.2, `${f}: ${name} one-shot lasts ${seconds.toFixed(2)} s`);
    }
  }
});

check('every reaction answers a real event with a one-shot the character carries', () => {
  const types = fs.readFileSync('src/core/state/types.ts', 'utf8');
  const events = new Set([...types.matchAll(/\{ type: '([a-zA-Z]+)'/g)].map((m) => m[1]!));
  assert(events.size > 20, 'the SimEvent union was not found');
  for (const [f, a] of raw) {
    for (const [event, clip] of Object.entries(a.reactions as Record<string, string>)) {
      assert(events.has(event), `${f}: reacts to "${event}", which is not an event`);
      const def = a.clips[clip];
      assert(def, `${f}: reaction "${event}" plays "${clip}", which the sheet lacks`);
      assert(!def.loop, `${f}: reaction "${event}" plays a looping clip`);
    }
  }
});

check('the schema mirrors the SimEvent union exactly', () => {
  // The Zod schema keeps a copy of the event names so a reaction can be
  // validated in the app. A copy drifts; this is what stops it.
  const schema = fs.readFileSync('src/data/schemas/animations.ts', 'utf8');
  const block = /SIM_EVENT_TYPES = \[([\s\S]*?)\] as const/.exec(schema)?.[1] ?? '';
  const mirrored = new Set([...block.matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]!));
  const types = fs.readFileSync('src/core/state/types.ts', 'utf8');
  const events = new Set([...types.matchAll(/\{ type: '([a-zA-Z]+)'/g)].map((m) => m[1]!));
  const missing = [...events].filter((e) => !mirrored.has(e));
  const extra = [...mirrored].filter((e) => !events.has(e));
  assert(missing.length === 0, `events the schema does not know: ${missing.join(', ')}`);
  assert(extra.length === 0, `the schema lists events that do not exist: ${extra.join(', ')}`);
});

check('the cast is nine different people, not one person copied', () => {
  // ART-0 §5 for the drawing; the same rule for the motion. If every file
  // carried the same speed and the same fidget timing, the cast would move
  // in lockstep — the exact thing the plan calls "robots".
  const speeds = new Set(data.animations.map((a) => a.motion.walkSpeedBlocksPerSec));
  assert(speeds.size >= 4, `only ${speeds.size} distinct walk speeds across ${data.animations.length} characters`);
  const guests = data.animations.filter((a) => a.id.startsWith('guest.'));
  for (const a of guests) assert(a.behaviour.sleep, `${a.id} has no sleep routine`);
  for (const a of data.animations) {
    assert(a.motion.speedJitter > 0, `${a.id} has no per-individual speed jitter`);
    const [lo, hi] = a.behaviour.blinkEveryMs;
    assert(hi > lo, `${a.id} blinks on a fixed timer — ART-0 §11 asks for varied timing`);
  }
});

// ------------------------------------------------------------- the drawn frames
// Everything above reads the contract. These read the pixels the contract
// produced, because the rules ART-0 §11 sets for a frame — the figure does not
// change height, the identity does not change, nothing is cut off by the cell —
// are properties of the image and cannot be checked any other way.

/** A frame of a sheet, addressable by (clip, frame) and pixel. */
interface Sheet {
  key: string; tier: number; fw: number; fh: number; pivotY: number;
  clips: Record<string, { row: number; frames: number; fps: number; loop: boolean }>;
  alpha: (col: number, row: number, x: number, y: number) => number;
  colour: (col: number, row: number, x: number, y: number) => number;
}

/** Every character sheet on disk, at both resolutions. */
function sheets(): Sheet[] {
  const manifest = JSON.parse(fs.readFileSync('public/assets/manifest.json', 'utf8'));
  const out: Sheet[] = [];
  for (const entry of manifest.entries as { key: string; file: string; anim?: Sheet['clips'] & object }[]) {
    const anim = (entry as unknown as { anim?: { frame: { w: number; h: number; pivotY: number }; clips: Sheet['clips'] } }).anim;
    if (!anim) continue;
    for (const [dir, tier] of [['public/assets', 1], ['public/assets/@2x', 2]] as const) {
      const file = `${dir}/${entry.file}`;
      if (!fs.existsSync(file)) continue;
      const png = readPng(file);
      const fw = anim.frame.w * tier;
      const fh = anim.frame.h * tier;
      const at = (col: number, row: number, x: number, y: number) =>
        (((row * fh + y) * png.width) + col * fw + x) * png.channels;
      out.push({
        key: entry.key, tier, fw, fh, pivotY: anim.frame.pivotY * tier, clips: anim.clips,
        alpha: (c, r, x, y) => (png.channels === 4 ? png.data[at(c, r, x, y) + 3]! : 255),
        colour: (c, r, x, y) => {
          const o = at(c, r, x, y);
          return (png.data[o]! << 16) | (png.data[o + 1]! << 8) | png.data[o + 2]!;
        },
      });
    }
  }
  return out;
}

/** Anything the eye reads as drawn, rather than an anti-aliased tail. */
const SOLID = 128;
const sheetsOnDisk = sheets();

check('the pivot never moves: every frame of a clip stands on the same line', () => {
  // ART-0 line 479 and the master reference §5A: the figure may not change
  // height between frames. Measured at the feet, because that is the edge the
  // renderer pins to the floor — a bottom that drifts one pixel is a character
  // who sinks into the carpet on frame three.
  let worst = 0;
  for (const s of sheetsOnDisk) {
    for (const [name, clip] of Object.entries(s.clips)) {
      const bottoms: number[] = [];
      for (let i = 0; i < clip.frames; i++) {
        let bottom = -1;
        for (let y = s.fh - 1; y >= 0 && bottom < 0; y--) {
          for (let x = 0; x < s.fw; x++) if (s.alpha(i, clip.row, x, y) > 8) { bottom = y; break; }
        }
        assert(bottom >= 0, `${s.key} @${s.tier}x ${name} frame ${i} is empty`);
        bottoms.push(bottom);
      }
      const spread = Math.max(...bottoms) - Math.min(...bottoms);
      assert(spread <= 1, `${s.key} @${s.tier}x ${name} feet move ${spread}px across the clip (${bottoms.join(', ')})`);
      worst = Math.max(worst, spread);
    }
  }
  console.log(`      ${sheetsOnDisk.length} sheets, worst drift ${worst}px`);
});

check('a loop wraps no harder than it steps', () => {
  // "First and last frame agree" cannot mean "are the same picture" — the last
  // frame of a stride is one step before the first, not equal to it. What has
  // to hold is that the step from the last frame back to the first is no bigger
  // than the steps inside the cycle, which is exactly what stops a walk from
  // hitching once per revolution.
  let worst = 0; let worstAt = '';
  for (const s of sheetsOnDisk) {
    for (const [name, clip] of Object.entries(s.clips)) {
      if (!clip.loop || clip.frames < 3) continue;
      const distance = (a: number, b: number) => {
        let sum = 0;
        for (let y = 0; y < s.fh; y++) for (let x = 0; x < s.fw; x++) {
          sum += Math.abs(s.alpha(a, clip.row, x, y) - s.alpha(b, clip.row, x, y));
        }
        return sum / (s.fw * s.fh);
      };
      let biggest = 0;
      for (let i = 0; i + 1 < clip.frames; i++) biggest = Math.max(biggest, distance(i, i + 1));
      const wrap = distance(clip.frames - 1, 0);
      const ratio = biggest === 0 ? 0 : wrap / biggest;
      assert(ratio <= 1.5, `${s.key} @${s.tier}x ${name} jumps ${ratio.toFixed(2)}x its own step size when it loops`);
      if (ratio > worst) { worst = ratio; worstAt = `${s.key} ${name}`; }
    }
  }
  console.log(`      worst wrap ${worst.toFixed(2)}x the largest interior step (${worstAt})`);
});

check('the character is the same person in every frame of every clip', () => {
  // ART-0 §11: the identity, the height and the clothes do not change between
  // frames. The generator guarantees it structurally — every frame is drawn
  // from one `Person` — and this is the proof at the pixels: each colour that
  // makes up 3% or more of the idle frame is still somewhere in every other
  // frame the character has, sleeping and cheering included.
  //
  // Colours are compared four bits to a channel. At an exact match the two
  // tiers disagree about nothing but their anti-aliasing, and a skin tone
  // sampled at @2x is a hundred neighbouring values rather than one.
  const bucket = (c: number) => (((c >> 20) & 0xf) << 8) | (((c >> 12) & 0xf) << 4) | ((c >> 4) & 0xf);
  let marksChecked = 0;
  for (const s of sheetsOnDisk) {
    const idle = s.clips.idle;
    assert(idle, `${s.key} has no idle row to take an identity from`);
    const tally = (col: number, row: number): Set<number> => {
      const m = new Set<number>();
      for (let y = 0; y < s.fh; y++) for (let x = 0; x < s.fw; x++) {
        if (s.alpha(col, row, x, y) < 250) continue;
        m.add(bucket(s.colour(col, row, x, y)));
      }
      return m;
    };
    const counts = new Map<number, number>();
    let total = 0;
    for (let y = 0; y < s.fh; y++) for (let x = 0; x < s.fw; x++) {
      if (s.alpha(0, idle.row, x, y) < 250) continue;
      const k = bucket(s.colour(0, idle.row, x, y));
      counts.set(k, (counts.get(k) ?? 0) + 1);
      total++;
    }
    const marks = [...counts.entries()].filter(([, n]) => n / total >= 0.03).map(([k]) => k);
    assert(marks.length >= 4, `${s.key} @${s.tier}x has only ${marks.length} colours to be recognised by`);
    for (const [name, clip] of Object.entries(s.clips)) {
      for (let i = 0; i < clip.frames; i++) {
        const t = tally(i, clip.row);
        for (const k of marks) {
          assert(t.has(k), `${s.key} @${s.tier}x loses colour ${k.toString(16)} in ${name} frame ${i}`);
        }
        marksChecked += marks.length;
      }
    }
  }
  console.log(`      ${marksChecked} colour-in-frame checks across ${sheetsOnDisk.length} sheets`);
});

check('no character is cut off by the edge of its own cell', () => {
  // A figure that touches the left, right or top of its 48x72 cell has been
  // shaved by it — the chef's hat and the sleeper's pillow both were, before
  // this test existed. The bottom row is exempt and deliberately so: the pivot
  // is at y=70 of 72 and the contact shadow is what fills the last two rows.
  let sides = 0;
  for (const s of sheetsOnDisk) {
    for (const [name, clip] of Object.entries(s.clips)) {
      for (let i = 0; i < clip.frames; i++) {
        for (let y = 0; y < s.fh; y++) {
          assert(s.alpha(i, clip.row, 0, y) < SOLID, `${s.key} @${s.tier}x ${name} frame ${i} is cut off at the left edge (row ${y})`);
          assert(s.alpha(i, clip.row, s.fw - 1, y) < SOLID, `${s.key} @${s.tier}x ${name} frame ${i} is cut off at the right edge (row ${y})`);
        }
        for (let x = 0; x < s.fw; x++) {
          assert(s.alpha(i, clip.row, x, 0) < SOLID, `${s.key} @${s.tier}x ${name} frame ${i} is cut off at the top edge (column ${x})`);
        }
        sides += 3;
      }
    }
  }
  console.log(`      ${sides} frame edges clear`);
});

check('a standing character has something on the floor line in every frame', () => {
  // The renderer pins pivotY to the floor. If the row at the pivot is empty
  // the character is drawn hovering, which is the failure the old fixed-frame
  // renderer hid because nothing ever moved.
  let frames = 0;
  for (const s of sheetsOnDisk) {
    for (const [name, clip] of Object.entries(s.clips)) {
      // A sleeper is lying on a bed the room draws; its own feet row is quilt.
      if (name === 'sleep') continue;
      for (let i = 0; i < clip.frames; i++) {
        let hit = false;
        for (let x = 0; x < s.fw && !hit; x++) if (s.alpha(i, clip.row, x, s.pivotY) > 8) hit = true;
        assert(hit, `${s.key} @${s.tier}x ${name} frame ${i} has nothing at the pivot row — the character floats`);
        frames++;
      }
    }
  }
  console.log(`      ${frames} standing frames touch their own floor line`);
});

check('no clip is the same picture repeated', () => {
  // A two-frame clip whose frames are identical is a still image wearing an
  // animation's frame count, and it costs a sheet column to say nothing. The
  // sit clip was exactly this until its breath was drawn.
  for (const s of sheetsOnDisk) {
    for (const [name, clip] of Object.entries(s.clips)) {
      if (clip.frames < 2) continue;
      const digest = (i: number) => {
        let h = 2166136261;
        for (let y = 0; y < s.fh; y++) for (let x = 0; x < s.fw; x++) {
          h = Math.imul(h ^ s.alpha(i, clip.row, x, y), 16777619);
          h = Math.imul(h ^ s.colour(i, clip.row, x, y), 16777619);
        }
        return h >>> 0;
      };
      const seen = new Set<number>();
      for (let i = 0; i < clip.frames; i++) seen.add(digest(i));
      // A cycle that goes out and comes back repeats a frame on the way home;
      // what is forbidden is a clip that never draws a second picture at all.
      assert(seen.size >= 2, `${s.key} @${s.tier}x ${name} draws one picture ${clip.frames} times`);
    }
  }
});

// ---------------------------------------------------------------- the boundary
check('the simulation never reads the animation data', () => {
  // `SimData.animations` rides through the core so the bridge can reach it.
  // The only line in src/core allowed to mention it is the interface field.
  for (const file of sources('src/core')) {
    const text = fs.readFileSync(file, 'utf8');
    const hits = [...text.matchAll(/\banimations\b/g)].length;
    if (file.endsWith('data-source.ts')) {
      // The field declaration and the sentences that describe it.
      assert(/^\s+animations: CharacterAnimationDef\[\];/m.test(text), 'data-source.ts does not declare SimData.animations');
      continue;
    }
    eq(hits, 0, `${file} reads the animation data`);
  }
});

// ---------------------------------------------------------------- the motion
// The three pure modules the renderer's 60fps behaviour is made of. Vitest
// covers them in depth (tests/unit/animation.test.ts); these are the load-
// bearing properties, restated so a cold checkout with nothing installed can
// still prove them.
check('the drawn position moves every frame, never in 10Hz steps', () => {
  const m = createMotion();
  const walking = { x: 0, y: 0, vx: 1, vy: 0, toX: 10, toY: 0, segment: 'w' };
  step(m, walking, 16.7);
  let previous = m.x;
  for (let i = 0; i < 8; i++) {
    step(m, walking, 16.7);
    assert(m.x > previous, `frame ${i} did not move (${m.x} after ${previous})`);
    previous = m.x;
  }
});

check('the drawn position never passes the end of a leg', () => {
  const m = createMotion();
  snapTo(m, { x: 0.9, y: 0, vx: 1, vy: 0, toX: 1, toY: 0, segment: 'w' });
  for (let i = 0; i < 50; i++) step(m, { x: 1, y: 0, vx: 1, vy: 0, toX: 1, toY: 0, segment: 'w' }, 100);
  assert(m.x <= 1 + 1e-9, `overshot to ${m.x}`);
});

check('a clip steps at its own rate, not the display\'s', () => {
  const clips: Record<string, { frames: number; fps: number; loop: boolean }> = {
    walk: { frames: 8, fps: 10, loop: true },
  };
  const p = createPlayer('walk');
  const seen: number[] = [];
  for (let i = 0; i < 60; i++) seen.push(advance(p, 1000 / 60, (n) => clips[n] ?? null).frame);
  const changes = seen.filter((f, i) => i > 0 && f !== seen[i - 1]!).length;
  // A second of frames at 10fps changes about ten times, not sixty.
  assert(changes >= 8 && changes <= 12, `${changes} frame changes in one second at 10fps`);
});

check('two characters never blink in unison, and each is the same after a reload', () => {
  const config = {
    blinkEveryMs: [2500, 5000] as [number, number],
    fidgetEveryMs: [3000, 8000] as [number, number],
    fidgets: ['shiftWeight' as const, 'glance' as const],
  };
  const run = (seed: number): number[] => {
    const s = createScheduler(seed);
    const at: number[] = [];
    for (let t = 0; t < 30_000; t += 16.7) {
      if (tick(s, 16.7, config, true).play === 'blink') at.push(Math.round(t));
    }
    return at;
  };
  const a = run(11);
  const b = run(22);
  assert(a.length > 3, 'nobody blinked in thirty seconds');
  assert(JSON.stringify(a) !== JSON.stringify(b), 'two characters blink on the same timetable');
  eq(JSON.stringify(run(11)), JSON.stringify(a), 'the same character blinked differently the second time');
});

check('reduced motion holds the frame but keeps the character moving', () => {
  const clips: Record<string, { frames: number; fps: number; loop: boolean }> = {
    walk: { frames: 8, fps: 10, loop: true },
  };
  const p = createPlayer('walk');
  for (let i = 0; i < 20; i++) {
    eq(advance(p, 50, (n) => clips[n] ?? null, true).frame, 0, 'a frame cycled under reduced motion');
  }
  // The position is a separate concern and must keep moving: a guest frozen
  // mid-street loses the information that somebody is arriving.
  const m = createMotion();
  const s = { x: 0, y: 0, vx: 1, vy: 0, toX: 5, toY: 0, segment: 'w' };
  step(m, s, 16.7);
  const before = m.x;
  step(m, s, 16.7);
  assert(m.x > before, 'reduced motion stopped the character travelling');
});

check('a pooled view keeps nothing from the character before it', () => {
  const m = createMotion();
  snapTo(m, { x: 40, y: 9, vx: 0, vy: 0, toX: 40, toY: 9, segment: 'old' });
  resetMotion(m);
  step(m, { x: 2, y: 1, vx: 0, vy: 0, toX: 2, toY: 1, segment: 'new' }, 16.7);
  eq(m.x, 2, 'a recycled view slid in from the last character\'s position');
  eq(m.y, 1, 'a recycled view slid in from the last character\'s row');
});

// ---- the live rig (HC-P2-S3, DEC-020)
// The rig's maths is pure, so the properties DEC-020 signs are restated here
// for a cold checkout, computed from `pose()` over every clip and phase. The
// numbers vitest pins in depth (tests/unit/rig.test.ts) are printed per member
// so the report can quote them from a log rather than from the plan.
const RIG_CLIPS: readonly RigClip[] = ['idle', 'walk', 'work', 'sleep', 'sit', 'happy', 'angry', 'scared'];
const walkRow = (raw.get(files[0]!) as { clips: Record<string, { frames: number }> }).clips;
const rigFrames = (clip: RigClip): number => walkRow[clip]?.frames ?? 1;
const rigInput = (over: Partial<RigInput> = {}): RigInput => ({ ...NEUTRAL_INPUT, ...over });
const rigDist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
const NOMINAL = figureFor('normal', 1, 'adult');
const boundsLook = (look: Look, clip: RigClip) => {
  const prop = clip === 'work' ? look.propWork : look.prop;
  const ext = prop ? PROP_EXTENT[prop] : { halfWidth: 0, above: 0 };
  return { hairStyle: look.hairStyle, capStyle: look.capStyle, propHalfWidth: ext.halfWidth, propAbove: ext.above };
};
function bonesHold(p: Pose, f: RigProportions, where: string): void {
  const pairs: [Pt, Pt, number, string][] = [
    [p.kneeL, p.hipL, f.thigh, 'left thigh'], [p.kneeR, p.hipR, f.thigh, 'right thigh'],
    [p.footL, p.kneeL, f.shin, 'left shin'], [p.footR, p.kneeR, f.shin, 'right shin'],
    [p.elbowL, p.shoulderL, f.upperArm, 'left upper arm'], [p.elbowR, p.shoulderR, f.upperArm, 'right upper arm'],
    [p.handL, p.elbowL, f.foreArm, 'left forearm'], [p.handR, p.elbowR, f.foreArm, 'right forearm'],
  ];
  for (const [a, b, len, name] of pairs) {
    const d = rigDist(a, b);
    assert(Number.isFinite(d) && Math.abs(d - len) <= 1e-6, `${where}: the ${name} is ${d.toFixed(4)} long, not ${len.toFixed(4)}`);
  }
}
const stripSrc = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

check('the stride is driven by distance, not time', () => {
  for (const frames of [3, 30, 300]) {
    const rs = createRigState(5);
    const start = rs.phase;
    for (let i = 0; i < frames; i++) pose(rs, NOMINAL, rigInput({ clip: 'walk', frames: rigFrames('walk'), movedPx: STRIDE_PX / frames, dtS: 1 / 60 }));
    const turned = ((rs.phase - start) % 1 + 1) % 1;
    assert(Math.min(turned, 1 - turned) <= 1e-9, `${STRIDE_PX} px in ${frames} frames turned the cycle ${turned.toFixed(6)}, not 1`);
  }
  const rs = createRigState(5);
  const start = rs.phase;
  for (let i = 0; i < 60; i++) pose(rs, NOMINAL, rigInput({ clip: 'walk', frames: rigFrames('walk'), movedPx: 0, dtS: 1 / 60 }));
  eq(rs.phase, start, 'a second of standing still moved the walk phase');
});

check('the stance foot is planted, the leg always reaches, and the pivot never moves', () => {
  for (const id of castIds()) {
    const look = CAST[id]!;
    const f = figureFor(look.build, look.height, look.age);
    const legs = f.thigh + f.shin;
    assert(-f.hipY <= legs - 0.001, `${id}: hip ${(-f.hipY).toFixed(2)} is higher than the legs are long (${legs.toFixed(2)})`);
    const rs = createRigState(1);
    for (let i = 0; i < 64; i++) {
      const p = pose(rs, f, rigInput({ clip: 'walk', frames: rigFrames('walk'), movedPx: STRIDE_PX / 64, dtS: 1 / 60 }));
      const lower = Math.max(p.footL.y, p.footR.y);
      assert(Math.abs(lower) <= 1e-9, `${id} phase ${i}/64: the stance foot is at y ${lower.toFixed(4)}, not on the floor`);
      assert(p.hip.y >= f.hipY - 1e-12, `${id} phase ${i}/64: the hip rose ${(f.hipY - p.hip.y).toFixed(3)} above nominal while walking`);
      eq(p.hip.x, 0, `${id} phase ${i}/64: the pivot moved`);
      bonesHold(p, f, `${id} walk ${i}/64`);
    }
  }
});

check('secondary motion stays inside the bounds DEC-020 signs', () => {
  let idleLo = Infinity; let idleHi = -Infinity; let worstLag = 0;
  for (const id of castIds()) {
    const look = CAST[id]!;
    const f = figureFor(look.build, look.height, look.age);
    for (const clip of RIG_CLIPS) {
      const rs = createRigState(4);
      for (let i = 0; i < 200; i++) {
        const p = pose(rs, f, rigInput({ clip, frames: rigFrames(clip), clipT: i / 200, movedPx: 1, dtS: 1 / 60 }));
        assert(p.squash >= 1 - SQUASH_MAX - 1e-12 && p.squash <= 1 + SQUASH_IDLE + 1e-12, `${id} ${clip}: squash ${p.squash}`);
        assert(Math.abs(p.lean) <= LEAN_MAX + 1e-12, `${id} ${clip}: lean ${p.lean}`);
        if (clip === 'walk') assert(p.hipDrop >= 0 && p.hipDrop <= BOB_WALK_MAX + 1e-12, `${id} walk: hipDrop ${p.hipDrop}`);
        if (clip === 'happy') assert(-p.hipDrop <= HOP_MAX + 1e-12, `${id} happy: hop ${-p.hipDrop}`);
        if (clip === 'idle') { idleLo = Math.min(idleLo, p.hipDrop); idleHi = Math.max(idleHi, p.hipDrop); }
        // The head rides the squashed neck: its target is the drawn neck, not the unsquashed one.
        const neckY = (f.bodyTop + p.hipDrop) * p.squash;
        const off = Math.abs(p.head.y - rs.headLag.y - (neckY - RIG_BODY_TOP * f.headR));
        assert(off <= 1e-6, `${id} ${clip}: the head floats ${off.toExponential(2)} off the squashed neck`);
      }
    }
  }
  assert(idleHi - idleLo <= BOB_IDLE_MAX, `idle bob is ${(idleHi - idleLo).toFixed(3)} peak to peak`);
  const rs = createRigState(6);
  for (let i = 0; i < 5000; i++) {
    pose(rs, NOMINAL, rigInput({ clip: 'scared', frames: 2, clipT: i % 2 ? 0.5 : 0, facing: i % 2 ? -1 : 1, dtS: 0.001 }));
    worstLag = Math.max(worstLag, Math.abs(rs.headLag.x), Math.abs(rs.headLag.y));
  }
  assert(worstLag <= HEAD_LAG_MAX, `head lag reached ${worstLag.toFixed(3)} under jitter`);
  assert(worstLag > 0, 'the head spring was never excited');
  console.log(`      idle bob ${(idleHi - idleLo).toFixed(2)} p-p, worst head lag ${worstLag.toFixed(2)} of ${HEAD_LAG_MAX}`);
});

check('no pose is ever NaN', () => {
  const f = figureFor('slim', 0.92, 'adult');
  const moods: RigMood[] = ['neutral', 'impatient', 'happy', 'angry'];
  const holds: RigHold[] = [null, 'shiftWeight', 'glance'];
  let combos = 0;
  for (const clip of RIG_CLIPS) for (const mood of moods) for (const holding of holds) {
    for (const facing of [1, -1] as const) for (const reduced of [false, true]) for (const lite of [false, true]) for (const dtS of [0, 1 / 60, 10]) {
      const rs = createRigState(1);
      const p = pose(rs, f, rigInput({ clip, mood, holding, holdT: 0.5, facing, reduced, lite, dtS, movedPx: 300, frames: rigFrames(clip), clipT: 0.37 }));
      for (const v of Object.values(p)) {
        if (typeof v === 'number') assert(Number.isFinite(v), `${clip} ${mood} ${holding}: a scalar is ${v}`);
        else if (typeof v === 'object' && v !== null) assert(Number.isFinite((v as Pt).x) && Number.isFinite((v as Pt).y), `${clip} ${mood} ${holding}: a joint is NaN`);
      }
      bonesHold(p, f, `${clip} ${mood} ${holding} facing ${facing} reduced ${reduced} lite ${lite} dt ${dtS}`);
      combos++;
    }
  }
  console.log(`      ${combos} combinations, four bone lengths exact in each`);
});

check('reduced motion freezes the pose and keeps the transit', () => {
  for (const clip of RIG_CLIPS) for (const facing of [1, -1] as const) {
    const a = createRigState(11);
    const b = createRigState(22);
    for (let i = 0; i < 9; i++) pose(a, NOMINAL, rigInput({ clip: 'walk', frames: 8, movedPx: 10, dtS: 1 / 60 }));
    const pa = JSON.stringify(pose(a, NOMINAL, rigInput({ clip, facing, reduced: true, movedPx: 40, dtS: 1 / 60, clipT: 0.6, frames: rigFrames(clip) })));
    const pb = JSON.stringify(pose(b, NOMINAL, rigInput({ clip, facing, reduced: true, movedPx: 3, dtS: 10, clipT: 0.1, frames: rigFrames(clip) })));
    eq(pa, pb, `${clip} facing ${facing}: two seeds pose differently under reduced motion`);
    eq(a.pose.squash, 1, `${clip}: squash under reduced motion`);
    eq(a.pose.head.x, a.pose.neck.x, `${clip}: head lag under reduced motion`);
  }
  // The position is a separate concern and keeps travelling (animations.ts, the sheet path's rule).
  const m = createMotion();
  const s = { x: 0, y: 0, vx: 1, vy: 0, toX: 5, toY: 0, segment: 'w' };
  step(m, s, 16.7);
  const before = m.x;
  step(m, s, 16.7);
  assert(m.x > before, 'reduced motion stopped the character travelling');
});

check('same seed, same person; different seeds do not breathe in unison', () => {
  const run = (seed: number): string => {
    const rs = createRigState(seed);
    const out: string[] = [];
    for (let i = 0; i < 300; i++) {
      const clip: RigClip = i < 100 ? 'idle' : i < 200 ? 'walk' : 'work';
      out.push(JSON.stringify(pose(rs, NOMINAL, rigInput({ clip, frames: rigFrames(clip), clipT: (i % 50) / 50, movedPx: 2, dtS: 1 / 60 }))));
    }
    return out.join('\n');
  };
  eq(run(11), run(11), 'the same seed posed differently the second time');
  const gap = Math.abs(createRigState(11).phase - createRigState(22).phase);
  assert(gap >= 0.05, `seeds 11 and 22 start their stride only ${gap.toFixed(3)} apart`);
});

check('every cast member fits the body the rooms assume and the cell a bake would need', () => {
  let tallest = 0; let tallestAt = ''; let widest = 0; let widestAt = '';
  for (const id of castIds()) {
    const look = CAST[id]!;
    const f = figureFor(look.build, look.height, look.age);
    assert((f.shoulder / 2) * 0.82 <= BODY_HALF_WIDTH_PX, `${id}: torso half-width ${((f.shoulder / 2) * 0.82).toFixed(2)} px is wider than the ${BODY_HALF_WIDTH_PX} px the waypoints assume`);
    const bare = (2 * f.headR) / f.total;
    const ext = headExtent(look.hairStyle, look.capStyle);
    const dressed = ((ext.up + 1) * f.headR) / (f.total - f.headR + ext.up * f.headR);
    assert(bare >= 0.5 && bare <= 0.6, `${id}: bare head ratio ${bare.toFixed(3)}`);
    assert(dressed >= 0.5 && dressed <= 0.6, `${id}: head ratio with headwear ${dressed.toFixed(3)}`);
    const tops: string[] = [];
    for (const clip of RIG_CLIPS) {
      let top = 0; let half = 0;
      for (const mood of ['neutral', 'impatient'] as const) for (const holding of [null, 'shiftWeight'] as const) {
        const rs = createRigState(7);
        for (let i = 0; i < 16; i++) {
          const p = pose(rs, f, rigInput({ clip, frames: rigFrames(clip), clipT: i / 16, movedPx: STRIDE_PX / 16, dtS: 1 / 60, mood, holding, holdT: i / 16 }));
          const b = boundsOf(p, f, boundsLook(look, clip));
          top = Math.max(top, b.top); half = Math.max(half, b.halfWidth);
        }
      }
      assert(top <= STAND_SPACE_PX, `${id} ${clip}: top ${top.toFixed(2)} rig px is above ${STAND_SPACE_PX}`);
      assert(half <= CELL_HALF_WIDTH_PX, `${id} ${clip}: half-width ${half.toFixed(2)} rig px is beyond ${CELL_HALF_WIDTH_PX}`);
      tops.push(`${clip} ${top.toFixed(1)}/${half.toFixed(1)}`);
      if (top > tallest) { tallest = top; tallestAt = `${id} ${clip}`; }
      if (half > widest) { widest = half; widestAt = `${id} ${clip}`; }
    }
    const amp = STRIDE_AMP * f.total;
    console.log(`      ${id}: ${f.total.toFixed(1)} rig px (${(f.total * 0.82).toFixed(1)} px), head ${(bare * 100).toFixed(0)}% bare / ${(dressed * 100).toFixed(1)}% dressed, slide ${walkSlidePx(amp, STRIDE_PX, 0.82).toFixed(1)} px/step at ${STRIDE_PX} and ${walkSlidePx(amp, 64, 0.82).toFixed(1)} at 64`);
    console.log(`        top/half per clip: ${tops.join(', ')}`);
  }
  console.log(`      tallest ${tallest.toFixed(2)} (${tallestAt}) ≤ ${STAND_SPACE_PX}; widest ${widest.toFixed(2)} (${widestAt}) ≤ ${CELL_HALF_WIDTH_PX}`);
});

check('the rig never redraws geometry per frame', () => {
  // characterRig.ts poses fixed parts by transform and alpha only. Any
  // `new`, clear(), fill(), stroke(), context swap or visible/renderable
  // toggle inside apply() would rebuild geometry or the world's instruction
  // set every frame (DEC-020 §6); a RenderTexture anywhere breaks DEC-019.
  const file = 'src/render/characterRig.ts';
  assert(fs.existsSync(file), `${file} does not exist yet`);
  const src = fs.readFileSync(file, 'utf8');
  const stripped = stripSrc(src);
  const start = stripped.search(/\n\s+apply\(/);
  assert(start >= 0, 'characterRig.ts has no apply( method');
  let depth = 0; let i = stripped.indexOf('{', start); const open = i;
  for (; i < stripped.length; i++) {
    if (stripped[i] === '{') depth++;
    else if (stripped[i] === '}') { depth--; if (depth === 0) break; }
  }
  const body = stripped.slice(open, i + 1);
  for (const bad of ['new ', '.clear(', '.fill(', '.stroke(', '.context =', '.visible =', '.renderable =']) {
    assert(!body.includes(bad), `apply() contains "${bad}"`);
  }
  assert(/batchMode\s*=\s*'batch'/.test(stripped), 'contextFor does not set batchMode = \'batch\'');
  eq((stripped.match(/new GraphicsContext\(/g) ?? []).length, 1, 'new GraphicsContext( count');
  assert(!/cacheAsTexture/.test(stripped), 'characterRig.ts uses cacheAsTexture (DEC-019)');
  assert(!/RenderTexture/.test(stripped), 'characterRig.ts uses a RenderTexture (DEC-019)');
});

check('the sheet path is still there behind the rig', () => {
  const view = fs.readFileSync('src/render/characterView.ts', 'utf8');
  for (const literal of ['clipOf(', 'assetGeneration()', 'framesFor(', 'lookFor(']) {
    assert(view.includes(literal), `characterView.ts lost "${literal}"`);
  }
  assert(view.includes('if (beat.play && clipOf(this.lastAssetKey, beat.play)) playOnce(this.player, beat.play);'),
    'the sheet path\'s one-shot line is no longer byte-identical');
});

check('the JSON is still the clock', () => {
  const view = fs.readFileSync('src/render/characterView.ts', 'utf8');
  assert(view.includes('progress('), 'characterView.ts never reads the clip\'s progress');
  assert(view.includes("clipOf(this.lastAssetKey, 'blink')"), 'the blink\'s duration is not read from the blink row');
  for (const bad of ['WALK_FRAMES =', 'WALK_CYCLE_MS =', 'FIDGET_MS.blink']) {
    assert(!view.includes(bad), `characterView.ts carries its own clock: "${bad}"`);
  }
  const rig = stripSrc(fs.readFileSync('src/render/anim/rig.ts', 'utf8'));
  assert(!/\bfps\b/.test(rig), 'rig.ts knows a frame rate of its own');
  const player = stripSrc(fs.readFileSync('src/render/anim/clipPlayer.ts', 'utf8'));
  assert(/export function progress\(/.test(player), 'clipPlayer.ts has no progress()');
  const rows = { walk: { frames: 8, fps: 11, loop: true } } as Record<string, { frames: number; fps: number; loop: boolean }>;
  const p = createPlayer('walk');
  advance(p, 300, (n) => rows[n] ?? null);
  const t = progress(p, (n) => rows[n] ?? null);
  assert(t >= 0 && t < 1, `progress ${t} is outside [0, 1)`);
  eq(Math.floor(t * 8), Math.floor(0.3 * 11) % 8, 'progress disagrees with the frame index');
});

check('no presentation module rolls its own dice or touches the DOM at import', () => {
  // Every random number the renderer draws is seeded (mulberry32 through the
  // scheduler, a hash for the skyline and the stars), so a frame is the same
  // frame on every device and in every capture. And the pure modules — the
  // animation maths, the lighting maths, the bridge's clock — are loaded
  // headlessly by this suite and by vitest, which they can only be while they
  // import no Pixi and touch no DOM (HC-P2-S2; no earlier guard covered this).
  const strip = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  for (const file of sources('src/render')) {
    assert(!/Math\.random/.test(strip(fs.readFileSync(file, 'utf8'))), `${file} uses Math.random`);
  }
  // sheet.ts is the one anim module that is not pure: it hands out Pixi
  // textures, so it is the renderer's and is left out here on purpose.
  const pure = [
    'src/render/anim/motion.ts',
    'src/render/anim/clipPlayer.ts',
    'src/render/anim/scheduler.ts',
    'src/render/anim/rig.ts',
    'src/render/anim/cast.ts',
    'src/render/quality.ts',
    'src/render/lighting.ts',
    'src/bridge/daylight.ts',
  ];
  for (const file of pure) {
    const src = strip(fs.readFileSync(file, 'utf8'));
    assert(!/from 'pixi\.js'/.test(src), `${file} imports Pixi and can no longer load headlessly`);
    assert(!/\bdocument\b/.test(src), `${file} touches document`);
    assert(!/\bwindow\b/.test(src), `${file} touches window`);
  }
  console.log(`      ${pure.length} pure modules, ${sources('src/render').length} render files`);
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
