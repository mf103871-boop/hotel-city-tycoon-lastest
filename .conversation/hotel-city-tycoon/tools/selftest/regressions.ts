/**
 * Regression guards for everything an external audit found in P3a.
 *
 * Each check here corresponds to a real defect that shipped. They exist so the
 * same mistakes cannot come back quietly.
 *
 * Run: node --experimental-strip-types tools/selftest/regressions.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadSimData } from '../balance-sim/load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { execute } from '../../src/core/commands/index.ts';
import { GameEngine, fakeClock } from '../../src/bridge/engine.ts';
import { SaveManager, MemoryStorage, validateState, SAVE_KEY } from '../../src/save/index.ts';
import { SCHEMA_VERSION } from '../../src/core/state/types.ts';
import { GestureTracker, TAP_SLOP_PX } from '../../src/render/gestures.ts';

const data = loadSimData();
let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve().then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e: Error) => { failures.push(name); console.log(`  ✗ ${name}\n      ${e.message}`); });
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }

const newState = (seed = 4242) => createInitialState(data, { seed, epochMs: 0 });

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — audit regression guards');
console.log(line);

await (async () => {

// ── AUDIT: engine only notified subscribers when events.length > 0, so the
//    shift countdown froze between events.
await check('the engine notifies on a plain tick with no events', () => {
  const clock = fakeClock(0);
  const engine = GameEngine.newGame(data, { clock }, 1);
  let notifications = 0;
  let lastTick = -1;
  engine.subscribe((state) => { notifications++; lastTick = state.tick; });

  // Closed hotel: nothing "happens", but time still passes.
  clock.advance(1000);
  engine.catchUp(clock.now());

  assert(notifications > 0, 'a tick produced no notification — the HUD would freeze');
  eq(lastTick, 10, 'the notified state was not the advanced one');
});

await check('a closed hotel still advances its clock for the HUD', () => {
  const clock = fakeClock(0);
  const engine = GameEngine.newGame(data, { clock }, 2);
  const seen: number[] = [];
  engine.subscribe((state) => seen.push(state.tick));
  for (let i = 0; i < 5; i++) { clock.advance(1000); engine.catchUp(clock.now()); }
  eq(seen.length, 5, 'not every tick reached the subscriber');
  assert(seen[4]! > seen[0]!, 'the tick counter did not move');
});

// ── AUDIT: looksLikeState accepted `player: {}` and a minimal hotel, so a
//    malformed save loaded and produced NaN in the HUD later.
await check('a save with an empty player object is rejected', () => {
  const rubbish = {
    schemaVersion: 1, seed: 1, tick: 0, epochMs: 0,
    rng: { guestSpawn: 0, guestType: 0, guestDesire: 0, roomPick: 0, events: 0, staffGrade: 0 },
    player: {},
    hotel: { name: 'x', plotId: 'plot_12', stars: 3, rooms: [] },
    shift: { activeShiftId: null, endsAtTick: 0, paidCost: 0 },
    guests: [], staff: [], lobbyQueue: [],
    stats: { guestsServed: 0, coinsEarned: 0, coinsSpent: 0 },
    counters: { room: 0, guest: 0, staff: 0, decor: 0 },
    eventCooldowns: {}, eventClearCounts: {},
  };
  const problems = validateState(rubbish);
  assert(problems.length > 0, 'an empty player object passed validation');
  assert(problems.some((p) => p.includes('player.coins')), `wrong problem reported: ${problems.join('; ')}`);
});

await check('a save with a malformed room is rejected', () => {
  const s = newState();
  const broken = JSON.parse(JSON.stringify(s));
  delete broken.hotel.rooms[0].cleanliness;
  const problems = validateState(broken);
  assert(problems.some((p) => p.includes('cleanliness')), `malformed room accepted: ${problems.join('; ')}`);
});

await check('a save with NaN coins is rejected', () => {
  const s = newState();
  const broken = JSON.parse(JSON.stringify(s));
  broken.player.coins = null;
  assert(validateState(broken).length > 0, 'null coins passed validation');
});

await check('a real save still passes the deeper validation', () => {
  eq(validateState(newState()).length, 0, 'a legitimate save was rejected');
});

await check('the loader reports what was actually wrong', async () => {
  const storage = new MemoryStorage();
  const broken = JSON.parse(JSON.stringify(newState()));
  broken.player.coins = 'lots';
  await storage.set(SAVE_KEY, JSON.stringify({ format: 1, version: SCHEMA_VERSION, savedAtMs: 0, state: broken }));
  const res = await new SaveManager(storage).load();
  assert(!res.ok && res.reason === 'corrupt', 'a broken save loaded');
  assert(res.ok === false && res.detail?.includes('player.coins'), `unhelpful detail: ${res.ok === false ? res.detail : ''}`);
});

// ── AUDIT: rooms marked unique: true could be built more than once.
await check('a second lobby is refused', () => {
  const s = newState();
  s.player.coins = 10_000_000;
  assert(s.hotel.rooms.some((r) => r.defId === 'lobby'), 'the starting hotel has no lobby');
  const res = execute(data, s, { type: 'BUILD_ROOM', defId: 'lobby' });
  assert(!res.ok && res.reason === 'alreadyExists', 'a second lobby was built');
});

await check('non-unique rooms can still be built repeatedly', () => {
  const s = newState();
  s.player.coins = 10_000_000;
  let built = 0;
  for (let i = 0; i < 4; i++) if (execute(data, s, { type: 'BUILD_ROOM', defId: 'housekeeping' }).ok) built++;
  assert(built >= 2, `unique enforcement leaked onto ordinary rooms (built ${built})`);
});

// ── AUDIT: after a pinch, the remaining finger was not re-anchored, so the
//    hotel jumped; and a pinch could end as an unintended tap.
await check('lifting one finger after a pinch does not jump the view', () => {
  const g = new GestureTracker();
  g.down(1, { x: 100, y: 100 });
  g.down(2, { x: 300, y: 100 });
  g.move(2, { x: 320, y: 100 });
  g.up(2, { x: 320, y: 100 });

  // The next move must be measured from finger 1, not from the departed one.
  const action = g.move(1, { x: 105, y: 100 });
  assert(action.kind === 'pan', `expected a pan, got ${action.kind}`);
  assert(Math.abs(action.dx) <= 10, `view jumped by ${action.dx}px when the second finger lifted`);
});

await check('a pinch never ends as a tap', () => {
  const g = new GestureTracker();
  g.down(1, { x: 100, y: 100 });
  g.down(2, { x: 300, y: 100 });
  g.move(2, { x: 305, y: 100 });          // barely moved
  g.up(2, { x: 305, y: 100 });
  const action = g.up(1, { x: 100, y: 100 });
  assert(action.kind !== 'tap', 'a pinch was reported as a tap and would open a room');
});

await check('a genuine tap is still a tap', () => {
  const g = new GestureTracker();
  g.down(1, { x: 200, y: 400 });
  g.move(1, { x: 201, y: 401 });
  const action = g.up(1, { x: 201, y: 401 });
  eq(action.kind, 'tap', 'a real tap was swallowed');
});

await check('a drag is not mistaken for a tap', () => {
  const g = new GestureTracker();
  g.down(1, { x: 100, y: 100 });
  for (let i = 1; i <= 10; i++) g.move(1, { x: 100 + i * 5, y: 100 });
  const action = g.up(1, { x: 150, y: 100 });
  assert(action.kind !== 'tap', `a ${TAP_SLOP_PX}px+ drag was treated as a tap`);
});

await check('a cancelled pointer leaves no state behind', () => {
  const g = new GestureTracker();
  g.down(1, { x: 10, y: 10 });
  g.down(2, { x: 90, y: 10 });
  g.cancel();
  eq(g.pointerCount, 0, 'cancel left pointers registered');
  eq(g.isPinching, false, 'cancel left the tracker pinching');
  g.down(3, { x: 50, y: 50 });
  eq(g.up(3, { x: 50, y: 50 }).kind, 'tap', 'the tracker did not recover after a cancel');
});

await check('pinch reports a zoom factor and a centre between the fingers', () => {
  const g = new GestureTracker();
  g.down(1, { x: 100, y: 200 });
  g.down(2, { x: 300, y: 200 });
  const action = g.move(2, { x: 400, y: 200 });
  assert(action.kind === 'zoom', `expected a zoom, got ${action.kind}`);
  assert(action.factor > 1, 'spreading the fingers did not zoom in');
  eq(action.anchor.x, 250, 'the zoom anchor is not between the fingers');
});

// ── AUDIT: a bulk regex normalising local imports also rewrote the package
//    name, turning `pixi.js` into `pixi.ts` in three files. The render layer
//    could not compile for two releases and nothing headless noticed, because
//    the self-tests deliberately avoid importing Pixi.
await check('every bare package import names a real dependency', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);
  const builtin = /^node:/;
  // Path aliases declared in tsconfig are not packages. Read them rather than
  // hardcoding the list, so adding an alias never breaks this check.
  const tsconfig = fs.readFileSync('tsconfig.json', 'utf8');
  const aliases = new Set(
    [...tsconfig.matchAll(/"(@[a-z]+)\/\*"\s*:/g)].map((m) => m[1]!),
  );
  const problems: string[] = [];

  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(name)) continue;
      const src = fs.readFileSync(full, 'utf8');
      // Only real import statements. Matching every quoted string after the
      // word `from` also caught regex source inside other checks, which were
      // then reported as unresolvable packages.
      for (const m of src.matchAll(/^\s*(?:import|export)[^;']*\bfrom\s+'([^']+)'/gm)) {
        const spec = m[1]!;
        if (spec.startsWith('.') || builtin.test(spec)) continue;
        if (aliases.has(spec.split('/')[0]!)) continue;
        // Scoped and sub-path imports resolve against their package root.
        const root = spec.startsWith('@')
          ? spec.split('/').slice(0, 2).join('/')
          : spec.split('/')[0]!;
        if (!declared.has(root)) problems.push(`${full} imports "${spec}"`);
      }
    }
  };
  walk('src');
  walk('tools');

  assert(problems.length === 0,
    `unresolvable package imports:\n      ${problems.join('\n      ')}`);
});

await check('no local import claims a .js extension that does not exist', () => {
  // The mirror of the bug above: local files are .ts, so a relative import
  // ending in .js resolves through the bundler but not through Node.
  const problems: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(name)) continue;
      const src = fs.readFileSync(full, 'utf8');
      for (const m of src.matchAll(/from\s+'(\.[^']+\.js)'/g)) {
        problems.push(`${full} imports "${m[1]}"`);
      }
    }
  };
  walk('src');
  assert(problems.length === 0, `stale .js specifiers:\n      ${problems.join('\n      ')}`);
});

// ── AUDIT: `ObjectivesSchema` was used in src/data/index.ts and never
//    imported, because a string replace matched nothing and nobody checked.
//    Same shape as the pixi.ts corruption: an edit that silently did nothing.
await check('every schema used to parse data is actually imported', () => {
  const source = fs.readFileSync('src/data/index.ts', 'utf8');
  const imported = new Set(
    [...source.matchAll(/import\s*\{([^}]+)\}\s*from/g)]
      .flatMap((m) => m[1]!.split(',').map((x) => x.trim().split(/\s+as\s+/)[0]!.trim()))
      .filter(Boolean),
  );
  const used = [...source.matchAll(/(\w+Schema)\.parse\(/g)].map((m) => m[1]!);
  const missing = [...new Set(used)].filter((name) => !imported.has(name));
  assert(missing.length === 0, `used but never imported: ${missing.join(', ')}`);
  assert(used.length > 0, 'no schema is used to parse anything');
});

await check('every data file is parsed through a schema', () => {
  const source = fs.readFileSync('src/data/index.ts', 'utf8');
  const files = fs.readdirSync('data').filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const stem = file.replace('.json', '');
    assert(source.includes(`${stem}.json`),
      `data/${file} exists but src/data never loads it`);
  }
  // And every loader used by the headless tools sees them too.
  const loader = fs.readFileSync('tools/balance-sim/load-data.ts', 'utf8');
  for (const file of files) {
    assert(loader.includes(file), `tools/balance-sim/load-data.ts does not read data/${file}`);
  }
});

await check('no translation key is defined twice', () => {
  // A duplicate silently wins or loses depending on order, and the loser is
  // whichever wording someone actually wanted.
  const source = fs.readFileSync('tools/gen-i18n.mjs', 'utf8');
  const keys = [...source.matchAll(/'((?:ui|notice|obj)\.[\w.]+)'\s*:/g)].map((m) => m[1]!);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  assert(duplicates.size === 0, `duplicated: ${[...duplicates].join(', ')}`);
});

await check('the interface palette matches the shipped art', () => {
  // The chrome was rebuilt from the supplied art's measured colours. If the
  // art direction changes and the tokens do not, the two fight everywhere.
  const css = fs.readFileSync('src/index.css', 'utf8');
  const manifest = JSON.parse(fs.readFileSync('public/manifest.webmanifest', 'utf8'));
  assert(css.includes(manifest.background_color.replace('#', '')),
    'the manifest background colour is not one of the theme tokens');
  const html = fs.readFileSync('index.html', 'utf8');
  assert(html.includes(manifest.theme_color),
    'index.html and the manifest disagree on the theme colour');
});

// ── AUDIT: a constructor parameter property broke the headless tooling in P2
//    and again in P7. Node's strip-only TypeScript mode does not support them,
//    and the failure is a parse error in a file that looks perfectly valid.
await check('no class uses a constructor parameter property', () => {
  const problems: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(name)) continue;
      const src = fs.readFileSync(full, 'utf8');
      for (const m of src.matchAll(/constructor\s*\([^)]*\b(private|public|protected|readonly)\s+\w+/g)) {
        problems.push(`${full}: ${m[0].slice(0, 50)}`);
      }
    }
  };
  walk('src');
  walk('tools');
  assert(problems.length === 0,
    `parameter properties break Node's strip-only mode:\n      ${problems.join('\n      ')}`);
});

// ── AUDIT: three separate tests pinned SCHEMA_VERSION to a literal, and each
//    one broke on the next feature for a reason that had nothing to do with
//    what it was testing. What matters is that the chain is unbroken.
await check('no test pins the schema version to a literal', () => {
  const problems: string[] = [];
  for (const name of fs.readdirSync('tools/selftest')) {
    if (!name.endsWith('.ts')) continue;
    const src = fs.readFileSync(path.join('tools/selftest', name), 'utf8');
    for (const m of src.matchAll(/eq\(\s*SCHEMA_VERSION\s*,\s*\d+/g)) {
      problems.push(`${name}: ${m[0]}`);
    }
  }
  assert(problems.length === 0,
    `a literal version will break on the next feature: ${problems.join(', ')}`);
});

})();

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach(f => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
