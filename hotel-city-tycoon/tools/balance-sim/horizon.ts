/**
 * Long-horizon balance runs.
 *
 * Six player profiles, checkpointed at D1, D7, D30, D90 and D180, reported
 * through the coin ledger so that "the hotel is profitable" and "the player was
 * given a lot of money" are finally different statements.
 *
 * The date is deliberately neutral. `epochMs = 0` is 1 January 1970, which
 * activates the New Year season and quietly inflated every earlier run.
 *
 *   node --experimental-strip-types tools/balance-sim/horizon.ts
 */
import { loadSimData } from './load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { execute } from '../../src/core/commands/index.ts';
import { advance } from '../../src/core/sim/tick.ts';
import { resolveOffline } from '../../src/core/sim/offline.ts';
import { operatingProfit, netProfit, OPERATING } from '../../src/core/systems/economy.ts';
import { isOpen } from '../../src/core/systems/economy.ts';
import { computeStars } from '../../src/core/systems/stars.ts';
import type { GameState } from '../../src/core/state/types.ts';
import { catalogueFor, catalogueIndex } from '../../src/core/data-source.ts';

const data = loadSimData();
const TPS = data.economy.simulation.ticksPerSecond;
const DAY = 86_400_000;
/** A Tuesday in March. No season, no New Year. */
const NEUTRAL = Date.UTC(2025, 2, 11);

interface Profile {
  name: string;
  /** Minutes of active play per day. */
  activeMin: number;
  /** How many days between visits. */
  everyDays: number;
  /** Which shift they reach for, longest-first among unlocked. */
  prefersLongShift: boolean;
}

const PROFILES: Profile[] = [
  { name: '2 min/day', activeMin: 2, everyDays: 1, prefersLongShift: true },
  { name: '10 min/day', activeMin: 10, everyDays: 1, prefersLongShift: true },
  { name: '20 min/day', activeMin: 20, everyDays: 1, prefersLongShift: false },
  { name: 'casual, short shifts', activeMin: 10, everyDays: 1, prefersLongShift: false },
  { name: 'weekend only', activeMin: 30, everyDays: 3, prefersLongShift: true },
  { name: 'lapsed, weekly', activeMin: 15, everyDays: 7, prefersLongShift: true },
];

function reopen(s: GameState, prefersLong: boolean): void {
  if (isOpen(s)) return;
  const affordable = data.shifts
    .filter((sh) => sh.unlockLevel <= s.player.level)
    .filter((sh) => s.player.coins >= sh.baseCost * 2);
  const pick = prefersLong ? affordable[affordable.length - 1] : affordable[0];
  if (pick) execute(data, s, { type: 'START_SHIFT', shiftId: pick.id });
}

/**
 * Spend surplus the way a player who is trying to win would.
 *
 * The first version of this only built rooms and hired staff, which left every
 * profile stuck at two stars for 180 days. That looked like a broken rating
 * until you notice the simulated player was never buying the two things the
 * rating actually measures — decor and amenity breadth. A harness that plays
 * badly cannot tell you whether a game is beatable.
 */
function reinvest(s: GameState): void {
  // 1. Breadth first: one amenity per distinct desire is worth more to the
  //    rating than a second copy of one you already have.
  const covered = new Set<string>();
  for (const r of s.hotel.rooms) {
    const d = data.rooms.find((x) => x.id === r.defId);
    if (d && d.category === 'commercial') covered.add(d.desireTag);
  }
  for (const def of data.rooms) {
    if (def.category !== 'commercial' || def.unlockLevel > s.player.level) continue;
    if (covered.has(def.desireTag)) continue;
    if (s.player.coins < def.cost.amount * 3) continue;
    if (execute(data, s, { type: 'BUILD_ROOM', defId: def.id }).ok) covered.add(def.desireTag);
  }

  // 2. Rooms, so there is somewhere to put guests.
  for (let i = 0; i < 3; i++) {
    const room = data.rooms
      .filter((r) => r.unlockLevel <= s.player.level && r.category === 'guest')
      .filter((r) => s.player.coins > r.cost.amount * 4)
      .sort((a, b) => b.cost.amount - a.cost.amount)[0];
    if (!room) break;
    if (!execute(data, s, { type: 'BUILD_ROOM', defId: room.id }).ok) break;
  }

  // 3. Staff every post, or half the rooms do nothing.
  for (const r of s.hotel.rooms) {
    const def = data.rooms.find((d) => d.id === r.defId);
    if (def && 'staffRole' in def && def.staffSlots > 0 && !r.staffId && def.staffRole) {
      execute(data, s, { type: 'HIRE_STAFF', roomId: r.id, roleId: def.staffRole });
    }
  }

  // 4. Decorate, with variety, because repeats have diminishing returns and
  //    four distinct categories is what the quality model rewards.
  for (const room of s.hotel.rooms) {
    const def = data.rooms.find((d) => d.id === room.defId);
    if (!def || def.decorSlots === 0) continue;
    const kinds = new Set(room.decor.map((p) => data.decor.find((x) => x.id === p.defId)?.category));
    for (const id of catalogueFor(data, room.defId)) {
      const item = data.decor.find((x) => x.id === id)!;
      if (room.decor.length >= Math.min(6, def.decorSlots)) break;
      if (item.unlockLevel > s.player.level || item.cost.currency !== 'coins') continue;
      if (kinds.has(item.category)) continue;
      if (s.player.coins < item.cost.amount * 6) continue;
      if (room.decor.some((p) => p.defId === id)) continue;
      const slot = catalogueIndex(data, room.defId, id);
      if (execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: item.id, slot }).ok) {
        kinds.add(item.category);
      }
    }
  }
}

function run(p: Profile, days: number): GameState {
  const s = createInitialState(data, { seed: 90210, epochMs: NEUTRAL });
  for (let day = 0; day < days; day++) {
    const visiting = day % p.everyDays === 0;
    if (visiting) {
      execute(data, s, { type: 'CLAIM_GIFT', epochMs: s.epochMs });
      reopen(s, p.prefersLongShift);
      reinvest(s);
      advance(data, s, p.activeMin * 60 * TPS);
      const rest = DAY - p.activeMin * 60_000;
      if (rest > 0) resolveOffline(data, s, rest);
    } else {
      resolveOffline(data, s, DAY);
    }
  }
  return s;
}

const line = '─'.repeat(94);
console.log(line);
console.log('  Hotel City Tycoon — long-horizon balance');
console.log(`  neutral date ${new Date(NEUTRAL).toISOString().slice(0, 10)} · seed 90210`);
console.log(line);
console.log('profile                 day |    coins |    level | stars |  operating |        net | reward share');
for (const p of PROFILES) {
  for (const days of [1, 7, 30, 90, 180]) {
    const s = run(p, days);
    const op = operatingProfit(s);
    const net = netProfit(s);
    let rewards = 0;
    for (const [k, v] of Object.entries(s.ledger)) if (!OPERATING.has(k as never) && v > 0) rewards += v;
    let sources = 0;
    for (const v of Object.values(s.ledger)) if (v > 0) sources += v;
    const share = sources === 0 ? 0 : rewards / sources;
    console.log(
      `${p.name.padEnd(22)} ${String(days).padStart(4)} | ${String(Math.round(s.player.coins)).padStart(8)}`
      + ` | ${String(s.player.level).padStart(8)} | ${String(computeStars(data, s)).padStart(5)}`
      + ` | ${String(Math.round(op)).padStart(10)} | ${String(Math.round(net)).padStart(10)}`
      + ` | ${(share * 100).toFixed(0).padStart(11)}%`);
  }
  console.log('');
}

// One profile's full ledger, so the categories are visible rather than summed.
const detail = run(PROFILES[1]!, 30);
console.log(line);
console.log('  sources and sinks — 10 min/day, 30 days');
console.log(line);
for (const [k, v] of Object.entries(detail.ledger).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(20)} ${String(Math.round(v)).padStart(12)}  ${OPERATING.has(k as never) ? 'operating' : ''}`);
}
console.log(line);
