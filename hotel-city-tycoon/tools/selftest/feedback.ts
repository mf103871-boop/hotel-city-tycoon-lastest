/**
 * Headless tests for the feedback layer: notifications, the offline summary,
 * and the audio manager's throttling rules.
 *
 * All of it is pure logic on purpose. What a player gets told, and how often,
 * is a design decision that should be provable without opening a browser.
 *
 * Run: node --experimental-strip-types tools/selftest/feedback.ts
 */
import fs from 'node:fs';
import {
  noticesFrom, dedupe, mergeNotices, offlineSummary,
  MAX_VISIBLE, OFFLINE_SUMMARY_FLOOR_MS,
} from '../../src/bridge/notifications.ts';
import type { SimEvent } from '../../src/core/state/types.ts';

let passed = 0;
const failures: string[] = [];
type TestFn = () => void | Promise<void>;

/*
 * Registered here, run later — and always awaited.
 *
 * This used to call `fn()` and count the test green the moment it returned.
 * An async callback returns a Promise immediately, so the runner printed a
 * tick before the test had done anything, and every assertion inside it
 * settled afterwards in a rejected promise nobody was listening to. Tests that
 * could not fail were being counted as passing.
 *
 * Registering without executing is what makes the fix hold: there is no longer
 * a code path that runs a callback outside the awaited loop.
 */
const tests: Array<{ name: string; fn: TestFn }> = [];
function check(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

async function runAll(): Promise<void> {
  for (const test of tests) {
    try {
      await test.fn();
      passed++;
      console.log(`  ✓ ${test.name}`);
    } catch (error) {
      failures.push(test.name);
      console.log(`  ✗ ${test.name}`);
      console.error(error);
    }
  }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — feedback self-test');
console.log(line);

// ---------------------------------------------------------------- notices
check('nothing happening produces nothing to read', () => {
  eq(noticesFrom([]).length, 0, 'an empty batch produced a toast');
});

check('a level-up is announced with its reward', () => {
  const notices = noticesFrom([{ type: 'levelUp', level: 7, rewardCoins: 2320, rewardGems: 0 }]);
  eq(notices.length, 1, 'wrong number of notices');
  eq(notices[0]!.kind, 'levelUp', 'wrong kind');
  eq(notices[0]!.values['level'], 7, 'wrong level reported');
  eq(notices[0]!.tone, 'good', 'a level-up should read as good news');
});

check('a rating going up and down are different messages', () => {
  const up = noticesFrom([{ type: 'starsChanged', from: 3, to: 4 }])[0]!;
  const down = noticesFrom([{ type: 'starsChanged', from: 4, to: 3 }])[0]!;
  eq(up.kind, 'starsUp', 'a rise was not reported as a rise');
  eq(down.kind, 'starsDown', 'a fall was not reported as a fall');
  eq(down.tone, 'bad', 'losing a star should not read as good news');
});

check('one busy minute does not produce one toast per guest', () => {
  // A hotel checks out several guests a second. Without aggregation the
  // important messages drown in a stream of coin notices.
  const events: SimEvent[] = [];
  for (let i = 0; i < 60; i++) {
    events.push({ type: 'guestCheckedOut', guestId: `g${i}`, roomId: 'r1', coins: 40, xp: 8 });
  }
  const notices = noticesFrom(events);
  eq(notices.length, 1, `60 checkouts produced ${notices.length} notices`);
  eq(notices[0]!.values['coins'], 2400, 'the payouts were not summed');
});

check('small payouts are not worth interrupting for', () => {
  const notices = noticesFrom([
    { type: 'guestCheckedOut', guestId: 'g1', roomId: 'r1', coins: 12, xp: 4 },
  ]);
  eq(notices.length, 0, 'a twelve-coin payout raised a toast');
});

check('guests walking away are counted, not listed', () => {
  const events: SimEvent[] = Array.from({ length: 9 }, (_, i) => ({
    type: 'guestLeftAngry' as const, guestId: `g${i}`, reason: 'noRoom' as const,
  }));
  const notices = noticesFrom(events);
  eq(notices.length, 1, 'nine departures produced nine messages');
  eq(notices[0]!.values['count'], 9, 'the count was wrong');
});

check('a departure says why, and two reasons do not merge into one number', () => {
  // The event has always carried the reason and the bridge threw it away, so
  // every way of losing a waiting guest read as the same sentence. A player
  // who sees "4 walked away" learns that something is wrong; one who sees that
  // three gave up queuing and one found no free room learns what to build.
  const notices = noticesFrom([
    { type: 'guestLeftAngry', guestId: 'a', reason: 'outOfPatience' },
    { type: 'guestLeftAngry', guestId: 'b', reason: 'outOfPatience' },
    { type: 'guestLeftAngry', guestId: 'c', reason: 'outOfPatience' },
    { type: 'guestLeftAngry', guestId: 'd', reason: 'noRoom' },
  ]);
  const lost = notices.filter((n) => n.kind === 'guestLost');
  eq(lost.length, 2, 'two different reasons did not produce two messages');
  const byKey = new Map(lost.map((n) => [n.titleKey, n.values['count']]));
  eq(byKey.get('notice.guestLost.outOfPatience'), 3, 'the impatient three were miscounted');
  eq(byKey.get('notice.guestLost.noRoom'), 1, 'the one with nowhere to sleep was miscounted');
});

check('every reason the core can emit has a message', () => {
  // The reason lives in the core and the sentence lives in the locale files.
  // Without this, adding a reason silently produces a notice whose title key
  // resolves to nothing — an empty toast.
  const en = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>;
  const types = fs.readFileSync('src/core/state/types.ts', 'utf8');
  const decl = /type: 'guestLeftAngry';[^}]*reason: ([^}]+)\}/.exec(types);
  assert(decl, 'the guestLeftAngry event declaration was not found — this check is stale');
  const reasons = [...decl[1]!.matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]!);
  assert(reasons.length >= 3, `only found ${reasons.length} reasons in the union`);
  for (const reason of reasons) {
    const key = `notice.guestLost.${reason}`;
    assert(key in en, `the core can emit reason "${reason}" and ${key} does not exist`);
    // And it is actually reachable: the bridge must know the reason too.
    const bridge = fs.readFileSync('src/bridge/notifications.ts', 'utf8');
    assert(bridge.includes(`'${reason}'`),
      `LOST_REASONS in notifications.ts does not list "${reason}", so its notice is never emitted`);
  }
  console.log(`      ${reasons.length} reasons, each with a message and a place in the order`);
});

check('a bad review says what was bad, and a wanted amenity is named', () => {
  /*
   * Both halves of this were emitted by the core and read by nobody.
   * `guestReviewed` had no consumer at all — every review in the game landed
   * in a reputation average and the reason behind it was discarded. And
   * `desireUnmet` reached only the sprite's face, which is why the core still
   * carries the note that it "has to be counted somewhere they can see it, or
   * it is just a sad face on a sprite".
   */
  const notices = noticesFrom([
    { type: 'guestReviewed', guestId: 'a', score: 61, reputation: 70, complaint: 'cleanliness' },
    { type: 'guestReviewed', guestId: 'b', score: 63, reputation: 70, complaint: 'cleanliness' },
    { type: 'guestReviewed', guestId: 'c', score: 66, reputation: 70, complaint: 'waited' },
    // A stay good enough to carry no complaint must stay silent.
    { type: 'guestReviewed', guestId: 'd', score: 97, reputation: 70, complaint: null },
    { type: 'desireUnmet', guestId: 'e', tag: 'food' },
    { type: 'desireUnmet', guestId: 'f', tag: 'food' },
    { type: 'desireUnmet', guestId: 'g', tag: 'food' },
    { type: 'desireUnmet', guestId: 'h', tag: 'fitness' },
  ]);
  const byKey = new Map(notices.map((n) => [n.titleKey, n.values['count']]));
  eq(byKey.get('notice.complaint.cleanliness'), 2, 'the two dirty rooms were miscounted');
  eq(byKey.get('notice.complaint.waited'), 1, 'the guest kept waiting was miscounted');
  assert(!byKey.has('notice.complaint.null'), 'a stay with no complaint produced one anyway');
  eq(byKey.get('notice.desireUnmet.food'), 3, 'the three who wanted to eat were miscounted');
  eq(byKey.get('notice.desireUnmet.fitness'), 1, 'the one who wanted a gym was miscounted');

  // Loudest first, within each group: a player reads the top of the stack.
  const keys = notices.map((n) => n.titleKey);
  assert(keys.indexOf('notice.desireUnmet.food') < keys.indexOf('notice.desireUnmet.fitness'),
    'three guests wanting food ranked below one wanting a gym');
  assert(keys.indexOf('notice.complaint.cleanliness') < keys.indexOf('notice.complaint.waited'),
    'the bigger complaint was buried under the smaller one');
});

check('two different sentences with the same count are two notices', () => {
  /*
   * A notice used to be identified by its kind and its numbers, from the days
   * when one kind meant one sentence. Splitting the lost-guest and complaint
   * messages by reason broke that silently: "3 gave up waiting" and "3 wanted
   * a gym" are both `guestLost` with `{count: 3}`, so `dedupe` read them as
   * the same notice twice, added the counts to 6 and dropped one sentence.
   * The player was told six guests did a thing three of them did.
   */
  const notices = noticesFrom([
    { type: 'guestLeftAngry', guestId: 'a', reason: 'outOfPatience' },
    { type: 'guestLeftAngry', guestId: 'b', reason: 'outOfPatience' },
    { type: 'desireUnmet', guestId: 'c', tag: 'food' },
    { type: 'desireUnmet', guestId: 'd', tag: 'food' },
  ]);
  eq(notices.length, 2, 'two different problems did not produce two notices');
  for (const notice of notices) {
    eq(notice.values['count'], 2, `${notice.titleKey} absorbed the other one's count`);
  }
});

check('the order of a tie does not move between runs', () => {
  // Two reasons with the same count. Map iteration order is insertion order,
  // so without a tiebreak the notices would follow whichever guest the
  // simulation happened to check out first — the same tick, told two ways.
  const one = noticesFrom([
    { type: 'desireUnmet', guestId: 'a', tag: 'nightlife' },
    { type: 'desireUnmet', guestId: 'b', tag: 'food' },
  ]).map((n) => n.titleKey);
  const other = noticesFrom([
    { type: 'desireUnmet', guestId: 'b', tag: 'food' },
    { type: 'desireUnmet', guestId: 'a', tag: 'nightlife' },
  ]).map((n) => n.titleKey);
  eq(one.join('|'), other.join('|'), 'the same tick produced two different orders');
});

check('everything the core can complain about has a sentence', () => {
  /*
   * Two unions meeting a locale file, the same shape as the departure-reason
   * check above. A complaint reason is a `SatisfactionReason` that
   * `dominantComplaint` can actually return — the SHORTFALL table says which:
   * a term read as always worth zero is given, not withheld, and can never be
   * a complaint. A desire tag is whatever a commercial room declares, because
   * that is literally where `spawnGuest` reads them from.
   *
   * Without this, adding a room category or a satisfaction term produces a
   * toast whose title resolves to nothing — an empty white box.
   */
  const en = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>;
  const satisfaction = fs.readFileSync('src/core/systems/satisfaction.ts', 'utf8');

  const table = /const SHORTFALL[^{]*\{([\s\S]*?)\n\};/.exec(satisfaction);
  assert(table, 'the SHORTFALL table was not found — this check is stale');
  const rows = [...table[1]!.matchAll(/^\s{2}(\w+):\s*\(([^)]*)\)\s*=>\s*(.+?),\s*$/gm)];
  assert(rows.length >= 8, `only ${rows.length} rows read out of the SHORTFALL table`);
  const complaintReasons = rows.filter((r) => r[3] !== '0').map((r) => r[1]!);
  assert(complaintReasons.length >= 6,
    `only ${complaintReasons.length} reasons can be a complaint — the table shape changed`);

  for (const reason of complaintReasons) {
    const key = `notice.complaint.${reason}`;
    assert(key in en, `dominantComplaint can return "${reason}" and ${key} does not exist`);
  }
  // And nothing in the locale file promises a complaint that cannot happen.
  for (const key of Object.keys(en)) {
    if (!key.startsWith('notice.complaint.')) continue;
    const reason = key.slice('notice.complaint.'.length);
    assert(complaintReasons.includes(reason),
      `${key} exists and no stay can ever raise "${reason}"`);
  }

  // Desires come from the rooms, exactly as spawnGuest reads them.
  const rooms = JSON.parse(fs.readFileSync('data/rooms.json', 'utf8')) as
    { rooms: Array<{ category: string; desireTag?: string }> };
  const tags = [...new Set(rooms.rooms
    .filter((r) => r.category === 'commercial' && typeof r.desireTag === 'string')
    .map((r) => r.desireTag!))];
  assert(tags.length > 0, 'no commercial room declares a desire tag — this check is stale');
  for (const tag of tags) {
    const key = `notice.desireUnmet.${tag}`;
    assert(key in en, `a guest can want "${tag}" and ${key} does not exist`);
  }
  for (const key of Object.keys(en)) {
    if (!key.startsWith('notice.desireUnmet.')) continue;
    const tag = key.slice('notice.desireUnmet.'.length);
    assert(tags.includes(tag), `${key} exists and no room can ever make a guest want "${tag}"`);
  }
  console.log(`      ${complaintReasons.length} complaints and ${tags.length} desires, each with a sentence`);
});

check('a fire outranks everything else in the batch', () => {
  const notices = noticesFrom([
    { type: 'guestCheckedOut', guestId: 'g1', roomId: 'r1', coins: 900, xp: 100 },
    { type: 'fireStarted', roomId: 'r2' },
    { type: 'levelUp', level: 5, rewardCoins: 1800, rewardGems: 0 },
  ]);
  eq(notices[0]!.kind, 'hazard', 'a fire did not come first');
});

check('a flood of events is trimmed to what fits on screen', () => {
  const events: SimEvent[] = [
    { type: 'fireStarted', roomId: 'r1' },
    { type: 'pestAppeared', roomId: 'r2' },
    { type: 'levelUp', level: 3, rewardCoins: 1280, rewardGems: 0 },
    { type: 'starsChanged', from: 3, to: 4 },
    { type: 'shiftEnded' },
    { type: 'guestLeftAngry', guestId: 'g1', reason: 'noRoom' },
    { type: 'guestCheckedOut', guestId: 'g2', roomId: 'r1', coins: 5000, xp: 500 },
  ];
  const notices = noticesFrom(events);
  assert(notices.length <= MAX_VISIBLE, `${notices.length} notices exceed the cap of ${MAX_VISIBLE}`);
  assert(notices.some((n) => n.kind === 'hazard'), 'the hazard was trimmed away');
});

check('identical notices merge with a count instead of repeating', () => {
  const one = noticesFrom([{ type: 'fireStarted', roomId: 'r1' }]);
  const two = noticesFrom([{ type: 'fireStarted', roomId: 'r2' }]);
  const merged = mergeNotices(one, two);
  eq(merged.length, 1, 'two fires produced two separate toasts');
  eq(merged[0]!.count, 2, 'the count did not accumulate');
});

check('dedupe keeps the highest priority when it has to choose', () => {
  const many = noticesFrom([
    { type: 'fireStarted', roomId: 'r1' },
    { type: 'levelUp', level: 2, rewardCoins: 1020, rewardGems: 0 },
    { type: 'starsChanged', from: 3, to: 4 },
    { type: 'shiftEnded' },
    { type: 'guestLeftAngry', guestId: 'g1', reason: 'noRoom' },
  ]);
  const trimmed = dedupe(many);
  for (let i = 1; i < trimmed.length; i++) {
    assert(trimmed[i - 1]!.priority >= trimmed[i]!.priority, 'notices are not in priority order');
  }
});

check('every notice names a sound that exists, or none at all', () => {
  const files = new Set(
    fs.readdirSync('public/assets/audio').map((f) => f.replace('.wav', '')),
  );
  const sample = noticesFrom([
    { type: 'levelUp', level: 2, rewardCoins: 1020, rewardGems: 0 },
    { type: 'starsChanged', from: 3, to: 4 },
    { type: 'starsChanged', from: 4, to: 3 },
    { type: 'fireStarted', roomId: 'r1' },
    { type: 'hazardCleared', roomId: 'r1', hazard: 'fire', coins: 260 },
    { type: 'shiftEnded' },
    { type: 'guestCheckedOut', guestId: 'g1', roomId: 'r1', coins: 900, xp: 90 },
    { type: 'offlineResolved', elapsedMs: 7_200_000, coins: 4000, xp: 400, guestsServed: 90 },
  ]);
  assert(sample.length > 0, 'no notices to check');
  for (const notice of dedupe(sample)) {
    if (notice.sound === null) continue;
    assert(files.has(notice.sound), `"${notice.kind}" asks for a sound file "${notice.sound}.wav" that does not exist`);
  }
});

check('every notice text resolves in the primary locale', () => {
  const en = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>;
  const all = noticesFrom([
    { type: 'levelUp', level: 2, rewardCoins: 1020, rewardGems: 0 },
    { type: 'starsChanged', from: 3, to: 4 },
    { type: 'starsChanged', from: 4, to: 3 },
    { type: 'fireStarted', roomId: 'r1' },
    { type: 'pestAppeared', roomId: 'r1' },
    { type: 'hazardCleared', roomId: 'r1', hazard: 'pest', coins: 65 },
    { type: 'shiftEnded' },
    { type: 'guestLeftAngry', guestId: 'g1', reason: 'noRoom' },
    { type: 'guestCheckedOut', guestId: 'g1', roomId: 'r1', coins: 900, xp: 90 },
    { type: 'offlineResolved', elapsedMs: 7_200_000, coins: 4000, xp: 400, guestsServed: 90 },
  ]);
  for (const notice of all) {
    assert(notice.titleKey in en, `"${notice.titleKey}" is missing from en.json — the player would see a raw key`);
    // Every {placeholder} in the string must have a value supplied.
    for (const m of (en[notice.titleKey] ?? '').matchAll(/\{(\w+)\}/g)) {
      assert(m[1]! in notice.values,
        `"${notice.titleKey}" needs {${m[1]}} but the notice does not supply it`);
    }
  }
});

// ---------------------------------------------------------------- offline
check('a short absence is not an occasion', () => {
  const summary = offlineSummary([
    { type: 'offlineResolved', elapsedMs: 60_000, coins: 300, xp: 30, guestsServed: 5 },
  ]);
  eq(summary, null, 'coming back after a minute staged a welcome screen');
});

check('a real absence produces a summary', () => {
  const summary = offlineSummary([
    { type: 'offlineResolved', elapsedMs: 3 * 3600_000, coins: 12400, xp: 900, guestsServed: 210 },
  ]);
  assert(summary !== null, 'three hours away produced nothing');
  eq(summary.minutesAway, 180, 'wrong duration');
  eq(summary.coins, 12400, 'wrong payout');
});

check('an absence that earned nothing shows nothing', () => {
  const summary = offlineSummary([
    { type: 'offlineResolved', elapsedMs: 6 * 3600_000, coins: 0, xp: 0, guestsServed: 0 },
  ]);
  eq(summary, null, 'a closed hotel staged a celebration for zero coins');
});

check('the summary reports that the shift ran out', () => {
  const summary = offlineSummary([
    { type: 'shiftEnded' },
    { type: 'offlineResolved', elapsedMs: 5 * 3600_000, coins: 8000, xp: 600, guestsServed: 140 },
  ]);
  eq(summary?.shiftExpired, true, 'the player was not told their hotel had closed');
});

check('the summary floor is a sensible duration', () => {
  assert(OFFLINE_SUMMARY_FLOOR_MS >= 60_000 && OFFLINE_SUMMARY_FLOOR_MS <= 30 * 60_000,
    `the floor is ${OFFLINE_SUMMARY_FLOOR_MS}ms, which is not a sensible absence`);
});

// ---------------------------------------------------------------- audio
check('sound files exist for every id the manager declares', async () => {
  const source = fs.readFileSync('src/audio/index.ts', 'utf8');
  const ids = [...source.matchAll(/'(\w+)'/g)].map((m) => m[1]!);
  const declared = /export const SOUNDS[^=]*=\s*\[([^\]]+)\]/.exec(source)?.[1] ?? '';
  const names = [...declared.matchAll(/'(\w+)'/g)].map((m) => m[1]!);
  assert(names.length > 0, 'the manager declares no sounds');
  const files = new Set(fs.readdirSync('public/assets/audio').map((f) => f.replace('.wav', '')));
  for (const name of names) {
    assert(files.has(name), `"${name}" is declared but ${name}.wav does not exist`);
  }
  void ids;
  console.log(`      ${names.length} sounds declared, all present`);
});

check('the sound set is small enough to ship', () => {
  let bytes = 0;
  for (const f of fs.readdirSync('public/assets/audio')) {
    bytes += fs.statSync(`public/assets/audio/${f}`).size;
  }
  const kb = bytes / 1024;
  assert(kb < 400, `the sound set is ${kb.toFixed(0)}KB, too heavy for a first load`);
  console.log(`      sound set is ${kb.toFixed(0)}KB`);
});

check('every generated sound is short enough to repeat', () => {
  // A tycoon game plays its coin chime hundreds of times an hour. Anything
  // with a tail becomes unbearable by the second session.
  for (const f of fs.readdirSync('public/assets/audio')) {
    const buf = fs.readFileSync(`public/assets/audio/${f}`);
    const rate = buf.readUInt32LE(24);
    const seconds = (buf.length - 44) / (rate * 2);
    assert(seconds < 1.2, `${f} runs for ${seconds.toFixed(2)}s`);
  }
});

// ---------------------------------------------------------------- wiring
check('something actually consumes the buffered events', () => {
  // The store buffered events from P2.5 onward and nothing ever read them —
  // the same dead-code shape that left the art unloaded for a whole release.
  const callers: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = `${dir}/${name}`;
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(name) || full.endsWith('store.ts')) continue;
      if (/consumeEvents\s*\(/.test(fs.readFileSync(full, 'utf8'))) callers.push(full);
    }
  };
  walk('src');
  assert(callers.length > 0, 'consumeEvents is never called — every event is discarded');
  console.log(`      consumed by ${callers.join(', ')}`);
});

check('something actually shows the offline summary', () => {
  const callers: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = `${dir}/${name}`;
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(name) || full.endsWith('notifications.ts')) continue;
      if (/offlineSummary\s*\(/.test(fs.readFileSync(full, 'utf8'))) callers.push(full);
    }
  };
  walk('src');
  assert(callers.length > 0, 'the offline summary is computed and never displayed');
});

check('the player can reach the export and import they own', () => {
  // The save layer has been able to export since P2.5 and no screen offered
  // it. For a game with no account, that is the difference between owning
  // progress and renting it.
  const callers: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = `${dir}/${name}`;
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(name) || full.startsWith('src/save')) continue;
      const src = fs.readFileSync(full, 'utf8');
      /*
       * Import is now `importAndCommit` on the narrow capability rather than
       * `importFromJson` on a SaveManager the screen holds itself. The name
       * changed; the question this asks did not — can a player get their save
       * out and put one back.
       */
      const offersImport = /importFromJson\s*\(/.test(src) || /importAndCommit\s*\(/.test(src);
      if (/exportToJson\s*\(/.test(src) && offersImport) callers.push(full);
    }
  };
  walk('src');
  assert(callers.length > 0, 'no screen offers export and import');
});

check('the player can mute the game', () => {
  const callers: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = `${dir}/${name}`;
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(name) || full.startsWith('src/audio')) continue;
      if (/setEnabled\s*\(/.test(fs.readFileSync(full, 'utf8'))) callers.push(full);
    }
  };
  walk('src');
  assert(callers.length > 0, 'audio ships with no way to turn it off');
});

check('something actually initialises audio', () => {
  const callers: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = `${dir}/${name}`;
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(name) || full.startsWith('src/audio')) continue;
      if (/initAudio\s*\(/.test(fs.readFileSync(full, 'utf8'))) callers.push(full);
    }
  };
  walk('src');
  assert(callers.length > 0, 'the audio manager is never initialised');
});

await runAll();

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
// exitCode, not exit(): exit() would tear the process down mid-flush and
// could cut off a test that had not settled.
process.exitCode = failures.length ? 1 : 0;
