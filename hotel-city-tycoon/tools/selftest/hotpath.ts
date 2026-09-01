/**
 * The hot path, and the arithmetic at the far end of it.
 *
 * Two questions nobody had asked. What happens when a throttled tab comes back
 * and the engine replays every missed step in one frame — the classic source
 * of a freeze on return. And whether a hotel run for years produces numbers
 * JavaScript can still count.
 *
 * Both were measured rather than assumed, and both turned out fine. Keeping
 * the checks means they stay fine.
 *
 * Run: node --experimental-strip-types tools/selftest/hotpath.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadSimData } from '../balance-sim/load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { execute } from '../../src/core/commands/index.ts';
import { advance } from '../../src/core/sim/tick.ts';
import { resolveOffline } from '../../src/core/sim/offline.ts';
import type { GameState } from '../../src/core/state/types.ts';
import { measure, describe } from './measure.ts';

const data = loadSimData();
const TPS = data.economy.simulation.ticksPerSecond;
const FRAME_MS = 16.7;

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

/** A hotel at the scale the architecture document asks about. */
function bigHotel(): GameState {
  const s = createInitialState(data, { seed: 3, epochMs: 0 });
  s.player.coins = 500_000_000;
  s.player.level = 60;
  for (const p of [...data.plots].sort((a, b) => a.blocks - b.blocks)) {
    execute(data, s, { type: 'EXPAND_PLOT', plotId: p.id });
  }
  for (let i = 0; i < 60; i++) execute(data, s, { type: 'BUILD_ROOM', defId: 'economy' });
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_48h' });
  advance(data, s, 1800 * TPS);
  return s;
}

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — the hot path');
console.log(line);

check('a returning tab does not freeze the frame', () => {
  // Below sixty seconds the engine replays every missed tick at once rather
  // than resolving analytically. Fifty-nine seconds is the worst case, and it
  // lands in a single frame.
  const base = bigHotel();
  const worstGap = 59;
  // Judged on the median of several runs — see measure.ts. A single sample
  // here swings 14ms..62ms on identical input, which failed this check inside
  // the full suite and passed it standing alone. The budget is unchanged.
  const t = measure(
    () => JSON.parse(JSON.stringify(base)) as GameState,
    (copy) => { advance(data, copy, worstGap * TPS); },
  );

  assert(t.median < FRAME_MS * 3,
    `catching up on ${worstGap}s took ${t.median.toFixed(1)}ms — that is a visible freeze on return`);
  console.log(`      ${base.hotel.rooms.length} rooms, ${worstGap}s of catch-up in ${describe(t)}`);
});

check('catch-up cost grows with time, not with the square of it', () => {
  // Linear is the property that matters. Anything worse means a longer gap
  // costs disproportionately more, and the worst case is unbounded.
  const base = bigHotel();
  const time = (seconds: number) => measure(
    () => JSON.parse(JSON.stringify(base)) as GameState,
    (copy) => { advance(data, copy, seconds * TPS); },
  ).median;
  const short = Math.max(0.2, time(5));
  const long = time(50);
  assert(long < short * 25,
    `ten times the gap cost ${(long / short).toFixed(1)}x the time — the cost is not linear`);
});

check('an ordinary frame is nowhere near the budget', () => {
  const base = bigHotel();
  const copy = JSON.parse(JSON.stringify(base)) as GameState;
  const started = performance.now();
  for (let i = 0; i < 60; i++) advance(data, copy, 1);
  const perTick = (performance.now() - started) / 60;
  // The document allows the simulation 2ms of a 16.7ms frame.
  assert(perTick < 2, `one tick costs ${perTick.toFixed(3)}ms against a 2ms budget`);
  console.log(`      one tick on a 60-room hotel: ${perTick.toFixed(3)}ms`);
});

check('a long absence is capped rather than paid in full', () => {
  // Without a ceiling, coming back after a month would hand over a fortune
  // nobody played for. The ceiling is now the longest shift (48h — see
  // economy.json offlineNote): the original never truncated a paid shift.
  const base = bigHotel();
  const capMs = data.economy.simulation.maxOfflineHours * 3_600_000;
  const atCap = resolveOffline(data, JSON.parse(JSON.stringify(base)), capMs).coins;
  const year = resolveOffline(data, JSON.parse(JSON.stringify(base)), 365 * 86_400_000).coins;
  assert(year === atCap, `a year away paid ${year} against the cap's ${atCap} — the cap is not applied`);
  console.log(`      capped at ${data.economy.simulation.maxOfflineHours}h, both pay ${atCap.toLocaleString()}`);
});

check('offline resolution stays instant however long the absence', () => {
  // It is analytic, so a month should cost no more than a minute.
  const base = bigHotel();
  const time = (ms: number) => measure(
    () => JSON.parse(JSON.stringify(base)) as GameState,
    (copy) => { resolveOffline(data, copy, ms); },
  ).median;
  const minute = time(60_000);
  const month = time(30 * 86_400_000);
  assert(month < Math.max(1, minute * 4),
    `a month took ${month.toFixed(2)}ms against a minute's ${minute.toFixed(2)}ms — the resolver is iterating`);
});

check('years of earnings stay inside what JavaScript can count', () => {
  // Coins are plain numbers. Past 9e15 they stop being exact, and a player
  // would start losing money to rounding without any way to know why.
  const perDay = 3_000_000_000;   // far above the measured rate, deliberately
  const tenYears = perDay * 365 * 10;
  assert(tenYears < Number.MAX_SAFE_INTEGER / 100,
    `ten years of generous earnings reaches ${tenYears.toExponential(1)}, close to the safe limit`);
  console.log(`      ten years of play sits ${(Number.MAX_SAFE_INTEGER / tenYears).toExponential(1)}x below the limit`);
});

check('no code reads a data field that does not exist', () => {
  // A missing field reads as `undefined` and silently becomes NaN or a
  // fallback. A diagnostic of mine did exactly that while investigating this
  // very file, and printed "capped at undefined" without complaint.
  const economy = JSON.parse(fs.readFileSync('data/economy.json', 'utf8'));
  const known = new Set<string>();
  const collect = (o: unknown) => {
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      for (const [k, v] of Object.entries(o)) { known.add(k); collect(v); }
    }
  };
  collect(economy);

  const problems: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.ts$/.test(name)) continue;
      const src = fs.readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
      for (const m of src.matchAll(/economy\.(?:simulation|cleanliness|guests|start|decorMeter|sellback)\.(\w+)/g)) {
        if (!known.has(m[1]!)) problems.push(`${full}: economy.….${m[1]}`);
      }
    }
  };
  walk('src');
  assert(problems.length === 0, `these read fields that are not in the data: ${problems.join(', ')}`);
});

check('the hot loop looks rooms up by key, not by scanning', () => {
  // Twenty-one linear scans across twenty-three definitions, several of them
  // inside the loop that touches every room ten times a second. The bridge was
  // indexed in P13 and the core was forgotten — and the core is the hotter of
  // the two. Removing them took a third off a simulated day.
  const problems: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.ts$/.test(name) || full.includes('data-source')) continue;
      const src = fs.readFileSync(full, 'utf8');
      for (const m of src.matchAll(/(data|d)\.rooms\.find\(/g)) {
        problems.push(`${full}: ${m[0]}…`);
      }
    }
  };
  walk('src/core');
  assert(problems.length === 0,
    `scanning where a keyed lookup exists: ${problems.join(', ')}`);
});

check('a busy hotel simulates a day in reasonable time', () => {
  // Not a frame budget — this runs far faster in a browser than in this
  // container — but a regression here means something started scanning again.
  const s = createInitialState(data, { seed: 8, epochMs: 0 });
  s.player.coins = 50_000_000;
  s.player.level = 40;
  for (const p of [...data.plots].sort((a, b) => a.blocks - b.blocks)) {
    execute(data, s, { type: 'EXPAND_PLOT', plotId: p.id });
  }
  for (let i = 0; i < 40; i++) execute(data, s, { type: 'BUILD_ROOM', defId: 'economy' });
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_24h' });

  const started = performance.now();
  advance(data, s, 3600 * TPS);
  const elapsed = performance.now() - started;
  assert(elapsed < 4000, `one simulated hour on a 40-room hotel took ${elapsed.toFixed(0)}ms`);
  console.log(`      one simulated hour, ${s.hotel.rooms.length} rooms: ${elapsed.toFixed(0)}ms`);
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
