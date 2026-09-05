/**
 * Balance simulator.
 *
 * Plays the game for 30 days with a scripted player and prints the progression
 * curve. This is the tool that exists because the original Hotel City shipped a
 * curve so steep that players complained about it for its entire lifetime. We
 * would rather find that wall in a terminal than in a review.
 *
 * The player policy is deliberately mediocre: a few active minutes a day, buys
 * the best thing it can afford, never optimises. If the curve works for this
 * player it works for most.
 *
 * Run: node --experimental-strip-types tools/balance-sim/run.ts
 */
import { loadSimData } from './load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { advance } from '../../src/core/sim/tick.ts';
import { resolveOffline } from '../../src/core/sim/offline.ts';
import { execute } from '../../src/core/commands/index.ts';
import { totalShiftCost, isOpen } from '../../src/core/systems/economy.ts';
import { nextTier, tierOwned } from '../../src/core/systems/upgrades.ts';
import { decorFill } from '../../src/core/systems/decor.ts';
import type { SimData } from '../../src/core/data-source.ts';
import type { GameState } from '../../src/core/state/types.ts';
import { catalogueFor, catalogueIndex } from '../../src/core/data-source.ts';

const DAYS = Number(process.env.DAYS ?? 30);
const ACTIVE_MIN_PER_DAY = Number(process.env.ACTIVE_MIN ?? 8);
const SEED = Number(process.env.SEED ?? 20260828);

const data = loadSimData();
const state = createInitialState(data, { seed: SEED, epochMs: 0, hotelName: 'Sim' });

interface DayRow {
  day: number; level: number; coins: number; rooms: number; stars: number;
  served: number; decorFill: number; xp: number;
}
const rows: DayRow[] = [];

// ---------------------------------------------------------------- policy

/** Open the hotel with the longest shift the player can comfortably afford. */
function openHotel(d: SimData, s: GameState): void {
  if (isOpen(s)) return;
  const affordable = d.shifts
    .filter((sh) => sh.unlockLevel <= s.player.level)
    .filter((sh) => totalShiftCost(d, s, sh.id) <= s.player.coins * 0.5)
    .sort((a, b) => b.durationSec - a.durationSec);
  const pick = affordable[0] ?? d.shifts.find((sh) => sh.unlockLevel <= s.player.level);
  if (pick) execute(d, s, { type: 'START_SHIFT', shiftId: pick.id });
}

/** Clear anything blocking income. Always worth it. */
function clearHazards(d: SimData, s: GameState): void {
  for (const room of [...s.hotel.rooms]) {
    if (room.hasFire) execute(d, s, { type: 'CLEAR_HAZARD', roomId: room.id, hazard: 'fire' });
    if (room.hasPest) execute(d, s, { type: 'CLEAR_HAZARD', roomId: room.id, hazard: 'pest' });
  }
}

/** Buy the biggest plot we can afford, so building is never blocked by space. */
function expand(d: SimData, s: GameState): void {
  const current = d.plots.find((p) => p.id === s.hotel.plotId);
  const next = d.plots
    .filter((p) => p.unlockLevel <= s.player.level && p.blocks > (current?.blocks ?? 0))
    .filter((p) => p.cost <= s.player.coins * 0.4)
    .sort((a, b) => b.blocks - a.blocks)[0];
  if (next) execute(d, s, { type: 'EXPAND_PLOT', plotId: next.id });
}

/** Keep a housekeeping room for every 14 cleanable rooms. */
function staffUp(d: SimData, s: GameState): void {
  const cleanable = s.hotel.rooms.filter((r) => {
    const def = d.rooms.find((x) => x.id === r.defId);
    return def ? def.category !== 'functional' : false;
  }).length;
  const closets = s.hotel.rooms.filter((r) => r.defId === 'housekeeping').length;
  const needed = Math.ceil(cleanable / d.economy.cleanliness.roomsPerCleaner);
  for (let i = closets; i < needed; i++) {
    const res = execute(d, s, { type: 'BUILD_ROOM', defId: 'housekeeping' });
    if (!res.ok) break;
    const room = s.hotel.rooms[s.hotel.rooms.length - 1];
    if (room) execute(d, s, { type: 'HIRE_STAFF', roomId: room.id, roleId: 'cleaner' });
  }
}

/** Build the best guest room affordable; occasionally a commercial one for stars. */
function build(d: SimData, s: GameState): void {
  const commercialCount = s.hotel.rooms.filter((r) => {
    const def = d.rooms.find((x) => x.id === r.defId);
    return def?.category === 'commercial';
  }).length;
  const guestCount = s.hotel.rooms.filter((r) => {
    const def = d.rooms.find((x) => x.id === r.defId);
    return def?.category === 'guest';
  }).length;

  // Star tiers want commercial rooms; keep roughly one per four guest rooms.
  const wantCommercial = commercialCount * 4 < guestCount;

  const affordable = (category: 'guest' | 'commercial') => d.rooms
    .filter((r) => r.category === category)
    .filter((r) => r.unlockLevel <= s.player.level)
    .filter((r) => r.cost.currency === 'coins' && r.cost.amount <= s.player.coins * 0.35)
    .sort((a, b) => b.cost.amount - a.cost.amount);

  // Fall back to the other category rather than buying nothing. Insisting on a
  // commercial room at level 1, where none is unlocked, previously froze the
  // simulated player for ten days and read as a game-design stall.
  // If the only thing standing between the hotel and its next star is a
  // commercial room, stop buying cheap guest rooms and save for it. A real
  // player reading the requirement would do exactly this; the simulator
  // previously bought guest rooms forever and never left one star.
  const nextTier = d.starTiers.find((t) => t.stars === s.hotel.stars + 1);
  const gatedByCommercial = nextTier != null
    && commercialCount < nextTier.minCommercialRooms
    && guestCount >= nextTier.minGuestRooms;

  const first = wantCommercial || gatedByCommercial ? 'commercial' : 'guest';
  const second = first === 'commercial' ? 'guest' : 'commercial';
  const pool = affordable(first).length
    ? affordable(first)
    : (gatedByCommercial ? [] : affordable(second));

  const pick = pool[0];
  if (!pick) return;
  const res = execute(d, s, { type: 'BUILD_ROOM', defId: pick.id });
  if (res.ok) {
    const room = s.hotel.rooms[s.hotel.rooms.length - 1];
    const roleId = 'staffRole' in pick ? pick.staffRole : null;
    if (room && roleId) execute(d, s, { type: 'HIRE_STAFF', roomId: room.id, roleId });
  }
}

/**
 * A real player with money in hand spends it, especially on day one. Building
 * a single room per session was a simulator artefact that read as a game-design
 * stall; this keeps buying while there is both cash and space.
 */
function buildOut(d: SimData, s: GameState): void {
  for (let n = 0; n < 8; n++) {
    const before = s.hotel.rooms.length;
    build(d, s);
    if (s.hotel.rooms.length === before) return;
  }
}

/**
 * Buy a permanent upgrade when there is money spare.
 *
 * A real player with millions idle buys the thing that makes the millions
 * arrive faster. Without this the simulator hoarded, which is exactly how the
 * endgame drought went unnoticed for so long.
 */
function upgrade(d: SimData, s: GameState): void {
  for (let n = 0; n < 3; n++) {
    const affordable = d.upgrades
      .filter((u) => u.unlockLevel <= s.player.level)
      .map((u) => ({ u, next: nextTier(d, s, u.id) }))
      .filter((x) => x.next !== null && x.next.cost <= s.player.coins * 0.5)
      .sort((a, b) => a.next!.cost - b.next!.cost);
    const pick = affordable[0];
    if (!pick) return;
    if (!execute(d, s, { type: 'BUY_UPGRADE', upgradeId: pick.u.id }).ok) return;
  }
}

/** Fill the emptiest room's meter with the best decor affordable. */
function decorate(d: SimData, s: GameState): void {
  for (let n = 0; n < 6; n++) {
    const targets = s.hotel.rooms
      .map((room) => {
        const def = d.rooms.find((r) => r.id === room.defId);
        return def && def.decorTarget > 0 ? { room, def, fill: decorFill(def, room) } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.fill < 1)
      .sort((a, b) => a.fill - b.fill);

    const target = targets[0];
    if (!target) return;

    const item = catalogueFor(d, target.room.defId)
      .map((id) => d.decor.find((x) => x.id === id)!)
      .filter((x) => x.unlockLevel <= s.player.level && x.cost.currency === 'coins')
      .filter((x) => x.cost.amount <= s.player.coins * 0.15)
      .filter((x) => !target.room.decor.some((p) => p.defId === x.id))
      .sort((a, b) => b.decorPoints - a.decorPoints)[0];
    if (!item) return;
    const slot = catalogueIndex(d, target.room.defId, item.id);

    const res = execute(d, s, { type: 'PLACE_DECOR', roomId: target.room.id, defId: item.id, slot });
    if (!res.ok) return;
  }
}

// ---------------------------------------------------------------- run

const tps = data.economy.simulation.ticksPerSecond;
let lastServed = 0;

for (let day = 1; day <= DAYS; day++) {
  clearHazards(data, state);
  expand(data, state);
  buildOut(data, state);
  staffUp(data, state);
  decorate(data, state);
  upgrade(data, state);
  openHotel(data, state);

  // active session
  advance(data, state, ACTIVE_MIN_PER_DAY * 60 * tps);

  // rest of the day away
  const awayMs = (24 * 60 - ACTIVE_MIN_PER_DAY) * 60 * 1000;
  resolveOffline(data, state, awayMs);

  const guestRooms = state.hotel.rooms.filter((r) => {
    const def = data.rooms.find((x) => x.id === r.defId);
    return def?.category === 'guest';
  });
  const fills = guestRooms.map((room) => {
    const def = data.rooms.find((x) => x.id === room.defId);
    return def ? decorFill(def, room) : 0;
  });
  const avgFill = fills.length ? fills.reduce((a, b) => a + b, 0) / fills.length : 0;

  rows.push({
    day,
    level: state.player.level,
    coins: state.player.coins,
    rooms: state.hotel.rooms.length,
    stars: state.hotel.stars,
    served: state.stats.guestsServed - lastServed,
    decorFill: avgFill,
    xp: state.player.xp,
  });
  lastServed = state.stats.guestsServed;
}

// ---------------------------------------------------------------- report

const line = '─'.repeat(72);
console.log(line);
console.log(`  Balance simulation — ${DAYS} days, ${ACTIVE_MIN_PER_DAY} active min/day, seed ${SEED}`);
console.log(line);
console.log('  day   level   coins        rooms  stars  served/day  decor');
for (const r of rows) {
  if (r.day % Math.max(1, Math.floor(DAYS / 15)) !== 0 && r.day !== 1 && r.day !== DAYS) continue;
  console.log(
    `  ${String(r.day).padStart(3)}   ${String(r.level).padStart(5)}   ` +
    `${r.coins.toLocaleString().padStart(11)}  ${String(r.rooms).padStart(5)}  ` +
    `${String(r.stars).padStart(5)}  ${String(r.served).padStart(10)}  ${(r.decorFill * 100).toFixed(0).padStart(4)}%`,
  );
}

console.log(line);
const first = rows[0]!;
const last = rows[rows.length - 1]!;
console.log(`  levels gained      ${first.level} -> ${last.level}`);
console.log(`  rooms built        ${first.rooms} -> ${last.rooms}`);
console.log(`  stars              ${first.stars} -> ${last.stars}`);
console.log(`  guests served      ${state.stats.guestsServed.toLocaleString()}`);
console.log(`  guests lost        ${state.stats.guestsLost.toLocaleString()}`);
console.log(`  coins earned       ${state.stats.coinsEarned.toLocaleString()}`);
console.log(`  coins spent        ${state.stats.coinsSpent.toLocaleString()}`);
const owned = data.upgrades
  .map((u) => `${u.id} ${tierOwned(state, u.id)}/${u.tiers.length}`)
  .join('  ');
console.log(`  upgrades           ${owned}`);

// ---- health checks ---------------------------------------------------
console.log(line);
const problems: string[] = [];
const stalledFrom = rows.findIndex((r, i) => i > 3 && r.level === rows[i - 3]!.level && r.level < 15);
if (stalledFrom > 0) problems.push(`progression stalls at level ${rows[stalledFrom]!.level} around day ${rows[stalledFrom]!.day}`);
// The bounds have to scale with the horizon. Judging a 120-day run against
// limits drawn for 30 reported a healthy curve as broken.
const maxLevel = data.levels[data.levels.length - 1]?.level ?? 60;
const expectedLow = Math.max(4, Math.round(maxLevel * 0.12 * (DAYS / 30)));
const expectedHigh = Math.min(maxLevel, Math.round(maxLevel * 0.75 * (DAYS / 30)));
if (last.level < expectedLow) {
  problems.push(`only reached level ${last.level} in ${DAYS} days — expected at least ${expectedLow}`);
}
if (last.level > expectedHigh && last.level < maxLevel) {
  problems.push(`reached level ${last.level} in ${DAYS} days — expected at most ${expectedHigh}`);
}
// Hitting the cap is only a problem if it happens early.
const cappedOn = rows.find((r) => r.level >= maxLevel)?.day;
if (cappedOn !== undefined && cappedOn < 40) {
  problems.push(`hit the level cap on day ${cappedOn} — too soon for a game meant to last`);
}
if (last.stars < 3) problems.push(`stuck at ${last.stars} stars — star requirements may be unreachable`);
const lostRatio = state.stats.guestsLost / Math.max(1, state.stats.guestsServed + state.stats.guestsLost);
if (lostRatio > 0.35) problems.push(`${(lostRatio * 100).toFixed(0)}% of guests walked away — capacity is starved`);
if (last.decorFill < 0.3) problems.push(`average decor fill only ${(last.decorFill * 100).toFixed(0)}% — decor is unaffordable`);

// A fortune with nothing to buy is the shape of an endgame that has run out.
const maxed = data.upgrades.every((u) => tierOwned(state, u.id) >= u.tiers.length);
if (last.coins > 20_000_000 && maxed) {
  problems.push(`ends with ${last.coins.toLocaleString()} coins and every upgrade bought — the sink is too small`);
} else if (last.coins > 40_000_000) {
  problems.push(`ends holding ${last.coins.toLocaleString()} coins — nothing is draining the fortune`);
}

if (problems.length === 0) {
  console.log('  ✓ curve is within expected bounds');
} else {
  for (const p of problems) console.log(`  ! ${p}`);
}
console.log(line);
