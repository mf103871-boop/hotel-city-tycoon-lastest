import { testGuest } from './guest-factory.ts';
/**
 * Headless tests for the objective chain, its rewards, and the schema
 * migration that made room for it.
 *
 * The chain has to be provably completable. A checklist that strands a player
 * on an impossible step is worse than no checklist, and that is exactly the
 * kind of bug nobody notices until someone reaches step nine.
 *
 * Run: node --experimental-strip-types tools/selftest/objectives.ts
 */
import fs from 'node:fs';
import { loadSimData } from '../balance-sim/load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { execute } from '../../src/core/commands/index.ts';
import { catalogueFor } from '../../src/core/data-source.ts';
import { objectiveProgress as conditionProgress } from '../../src/core/systems/objectives.ts';
import { totalShiftCost, isOpen } from '../../src/core/systems/economy.ts';
import { advance } from '../../src/core/sim/tick.ts';
import { resolveOffline } from '../../src/core/sim/offline.ts';
import { SCHEMA_VERSION } from '../../src/core/state/types.ts';
import { SaveManager, MemoryStorage, MIGRATIONS, migrate, SAVE_KEY } from '../../src/save/index.ts';
import type { GameState } from '../../src/core/state/types.ts';

const data = loadSimData();
const { initSelectors } = await import('../../src/bridge/selectors.ts');
initSelectors(data);
const { objectiveViews, currentObjective, claimableObjectives, objectiveProgress } =
  await import('../../src/bridge/objectives.ts');

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }

const TPS = data.economy.simulation.ticksPerSecond;
const fresh = (): GameState => createInitialState(data, { seed: 6161, epochMs: 0 });

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — objectives self-test');
console.log(line);

await (async () => {

await check('a new player is given exactly one next step', () => {
  const s = fresh();
  const objective = currentObjective(s);
  assert(objective !== null, 'a new player has nothing to do');
  eq(objective.id, data.objectives[0]!.id, 'the chain did not start at the beginning');
  eq(objective.claimed, false, 'the first step is already claimed');
});

await check('progress is a fraction, not a checkbox', () => {
  const s = fresh();
  s.stats.guestsServed = 25;
  const serve = objectiveViews(s).find((o) => o.id === 'serve_guests')!;
  assert(serve.progress > 0.4 && serve.progress < 0.6,
    `half of fifty guests reported ${serve.progress}`);
  assert(!serve.done, 'half done was reported as done');
});

await check('progress never exceeds one', () => {
  const s = fresh();
  s.stats.guestsServed = 100_000;
  s.player.level = data.levels[data.levels.length - 1]!.level;
  s.hotel.stars = 5;
  for (const view of objectiveViews(s)) {
    assert(view.progress <= 1, `"${view.id}" reports progress ${view.progress}`);
  }
});

await check('opening the hotel completes the first objective', () => {
  const s = fresh();
  eq(currentObjective(s)!.done, false, 'the first objective started complete');
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
  eq(currentObjective(s)!.done, true, 'opening the hotel did not complete it');
});

await check('claiming pays the reward exactly once', () => {
  const s = fresh();
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_2h' });
  const objective = currentObjective(s)!;
  const before = s.player.coins;
  const gemsBefore = s.player.gems;

  assert(execute(data, s, { type: 'CLAIM_OBJECTIVE', objectiveId: objective.id }).ok,
    'claiming a finished objective failed');
  eq(s.player.coins - before, objective.rewardCoins, 'wrong coin reward');
  eq(s.player.gems - gemsBefore, objective.rewardGems, 'wrong gem reward');

  const second = execute(data, s, { type: 'CLAIM_OBJECTIVE', objectiveId: objective.id });
  assert(!second.ok && second.reason === 'alreadyClaimed', 'the same reward was paid twice');
});

await check('the core measures completion itself and cannot be told otherwise', () => {
  // An earlier version accepted a progress number from the caller. This test
  // used to assert that behaviour and call it a pass, which documented a
  // reward exploit instead of preventing it.
  const s = fresh();
  const view = objectiveViews(s).find((o) => o.id === 'five_stars')!;
  eq(view.done, false, 'a new hotel already has five stars');

  const result = execute(data, s, { type: 'CLAIM_OBJECTIVE', objectiveId: 'five_stars' });
  assert(!result.ok && result.reason === 'notComplete',
    'an unfinished objective was claimed — the core is trusting its caller');
  eq(s.completedObjectives.length, 0, 'a refused claim still marked the objective done');
});

await check('an unknown objective is refused', () => {
  const result = execute(data, fresh(), { type: 'CLAIM_OBJECTIVE', objectiveId: 'no_such_thing' });
  assert(!result.ok && result.reason === 'unknownObjective', 'a phantom objective paid out');
});

await check('the chain advances to the next step after a claim', () => {
  const s = fresh();
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_2h' });
  const first = currentObjective(s)!;
  execute(data, s, { type: 'CLAIM_OBJECTIVE', objectiveId: first.id });
  const next = currentObjective(s);
  assert(next !== null && next.id !== first.id, 'the chain did not advance');
});

await check('every objective is reachable by actually playing', () => {
  // A checklist that strands a player on an impossible step is worse than no
  // checklist. This plays the game until every step is claimed, or gives up.
  const s = fresh();
  s.player.coins = 80_000_000;
  s.player.level = data.levels[data.levels.length - 1]!.level;

  const buildMany = (defId: string, n: number) => {
    for (let i = 0; i < n; i++) execute(data, s, { type: 'BUILD_ROOM', defId });
  };
  // Expand first so there is somewhere to build.
  for (const plot of [...data.plots].sort((a, b) => a.blocks - b.blocks)) {
    execute(data, s, { type: 'EXPAND_PLOT', plotId: plot.id });
  }
  buildMany('economy', 22);
  buildMany('housekeeping', 4);
  // A player who builds closets staffs them. Without cleaners a 35-room hotel
  // drowns in dirt and the star objectives become unreachable for a reason
  // that is the bot's, not the game's.
  for (const room of s.hotel.rooms) {
    if (room.defId === 'housekeeping' && !room.staffId) {
      execute(data, s, { type: 'HIRE_STAFF', roomId: room.id, roleId: 'cleaner' });
    }
  }
  for (const id of ['cafe', 'gym', 'restaurant', 'bar', 'arcade', 'cinema', 'spa']) {
    execute(data, s, { type: 'BUILD_ROOM', defId: id });
    const room = s.hotel.rooms[s.hotel.rooms.length - 1];
    const def = data.rooms.find((r) => r.id === id)!;
    if (room && 'staffRole' in def && def.staffRole) {
      execute(data, s, { type: 'HIRE_STAFF', roomId: room.id, roleId: def.staffRole });
    }
  }
  // Fill every meter completely.
  for (const room of s.hotel.rooms) {
    catalogueFor(data, room.defId).forEach((defId, slot) => {
      execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId, slot });
    });
  }
  /*
   * Time, spent the way a real player spends it.
   *
   * This used to tick 40 live hours — 1.44 million ticks — to push
   * guests-served past the eight-thousand objective. The claim it proved was
   * right and the price was not: three minutes here and past five on a
   * throttled box, which timed the whole verify chain out. Nobody reaches
   * eight thousand guests by watching the screen for forty hours; they play
   * a while and let the game's own away-time earnings do the rest. So the
   * check now does exactly that: two live hours of real ticks — check-ins,
   * service, cleaning, stars, all through the actual loop — then 48-hour
   * away windows through resolveOffline, whose agreement with the live loop
   * is itself guarded (timeline's coin and throughput parity checks). Same
   * claim, the game's own mechanics, twenty times cheaper.
   */
  execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_48h' });
  advance(data, s, 2 * 3600 * TPS);

  const serveDef = data.objectives.find((o) => o.id === 'serve_thousands');
  const serveTarget = Number(serveDef?.check['min'] ?? 8000);
  for (let window = 0; window < 10 && s.stats.guestsServed < serveTarget; window++) {
    if (!isOpen(s)) {
      s.player.coins += 50_000; // the bot never stalls on a shift bill
      execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_48h' });
    }
    resolveOffline(data, s, 48 * 3600 * 1000);
  }

  // Claim everything that is finished, repeatedly, until nothing moves.
  for (let round = 0; round < data.objectives.length + 2; round++) {
    const ready = claimableObjectives(s);
    if (ready.length === 0) break;
    for (const objective of ready) {
      execute(data, s, { type: 'CLAIM_OBJECTIVE', objectiveId: objective.id });
    }
  }

  const stuck = objectiveViews(s).filter((o) => !o.claimed);
  assert(stuck.length === 0,
    `unreachable after full play: ${stuck.map((o) => `${o.id} (${Math.round(o.progress * 100)}%)`).join(', ')}`);
  const { claimed, total } = objectiveProgress(s);
  console.log(`      all ${claimed}/${total} objectives reachable`);
});

await check('rewards rise along the chain', () => {
  // A later objective paying less than an earlier one reads as a mistake even
  // when it is deliberate.
  let previous = -1;
  for (const objective of data.objectives) {
    const value = objective.rewardCoins + objective.rewardGems * 1000;
    assert(value >= previous, `"${objective.id}" pays less than the objective before it`);
    previous = value;
  }
});

await check('every objective string exists in the primary locale', () => {
  const en = JSON.parse(fs.readFileSync('src/i18n/locales/en.json', 'utf8')) as Record<string, string>;
  for (const objective of data.objectives) {
    assert(objective.titleKey in en, `"${objective.titleKey}" is missing from en.json`);
    assert(objective.hintKey in en, `"${objective.hintKey}" is missing from en.json`);
  }
});

await check('an unknown condition never strands the chain', () => {
  const s = fresh();
  const views = objectiveViews({ ...s });
  assert(views.length === data.objectives.length, 'objectives were lost');
  // The evaluator treats an unrecognised kind as satisfied on purpose, so a
  // typo in the data cannot lock every later step behind it.
});

// ---------------------------------------------------------------- inspector
await check('tapping an ordinary sleeper pays the poke, never the inspection (4A)', () => {
  // Decision 3a flipped the old expectation: a sleeping guest IS worth
  // tapping now. What must still never happen is the inspection side —
  // no star boost, no per-star payout — and a guest who is awake in an
  // amenity pays nothing at all.
  const s = fresh();
  s.epochMs = 1_710_000_000_000;
  s.guests.push(testGuest({ id: 'gp', typeId: 'standard', state: 'staying', roomId: s.hotel.rooms[1]!.id,
    stateSinceTick: s.tick, finishesAtTick: s.tick + 9999, desire: null, patienceUntilTick: 0, everCheckedIn: false }));
  const coins = s.player.coins;
  const result = execute(data, s, { type: 'TAP_GUEST', guestId: 'gp' });
  assert(result.ok, 'tapping a guest failed outright');
  const gain = s.player.coins - coins;
  const poke = data.economy.poke;
  assert(gain >= poke.minCoins && gain <= poke.maxCoins,
    `a sleeper poke paid ${gain}, outside ${poke.minCoins}..${poke.maxCoins}`);
  eq(s.starBoost.amount, 0, 'a poke applied the inspection star boost');
  assert(result.events.some((e) => e.type === 'guestPoked'), 'no poke was reported');

  s.guests.push(testGuest({ id: 'ga', typeId: 'standard', state: 'usingAmenity', roomId: null,
    stateSinceTick: s.tick, finishesAtTick: s.tick + 9999, desire: null, patienceUntilTick: 0, everCheckedIn: true }));
  const before = s.player.coins;
  const awake = execute(data, s, { type: 'TAP_GUEST', guestId: 'ga' });
  assert(awake.ok && awake.events.some((e) => e.type === 'nothingFound'), 'an awake guest was pokeable');
  eq(s.player.coins, before, 'an awake guest paid a poke');
});

await check('finding the inspector pays by star rating and lifts it', () => {
  // The signature find-them-among-the-sleepers mechanic. Its reward fields sat
  // in the data unread from P1 until now.
  const s = fresh();
  s.hotel.stars = 3;
  // At the cap the inspection XP cannot trigger a level-up, so the coin delta
  // below is the inspection reward alone rather than reward + level rewards.
  s.player.level = data.levels[data.levels.length - 1]!.level;
  s.guests.push(testGuest({ id: 'gi', typeId: 'inspector', state: 'staying', roomId: s.hotel.rooms[1]!.id,
    stateSinceTick: s.tick, finishesAtTick: s.tick + 9999, desire: null, patienceUntilTick: 0, everCheckedIn: false }));
  const coins = s.player.coins;
  const result = execute(data, s, { type: 'TAP_GUEST', guestId: 'gi' });
  assert(result.ok, 'finding the inspector failed');

  const def = data.events.find((e) => e.id === 'inspection')!;
  const expected = Math.round(Number(def['rewardCoinsPerStar']) * 3);
  eq(s.player.coins - coins, expected, 'the reward did not scale with the rating');
  assert(s.starBoost.amount > 0, 'no temporary rating boost was applied');
  assert(s.starBoost.untilTick > s.tick, 'the boost expired immediately');
});

await check('the same guest cannot be checked twice', () => {
  const s = fresh();
  s.guests.push(testGuest({ id: 'gi2', typeId: 'inspector', state: 'staying', roomId: s.hotel.rooms[1]!.id,
    stateSinceTick: s.tick, finishesAtTick: s.tick + 9999, desire: null, patienceUntilTick: 0, everCheckedIn: false }));
  assert(execute(data, s, { type: 'TAP_GUEST', guestId: 'gi2' }).ok, 'the first check failed');
  const second = execute(data, s, { type: 'TAP_GUEST', guestId: 'gi2' });
  assert(!second.ok && second.reason === 'alreadyRevealed', 'the inspector paid out twice');
});

await check('a guest walking past cannot be checked on', () => {
  const s = fresh();
  s.guests.push(testGuest({ id: 'gw', typeId: 'inspector', state: 'arriving', roomId: null,
    stateSinceTick: s.tick, finishesAtTick: 0, desire: null, patienceUntilTick: s.tick + 600, everCheckedIn: false }));
  const result = execute(data, s, { type: 'TAP_GUEST', guestId: 'gw' });
  assert(!result.ok && result.reason === 'guestNotResting', 'a guest in the street was inspected');
});

await check('the boost raises income and then expires', async () => {
  const { effectiveStars } = await import('../../src/core/systems/stars.ts');
  const s = fresh();
  const earned = effectiveStars(data, s);
  s.starBoost = { amount: 1, untilTick: s.tick + 100 };
  assert(effectiveStars(data, s) > earned, 'the boost did not lift the rating');
  s.tick += 200;
  eq(effectiveStars(data, s), earned, 'the boost never expired');
});

await check('the boost cannot manufacture a five-star slum', async () => {
  const { effectiveStars } = await import('../../src/core/systems/stars.ts');
  const s = fresh();
  s.starBoost = { amount: 99, untilTick: s.tick + 1000 };
  const top = data.starTiers[data.starTiers.length - 1]!.stars;
  eq(effectiveStars(data, s), top, 'the boost ran past the top tier');
});

await check('presence bonuses left with the typed guests (decision 13a)', async () => {
  const { presenceMultiplier } = await import('../../src/core/systems/guests.ts');
  const s = fresh();
  eq(presenceMultiplier(data, s), 1, 'an empty hotel already has a bonus');
  // 3B removed the vip and its event; a full house of the one remaining
  // guest type must change nothing. If this ever rises again, a presence
  // system has quietly returned without a decision.
  s.guests.push(testGuest({ id: 'gv', typeId: 'standard', state: 'staying', roomId: s.hotel.rooms[1]!.id,
    stateSinceTick: s.tick, finishesAtTick: s.tick + 9999, desire: null, patienceUntilTick: 0, everCheckedIn: false }));
  eq(presenceMultiplier(data, s), 1, 'a guest checked in and payments moved — presence bonuses are back');
});

// ---------------------------------------------------------------- migration
await check('the migration chain has no gaps', () => {
  // Asserting a literal version number here made every new feature break this
  // test for the wrong reason. What matters is that the chain is unbroken,
  // whatever the current version happens to be.
  assert(SCHEMA_VERSION >= 2, 'the schema has never been versioned');
  for (let v = 1; v < SCHEMA_VERSION; v++) {
    assert(v in MIGRATIONS, `there is no migration from version ${v} to ${v + 1}`);
  }
  const stray = Object.keys(MIGRATIONS).map(Number).filter((v) => v >= SCHEMA_VERSION);
  assert(stray.length === 0, `migrations exist beyond the current version: ${stray.join(', ')}`);
});

await check('a save from any older version migrates all the way forward', () => {
  const migrated = migrate({ seed: 1, player: { coins: 5 } }, 1, SCHEMA_VERSION);
  assert(Array.isArray(migrated['completedObjectives']), 'the objectives field was not added');
  assert(migrated['starBoost'] !== undefined, 'the star boost field was not added');
  assert(Array.isArray(migrated['revealedGuests']), 'the revealed list was not added');
  eq((migrated['player'] as { coins: number }).coins, 5, 'the chain lost existing data');
});

await check('a real version-1 save loads and keeps its hotel', async () => {
  const storage = new MemoryStorage();
  const old = JSON.parse(JSON.stringify(fresh())) as Record<string, unknown>;
  delete old['completedObjectives'];
  delete old['starBoost'];
  delete old['revealedGuests'];
  old['schemaVersion'] = 1;
  const rooms = (old['hotel'] as { rooms: unknown[] }).rooms.length;
  await storage.set(SAVE_KEY, JSON.stringify({ format: 1, version: 1, savedAtMs: 0, state: old }));

  const result = await new SaveManager(storage).load();
  assert(result.ok, `a version-1 save failed to load: ${result.ok === false ? result.detail : ''}`);
  eq(result.migratedFrom, 1, 'the load did not report a migration');
  eq(result.state.schemaVersion, SCHEMA_VERSION, 'the loaded save kept the old version number');
  eq(result.state.hotel.rooms.length, rooms, 'the migration lost rooms');
  eq(result.state.completedObjectives.length, 0, 'the new field is not an empty list');
});

await check('a migrated save is immediately playable', () => {
  const s = fresh();
  s.completedObjectives = [];
  const objective = currentObjective(s);
  assert(objective !== null, 'a migrated player has no next step');
});

})();

await check('the guidance runs as far as the game does', () => {
  // The chain stopped at level 10 while the curve reaches level 31 in four
  // months. A checklist that quits at the point the game gets long has
  // abandoned the player exactly where they most need a reason to continue.
  const maxLevel = data.levels[data.levels.length - 1]!.level;
  const levelGoals = data.objectives
    .filter((o) => o.check.kind === 'level')
    .map((o) => Number(o.check['min']))
    .sort((a, b) => a - b);
  assert(levelGoals.length >= 3, 'the chain names only a couple of levels');
  assert(levelGoals[levelGoals.length - 1]! >= maxLevel * 0.9,
    `the last level objective is ${levelGoals[levelGoals.length - 1]} against a cap of ${maxLevel}`);
  console.log(`      level goals: ${levelGoals.join(', ')} against a cap of ${maxLevel}`);
});

await check('there is something left to buy at every stage', () => {
  // Past level 40 the entire game contained one decor item. The shop is meant
  // to be the weekly reason to return, and it had nothing to offer.
  const maxLevel = data.levels[data.levels.length - 1]!.level;
  for (let band = 0; band < maxLevel; band += 10) {
    const inBand = data.decor.filter((d) => d.unlockLevel >= band && d.unlockLevel < band + 10);
    assert(inBand.length >= 3,
      `levels ${band}-${band + 9} unlock only ${inBand.length} decor item(s) — nothing to want`);
  }
});

await check('the shop does not run out of stock in a month', () => {
  const weeks = data.decor.length / data.shop.slots;
  assert(weeks >= 10,
    `every item in the game is seen in ${Math.floor(weeks)} weeks — the weekly refresh stops being a reason to return`);
  console.log(`      ${data.decor.length} items, ${Math.floor(weeks)} weeks to see them all`);
});

await check('the first week gives a reason to come back each day', () => {
  // The session audit found a player stalling at level nine for seven weeks
  // while a measure reported everything fine — because the daily gift fires
  // every day and made "was there something new" always true.
  //
  // Seven days rather than sixty: long enough to catch a dead opening week,
  // short enough to run in a check. The full horizon is `npm run sim:sessions`.
  const s = createInitialState(data, { seed: 31415, epochMs: Date.UTC(2026, 4, 4) });
  const DAY = 86_400_000;
  let quietDays = 0;

  for (let day = 0; day < 7; day++) {
    const now = Date.UTC(2026, 4, 4) + day * DAY;
    s.epochMs = now;
    const levelBefore = s.player.level;
    const claimedBefore = s.completedObjectives.length;

    execute(data, s, { type: 'CLAIM_GIFT', epochMs: now });
    const objective = data.objectives.find((o) => !s.completedObjectives.includes(o.id));
    if (objective && conditionProgress(data, s, objective.check) >= 1) {
      execute(data, s, { type: 'CLAIM_OBJECTIVE', objectiveId: objective.id });
    }
    // Land, then rooms — the order a player actually follows.
    for (let act = 0; act < 6; act++) {
      const plot = [...data.plots]
        .filter((p) => p.unlockLevel <= s.player.level && p.cost <= s.player.coins * 0.6)
        .sort((a, b) => b.blocks - a.blocks)[0];
      if (plot && execute(data, s, { type: 'EXPAND_PLOT', plotId: plot.id }).ok) continue;
      const room = data.rooms
        .filter((r) => r.unlockLevel <= s.player.level && r.cost.currency === 'coins'
          && r.cost.amount <= s.player.coins * 0.4)
        .sort((a, b) => b.cost.amount - a.cost.amount)[0];
      if (!room || !execute(data, s, { type: 'BUILD_ROOM', defId: room.id }).ok) break;
    }
    const shift = [...data.shifts]
      .filter((sh) => sh.unlockLevel <= s.player.level && totalShiftCost(data, s, sh.id) <= s.player.coins)
      .sort((a, b) => b.durationSec - a.durationSec)[0];
    if (shift) execute(data, s, { type: 'START_SHIFT', shiftId: shift.id });

    advance(data, s, 24 * 3600 * TPS);

    // Something other than the timer has to have moved.
    const moved = s.player.level > levelBefore
      || s.completedObjectives.length > claimedBefore;
    if (!moved) quietDays++;
  }

  assert(quietDays <= 2,
    `${quietDays} of the first seven days moved nothing but the daily gift`);
  console.log(`      reached level ${s.player.level}, claimed ${s.completedObjectives.length} objectives in a week`);
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
