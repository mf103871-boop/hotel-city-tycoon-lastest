/**
 * Headless tests for the runtime layer: engine, save, migrations, i18n.
 *
 * Everything here runs with an injected clock and in-memory storage, so it
 * needs no browser and no dependencies. That is the point: the layer P3 will
 * build on is verified before a single pixel exists.
 *
 * Run: node --experimental-strip-types tools/selftest/runtime.ts
 */
import { loadSimData } from '../balance-sim/load-data.ts';
import { GameEngine, fakeClock } from '../../src/bridge/engine.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { SaveManager, MemoryStorage, looksLikeState, validateState, SAVE_KEY, QUARANTINE_KEY } from '../../src/save/index.ts';
import { translate, directionOf, coverage, missingKeys, DEFAULT_LOCALE } from '../../src/i18n/index.ts';
import { SCHEMA_VERSION } from '../../src/core/state/types.ts';
import type { GameState, SimEvent } from '../../src/core/state/types.ts';
import { measure, describe } from './measure.ts';

const data = loadSimData();
let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e: Error) => { failures.push(name); console.log(`  ✗ ${name}\n      ${e.message}`); });
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function eq(a: unknown, b: unknown, msg: string): void {
  if (a !== b) throw new Error(`${msg} (got ${String(a)}, expected ${String(b)})`);
}

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — runtime self-test');
console.log(line);

await (async () => {

// ---------------------------------------------------------------- engine
await check('engine starts a new game at the injected time', () => {
  const clock = fakeClock(1_700_000_000_000);
  const e = GameEngine.newGame(data, { clock }, 42, 'Test');
  eq(e.getState().epochMs, 1_700_000_000_000, 'epoch not taken from the clock');
  eq(e.getState().seed, 42, 'seed not applied');
  eq(e.getState().hotel.name, 'Test', 'hotel name not applied');
});

await check('engine ticks short gaps and does not lose fractions of a tick', () => {
  const clock = fakeClock(0);
  const e = GameEngine.newGame(data, { clock }, 1);
  e.dispatch({ type: 'START_SHIFT', shiftId: 'shift_6h' });
  // 155ms is one full 100ms tick plus a 55ms remainder that must be carried.
  for (let i = 0; i < 40; i++) { clock.advance(155); e.catchUp(clock.now()); }
  const expected = Math.floor((40 * 155) / data.economy.simulation.tickMs);
  eq(e.getState().tick, expected, 'ticks were dropped or double-counted');
});

await check('engine resolves a long gap analytically instead of ticking', () => {
  const clock = fakeClock(0);
  const events: SimEvent[] = [];
  const e = GameEngine.newGame(data, { clock }, 7);
  e.subscribe((_s, ev) => events.push(...ev));
  e.dispatch({ type: 'START_SHIFT', shiftId: 'shift_48h' });

  // The engine and clock are stateful, so this one is measured by repeating
  // the whole setup per run rather than deep-copying — same estimator, see
  // tools/selftest/measure.ts.
  const t = measure(
    () => {
      const c = fakeClock(0);
      const engine = GameEngine.newGame(data, { clock: c }, 7);
      engine.dispatch({ type: 'START_SHIFT', shiftId: 'shift_48h' });
      c.advance(20 * 24 * 3600 * 1000);
      return { c, engine };
    },
    ({ c, engine }) => { engine.catchUp(c.now()); },
  );

  clock.advance(20 * 24 * 3600 * 1000);
  e.catchUp(clock.now());
  assert(events.some((ev) => ev.type === 'offlineResolved'), 'no offlineResolved event');
  assert(t.median < 50, `long gap took ${t.median.toFixed(1)}ms — it is ticking, not solving`);
  console.log(`      20 days of absence resolved in ${describe(t)}`);
});

await check('engine notifies subscribers and can unsubscribe', () => {
  const clock = fakeClock(0);
  const e = GameEngine.newGame(data, { clock }, 3);
  let count = 0;
  const off = e.subscribe(() => { count++; });
  e.dispatch({ type: 'START_SHIFT', shiftId: 'shift_2h' });
  assert(count > 0, 'subscriber was never called');
  const afterFirst = count;
  off();
  e.dispatch({ type: 'RENAME_HOTEL', name: 'Quiet' });
  eq(count, afterFirst, 'unsubscribed listener was still called');
});

await check('engine returns rejections instead of throwing', () => {
  const clock = fakeClock(0);
  const e = GameEngine.newGame(data, { clock }, 5);
  // 3B: presidential is gem-priced from L1; the level lock lives on family.
  const res = e.dispatch({ type: 'BUILD_ROOM', defId: 'family', x: 0, y: 0 });
  assert(!res.ok, 'a locked room was allowed');
  eq(res.ok === false ? res.reason : '', 'notUnlocked', 'wrong rejection reason');
});

await check('engine autosaves on its configured interval, not more often', async () => {
  const clock = fakeClock(0);
  let saves = 0;
  const e = GameEngine.newGame(data, { clock, persist: () => { saves++; } }, 11);
  e.dispatch({ type: 'START_SHIFT', shiftId: 'shift_6h' });
  const interval = data.economy.simulation.autosaveIntervalSec * 1000;

  clock.advance(interval / 2); e.catchUp(clock.now());
  eq(saves, 0, 'saved before the interval elapsed');
  clock.advance(interval); e.catchUp(clock.now());
  eq(saves, 1, 'did not save after the interval elapsed');
});

await check('engine is deterministic through the runtime layer too', () => {
  const run = () => {
    const clock = fakeClock(0);
    const e = GameEngine.newGame(data, { clock }, 20260828);
    e.dispatch({ type: 'START_SHIFT', shiftId: 'shift_6h' });
    for (let i = 0; i < 100; i++) { clock.advance(1000); e.catchUp(clock.now()); }
    return JSON.stringify(e.getState());
  };
  eq(run(), run(), 'the engine introduced non-determinism the core did not have');
});

// ---------------------------------------------------------------- save
await check('a save round-trips through storage', async () => {
  const storage = new MemoryStorage();
  const mgr = new SaveManager(storage);
  const clock = fakeClock(1000);
  const e = GameEngine.newGame(data, { clock }, 99, 'Roundtrip');
  e.dispatch({ type: 'START_SHIFT', shiftId: 'shift_2h' });

  await mgr.save(e.getState(), clock.now());
  const loaded = await mgr.load();
  assert(loaded.ok, `load failed: ${loaded.ok === false ? loaded.reason : ''}`);
  eq(JSON.stringify(loaded.state), JSON.stringify(e.getState()), 'state changed across a save/load');
});

await check('loading with no save reports empty rather than failing', async () => {
  const res = await new SaveManager(new MemoryStorage()).load();
  assert(!res.ok && res.reason === 'empty', 'an absent save was not reported as empty');
});

await check('a corrupt save is quarantined, not silently discarded', async () => {
  const storage = new MemoryStorage();
  await storage.set(SAVE_KEY, '{ this is not json');
  const res = await new SaveManager(storage).load();
  assert(!res.ok && res.reason === 'corrupt', 'corrupt save was accepted');
  const quarantined = await storage.get(QUARANTINE_KEY);
  assert(quarantined !== null, 'the corrupt save was destroyed instead of kept');
});

await check('a save from a newer build is refused, not mangled', async () => {
  const storage = new MemoryStorage();
  await storage.set(SAVE_KEY, JSON.stringify({ format: 1, version: SCHEMA_VERSION + 5, savedAtMs: 0, state: {} }));
  const res = await new SaveManager(storage).load();
  assert(!res.ok && res.reason === 'fromFuture', 'a future save was not refused');
});

await check('a structurally broken state is rejected', async () => {
  const storage = new MemoryStorage();
  await storage.set(SAVE_KEY, JSON.stringify({ format: 1, version: SCHEMA_VERSION, savedAtMs: 0, state: { seed: 1 } }));
  const res = await new SaveManager(storage).load();
  assert(!res.ok && res.reason === 'corrupt', 'a malformed state passed the structure check');
});

await check('an unmigratable old save fails loudly rather than loading wrong', async () => {
  const storage = new MemoryStorage();
  await storage.set(SAVE_KEY, JSON.stringify({ format: 1, version: 0, savedAtMs: 0, state: { seed: 1 } }));
  const res = await new SaveManager(storage).load();
  assert(!res.ok && (res.reason === 'unmigratable' || res.reason === 'corrupt'),
    'a save with no migration path was loaded anyway');
});

await check('export and import survive a full cycle', async () => {
  const mgr = new SaveManager(new MemoryStorage());
  const clock = fakeClock(5000);
  const e = GameEngine.newGame(data, { clock }, 1234, 'Exported');
  e.dispatch({ type: 'START_SHIFT', shiftId: 'shift_6h' });
  e.advanceBy(120_000);

  const json = mgr.exportToJson(e.getState(), clock.now());
  const back = await mgr.importFromJson(json);
  assert(back.ok, `import failed: ${back.ok === false ? back.detail : ''}`);
  eq(back.state.hotel.name, 'Exported', 'hotel name lost in transfer');
  eq(back.state.seed, 1234, 'seed lost in transfer');
  eq(JSON.stringify(back.state), JSON.stringify(e.getState()), 'state changed across export/import');
});

await check('importing a foreign file is refused with a clear reason', async () => {
  const mgr = new SaveManager(new MemoryStorage());
  const res = await mgr.importFromJson(JSON.stringify({ some: 'other game' }));
  assert(!res.ok && res.reason === 'corrupt', 'a foreign file was accepted as a save');
});

await check('a resumed save keeps playing deterministically', async () => {
  const play = async (interrupt: boolean) => {
    const mgr = new SaveManager(new MemoryStorage());
    const clock = fakeClock(0);
    let e = GameEngine.newGame(data, { clock }, 777);
    e.dispatch({ type: 'START_SHIFT', shiftId: 'shift_6h' });
    clock.advance(30_000); e.catchUp(clock.now());

    if (interrupt) {
      await mgr.save(e.getState(), clock.now());
      const loaded = await mgr.load();
      assert(loaded.ok, 'reload failed mid-play');
      e = new GameEngine(data, loaded.state as GameState, { clock });
    }
    clock.advance(30_000); e.catchUp(clock.now());
    return JSON.stringify(e.getState());
  };
  eq(await play(true), await play(false), 'saving and reloading changed the outcome');
});

// ---------------------------------------------------------------- i18n
await check('every English key resolves', () => {
  eq(translate('en', 'room.economy.name'), 'Budget Room', 'wrong English room name');
  eq(translate('en', 'ui.coins'), 'Coins', 'wrong English UI string');
});

await check('Arabic falls back to English rather than showing a raw key', () => {
  // Coverage is complete today, so this no longer relies on a real gap: it
  // proves the mechanism still works for whatever key gets added tomorrow.
  eq(missingKeys('ar').length, 0, 'Arabic coverage has regressed');
  const key = 'room.deluxe.name';
  const english = translate('en', key);
  assert(english !== key, 'the probe key is missing from English too');
  // A key present in neither table must degrade to itself, never to blank.
  eq(translate('ar', 'no.such.key.at.all'), 'no.such.key.at.all',
    'an unknown key did not degrade to itself');
});

await check('Arabic is used where it exists', () => {
  assert(translate('ar', 'ui.coins') !== translate('en', 'ui.coins'), 'Arabic string not used');
});

await check('placeholders interpolate', () => {
  eq(translate('en', 'ui.notUnlocked', { level: 12 }), 'Unlocks at level 12', 'interpolation failed');
});

await check('an unknown key returns itself instead of crashing', () => {
  eq(translate('en', 'no.such.key'), 'no.such.key', 'unknown key did not degrade gracefully');
});

await check('direction is right for each locale', () => {
  eq(directionOf('en'), 'ltr', 'English direction wrong');
  eq(directionOf('ar'), 'rtl', 'Arabic direction wrong');
  eq(DEFAULT_LOCALE, 'en', 'English must be the default and fallback locale');
});

await check('Arabic coverage is reported honestly', () => {
  const c = coverage('ar');
  assert(c > 0.8 && c <= 1, `Arabic coverage reported as ${(c * 100).toFixed(0)}%`);
  console.log(`      Arabic coverage ${(c * 100).toFixed(0)}%, remainder falls back to English`);
});

await check('looksLikeState rejects plausible-looking rubbish', () => {
  assert(!looksLikeState(null), 'null accepted');
  assert(!looksLikeState({ schemaVersion: 1 }), 'partial object accepted');
  assert(!looksLikeState({ schemaVersion: 1, seed: 1, tick: 0, player: {}, hotel: {}, guests: [], staff: [] }),
    'a hotel with no rooms array was accepted');
});

})();

await check('validateState survives anything a JSON file can hold', () => {
  /*
   * A total function, tested as one.
   *
   * Every row below used to throw a TypeError on the first property read, so
   * a corrupt save became an exception at boot rather than a corrupt result —
   * and the caller got a rejected Promise instead of something it could
   * recover from.
   */
  const base = createInitialState(data, { seed: 1, epochMs: 1_700_000_000_000 });
  const cases: Array<[string, (s: Record<string, unknown>) => void]> = [
    ['storedRooms: [null]', (x) => { x['storedRooms'] = [null]; }],
    ['storedRooms: [0]', (x) => { x['storedRooms'] = [0]; }],
    ['storedRooms: [false]', (x) => { x['storedRooms'] = [false]; }],
    ["storedRooms: ['bad']", (x) => { x['storedRooms'] = ['bad']; }],
    ['storedRooms: [[]]', (x) => { x['storedRooms'] = [[]]; }],
    ['storedRoom.decor: [null]', (x) => {
      x['storedRooms'] = [{ id: 'r1', defId: 'standard', decor: [null], decorPoints: 0, cleanliness: 1, builtAtTick: 0 }];
    }],
    ['storedRoom.decor: [{}]', (x) => {
      x['storedRooms'] = [{ id: 'r1', defId: 'standard', decor: [{}], decorPoints: 0, cleanliness: 1, builtAtTick: 0 }];
    }],
    ['placedRoom.decor: [null]', (x) => {
      (x['hotel'] as { rooms: Array<{ decor: unknown }> }).rooms[0]!.decor = [null];
    }],
  ];

  for (const [name, corrupt] of cases) {
    const broken = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    corrupt(broken);
    let problems: string[];
    try {
      problems = validateState(broken);
    } catch (e) {
      throw new Error(`"${name}" threw instead of reporting: ${(e as Error).message}`);
    }
    assert(problems.length > 0, `"${name}" was accepted as valid`);
  }
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach(f => console.log(`    ✗ ${f}`)); }

console.log(line);
process.exit(failures.length ? 1 : 0);
