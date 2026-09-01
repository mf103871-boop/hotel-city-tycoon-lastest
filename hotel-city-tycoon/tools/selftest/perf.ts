/**
 * Headless tests for the performance harness.
 *
 * The document set five budgets on day one and three were never measured
 * across thirteen phases, because measuring them needs a browser. The
 * measurement still cannot happen here — but the arithmetic behind it can be
 * proved, so that when somebody does take a reading, the number means what it
 * claims.
 *
 * Run: node --experimental-strip-types tools/selftest/perf.ts
 */
import fs from 'node:fs';
import { loadSimData } from '../balance-sim/load-data.ts';
import { FrameSampler, report, formatReport, BUDGET } from '../../src/render/perf.ts';
import { buildStressState, stressRequest } from '../../src/bridge/stress.ts';

const data = loadSimData();
let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }
function near(a: number, b: number, m: string, eps = 0.5): void {
  if (Math.abs(a - b) > eps) throw new Error(`${m} (got ${a}, expected ~${b})`);
}

const scene = { rooms: 0, characters: 0, drawnRooms: 0, backend: 'webgl' };

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — performance harness');
console.log(line);

check('a steady sixty is reported as sixty', () => {
  const s = new FrameSampler();
  for (let i = 0; i < 300; i++) s.record(1000 / 60);
  const stats = s.stats();
  near(stats.fpsAverage, 60, 'a perfect sixty averaged wrongly');
  near(stats.fpsP95Low, 60, 'a perfect sixty has a bad fifth percentile');
  eq(stats.lateFrames, 0, 'a perfect sixty reported late frames');
});

check('one stutter does not hide behind the average', () => {
  // Sixty on average with a stutter every second is not sixty, and an average
  // is exactly the statistic that would call it sixty.
  const s = new FrameSampler();
  for (let i = 0; i < 100; i++) s.record(1000 / 60);
  s.record(200);                       // one terrible frame
  const stats = s.stats();
  assert(stats.fpsAverage > 45, 'the average should barely move');
  assert(stats.fpsMin < 10, `the worst frame reads ${stats.fpsMin} fps`);
  eq(stats.lateFrames, 1, 'the late frame was not counted');
});

check('the fifth percentile catches a stutter the average misses', () => {
  const s = new FrameSampler();
  // Ten percent of frames at half speed.
  for (let i = 0; i < 300; i++) s.record(i % 10 === 0 ? 1000 / 25 : 1000 / 60);
  const stats = s.stats();
  assert(stats.fpsAverage > 50, `the average is ${stats.fpsAverage.toFixed(1)} — it hides the stutter`);
  assert(stats.fpsP95Low < 30, `the fifth percentile is ${stats.fpsP95Low.toFixed(1)} — it should not`);
});

check('a backgrounded tab is not counted as a dropped frame', () => {
  // Returning to a tab produces one enormous delta. It is not a stutter, it is
  // a tab that was not being drawn, and counting it would poison every reading.
  const s = new FrameSampler();
  for (let i = 0; i < 100; i++) s.record(1000 / 60);
  s.record(45_000);
  eq(s.count, 100, 'the pause between sessions was recorded as a frame');
});

check('the window is fixed and never grows', () => {
  const s = new FrameSampler(50);
  for (let i = 0; i < 500; i++) s.record(16);
  eq(s.stats().samples, 50, 'the sampler kept more than its window');
});

check('an empty sampler reports nothing rather than dividing by zero', () => {
  const stats = new FrameSampler().stats();
  eq(stats.samples, 0, 'an empty sampler has samples');
  eq(stats.fpsAverage, 0, 'an empty sampler produced a frame rate');
});

check('a verdict is withheld until there is enough to judge', () => {
  const s = new FrameSampler();
  for (let i = 0; i < 30; i++) s.record(1000 / 60);
  eq(report(s, scene).verdict.sustained60, null,
    'thirty frames were enough to pass judgement');
  for (let i = 0; i < 200; i++) s.record(1000 / 60);
  eq(report(s, scene).verdict.sustained60, true, 'a steady sixty did not pass');
});

check('a failing frame rate is reported as failing', () => {
  const s = new FrameSampler();
  for (let i = 0; i < 300; i++) s.record(1000 / 30);
  eq(report(s, scene).verdict.sustained60, false, 'thirty fps passed a sixty fps budget');
});

check('an unavailable measurement is not a failure', () => {
  // A browser that will not report its heap has not failed the memory budget.
  const s = new FrameSampler();
  for (let i = 0; i < 200; i++) s.record(1000 / 60);
  const r = report(s, scene);
  assert(r.verdict.memory === null || typeof r.verdict.memory === 'boolean',
    'an absent memory reading became a verdict');
  eq(r.memoryMB, null, 'a heap was reported outside a browser');
});

check('the report says whether the scene is at the document\'s scale', () => {
  const s = new FrameSampler();
  for (let i = 0; i < 200; i++) s.record(1000 / 60);
  eq(report(s, { ...scene, rooms: 5, characters: 3 }).verdict.atDocumentScale, false,
    'five rooms passed as the document\'s scene');
  eq(report(s, { ...scene, rooms: 60, characters: 40 }).verdict.atDocumentScale, true,
    'sixty rooms and forty characters did not count as the document\'s scene');
});

check('the report reads as text without a browser', () => {
  const s = new FrameSampler();
  for (let i = 0; i < 200; i++) s.record(1000 / 60);
  const text = formatReport(report(s, { ...scene, rooms: 60, characters: 40 }));
  for (const needle of ['fps 5th pct', 'memory', 'first paint', 'at document scale']) {
    assert(text.includes(needle), `the report never mentions "${needle}"`);
  }
});

// ---------------------------------------------------------------- stress
check('stress mode builds the scene the document asks about', () => {
  const state = buildStressState(data, { rooms: BUDGET.stressRooms, seconds: 900, epochMs: 0 });
  assert(state.hotel.rooms.length >= BUDGET.stressRooms,
    `stress mode built ${state.hotel.rooms.length} rooms, short of ${BUDGET.stressRooms}`);
  assert(state.guests.length >= 10,
    `only ${state.guests.length} guests turned up — the character budget cannot be tested`);
  console.log(`      ${state.hotel.rooms.length} rooms, ${state.guests.length} guests, ${state.staff.length} staff`);
});

check('the stress hotel is one the game could really produce', () => {
  // Built by issuing commands, not by assembling state: a hand-made hotel
  // could quietly break a rule the renderer relies on.
  const state = buildStressState(data, { rooms: 60, seconds: 300, epochMs: 0 });
  const seen = new Set<string>();
  for (const room of state.hotel.rooms) {
    const def = data.rooms.find((r) => r.id === room.defId);
    assert(def, `a room of unknown type "${room.defId}" exists`);
    for (let dx = 0; dx < def.blocks.w; dx++) {
      for (let dy = 0; dy < def.blocks.h; dy++) {
        const key = `${room.x + dx},${room.y + dy}`;
        assert(!seen.has(key), `two rooms overlap at ${key}`);
        seen.add(key);
      }
    }
  }
});

check('stress mode is opt-in and bounded', () => {
  eq(stressRequest(''), null, 'a normal session was treated as a stress test');
  eq(stressRequest('?debug=1'), null, 'the debug flag started a stress test');
  eq(stressRequest('?stress=60')?.rooms, 60, 'the requested size was ignored');
  eq(stressRequest('?stress=99999')?.rooms, 200, 'an absurd request was not capped');
  eq(stressRequest('?stress=abc')?.rooms, 60, 'a malformed request did not fall back');
});

check('a stress session can never write to a save', () => {
  // Overwriting somebody's hotel to take a frame rate reading would be
  // indefensible, so the session is given no way to reach the disk.
  const boot = fs.readFileSync('src/ui/useGame.ts', 'utf8');
  const start = boot.indexOf('const stress = stressRequest');
  const end = boot.indexOf('const loaded = await saves.load()');
  const block = boot.slice(start, end);
  assert(block.length > 0, 'the stress branch was not found');
  // Strip comments first: the branch carries a comment explaining that there
  // is no persist port, and a naive search matched the explanation.
  const code = block.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  assert(!/persist\s*[,:)]/.test(code), 'the stress session is wired to a persist port');
  assert(!/saves\.save/.test(code), 'the stress session writes a save');
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
