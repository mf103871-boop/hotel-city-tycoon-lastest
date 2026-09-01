/**
 * Headless tests for what happens when things go wrong while playing.
 *
 * Never examined. The game was measured for correctness under good conditions
 * and never for failure: a browser out of storage, a private window where
 * IndexedDB is a quota of zero, an interface that throws mid-render.
 *
 * Both defects found here matter more than any other in this project, because
 * the save is the only copy of the player's hotel and both failures were
 * silent.
 *
 * Run: node --experimental-strip-types tools/selftest/resilience.ts
 */
import fs from 'node:fs';
import { loadSimData } from '../balance-sim/load-data.ts';
import { GameEngine, fakeClock } from '../../src/bridge/engine.ts';
import { SaveManager, MemoryStorage, SAVE_KEY, QUARANTINE_KEY } from '../../src/save/index.ts';
import { PersistenceCoordinator } from '../../src/save/coordinator.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { SCHEMA_VERSION } from '../../src/core/state/types.ts';
import type { SaveStorage } from '../../src/save/index.ts';
import type { GameState } from '../../src/core/state/types.ts';

const data = loadSimData();
let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }

/** A browser that has run out of room. */
class FullStorage implements SaveStorage {
  async get(): Promise<string | null> { return null; }
  async set(): Promise<void> {
    const e = new Error('The quota has been exceeded.');
    e.name = 'QuotaExceededError';
    throw e;
  }
  async remove(): Promise<void> { /* nothing to remove */ }
}

/** A private window, where storage may simply not be there. */
class NoStorage implements SaveStorage {
  async get(): Promise<string | null> { throw new Error('IndexedDB is not available'); }
  async set(): Promise<void> { throw new Error('IndexedDB is not available'); }
  async remove(): Promise<void> { throw new Error('IndexedDB is not available'); }
}

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — failure resilience');
console.log(line);

await (async () => {

// ---------------------------------------------------------------- saving
await check('a successful save says so', async () => {
  const mgr = new SaveManager(new MemoryStorage());
  const clock = fakeClock(0);
  const engine = GameEngine.newGame(data, { clock }, 1);
  const result = await mgr.save(engine.getState(), 0);
  assert(result.ok, 'a good save reported failure');
  assert(result.ok && result.bytes > 0, 'a good save wrote nothing');
});

await check('a full browser is reported as full, not swallowed', async () => {
  // This is the failure a real player hits, and the only one they can act on.
  const mgr = new SaveManager(new FullStorage());
  const clock = fakeClock(0);
  const engine = GameEngine.newGame(data, { clock }, 1);
  const result = await mgr.save(engine.getState(), 0);
  assert(!result.ok, 'saving into a full browser reported success');
  eq(result.ok === false ? result.reason : '', 'quota', 'the quota failure was misclassified');
});

await check('storage being unavailable is reported too', async () => {
  const mgr = new SaveManager(new NoStorage());
  const clock = fakeClock(0);
  const engine = GameEngine.newGame(data, { clock }, 1);
  const result = await mgr.save(engine.getState(), 0);
  assert(!result.ok && result.reason === 'unavailable', 'an unusable store reported success');
});

await check('a save that cannot be written never throws at the caller', async () => {
  // An unhandled rejection is how this stayed silent for eleven phases.
  const mgr = new SaveManager(new FullStorage());
  const clock = fakeClock(0);
  const engine = GameEngine.newGame(data, { clock }, 1);
  await mgr.save(engine.getState(), 0);   // must resolve, not reject
});

// ---------------------------------------------------------------- engine
await check('the engine notices when saving stops working', async () => {
  const clock = fakeClock(0);
  let warned = 0;
  const engine = GameEngine.newGame(data, {
    clock,
    persist: async () => false,
    onPersistFailed: () => { warned++; },
  }, 1);

  await engine.flush();
  eq(warned, 1, 'a failed save raised no warning');
  eq(engine.saveFailures(), 1, 'the failure was not counted');
});

await check('failures accumulate so a warning can wait for a pattern', async () => {
  const clock = fakeClock(0);
  const seen: number[] = [];
  const engine = GameEngine.newGame(data, {
    clock,
    persist: async () => false,
    onPersistFailed: (n) => seen.push(n),
  }, 1);
  for (let i = 0; i < 4; i++) await engine.flush();
  eq(seen.join(','), '1,2,3,4', 'consecutive failures were not counted in order');
});

await check('one good save clears the count', async () => {
  const clock = fakeClock(0);
  let healthy = false;
  const engine = GameEngine.newGame(data, {
    clock,
    persist: async () => healthy,
  }, 1);
  await engine.flush();
  await engine.flush();
  assert(engine.saveFailures() > 0, 'failures were not counted');
  healthy = true;
  await engine.flush();
  eq(engine.saveFailures(), 0, 'a working save did not clear the failure count');
});

await check('a persist that throws is treated as a failure, not a crash', async () => {
  const clock = fakeClock(0);
  let warned = 0;
  const engine = GameEngine.newGame(data, {
    clock,
    persist: () => { throw new Error('disk on fire'); },
    onPersistFailed: () => { warned++; },
  }, 1);
  const ok = await engine.flush();
  eq(ok, false, 'a throwing persist reported success');
  eq(warned, 1, 'a throwing persist raised no warning');
});

await check('the game keeps running when it cannot save', async () => {
  // Losing the ability to record progress must not stop play; the player
  // needs the chance to export what they have.
  const clock = fakeClock(0);
  const engine = GameEngine.newGame(data, { clock, persist: async () => false }, 5);
  engine.dispatch({ type: 'START_SHIFT', shiftId: 'shift_2h' });
  clock.advance(60_000);
  engine.catchUp(clock.now());
  assert(engine.getState().tick > 0, 'the simulation stopped when saving failed');
});

// ---------------------------------------------------------------- boundary
await check('an error boundary exists at the top of the tree', () => {
  const boundary = fs.readFileSync('src/ui/ErrorBoundary.tsx', 'utf8');
  assert(/getDerivedStateFromError/.test(boundary), 'the boundary does not catch render errors');
  assert(/componentDidCatch/.test(boundary), 'the boundary does not report what it caught');
  const main = fs.readFileSync('src/main.tsx', 'utf8');
  assert(/<ErrorBoundary>/.test(main),
    'the boundary is never mounted — a render error still blanks the screen');
});

await check('the crash screen offers the save before anything else', () => {
  // A player who can export their hotel has lost nothing. That has to come
  // before "reload", which is the button that feels like giving up.
  const boundary = fs.readFileSync('src/ui/ErrorBoundary.tsx', 'utf8');
  assert(/exportToJson/.test(boundary), 'the crash screen cannot rescue the save');
  const exportAt = boundary.indexOf('Download my hotel');
  const reloadAt = boundary.indexOf('Reload');
  assert(exportAt > 0 && exportAt < reloadAt, 'reload is offered before rescuing the save');
});

await check('the crash screen says the save is unharmed', () => {
  const boundary = fs.readFileSync('src/ui/ErrorBoundary.tsx', 'utf8');
  assert(/safe|not with your save/i.test(boundary),
    'a blank screen is indistinguishable from total loss unless the game says otherwise');
});

await check('the player is told when saving is failing', () => {
  const app = fs.readFileSync('src/ui/App.tsx', 'utf8');
  assert(/onSaveTrouble/.test(app), 'nothing listens for repeated save failures');
  const en = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>;
  const ar = JSON.parse(fs.readFileSync('src/i18n/locales/ar.json', 'utf8')) as Record<string, string>;
  assert('ui.saveFailing' in en && 'ui.saveFailing' in ar,
    'the warning has no wording in one of the locales');
});

// ---------------------------------------------------------------- loading
await check('an unreadable store starts a new game rather than hanging', async () => {
  const mgr = new SaveManager(new NoStorage());
  const outcome = await mgr.load();
  assert(!outcome.ok, 'an unreadable store reported a save');
  // Any reason is acceptable; hanging or throwing is not.
});

await check('a save far larger than expected is still handled', async () => {
  const storage = new MemoryStorage();
  const mgr = new SaveManager(storage);
  const clock = fakeClock(0);
  const engine = GameEngine.newGame(data, { clock }, 3);
  const state = engine.getState() as GameState;
  // A hotel that has run a long time accumulates guests and counters.
  for (let i = 0; i < 5000; i++) {
    state.revealedGuests.push(`g${i}`);
  }
  const saved = await mgr.save(state, 0);
  assert(saved.ok, 'a large save failed to write');
  const loaded = await mgr.load();
  assert(loaded.ok, 'a large save failed to load');
  eq(loaded.state.revealedGuests.length, 5000, 'the large save lost data');
  console.log(`      a 5,000-entry save is ${((saved.ok ? saved.bytes : 0) / 1024).toFixed(0)}KB`);
});

})();

// ------------------------------------------------ the persistence coordinator

/**
 * Storage that can be held open.
 *
 * Every race this section is about depends on one write being in flight while
 * another is requested, so the harness needs to decide when a write finishes
 * rather than hoping the event loop obliges.
 */
class GatedStorage implements SaveStorage {
  private readonly map = new Map<string, string>();
  readonly order: string[] = [];
  /** Fail the write carrying this exact payload, whenever it arrives. */
  failWritesContaining: string | null = null;
  private readonly gates: Array<() => void> = [];
  private inFlight = 0;
  maxConcurrent = 0;
  failNextSet = false;
  failNextRemove = false;
  failSetWith: unknown = undefined;
  failRemoveWith: unknown = undefined;
  private hold = false;

  /**
   * How many writes have actually entered `set`/`remove`.
   *
   * The old tests called `holdWrites()`, started a write and then
   * `releaseAll()` in the same synchronous block — so the release ran before
   * the write's microtask had even reached the storage layer, nothing was ever
   * held, and the race the test claimed to exercise never happened.
   */
  private started = 0;
  private readonly startWatchers: Array<() => void> = [];

  holdWrites(): void { this.hold = true; }

  /** Resolve once `count` writes have genuinely begun. No sleeps, no guessing. */
  async waitForStarted(count: number): Promise<void> {
    if (this.started >= count) return;
    await new Promise<void>((resolve) => {
      const watcher = () => { if (this.started >= count) resolve(); };
      this.startWatchers.push(watcher);
    });
  }

  private markStarted(): void {
    this.started++;
    for (const watcher of [...this.startWatchers]) watcher();
  }

  /** Let every held write proceed, in the order they arrived. */
  releaseAll(): void {
    this.hold = false;
    while (this.gates.length > 0) this.gates.shift()!();
  }

  private async gate(): Promise<void> {
    if (!this.hold) return;
    await new Promise<void>((resolve) => { this.gates.push(resolve); });
  }

  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.inFlight++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.inFlight);
    this.markStarted();
    try {
      await this.gate();
      if (this.failWritesContaining !== null && value.includes(this.failWritesContaining)) {
        throw new Error('disk full');
      }
      if (this.failNextSet) {
        this.failNextSet = false;
        // Anything at all can be thrown, including values that are not Errors.
        throw this.failSetWith !== undefined ? this.failSetWith : new Error('disk full');
      }
      this.map.set(key, value);
      this.order.push(`set:${key}`);
    } finally {
      this.inFlight--;
    }
  }

  async remove(key: string): Promise<void> {
    this.inFlight++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.inFlight);
    this.markStarted();
    try {
      await this.gate();
      if (this.failNextRemove) {
        this.failNextRemove = false;
        throw this.failRemoveWith !== undefined ? this.failRemoveWith : new Error('cannot remove');
      }
      this.map.delete(key);
      this.order.push(`remove:${key}`);
    } finally {
      this.inFlight--;
    }
  }
}

const clockNow = () => 1_700_000_000_000;

function stateWithCoins(coins: number): GameState {
  const s = createInitialState(data, { seed: 4242, epochMs: 1_700_000_000_000 });
  s.player.coins = coins;
  return s;
}

const envelopeFor = (state: GameState): string =>
  JSON.stringify({ version: SCHEMA_VERSION, savedAtMs: 1_700_000_000_000, state });

const coinsIn = async (storage: GatedStorage): Promise<number | null> => {
  const raw = await storage.get(SAVE_KEY);
  if (raw === null) return null;
  return (JSON.parse(raw) as { state: { player: { coins: number } } }).state.player.coins;
};

await check('a semantically corrupt file is refused through the Settings route', async () => {
  const storage = new GatedStorage();
  const coordinator = new PersistenceCoordinator(new SaveManager(storage, data), clockNow);
  const sound = stateWithCoins(1000);
  await storage.set(SAVE_KEY, envelopeFor(sound));
  await storage.set(QUARANTINE_KEY, 'sentinel');

  /*
   * Structurally complete, semantically impossible.
   *
   * The previous version pushed `null` into storedRooms, which `validateState`
   * rejects on shape alone — so it proved nothing about the semantic gate. A
   * stored room with every field present and a defId that does not exist gets
   * past structure and can only be caught by a manager that has the data.
   */
  const broken = JSON.parse(JSON.stringify(sound)) as Record<string, unknown>;
  (broken['storedRooms'] as unknown[]).push({
    id: 'stored-semantic-probe',
    defId: 'missing-room-definition',
    decor: [],
    decorPoints: 0,
    cleanliness: 1,
    builtAtTick: 0,
  });
  const file = envelopeFor(broken as unknown as GameState);

  // An unconfigured manager sees nothing wrong with the shape: that is exactly
  // what Settings used to use.
  const blind = await new SaveManager(new MemoryStorage()).importFromJson(file);
  assert(blind.ok, 'the probe file is structurally invalid — it proves nothing about semantics');

  const result = await coordinator.importAndCommit(file);

  assert(!result.ok && result.kind === 'invalid', 'a corrupt file was accepted by the coordinator');
  assert(await coinsIn(storage) === 1000, 'a refused import changed the save');
  assert(await storage.get(QUARANTINE_KEY) === 'sentinel', 'a refused import touched quarantine');
  assert(!coordinator.isSealed(), 'a refused import sealed the coordinator');

  // Autosave must still work afterwards.
  assert(await coordinator.persist(stateWithCoins(2000)), 'autosave stopped after a refused import');
  assert(await coinsIn(storage) === 2000, 'the post-rejection autosave did not land');
});

await check('an autosave already in flight lands before the import, not after', async () => {
  const storage = new GatedStorage();
  const coordinator = new PersistenceCoordinator(new SaveManager(storage, data), clockNow);

  storage.holdWrites();
  const autosave = coordinator.persist(stateWithCoins(111));   // A, stuck
  await storage.waitForStarted(1);                             // genuinely in flight
  const importing = coordinator.importAndCommit(envelopeFor(stateWithCoins(222))); // B
  storage.releaseAll();

  assert(await autosave, 'the in-flight autosave reported failure');
  const result = await importing;
  assert(result.ok, `the import failed: ${result.ok === false ? result.detail : ''}`);

  const writes = storage.order.filter((o) => o === `set:${SAVE_KEY}`);
  assert(writes.length === 2, `expected two writes, saw ${writes.length}`);
  // The old autosave finished first; the imported hotel is what remains.
  assert(await coinsIn(storage) === 222, 'the old autosave overwrote the import');
  assert(storage.maxConcurrent === 1, `${storage.maxConcurrent} writes ran at once`);
});

await check('a flush after a successful import writes nothing and reports success', async () => {
  const storage = new GatedStorage();
  const coordinator = new PersistenceCoordinator(new SaveManager(storage, data), clockNow);
  assert((await coordinator.importAndCommit(envelopeFor(stateWithCoins(222)))).ok, 'the import failed');

  const before = storage.order.length;
  // React cleanup or visibilitychange, arriving after the import.
  assert(await coordinator.persist(stateWithCoins(111)), 'a sealed persist reported failure');
  assert(storage.order.length === before, 'a sealed persist still wrote');
  assert(await coinsIn(storage) === 222, 'a late flush overwrote the import');
});

await check('reset runs last, and a later flush does not bring the save back', async () => {
  const storage = new GatedStorage();
  const coordinator = new PersistenceCoordinator(new SaveManager(storage, data), clockNow);

  storage.holdWrites();
  const autosave = coordinator.persist(stateWithCoins(111));
  await storage.waitForStarted(1);
  const resetting = coordinator.reset();
  storage.releaseAll();

  assert(await autosave, 'the in-flight autosave reported failure');
  assert((await resetting).ok, 'the reset failed');

  assert(storage.order[storage.order.length - 1] === `remove:${SAVE_KEY}`,
    `the last operation was ${storage.order[storage.order.length - 1]}, not the removal`);
  assert(await storage.get(SAVE_KEY) === null, 'the save survived the reset');

  assert(await coordinator.persist(stateWithCoins(999)), 'a sealed persist reported failure');
  assert(await storage.get(SAVE_KEY) === null, 'a late flush recreated the save after reset');
});

await check('persist writes the state as it was when it was asked for', async () => {
  const storage = new GatedStorage();
  const coordinator = new PersistenceCoordinator(new SaveManager(storage, data), clockNow);

  const live = stateWithCoins(500);
  storage.holdWrites();
  const saving = coordinator.persist(live);
  await storage.waitForStarted(1);
  // The engine keeps running while the write waits its turn.
  live.player.coins = 999_999;
  storage.releaseAll();

  assert(await saving, 'the save reported failure');
  assert(await coinsIn(storage) === 500,
    'the queue wrote the state as it was at flush time, not at request time');
});

await check('a failed import write is reported and leaves autosave working', async () => {
  const storage = new GatedStorage();
  const coordinator = new PersistenceCoordinator(new SaveManager(storage, data), clockNow);
  await storage.set(SAVE_KEY, envelopeFor(stateWithCoins(1000)));

  storage.failNextSet = true;
  const result = await coordinator.importAndCommit(envelopeFor(stateWithCoins(222)));
  assert(!result.ok && result.kind === 'storage', 'a failed write was reported as success');
  assert(!coordinator.isSealed(), 'a failed import left the coordinator sealed');

  // The queue must still be usable — a rejection in it cannot poison the rest.
  assert(await coordinator.persist(stateWithCoins(333)), 'autosave died after a failed import');
  assert(await coinsIn(storage) === 333, 'the next autosave did not land');
});

await check('a failed reset keeps the old save and lets autosave continue', async () => {
  const storage = new GatedStorage();
  const coordinator = new PersistenceCoordinator(new SaveManager(storage, data), clockNow);
  await storage.set(SAVE_KEY, envelopeFor(stateWithCoins(1000)));

  storage.failNextRemove = true;
  const result = await coordinator.reset();
  assert(!result.ok && result.kind === 'storage', 'a failed clear was reported as success');
  assert(!coordinator.isSealed(), 'a failed reset left the coordinator sealed');
  assert(await coinsIn(storage) === 1000, 'a failed reset destroyed the save anyway');

  assert(await coordinator.persist(stateWithCoins(444)), 'autosave died after a failed reset');
  assert(await coinsIn(storage) === 444, 'the next autosave did not land');
});

await check('import and reset cannot run at the same time', async () => {
  const storage = new GatedStorage();
  const coordinator = new PersistenceCoordinator(new SaveManager(storage, data), clockNow);

  storage.holdWrites();
  const importing = coordinator.importAndCommit(envelopeFor(stateWithCoins(222)));
  const resetting = coordinator.reset();
  storage.releaseAll();
  await storage.waitForStarted(1).catch(() => undefined);

  const results = [await importing, await resetting];
  const busy = results.filter((r) => !r.ok && r.kind === 'busy');
  assert(busy.length === 1, `${busy.length} operations reported busy, expected exactly one`);
  assert(storage.maxConcurrent === 1, `${storage.maxConcurrent} writes ran at once`);
});

await check('a real engine flush through a sealed coordinator is not a failure', async () => {
  const storage = new GatedStorage();
  const coordinator = new PersistenceCoordinator(new SaveManager(storage, data), clockNow);
  let persistFailedCalls = 0;

  const engine = GameEngine.newGame(data, {
    clock: fakeClock(1_700_000_000_000),
    persist: (state: GameState) => coordinator.persist(state),
    onPersistFailed: () => { persistFailedCalls++; },
  }, 7);

  assert((await coordinator.reset()).ok, 'the reset failed');
  assert(await engine.flush(), 'a blocked flush was reported as a failed save');
  assert(engine.saveFailures() === 0, `the engine counted ${engine.saveFailures()} failures`);
  assert(persistFailedCalls === 0, 'onPersistFailed was called for a save that was meant to be blocked');
  assert(await storage.get(SAVE_KEY) === null, 'the engine recreated the save after a reset');
});

await check('Settings reaches storage only through the capability', () => {
  const raw = fs.readFileSync('src/ui/SettingsSheet.tsx', 'utf8');
  // Comments explain history and are allowed to name what was removed; the
  // code is what must not touch it.
  const settings = raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  for (const forbidden of ['SaveManager', '.save(', '.clear(', 'storage']) {
    assert(!settings.includes(forbidden),
      `SettingsSheet code still refers to ${forbidden}`);
  }
  assert(settings.includes('saves.importAndCommit(') && settings.includes('saves.reset('),
    'SettingsSheet does not use the capability');
  /*
   * A reload only after a confirmed success.
   *
   * Every `location.reload()` in this screen must be preceded, in the same
   * function, by a `if (!result.ok) { ... return; }` that leaves before it.
   * The import used to reload unconditionally after calling `save()`, so a
   * full disk produced a reload and a player who believed it had worked.
   */
  for (const body of settings.split('const ').slice(1)) {
    if (!body.includes('location.reload()')) continue;
    const guard = body.indexOf('if (!result.ok)');
    assert(guard >= 0 && guard < body.indexOf('location.reload()'),
      'a reload in SettingsSheet is not guarded by a success check');
  }

  const boot = fs.readFileSync('src/ui/useGame.ts', 'utf8');
  assert((boot.match(/new SaveManager\(/g) ?? []).length === 1,
    'useGame builds more than one SaveManager');
  assert(boot.includes('new PersistenceCoordinator('), 'useGame does not build the coordinator');
  assert(boot.includes('coordinator.persist(state)'), 'the engine does not persist through the coordinator');
  assert(boot.includes('readOnlyCapability('), 'stress mode is not given a read-only capability');

  const app = fs.readFileSync('src/ui/App.tsx', 'utf8');
  assert(app.includes('saves={saves}'), 'App does not pass the capability to Settings');
});

await check('stress mode cannot write the player save', async () => {
  const { readOnlyCapability: readOnly } = await import('../../src/save/coordinator.ts');
  const capability = readOnly(() => '{}');
  const imported = await capability.importAndCommit('{}');
  const wiped = await capability.reset();
  assert(!imported.ok && !wiped.ok, 'a read-only capability allowed a write');
  assert(typeof capability.exportToJson(stateWithCoins(1)) === 'string', 'export stopped working');
});

await check('an autosave admitted before an import is never dropped', async () => {
  /*
   * The exact failure an external probe found.
   *
   * X is writing. A is requested while X is still in the storage layer, so it
   * joins the queue behind it. An import B then validates and seals. The seal
   * used to be re-checked inside A's queue callback, so A — accepted before
   * the seal, merely waiting its turn — was silently dropped, and when B's
   * write failed the hotel fell back to X.
   */
  const storage = new GatedStorage();
  const coordinator = new PersistenceCoordinator(new SaveManager(storage, data), clockNow);

  storage.holdWrites();
  const x = coordinator.persist(stateWithCoins(701));
  await storage.waitForStarted(1);              // X is genuinely stuck inside set()
  const a = coordinator.persist(stateWithCoins(702));  // admitted, queued behind X

  // Target B by its payload: X and A are already inside set(), so a
  // "fail the next write" flag would land on one of them instead.
  storage.failWritesContaining = '"coins":703';
  const b = coordinator.importAndCommit(envelopeFor(stateWithCoins(703)));
  storage.releaseAll();

  assert(await x, 'X reported failure');
  assert(await a, 'A, admitted before the seal, was dropped');
  const importResult = await b;
  assert(!importResult.ok && importResult.kind === 'storage', 'the failing import reported success');

  // A was the last thing successfully written, so A is what remains.
  assert(await coinsIn(storage) === 702,
    `final state is ${await coinsIn(storage)}, expected 702 — the admitted autosave was lost`);
  assert(!coordinator.isSealed(), 'a failed import left the coordinator sealed');
});

await check('an autosave admitted before a reset survives a failing remove', async () => {
  const storage = new GatedStorage();
  const coordinator = new PersistenceCoordinator(new SaveManager(storage, data), clockNow);

  storage.holdWrites();
  const x = coordinator.persist(stateWithCoins(701));
  await storage.waitForStarted(1);
  const a = coordinator.persist(stateWithCoins(702));

  storage.failNextRemove = true;
  const resetting = coordinator.reset();
  storage.releaseAll();

  assert(await x, 'X reported failure');
  assert(await a, 'A, admitted before the seal, was dropped');
  const result = await resetting;
  assert(!result.ok && result.kind === 'storage', 'the failing reset reported success');
  assert(await coinsIn(storage) === 702,
    `final state is ${await coinsIn(storage)}, expected 702`);
  assert(!coordinator.isSealed(), 'a failed reset left the coordinator sealed');
});

await check('the seal is terminal: nothing administrative runs after it', async () => {
  // Import, then import again.
  {
    const storage = new GatedStorage();
    const coordinator = new PersistenceCoordinator(new SaveManager(storage, data), clockNow);
    assert((await coordinator.importAndCommit(envelopeFor(stateWithCoins(222)))).ok, 'the first import failed');
    const writesAfter = storage.order.length;

    const second = await coordinator.importAndCommit(envelopeFor(stateWithCoins(333)));
    assert(!second.ok && second.kind === 'busy', 'a second import was accepted after a seal');
    assert(storage.order.length === writesAfter, 'the refused second import touched storage');
    assert(await coinsIn(storage) === 222, 'the second import overwrote the first');

    const afterReset = await coordinator.reset();
    assert(!afterReset.ok && afterReset.kind === 'busy', 'a reset was accepted after an import');
    assert(await coinsIn(storage) === 222, 'the refused reset wiped the save');
  }

  // Reset, then anything.
  {
    const storage = new GatedStorage();
    const coordinator = new PersistenceCoordinator(new SaveManager(storage, data), clockNow);
    await storage.set(SAVE_KEY, envelopeFor(stateWithCoins(1000)));
    assert((await coordinator.reset()).ok, 'the reset failed');
    const writesAfter = storage.order.length;

    const importing = await coordinator.importAndCommit(envelopeFor(stateWithCoins(222)));
    assert(!importing.ok && importing.kind === 'busy', 'an import was accepted after a reset');
    const again = await coordinator.reset();
    assert(!again.ok && again.kind === 'busy', 'a second reset was accepted');

    assert(storage.order.length === writesAfter, 'a refused operation touched storage');
    assert(await storage.get(SAVE_KEY) === null, 'the save came back after a reset');
  }
});

await check('anything thrown is turned into a result, never a rejection', async () => {
  // A value structuredClone cannot copy.
  {
    const storage = new GatedStorage();
    const coordinator = new PersistenceCoordinator(new SaveManager(storage, data), clockNow);
    const uncopyable = stateWithCoins(1) as unknown as Record<string, unknown>;
    uncopyable['fn'] = () => undefined;
    assert(await coordinator.persist(uncopyable as unknown as GameState) === false,
      'an uncopyable state did not resolve to false');
  }

  // A clock that throws.
  {
    const storage = new GatedStorage();
    const coordinator = new PersistenceCoordinator(
      new SaveManager(storage, data),
      () => { throw new Error('no clock'); },
    );
    assert(await coordinator.persist(stateWithCoins(1)) === false,
      'a throwing clock did not resolve to false');
  }

  // Storage that throws things that are not Errors.
  for (const thrown of [null, 'a string', { code: 5 }]) {
    const storage = new GatedStorage();
    const coordinator = new PersistenceCoordinator(new SaveManager(storage, data), clockNow);
    await storage.set(SAVE_KEY, envelopeFor(stateWithCoins(1000)));

    storage.failNextSet = true;
    storage.failSetWith = thrown;
    const result = await coordinator.importAndCommit(envelopeFor(stateWithCoins(222)));
    assert(!result.ok, `import survived a thrown ${String(thrown)}`);
    assert(typeof result.detail === 'string', `detail was ${typeof result.detail}, not a string`);

    storage.failNextRemove = true;
    storage.failRemoveWith = thrown;
    const wiped = await coordinator.reset();
    assert(!wiped.ok && typeof wiped.detail === 'string', `reset gave a bad detail for ${String(thrown)}`);

    // And the queue still works afterwards.
    assert(await coordinator.persist(stateWithCoins(555)), `the queue died after a thrown ${String(thrown)}`);
    assert(await coinsIn(storage) === 555, 'the recovery autosave did not land');
  }
});

await check('one SaveManager, injected, and Settings never rethrows', () => {
  const coordinatorSrc = fs.readFileSync('src/save/coordinator.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  assert(!coordinatorSrc.includes('new SaveManager('), 'the coordinator still builds its own manager');
  assert(!coordinatorSrc.includes('as Error).message'), 'the coordinator still reads .message off an unknown throw');

  const boot = fs.readFileSync('src/ui/useGame.ts', 'utf8');
  assert((boot.match(/new SaveManager\(/g) ?? []).length === 1, 'useGame builds more than one manager');
  assert(/new PersistenceCoordinator\(\s*saveManager/.test(boot),
    'the coordinator is not given the same manager useGame loads with');
  assert(boot.includes('saveManager.load()'), 'the shared manager is not used to load');

  const settingsRaw = fs.readFileSync('src/ui/SettingsSheet.tsx', 'utf8');
  const settings = settingsRaw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  assert(!settings.includes('throw '), 'SettingsSheet still rethrows out of a void handler');
  assert((settingsRaw.match(/disabled=\{busy\}/g) ?? []).length >= 4,
    'the import and reset controls are not all guarded against a double click');
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
