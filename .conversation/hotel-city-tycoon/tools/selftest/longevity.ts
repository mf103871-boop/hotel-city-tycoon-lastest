/**
 * The save must not grow without bound, and Arabic must fit.
 *
 * Nobody had asked what a save looks like after a year. It turned out that
 * every shop purchase was recorded forever under the week it happened in, and
 * nothing ever read an old one: 156 entries and four kilobytes after a
 * simulated year, with no ceiling. A slow leak in the only copy of somebody's
 * hotel is a failure that arrives months after anyone would look for it.
 *
 * Run: node --experimental-strip-types tools/selftest/longevity.ts
 */
import fs from 'node:fs';
import { loadSimData } from '../balance-sim/load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { execute } from '../../src/core/commands/index.ts';
import { advance } from '../../src/core/sim/tick.ts';
import { shopOffers } from '../../src/core/systems/liveops.ts';
import { neighbours } from '../../src/core/systems/neighbours.ts';
import type { GameState } from '../../src/core/state/types.ts';

const data = loadSimData();
const TPS = data.economy.simulation.ticksPerSecond;
const DAY = 86_400_000;

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

/** A hotel played hard for a given number of weeks. */
function playFor(weeks: number): GameState {
  const s = createInitialState(data, { seed: 5, epochMs: Date.UTC(2026, 0, 1) });
  s.player.coins = 500_000_000;
  s.player.level = 60;
  for (const p of [...data.plots].sort((a, b) => a.blocks - b.blocks)) {
    execute(data, s, { type: 'EXPAND_PLOT', plotId: p.id });
  }
  for (let i = 0; i < 40; i++) execute(data, s, { type: 'BUILD_ROOM', defId: 'economy' });
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_48h' });

  for (let week = 0; week < weeks; week++) {
    const start = Date.UTC(2026, 0, 1) + week * 7 * DAY;
    s.epochMs = start;
    for (const offer of shopOffers(data, s, start).slice(0, 3)) {
      execute(data, s, { type: 'BUY_SHOP_OFFER', defId: offer.defId, epochMs: start });
    }
    for (let d = 0; d < 7; d++) {
      const day = start + d * DAY;
      s.epochMs = day;
      for (const n of neighbours(data, s, day).slice(0, 6)) {
        execute(data, s, { type: 'VISIT_NEIGHBOUR', neighbourId: n.id, epochMs: day });
      }
      execute(data, s, { type: 'CLAIM_GIFT', epochMs: day });
    }
    // Two live minutes a week churn every structure a leak would grow —
    // guests, events, ledgers — at a fifth of the old ten-minute cost. The
    // claims here are about what ACCUMULATES per day and per week (visits,
    // shop records, the gift), which the calendar above provides; the tick
    // count only has to be non-trivial, and on a throttled verify box the
    // difference is the whole suite fitting its budget.
    advance(data, s, 120 * TPS);
  }
  return s;
}

const bytes = (s: GameState) => JSON.stringify(s).length;

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — long play');
console.log(line);

check('a year of play does not bloat the save', () => {
  const year = playFor(52);
  const kb = bytes(year) / 1024;
  assert(kb < 30, `a year of play produces a ${kb.toFixed(1)}KB save`);
  console.log(`      after a year: ${kb.toFixed(1)}KB`);
});

check('three years is barely bigger than one', () => {
  // The shape that matters. A save that grows steadily has a leak whatever
  // its size today.
  const oneYear = bytes(playFor(52));
  const threeYears = bytes(playFor(156));
  const growth = threeYears / oneYear;
  assert(growth < 1.4,
    `the save grew ${growth.toFixed(2)}x between year one and year three — something accumulates forever`);
  console.log(`      year 1 ${(oneYear / 1024).toFixed(1)}KB, year 3 ${(threeYears / 1024).toFixed(1)}KB`);
});

check('closed shop weeks are forgotten', () => {
  // The leak itself. Only the current week is ever consulted.
  const s = playFor(104);
  const kept = Object.keys(s.shopTaken).length;
  assert(kept <= data.shop.slots * 2,
    `${kept} shop purchases are still recorded, from weeks nothing will ever read`);
  console.log(`      ${kept} entries kept after two years`);
});

check('nothing else accumulates without a ceiling', () => {
  const s = playFor(104);
  const unbounded: string[] = [];
  const limits: Array<[string, number, unknown]> = [
    ['shopTaken', data.shop.slots * 2, Object.keys(s.shopTaken).length],
    ['revealedGuests', 200, s.revealedGuests.length],
    ['visitedToday.ids', data.neighbours.visitsPerDay, s.visitedToday.ids.length],
    ['completedObjectives', data.objectives.length, s.completedObjectives.length],
    ['eventClearCounts', data.events.length, Object.keys(s.eventClearCounts).length],
    ['eventCooldowns', data.events.length, Object.keys(s.eventCooldowns).length],
    ['guests', 500, s.guests.length],
    ['lobbyQueue', 50, s.lobbyQueue.length],
  ];
  for (const [name, cap, actual] of limits) {
    if (typeof actual === 'number' && actual > cap) unbounded.push(`${name}=${actual} (cap ${cap})`);
  }
  assert(unbounded.length === 0, `these have no ceiling: ${unbounded.join(', ')}`);
});

check('a long-played save still loads and still plays', () => {
  // Pruning must not have removed something the game needs.
  const s = playFor(104);
  const revived = JSON.parse(JSON.stringify(s)) as GameState;
  advance(data, revived, 600 * TPS);
  assert(revived.tick > s.tick, 'a long-played save stopped simulating');
  assert(revived.hotel.rooms.length === s.hotel.rooms.length, 'rooms were lost');
});

// ---------------------------------------------------------------- Arabic fit
check('Arabic labels fit where they are shown', () => {
  // Arabic runs longer than English almost everywhere: "Gym" is three
  // characters and "النادي الرياضي" is fourteen. Anything shown in a fixed
  // slot has to hold the longer one.
  const en = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>;
  const ar = JSON.parse(fs.readFileSync('src/i18n/locales/ar.json', 'utf8')) as Record<string, string>;

  const tooLong = Object.keys(en)
    .filter((k) => k.startsWith('ui.') && k in ar)
    .filter((k) => ar[k]!.length > 26 && en[k]!.length <= 14);
  assert(tooLong.length === 0,
    `short English labels with long Arabic that may not fit: ${tooLong.join(', ')}`);
});

check('anywhere a name is shown, it can be truncated', () => {
  // Room names roughly double in Arabic. Every slot that shows one has to be
  // able to cut it rather than push the row apart.
  const panels = ['BuildPanel', 'RoomSheet', 'CityPanel', 'ShopPanel'];
  for (const name of panels) {
    const src = fs.readFileSync(`src/ui/${name}.tsx`, 'utf8');
    if (!/nameKey|hotel\.name/.test(src)) continue;
    assert(/truncate/.test(src) || /Sheet\.tsx/.test(src) || /OptionRow/.test(src),
      `${name} shows a name with no way to cut it`);
  }
});

check('the layout uses logical directions only', () => {
  // The document's strict rule, and the reason RTL works at all: `ms-`/`me-`
  // flip with the language and `ml-`/`mr-` do not.
  const problems: string[] = [];
  for (const name of fs.readdirSync('src/ui')) {
    if (!name.endsWith('.tsx')) continue;
    const src = fs.readFileSync(`src/ui/${name}`, 'utf8');
    for (const m of src.matchAll(/\b(ml|mr|pl|pr|left|right)-\d/g)) {
      problems.push(`${name}: ${m[0]}`);
    }
  }
  assert(problems.length === 0, `physical directions break right-to-left: ${problems.join(', ')}`);
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
