/**
 * Headless tests for the city of rival hotels.
 *
 * Section 13 of the architecture document names these as the substitute for a
 * social layer that would otherwise need a server. Two properties matter more
 * than any feature here: the city must be honest about what it is, and it must
 * not become a better way to earn than running a hotel.
 *
 * Run: node --experimental-strip-types tools/selftest/neighbours.ts
 */
import fs from 'node:fs';
import { loadSimData } from '../balance-sim/load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { execute } from '../../src/core/commands/index.ts';
import { neighbours, cityRank, visitsLeft } from '../../src/core/systems/neighbours.ts';
import { migrate } from '../../src/save/index.ts';
import { SCHEMA_VERSION } from '../../src/core/state/types.ts';
import type { GameState } from '../../src/core/state/types.ts';

const data = loadSimData();
let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }

const DAY = 86_400_000;
const START = Date.UTC(2026, 4, 12);
const fresh = (seed = 777): GameState => createInitialState(data, { seed, epochMs: START });

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — the city');
console.log(line);

check('the city is the same every time it is opened', () => {
  const s = fresh();
  eq(JSON.stringify(neighbours(data, s, START)), JSON.stringify(neighbours(data, s, START)),
    'the city was regenerated differently within one moment');
});

check('two hotels see different cities', () => {
  const a = neighbours(data, fresh(1), START);
  const b = neighbours(data, fresh(2), START);
  assert(JSON.stringify(a) !== JSON.stringify(b), 'every player is given an identical city');
});

check('the city is full and every hotel is distinct', () => {
  const city = neighbours(data, fresh(), START);
  eq(city.length, data.neighbours.count, 'the city is not the declared size');
  eq(new Set(city.map((n) => n.id)).size, city.length, 'two hotels share an id');
});

check('the city grows whether or not the player does', () => {
  // This is the entire point of having neighbours: a week away should mean
  // arriving to a city that moved on.
  const s = fresh();
  const now = neighbours(data, s, START);
  const later = neighbours(data, s, START + 20 * DAY);
  const before = now.reduce((n, x) => n + x.level, 0);
  const after = later.reduce((n, x) => n + x.level, 0);
  assert(after > before, `the city sat still for twenty days (${before} → ${after})`);
});

check('a new player is not bottom of a city of giants', () => {
  // Day one has to be survivable. Somebody must be beatable.
  const s = fresh();
  const city = neighbours(data, s, START);
  const beatable = city.filter((n) => n.level <= 3);
  assert(beatable.length > 0, 'every rival is already ahead on day one');
});

check('the ladder is a spread, not a wall', () => {
  const city = neighbours(data, fresh(), START + 30 * DAY);
  const levels = city.map((n) => n.level);
  assert(new Set(levels).size > 3, 'every rival is at the same level — nothing to climb');
});

check('nobody outgrows the game', () => {
  const maxLevel = data.levels[data.levels.length - 1]!.level;
  for (const n of neighbours(data, fresh(), START + 400 * DAY)) {
    assert(n.level <= maxLevel, `"${n.name}" reached level ${n.level}, past the cap`);
    assert(n.stars >= 1 && n.stars <= 5, `"${n.name}" has ${n.stars} stars`);
  }
});

check('rank places the player against the city', () => {
  const s = fresh();
  s.player.level = 1;
  const bottom = cityRank(data, s, START);
  s.player.level = data.levels[data.levels.length - 1]!.level;
  const top = cityRank(data, s, START);
  assert(top.rank < bottom.rank, 'levelling up did not improve the standing');
  eq(top.rank, 1, 'a maximum-level player is not first');
  eq(top.of, data.neighbours.count + 1, 'the city size in the ranking is wrong');
});

// ---------------------------------------------------------------- visiting
check('visiting pays, once per hotel per day', () => {
  const s = fresh();
  const first = neighbours(data, s, START)[0]!;
  const before = s.player.coins;
  assert(execute(data, s, { type: 'VISIT_NEIGHBOUR', neighbourId: first.id, epochMs: START }).ok,
    'the first visit failed');
  const bag = data.starTiers.find((t) => t.stars === s.hotel.stars)!.dailyBonusCoins;
  eq(s.player.coins - before, bag, 'the visit did not pay the star-tier money bag');

  const again = execute(data, s, { type: 'VISIT_NEIGHBOUR', neighbourId: first.id, epochMs: START });
  assert(!again.ok && again.reason === 'alreadyVisited', 'the same hotel paid out twice in a day');
});

check('the daily allowance is real', () => {
  const s = fresh();
  const city = neighbours(data, s, START);
  let paid = 0;
  for (const n of city) {
    if (execute(data, s, { type: 'VISIT_NEIGHBOUR', neighbourId: n.id, epochMs: START }).ok) paid++;
  }
  eq(paid, data.neighbours.visitsPerDay, `${paid} visits were allowed against a cap of ${data.neighbours.visitsPerDay}`);
  eq(visitsLeft(data, s, START), 0, 'the allowance did not run out');

  const extra = execute(data, s, { type: 'VISIT_NEIGHBOUR', neighbourId: city[city.length - 1]!.id, epochMs: START });
  assert(!extra.ok && extra.reason === 'noVisitsLeft', 'a visit was allowed past the cap');
});

check('tomorrow brings a fresh allowance', () => {
  const s = fresh();
  for (const n of neighbours(data, s, START)) {
    execute(data, s, { type: 'VISIT_NEIGHBOUR', neighbourId: n.id, epochMs: START });
  }
  eq(visitsLeft(data, s, START), 0, 'today is not used up');
  eq(visitsLeft(data, s, START + DAY), data.neighbours.visitsPerDay, 'a new day did not reset the allowance');
});

check('a hotel that does not exist cannot be visited', () => {
  const result = execute(data, fresh(), {
    type: 'VISIT_NEIGHBOUR', neighbourId: 'not_a_hotel', epochMs: START,
  });
  assert(!result.ok && result.reason === 'unknownNeighbour', 'a phantom hotel paid out');
});

check('a day of bags matches the April-2010 snapshot (4A)', () => {
  // Nineteen visits plus the daily home bonus: twenty bags at most, each at
  // the decision-1a tier value. 20 x 430 at five stars, exactly the original.
  eq(data.neighbours.visitsPerDay + 1, 20, 'the day no longer holds twenty bags');
  const s = fresh();
  const bag = data.starTiers.find((t) => t.stars === s.hotel.stars)!.dailyBonusCoins;
  assert(bag >= 400 && bag <= 430, `a bag pays ${bag}, outside the snapshot's 400..430`);
  const top = Math.max(...data.starTiers.map((t) => t.dailyBonusCoins));
  eq((data.neighbours.visitsPerDay + 1) * top, 20 * 430, 'the five-star day is not twenty bags of 430');
});

check('the bag scales with the star tier and nothing else (4A)', () => {
  // Level and wealth must not move it; the rating does, per the 1a table.
  const poor = fresh();
  const rich = fresh();
  rich.player.level = data.levels[data.levels.length - 1]!.level;
  rich.player.coins = 10_000_000;
  const city = neighbours(data, poor, START);

  const gain = (s: GameState) => {
    const before = s.player.coins;
    execute(data, s, { type: 'VISIT_NEIGHBOUR', neighbourId: city[0]!.id, epochMs: START });
    return s.player.coins - before;
  };
  eq(gain(poor), gain(rich), 'the bag scales with level or wealth');
  const five = fresh();
  five.hotel.stars = 5;
  eq(gain(five), data.starTiers.find((t) => t.stars === 5)!.dailyBonusCoins,
    'a five-star bag is not the tier value');
});

// ---------------------------------------------------------------- honesty
check('the city is never described as other players', () => {
  // A fake leaderboard implying real rivals is a lie told to look busier than
  // the game is, and a player who works that out is right to distrust
  // everything else it says.
  const sources = [
    'data/neighbours.json',
    'src/core/systems/neighbours.ts',
    ...(fs.existsSync('src/ui/CityPanel.tsx') ? ['src/ui/CityPanel.tsx'] : []),
  ];
  // Words as words, not as identifiers: `state.player.level` is not a claim
  // about anybody, and matching it was the guard reading code as copy.
  const banned = /(?<![.\w])(friends?|players?|online|worldwide|real people)(?![\w.])/i;
  for (const path of sources) {
    for (const [i, raw] of fs.readFileSync(path, 'utf8').split('\n').entries()) {
      // Comments and design notes may discuss the design; only what a player
      // could read is held to this. The first version matched the word
      // "players" inside a JSON design note, which is the guard working
      // correctly on the wrong text.
      // Only what a player could read. Comments discuss the design, and
      // identifiers like `id: 'player'` name a thing rather than claim one.
      const line = raw.trim();
      if (line.startsWith('*') || line.startsWith('//') || line.startsWith('/*')) continue;
      if (/^"?note/.test(line) || /"note[_a-zA-Z]*"\s*:/.test(line)) continue;
      if (/^\w+:\s*['"]/.test(line) || /\bid:\s*['"]/.test(line)) continue;
      assert(!banned.test(line), `${path}:${i + 1} calls the generated city other players: ${line.slice(0, 60)}`);
    }
  }
});

check('an older save joins a city that has not run away', () => {
  assert(SCHEMA_VERSION >= 6, 'the city was never versioned');
  const migrated = migrate({ seed: 1, player: { coins: 4 } }, 1, SCHEMA_VERSION);
  assert(typeof migrated['startedAtMs'] === 'number', 'the start date was not added');
  const visited = migrated['visitedToday'] as { ids: string[] };
  eq(visited.ids.length, 0, 'a migrated player arrives having already visited');
  eq((migrated['player'] as { coins: number }).coins, 4, 'the chain lost existing data');
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
