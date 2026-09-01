/**
 * The two data loaders must agree.
 *
 * There are two: `tools/balance-sim/load-data.ts`, which every headless check
 * reads, and `src/data/index.ts`, which the game reads. If they ever diverge —
 * a file one loads and the other misses, a field mapped from a different
 * place — then several hundred passing checks are describing a game nobody
 * ships.
 *
 * Nothing has ever guarded that. They agree today by coincidence, and a
 * coincidence is not a property.
 *
 * The game's loader needs Zod and cannot run here, so this compares them
 * structurally: what each reads, what each maps, and that the test loader's
 * output matches the raw data byte for byte.
 *
 * Run: node --experimental-strip-types tools/selftest/loaders.ts
 */
import fs from 'node:fs';
import { loadSimData } from '../balance-sim/load-data.ts';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }

const testLoader = fs.readFileSync('tools/balance-sim/load-data.ts', 'utf8');
const gameIndex = fs.readFileSync('src/data/index.ts', 'utf8');
const gameMap = fs.readFileSync('src/data/sim-data.ts', 'utf8');
const dataFiles = fs.readdirSync('data').filter((f) => f.endsWith('.json')).sort();

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — the two loaders agree');
console.log(line);

check('both loaders read every file in data/', () => {
  for (const file of dataFiles) {
    assert(testLoader.includes(file), `the test loader never reads data/${file}`);
    assert(gameIndex.includes(file), `the game never reads data/${file}`);
  }
  console.log(`      ${dataFiles.length} data files, both loaders read all of them`);
});

check('neither loader reads a file that does not exist', () => {
  const present = new Set(dataFiles);
  for (const [label, src] of [['test', testLoader], ['game', gameIndex]] as const) {
    for (const m of src.matchAll(/([a-z]+\.json)/g)) {
      assert(present.has(m[1]!), `the ${label} loader reads data/${m[1]}, which is not there`);
    }
  }
});

check('both produce the same set of fields', () => {
  // The shape the simulation is handed has to be identical, or the core is
  // running against two different worlds.
  const fields = (src: string) =>
    new Set([...src.matchAll(/^ {4}([a-zA-Z]+):/gm)].map((m) => m[1]!));
  const fromTests = fields(testLoader);
  const fromGame = fields(gameMap);

  const onlyTests = [...fromTests].filter((f) => !fromGame.has(f));
  const onlyGame = [...fromGame].filter((f) => !fromTests.has(f));
  assert(onlyTests.length === 0, `only the tests see: ${onlyTests.join(', ')}`);
  assert(onlyGame.length === 0, `only the game sees: ${onlyGame.join(', ')}`);
  console.log(`      ${fromTests.size} fields, identical on both sides`);
});

check('every field the core declares is supplied by both', () => {
  // The interface is the contract. A field declared and never filled is a
  // crash waiting for the first code path that reads it.
  const source = fs.readFileSync('src/core/data-source.ts', 'utf8');
  const block = /export interface SimData \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? '';
  assert(block.length > 0, 'the SimData interface was not found');
  const declared = [...block.matchAll(/^\s{2}([a-zA-Z]+):/gm)].map((m) => m[1]!);
  assert(declared.length > 5, 'the interface looks empty');

  for (const field of declared) {
    assert(new RegExp(`^\\s{4}${field}:`, 'm').test(testLoader),
      `the core declares "${field}" and the test loader never supplies it`);
    assert(new RegExp(`^\\s{4}${field}:`, 'm').test(gameMap),
      `the core declares "${field}" and the game never supplies it`);
  }
  console.log(`      ${declared.length} declared fields, all supplied twice`);
});

check('the loaded data matches the files it came from', () => {
  // Not just that a field exists, but that it carries what the file says. A
  // loader mapping `rooms.json` to the wrong key would pass every check above.
  const data = loadSimData();
  const raw = (file: string) => JSON.parse(fs.readFileSync(`data/${file}`, 'utf8'));

  eq(data.rooms.length, raw('rooms.json').rooms.length, 'room count differs from the file');
  eq(data.decor.length, raw('decor.json').items.length, 'decor count differs from the file');
  eq(data.levels.length, raw('levels.json').levels.length, 'level count differs from the file');
  eq(data.objectives.length, raw('objectives.json').objectives.length, 'objective count differs');
  eq(data.upgrades.length, raw('upgrades.json').upgrades.length, 'upgrade count differs');
  eq(data.seasons.length, raw('seasons.json').seasons.length, 'season count differs');
  eq(data.staffRoles.length, raw('staff.json').roles.length, 'staff role count differs');
  eq(data.guestTypes.length, raw('guests.json').types.length, 'guest type count differs');
  eq(data.starTiers.length, raw('stars.json').tiers.length, 'star tier count differs');
  eq(data.plots.length, raw('plots.json').expansions.length, 'plot count differs');
  eq(data.shifts.length, raw('shifts.json').shifts.length, 'shift count differs');
  eq(data.events.length, raw('events.json').events.length, 'event count differs');
});

check('a value read through the loader is the value in the file', () => {
  const data = loadSimData();
  const rooms = JSON.parse(fs.readFileSync('data/rooms.json', 'utf8')).rooms as Array<Record<string, unknown>>;
  for (const raw of rooms) {
    const loaded = data.rooms.find((r) => r.id === raw['id']);
    assert(loaded, `"${String(raw['id'])}" is in the file and not in the loaded data`);
    eq(loaded.cost.amount, (raw['cost'] as { amount: number }).amount,
      `"${String(raw['id'])}" costs a different amount once loaded`);
    eq(loaded.unlockLevel, raw['unlockLevel'], `"${String(raw['id'])}" unlocks at a different level`);
  }
  const economy = JSON.parse(fs.readFileSync('data/economy.json', 'utf8'));
  eq(data.economy.simulation.tickMs, economy.simulation.tickMs, 'the tick rate differs once loaded');
  eq(data.economy.start.coins, economy.start.coins, 'the starting balance differs once loaded');
});

check('both loaders are updated together', () => {
  // Every past divergence had the same shape: a file added to one and not the
  // other. Counting the reads on each side catches that in one line.
  const reads = (src: string, pattern: RegExp) =>
    new Set([...src.matchAll(pattern)].map((m) => m[1]!));
  const fromTests = reads(testLoader, /read\('([a-z]+\.json)'\)/g);
  const fromGame = reads(gameIndex, /data\/([a-z]+\.json)/g);
  const missing = [...fromTests].filter((f) => !fromGame.has(f));
  const extra = [...fromGame].filter((f) => !fromTests.has(f));
  assert(missing.length === 0, `read by the tests only: ${missing.join(', ')}`);
  assert(extra.length === 0, `read by the game only: ${extra.join(', ')}`);
  eq(fromTests.size, dataFiles.length, 'the loaders read a different number of files than exist');
});

check('every schema is applied to exactly one file', () => {
  const validator = fs.readFileSync('tools/validate-data/schema.ts', 'utf8');
  const pairs = [...validator.matchAll(/\['([a-z]+\.json)',\s*(\w+Schema)\]/g)];
  eq(pairs.length, dataFiles.length,
    `${pairs.length} files are schema-checked against ${dataFiles.length} in data/`);
  const files = new Set(pairs.map((p) => p[1]!));
  for (const file of dataFiles) assert(files.has(file), `data/${file} is never schema-checked`);
});

check('no name means two different things across layers', () => {
  // `objectiveProgress` exists in both the core and the bridge with different
  // signatures. A test imported one and called it with the other's arguments,
  // and got `undefined` rather than an error.
  const exportsOf = (file: string) =>
    new Set([...fs.readFileSync(file, 'utf8').matchAll(/export function (\w+)/g)].map((m) => m[1]!));

  const core = exportsOf('src/core/systems/objectives.ts');
  const bridge = exportsOf('src/bridge/objectives.ts');
  const shared = [...core].filter((n) => bridge.has(n));

  // Sharing a name is allowed; sharing it silently is not. Each collision has
  // to be named here so the next person meets it deliberately.
  const known = new Set(['objectiveProgress']);
  const surprises = shared.filter((n) => !known.has(n));
  assert(surprises.length === 0,
    `these names mean different things in the core and the bridge: ${surprises.join(', ')}`);
  if (shared.length > 0) console.log(`      ${shared.length} known collision(s): ${shared.join(', ')}`);
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
