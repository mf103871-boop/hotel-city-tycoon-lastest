/**
 * The economy, measured.
 *
 * Runs several kinds of player over D1, D7, D30, D90 and D180 and reports where
 * every coin came from and where it went. Until this existed the only economic
 * evidence was a single-session sim, so "does the money work" was a question
 * nobody could answer with a number.
 *
 * Two things it does deliberately:
 *
 *   - It starts on a NEUTRAL DATE. `epochMs = 0` is 1 January 1970, which
 *     switches on the New Year season and its income multiplier, so every
 *     earlier measurement of this game was quietly taken during a festival.
 *   - It separates OPERATING PROFIT — what the hotel earns by being a hotel —
 *     from REWARDS. A game whose rewards dwarf its operating profit is not a
 *     tycoon game, and the split is the only way to see that happening.
 *
 *   node --experimental-strip-types tools/balance-sim/economy.ts
 */
import { loadSimData } from './load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { execute } from '../../src/core/commands/index.ts';
import { advance } from '../../src/core/sim/tick.ts';
import { resolveOffline } from '../../src/core/sim/offline.ts';
import { isOpen, totalShiftCost } from '../../src/core/systems/economy.ts';
import { computeStars } from '../../src/core/systems/stars.ts';
import type { GameState, SimEvent } from '../../src/core/state/types.ts';

const data = loadSimData();
const TPS = data.economy.simulation.ticksPerSecond;
const DAY_MS = 86_400_000;

/**
 * A Tuesday in March, deliberately far from every seasonal window.
 * 2024-03-12T09:00:00Z.
 */
const NEUTRAL_EPOCH = 1_710_234_000_000;

// ---------------------------------------------------------------- ledger

const SOURCES = ['rooms', 'amenities', 'offline', 'gifts', 'objectives', 'hazards', 'neighbours'] as const;
const SINKS = ['shifts', 'building', 'decor', 'upgrades', 'shop', 'repairs', 'plots'] as const;
type Source = (typeof SOURCES)[number];
type Sink = (typeof SINKS)[number];

interface Ledger {
  source: Record<Source, number>;
  sink: Record<Sink, number>;
}

function emptyLedger(): Ledger {
  const source = Object.fromEntries(SOURCES.map((k) => [k, 0])) as Record<Source, number>;
  const sink = Object.fromEntries(SINKS.map((k) => [k, 0])) as Record<Sink, number>;
  return { source, sink };
}

/** Revenue the hotel earned by being a hotel. */
function operatingRevenue(l: Ledger): number {
  return l.source.rooms + l.source.amenities + l.source.offline;
}

/** Everything it cost to run, excluding capital spending on new rooms. */
function operatingCost(l: Ledger): number {
  return l.sink.shifts + l.sink.repairs;
}

function rewards(l: Ledger): number {
  return l.source.gifts + l.source.objectives + l.source.hazards + l.source.neighbours;
}

function record(l: Ledger, events: SimEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'guestCheckedOut': l.source.rooms += e.coins; break;
      case 'offlineResolved': l.source.offline += e.coins; break;
      case 'starBonusPaid': l.source.gifts += e.coins; break;
      case 'hazardCleared': l.source.hazards += e.coins; break;
      case 'neighbourVisited': l.source.neighbours += e.coins; break;
      default: break;
    }
  }
}

// ---------------------------------------------------------------- players

interface Profile {
  name: string;
  /** Minutes of active play per day. */
  minutesPerDay: number;
  /** How many days between visits. 1 is daily. */
  visitEveryDays: number;
  /** Does this player reinvest well? */
  optimal: boolean;
}

const PROFILES: Profile[] = [
  { name: '2 min/day', minutesPerDay: 2, visitEveryDays: 1, optimal: false },
  { name: '10 min/day', minutesPerDay: 10, visitEveryDays: 1, optimal: false },
  { name: '20 min/day', minutesPerDay: 20, visitEveryDays: 1, optimal: false },
  { name: 'optimal 20m', minutesPerDay: 20, visitEveryDays: 1, optimal: true },
  { name: 'every 3 days', minutesPerDay: 15, visitEveryDays: 3, optimal: false },
  { name: 'weekly', minutesPerDay: 30, visitEveryDays: 7, optimal: false },
];

/**
 * The one objective the card shows: mirrors bridge/objectives.currentObjective
 * without importing the bridge (which needs its selectors initialised).
 */
const GROUP_ORDER: Record<string, number> = { tutorial: 0, milestone: 1, goal: 2 };
function currentObjective(state: GameState) {
  const claimed = new Set(state.completedObjectives);
  let best: (typeof data.objectives)[number] | null = null;
  for (const def of data.objectives) {
    if (claimed.has(def.id)) continue;
    if (!best || (GROUP_ORDER[def.group] ?? 9) < (GROUP_ORDER[best.group] ?? 9)) best = def;
  }
  return best;
}

/** The longest shift this player has unlocked; the dominant choice today. */
function bestShift(state: GameState): string {
  const unlocked = data.shifts.filter((s) => s.unlockLevel <= state.player.level);
  return (unlocked[unlocked.length - 1] ?? data.shifts[0]!).id;
}

/** Spend on the best thing available, cheapest first so nothing is skipped. */
function reinvest(state: GameState, l: Ledger, aggressive: boolean): void {
  for (let guard = 0; guard < 40; guard++) {
    const before = state.player.coins;

    // A room is the compounding purchase; always the first choice.
    const room = [...data.rooms]
      .filter((r) => r.category === 'guest' && r.unlockLevel <= state.player.level)
      .sort((a, b) => b.cost.amount - a.cost.amount)
      .find((r) => r.cost.amount <= state.player.coins * (aggressive ? 1 : 0.6));
    if (room && execute(state ? data : data, state, { type: 'BUILD_ROOM', defId: room.id }).ok) {
      l.sink.building += before - state.player.coins;
      continue;
    }

    if (aggressive) {
      const target = state.hotel.rooms.find((r) => r.decor.length < 4);
      const piece = [...data.decor]
        .filter((d) => d.unlockLevel <= state.player.level && d.cost.currency === 'coins')
        .sort((a, b) => b.decorPoints / b.cost.amount - a.decorPoints / a.cost.amount)
        .find((d) => d.cost.amount <= state.player.coins * 0.3);
      if (target && piece) {
        const slot = target.decor.length;
        if (execute(data, state, { type: 'PLACE_DECOR', roomId: target.id, defId: piece.id, slot }).ok) {
          l.sink.decor += before - state.player.coins;
          continue;
        }
      }
    }
    break;
  }
}

function runProfile(p: Profile, days: number): {
  ledger: Ledger; state: GameState; levelAt: Record<number, number>; starAt: Record<number, number>;
} {
  const state = createInitialState(data, { seed: 90210, epochMs: NEUTRAL_EPOCH });
  const l = emptyLedger();
  const levelAt: Record<number, number> = {};
  const starAt: Record<number, number> = {};

  for (let day = 0; day < days; day++) {
    const at = NEUTRAL_EPOCH + day * DAY_MS;
    const visiting = day % p.visitEveryDays === 0;

    if (visiting) {
      // The gift, which is the reason to open the app at all.
      const before = state.player.coins;
      const gift = execute(data, state, { type: 'CLAIM_GIFT', epochMs: at });
      if (gift.ok) record(l, gift.events);
      else void before;

      // Objectives, claimed the way the interface allows. The card shows ONE
      // objective — tutorials, then milestones, then goals, author order
      // within a group — and only its claim button exists. This loop used to
      // try every objective in the file, which let it collect `spotless`
      // (190,000 coins, trivially satisfied by a fresh hotel's cleanliness)
      // on day one — money no real player can reach that way. That single
      // claim is why this simulator reported ~183,000 coins at D1 while
      // horizon.ts, which claims nothing, reported ~12,000.
      for (let chain = 0; chain < data.objectives.length; chain++) {
        const current = currentObjective(state);
        if (!current) break;
        const c = execute(data, state, { type: 'CLAIM_OBJECTIVE', objectiveId: current.id });
        if (!c.ok) break;
        l.source.objectives += current.rewardCoins;
      }

      reinvest(state, l, p.optimal);

      if (!isOpen(state)) {
        const shiftId = bestShift(state);
        const cost = totalShiftCost(data, state, shiftId);
        const r = execute(data, state, { type: 'START_SHIFT', shiftId });
        if (r.ok) l.sink.shifts += cost;
      }

      // Active play.
      const active = advance(data, state, p.minutesPerDay * 60 * TPS);
      record(l, active.events);
    }

    // The rest of the day passes with the app shut.
    const idleMs = DAY_MS - (visiting ? p.minutesPerDay * 60_000 : 0);
    const off = resolveOffline(data, state, idleMs);
    record(l, off.events);

    if (!(state.player.level in levelAt)) levelAt[state.player.level] = day + 1;
    const stars = computeStars(data, state);
    if (!(stars in starAt)) starAt[stars] = day + 1;
  }
  return { ledger: l, state, levelAt, starAt };
}

// ---------------------------------------------------------------- report

const line = '─'.repeat(78);
console.log(line);
console.log('  Hotel City Tycoon — economy over time');
console.log(`  neutral start date: ${new Date(NEUTRAL_EPOCH).toISOString().slice(0, 10)}`);
console.log(line);

const HORIZONS = [1, 7, 30, 90, 180];

console.log('\nCOINS HELD, by player and day');
console.log('profile        ' + HORIZONS.map((d) => `D${d}`.padStart(12)).join(''));
for (const p of PROFILES) {
  const cells = HORIZONS.map((d) => {
    const { state } = runProfile(p, d);
    return Math.round(state.player.coins).toLocaleString().padStart(12);
  });
  console.log(p.name.padEnd(15) + cells.join(''));
}

console.log('\nLEVEL and STARS reached');
console.log('profile        ' + HORIZONS.map((d) => `D${d}`.padStart(12)).join(''));
for (const p of PROFILES) {
  const cells = HORIZONS.map((d) => {
    const { state } = runProfile(p, d);
    return `L${state.player.level}/${computeStars(data, state)}★`.padStart(12);
  });
  console.log(p.name.padEnd(15) + cells.join(''));
}

console.log('\nSOURCES and SINKS at D30, and D180 (optimal 20m)');
for (const days of [30, 180]) {
  const { ledger } = runProfile(PROFILES[3]!, days);
  const opRev = operatingRevenue(ledger);
  const opCost = operatingCost(ledger);
  const rew = rewards(ledger);
  console.log(`\n  --- D${days} ---`);
  for (const k of SOURCES) if (ledger.source[k] !== 0) {
    console.log(`   + ${k.padEnd(12)} ${Math.round(ledger.source[k]).toLocaleString().padStart(14)}`);
  }
  for (const k of SINKS) if (ledger.sink[k] !== 0) {
    console.log(`   - ${k.padEnd(12)} ${Math.round(ledger.sink[k]).toLocaleString().padStart(14)}`);
  }
  console.log(`   OperatingProfit  ${Math.round(opRev - opCost).toLocaleString().padStart(14)}`);
  console.log(`   Rewards          ${Math.round(rew).toLocaleString().padStart(14)}`);
  const share = opRev + rew === 0 ? 0 : rew / (opRev + rew);
  console.log(`   rewards are ${(share * 100).toFixed(1)}% of all income`);
}

console.log('\nSHIFT COMPARISON at D30 (10 min/day), coins held');
for (const shift of data.shifts) {
  const state = createInitialState(data, { seed: 90210, epochMs: NEUTRAL_EPOCH });
  state.player.level = 30;
  const l = emptyLedger();
  for (let day = 0; day < 30; day++) {
    const at = NEUTRAL_EPOCH + day * DAY_MS;
    const g = execute(data, state, { type: 'CLAIM_GIFT', epochMs: at });
    if (g.ok) record(l, g.events);
    if (!isOpen(state)) {
      const cost = totalShiftCost(data, state, shift.id);
      if (execute(data, state, { type: 'START_SHIFT', shiftId: shift.id }).ok) l.sink.shifts += cost;
    }
    record(l, advance(data, state, 10 * 60 * TPS).events);
    record(l, resolveOffline(data, state, DAY_MS - 600_000).events);
  }
  const perHour = shift.baseCost / (shift.durationSec / 3600);
  console.log(`  ${shift.id.padEnd(10)} ${Math.round(state.player.coins).toLocaleString().padStart(14)}`
    + `   base/hour ${perHour.toFixed(1).padStart(7)}   opens/month ${Math.round(30 * 86400 / shift.durationSec)}`);
}

console.log(`\n${line}`);
