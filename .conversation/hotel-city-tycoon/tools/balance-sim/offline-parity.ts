/**
 * Measures the closed-form resolver against the tick loop.
 *
 * Run after any change to arrivals, room capacity or reception, then set
 * `economy.simulation.analyticThroughputFactor` to 1 / (undiscounted mean).
 * That number corrects a modelling error and is measured; `offlineEfficiency`
 * next to it is a design choice and is not.
 *
 *   node --experimental-strip-types tools/balance-sim/offline-parity.ts
 */
import { loadSimData } from './load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { execute } from '../../src/core/commands/index.ts';
import { advance } from '../../src/core/sim/tick.ts';
import { resolveOffline } from '../../src/core/sim/offline.ts';
import type { GameState } from '../../src/core/state/types.ts';

const data = loadSimData();
const TPS = data.economy.simulation.ticksPerSecond;
const eff = data.economy.simulation.offlineEfficiency * data.economy.simulation.analyticThroughputFactor;

function build(rooms: number, level: number, seed: number): GameState {
  const s = createInitialState(data, { seed, epochMs: 1_700_000_000_000 });
  s.player.coins += 500_000_000; s.player.level = level;
  for (const p of data.plots) if (p.unlockLevel <= level) execute(data, s, { type: 'EXPAND_PLOT', plotId: p.id });
  for (let i = 0; i < rooms; i++) execute(data, s, { type: 'BUILD_ROOM', defId: 'economy' });
  for (const r of s.hotel.rooms) r.cleanliness = 1;
  // The longest shift this level has actually unlocked.
  const shift = [...data.shifts].filter((sh) => sh.unlockLevel <= level).pop();
  const r = execute(data, s, { type: 'START_SHIFT', shiftId: shift!.id });
  if (!r.ok) throw new Error(`could not open ${shift!.id} at level ${level}: ${r.reason}`);
  return s;
}

console.log('rooms lvl  hours | live served  away served | ratio | undiscounted');
const rows: number[] = [];
const coinRows: number[] = [];
for (const [rooms, level] of [[0, 1], [2, 5], [6, 15], [12, 25], [20, 35]] as const) {
  for (const hours of [1, 4]) {
    const live = build(rooms, level, 4242);
    advance(data, live, hours * 3600 * TPS);
    const away = build(rooms, level, 4242);
    resolveOffline(data, away, hours * 3600 * 1000);
    const l = live.stats.guestsServed, a = away.stats.guestsServed;
    const lc = live.stats.coinsEarned, ac = away.stats.coinsEarned;
    const ratio = l === 0 ? 0 : a / l;
    const cratio = lc === 0 ? 0 : ac / lc;
    rows.push(ratio / eff);
    coinRows.push(cratio / eff);
    console.log(`${String(rooms).padStart(5)} ${String(level).padStart(3)} ${String(hours).padStart(6)} | ${String(l).padStart(6)} ${String(a).padStart(6)} | ${ratio.toFixed(3)} | ${(ratio/eff).toFixed(3)} | coins ${(cratio/eff).toFixed(3)}`);
  }
}
const mean = rows.reduce((x, y) => x + y, 0) / rows.length;
const min = Math.min(...rows), max = Math.max(...rows);
console.log(`\nundiscounted mean ${mean.toFixed(3)}  range ${min.toFixed(3)}..${max.toFixed(3)}`);
console.log(`analytic correction needed: ${(1 / mean).toFixed(3)}`);
const cm = coinRows.reduce((x, y) => x + y, 0) / coinRows.length;
console.log(`coins undiscounted mean ${cm.toFixed(3)}  range ${Math.min(...coinRows).toFixed(3)}..${Math.max(...coinRows).toFixed(3)}`);
