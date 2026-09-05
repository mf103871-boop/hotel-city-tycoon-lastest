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

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
