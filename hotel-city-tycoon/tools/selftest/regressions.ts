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
import { initSelectors, shiftOptions } from '../../src/bridge/selectors.ts';

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

// ── AUDIT 2026-09-03 (D2): a save written by a newer client was refused
//    without being quarantined, and the fresh hotel that boot started in its
//    place autosaved over it within thirty seconds. A rollback deployment
//    silently erased the player's game.
await check('a save from a newer client is quarantined, and the key is left alone', async () => {
  const storage = new MemoryStorage();
  const raw = JSON.stringify({ format: 1, version: SCHEMA_VERSION + 1, savedAtMs: 5, state: { future: true } });
  await storage.set(SAVE_KEY, raw);
  const outcome = await new SaveManager(storage, data).load();
  assert(!outcome.ok && outcome.reason === 'fromFuture', `expected fromFuture, got ${JSON.stringify(outcome).slice(0, 60)}`);
  eq(await storage.get('hct:save:quarantine'), raw, 'the newer save was not quarantined');
  eq(await storage.get(SAVE_KEY), raw, 'load() touched the save key');
});

await check('a fallback hotel booted over an unusable save has no persist port', () => {
  // Structural: the boot path lives in a React hook. The fallback engine must
  // be built from ports that carry no `persist`, or its first autosave lands
  // on the save it could not read.
  const boot = fs.readFileSync(path.join('src', 'ui', 'useGame.ts'), 'utf8');
  assert(/const portsForFallback = saveProblem \? \{ clock: ports\.clock, scheduler: ports\.scheduler \} : ports/.test(boot),
    'the fallback ports are not stripped of persist when the save could not be used');
  assert(/GameEngine\.newGame\(data, portsForFallback/.test(boot),
    'the fallback engine is not built from the stripped ports');
});

// ── AUDIT 2026-09-03 (D19): saving happened only on the 30 s autosave and a
//    best-effort flush on hide, so a room built two seconds before a reload
//    was gone afterwards ("6 rooms" before, "4 rooms" after in the CI lane).
await check('an accepted command is saved at once, a refused one is not', async () => {
  let writes = 0;
  const engine = GameEngine.newGame(data, { clock: fakeClock(0), persist: async () => { writes++; return true; } }, 9);
  const accepted = engine.dispatch({ type: 'START_SHIFT', shiftId: 'shift_2h' });
  assert(accepted.ok, 'the test command was refused');
  await new Promise((r) => setTimeout(r, 0));
  eq(writes, 1, 'an accepted command did not save');
  const refused = engine.dispatch({ type: 'START_SHIFT', shiftId: 'shift_2h' });
  assert(!refused.ok, 'the second shift should have been refused (alreadyOpen)');
  await new Promise((r) => setTimeout(r, 0));
  eq(writes, 1, 'a refused command saved anyway');
});

await check('the page saves on pagehide, not only when hidden', () => {
  const boot = fs.readFileSync(path.join('src', 'ui', 'useGame.ts'), 'utf8');
  assert(/addEventListener\('pagehide'/.test(boot), 'no pagehide listener — iOS never fires beforeunload');
});

// ── AUDIT 2026-09-03 (D4): five `flex-1` buttons with content-sized minimum
//    widths pushed the fifth (Upgrades) past the bottom bar and off a 390 px
//    screen — and it opened a panel of rows that DEC #14 disables for good.
await check('the Upgrades button is hidden while no track can unlock at the level cap', () => {
  const cap = data.levels.reduce((max, l) => Math.max(max, l.level), 0);
  const reachable = data.upgrades.some((u) => u.unlockLevel <= cap);
  const hud = fs.readFileSync(path.join('src', 'ui', 'Hud.tsx'), 'utf8');
  assert(/upgradesReachable\(state\) && \(/.test(hud), 'the HUD renders the Upgrades button unconditionally');
  assert(/min-w-0 flex-1 truncate/.test(hud), 'the bottom-bar buttons can still not shrink below their labels');
  // With the shipped data every track unlocks past the cap, so the button is
  // hidden; the moment the data changes, it comes back on its own.
  eq(reachable, false, `upgrades.json now reaches the cap (${cap}) — the guard above still holds, this line only documents DEC #14`);
});

// ── AUDIT 2026-09-03, the small interface defects (D10, D12, D15, D16, D18, D21, D22).
await check('interface art is addressed under the Vite base, never at an absolute /assets/ path', () => {
  const offenders = fs.readdirSync(path.join('src', 'ui'))
    .filter((f) => f.endsWith('.tsx'))
    .filter((f) => /["'`]\/assets\//.test(fs.readFileSync(path.join('src', 'ui', f), 'utf8')));
  assert(offenders.length === 0, `absolute /assets/ paths (404 under a path prefix): ${offenders.join(', ')}`);
});

await check('a locked shift names the level that unlocks it', () => {
  const panel = fs.readFileSync(path.join('src', 'ui', 'ShiftPanel.tsx'), 'utf8');
  assert(!/level: '\?'/.test(panel), 'the shift picker still says "Unlocks at level ?"');
  initSelectors(data);
  const s = newState();
  const locked = shiftOptions(s).find((o) => !o.unlocked);
  assert(locked && locked.unlockLevel > s.player.level, 'shiftOptions carries no usable unlockLevel');
});

await check('a guest check that found nothing does not swallow the tap on the room', () => {
  const canvas = fs.readFileSync(path.join('src', 'ui', 'HotelCanvas.tsx'), 'utf8');
  assert(/nothingFound/.test(canvas), 'HotelCanvas treats every ok TAP_GUEST as handled');
});

await check('the daily gift is offered whenever it becomes available, not only at boot', () => {
  const app = fs.readFileSync(path.join('src', 'ui', 'App.tsx'), 'utf8');
  assert(/\[giftAvailable\]/.test(app), 'the gift effect is still keyed on the boot seed');
});

await check('the HUD bars respect the safe area and can be measured by the canvas', () => {
  const hud = fs.readFileSync(path.join('src', 'ui', 'Hud.tsx'), 'utf8');
  assert(/safe-area-inset-top/.test(hud) && /safe-area-inset-bottom/.test(hud), 'no safe-area padding on the HUD bars');
  assert(/data-hud="top"/.test(hud) && /data-hud="bottom"/.test(hud), 'the canvas cannot find the HUD bars to measure them');
  const canvas = fs.readFileSync(path.join('src', 'ui', 'HotelCanvas.tsx'), 'utf8');
  assert(/setInsets\(/.test(canvas), 'the canvas never hands the HUD height to the camera');
});

await check('the diagnostics badge follows the document direction so it never covers the gear in Arabic', () => {
  const badge = fs.readFileSync(path.join('src', 'ui', 'DebugBadge.tsx'), 'utf8');
  const button = badge.slice(badge.indexOf('<button'), badge.indexOf('>', badge.indexOf('<button')));
  assert(!/dir="ltr"/.test(button), 'dir="ltr" on the badge button makes start-3 resolve to the left in RTL too');
});

await check('a sheet is a dialog: labelled, focused on open, closed by Escape', () => {
  const sheet = fs.readFileSync(path.join('src', 'ui', 'Sheet.tsx'), 'utf8');
  assert(/role="dialog"/.test(sheet) && /aria-modal="true"/.test(sheet) && /aria-labelledby/.test(sheet), 'the sheet has no dialog semantics');
  assert(/\.focus\(\)/.test(sheet) && /'Escape'/.test(sheet), 'the sheet neither takes focus nor closes on Escape');
});

// ── AUDIT 2026-09-03 (D1): Pixi 8 never forwards DOM `pointercancel`, so the
//    scene's stage listener for it was dead. One OS-cancelled touch left a
//    finger registered for the rest of the session: every later tap read as
//    the second finger of a pinch and the hotel could not be tapped or panned
//    until a reload. The cancel now also comes straight from the canvas.
await check('a touch the OS takes away would otherwise poison every later tap', () => {
  const g = new GestureTracker();
  g.down(1, { x: 100, y: 100 });            // cancelled by the OS: no up ever arrives
  g.down(2, { x: 200, y: 200 });
  const stuck = g.up(2, { x: 200, y: 200 });
  assert(stuck.kind !== 'tap', 'the failure mode this guard documents no longer reproduces; revisit the guard');
  g.cancel();                               // what the DOM pointercancel listener now does
  g.down(3, { x: 200, y: 200 });
  eq(g.up(3, { x: 200, y: 200 }).kind, 'tap', 'cancel() did not restore tapping');
});

await check('the scene listens for pointercancel on the canvas itself, not only on the Pixi stage', () => {
  const scene = fs.readFileSync(path.join('src', 'render', 'scene.ts'), 'utf8');
  assert(/canvas\.addEventListener\(\s*'pointercancel'/.test(scene),
    'no DOM pointercancel listener on the canvas — Pixi will never deliver the stage one');
  assert(/canvas\.addEventListener\(\s*'lostpointercapture'/.test(scene),
    'no lostpointercapture listener on the canvas');
});

// ── AUDIT 2026-09-03 (D20, found while proving it): a touch tap opened the
//    room sheet on pointerup, and the browser's synthetic click that follows
//    a tap then landed on the sheet's backdrop and closed it in the same
//    instant. On a phone every room read as untappable; a mouse never showed
//    it. The canvas cancels the touch's default so no click follows a tap.
await check('a touch tap on the canvas does not click whatever the tap opened', () => {
  const scene = fs.readFileSync(path.join('src', 'render', 'scene.ts'), 'utf8');
  const touchend = scene.match(/canvas\.addEventListener\(\s*'touchend'[^;]*;/);
  assert(touchend, 'no touchend listener on the canvas: the synthetic click after a tap will hit the sheet the tap opened');
  assert(/preventDefault\(\)/.test(touchend![0]), 'the touchend listener does not cancel the default, so the click still follows');
  assert(/passive:\s*false/.test(touchend![0]), 'a passive touchend listener cannot cancel the click');
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
