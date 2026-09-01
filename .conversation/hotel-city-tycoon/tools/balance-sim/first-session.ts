/**
 * What the first twenty minutes actually feel like.
 *
 * Every measurement so far has been aggregate — day 1, day 30, day 120 — and
 * the document's first listed risk is that the player gets bored and stops.
 * An aggregate curve cannot see boredom. It happens in the minutes where there
 * is nothing to do and nothing to watch, and nobody has looked at those.
 *
 * This walks the opening session minute by minute and reports what a player
 * could do, what they could afford, and how long they spent with neither.
 *
 * Run: node --experimental-strip-types tools/balance-sim/first-session.ts
 */
import { loadSimData } from './load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { execute } from '../../src/core/commands/index.ts';
import { advance } from '../../src/core/sim/tick.ts';
import { isOpen, totalShiftCost } from '../../src/core/systems/economy.ts';
import { objectiveProgress } from '../../src/core/systems/objectives.ts';
import type { GameState } from '../../src/core/state/types.ts';
import type { SimData } from '../../src/core/data-source.ts';

const data = loadSimData();
const TPS = data.economy.simulation.ticksPerSecond;
const MINUTES = Number(process.env['MINUTES'] ?? 20);

interface Minute {
  minute: number;
  coins: number;
  guests: number;
  served: number;
  /** Things the player could tap right now that would change something. */
  actions: string[];
  objective: string;
  objectivePct: number;
}

/** What a player could actually do at this instant. */
function availableActions(d: SimData, s: GameState): string[] {
  const out: string[] = [];

  if (!isOpen(s)) {
    const affordable = d.shifts.filter(
      (sh) => sh.unlockLevel <= s.player.level && totalShiftCost(d, s, sh.id) <= s.player.coins,
    );
    if (affordable.length > 0) out.push('open the hotel');
  }

  const buildable = d.rooms.filter((r) => {
    if (r.unlockLevel > s.player.level) return false;
    if (r.cost.currency !== 'coins' || r.cost.amount > s.player.coins) return false;
    return true;
  });
  if (buildable.length > 0) out.push(`build (${buildable.length} affordable)`);

  const decorable = d.decor.filter(
    (item) => item.unlockLevel <= s.player.level
      && item.cost.currency === 'coins' && item.cost.amount <= s.player.coins,
  );
  const hasFreeSlot = s.hotel.rooms.some((room) => {
    const def = d.rooms.find((r) => r.id === room.defId);
    return def ? room.decor.length < def.decorSlots : false;
  });
  if (decorable.length > 0 && hasFreeSlot) out.push(`decorate (${decorable.length} affordable)`);

  if (s.guests.some((g) => g.state === 'leaving' || g.state === 'arriving')) out.push('rescue a guest');
  if (s.guests.some((g) => g.state === 'staying')) out.push('check a sleeping guest');
  if (s.hotel.rooms.some((r) => r.hasPest || r.hasFire)) out.push('clear a hazard');

  const claimable = objectiveProgress(data, s, d.objectives.find(
    (o) => !s.completedObjectives.includes(o.id))?.check ?? { kind: 'none' });
  if (claimable >= 1) out.push('claim an objective');

  return out;
}

function currentObjective(d: SimData, s: GameState): { key: string; pct: number } {
  const next = d.objectives.find((o) => !s.completedObjectives.includes(o.id));
  if (!next) return { key: 'all done', pct: 1 };
  return { key: next.id, pct: objectiveProgress(d, s, next.check) };
}

/**
 * An unhurried but engaged player.
 *
 * Acts roughly every ninety seconds rather than optimally every tick: a
 * simulation that plays perfectly measures a different game than the one
 * anybody opens.
 */
function play(state: GameState, minute: number): void {
  if (minute % 2 !== 0) return;

  const objective = data.objectives.find((o) => !state.completedObjectives.includes(o.id));
  if (objective && objectiveProgress(data, state, objective.check) >= 1) {
    execute(data, state, { type: 'CLAIM_OBJECTIVE', objectiveId: objective.id });
  }

  if (!isOpen(state)) {
    const shift = data.shifts.find(
      (sh) => sh.unlockLevel <= state.player.level && totalShiftCost(data, state, sh.id) <= state.player.coins,
    );
    if (shift) execute(data, state, { type: 'START_SHIFT', shiftId: shift.id });
  }

  // Decorate before building: filling a meter earns more than another bare room.
  const room = state.hotel.rooms.find((r) => {
    const def = data.rooms.find((x) => x.id === r.defId);
    return def ? r.decor.length < def.decorSlots && def.decorSlots > 0 : false;
  });
  if (room) {
    const item = [...data.decor]
      .filter((d) => d.unlockLevel <= state.player.level && d.cost.currency === 'coins'
        && d.cost.amount <= state.player.coins * 0.4)
      .sort((a, b) => b.decorPoints - a.decorPoints)[0];
    if (item) {
      execute(data, state, { type: 'PLACE_DECOR', roomId: room.id, defId: item.id, slot: room.decor.length });
      return;
    }
  }

  const affordable = data.rooms
    .filter((r) => r.unlockLevel <= state.player.level && r.cost.currency === 'coins'
      && r.cost.amount <= state.player.coins * 0.5)
    .sort((a, b) => b.cost.amount - a.cost.amount)[0];
  if (affordable) execute(data, state, { type: 'BUILD_ROOM', defId: affordable.id });
}

// ---------------------------------------------------------------- run
const state = createInitialState(data, { seed: 90210, epochMs: Date.UTC(2026, 4, 12) });
const rows: Minute[] = [];

for (let minute = 0; minute <= MINUTES; minute++) {
  const objective = currentObjective(data, state);
  rows.push({
    minute,
    coins: state.player.coins,
    guests: state.guests.length,
    served: state.stats.guestsServed,
    actions: availableActions(data, state),
    objective: objective.key,
    objectivePct: objective.pct,
  });
  play(state, minute);
  advance(data, state, 60 * TPS);
}

const line = '─'.repeat(78);
console.log(line);
console.log(`  Hotel City Tycoon — the first ${MINUTES} minutes`);
console.log(line);
console.log('  min   coins    guests  served   objective            what the player can do');
for (const r of rows) {
  const actions = r.actions.length === 0 ? '— nothing —' : r.actions.join(', ');
  console.log(
    `  ${String(r.minute).padStart(3)}  ${String(r.coins).padStart(8)}` +
    `  ${String(r.guests).padStart(6)}  ${String(r.served).padStart(6)}` +
    `   ${(`${r.objective} ${Math.round(r.objectivePct * 100)}%`).padEnd(20)} ${actions}`,
  );
}

console.log(line);
const problems: string[] = [];

// Dead time: a minute with nothing to do and nobody to watch.
const dead = rows.filter((r) => r.actions.length === 0 && r.guests === 0);
if (dead.length > 0) {
  problems.push(`${dead.length} minute(s) with nothing to do and nobody on screen: ${dead.map((d) => d.minute).join(', ')}`);
}

// The opening minute matters most: a player who arrives to nothing leaves.
if (rows[0]!.actions.length === 0) problems.push('minute zero offers no action at all');

// Somebody has to turn up early, or the hotel is a diorama.
const firstGuest = rows.find((r) => r.guests > 0)?.minute;
if (firstGuest === undefined) problems.push(`no guest arrived within ${MINUTES} minutes`);
else if (firstGuest > 3) problems.push(`the first guest took ${firstGuest} minutes to appear`);

// And somebody has to pay, or nothing the player did seemed to matter.
const firstPaid = rows.find((r) => r.served > 0)?.minute;
if (firstPaid === undefined) problems.push(`nobody checked out within ${MINUTES} minutes — no payoff in the whole first session`);
else if (firstPaid > 10) problems.push(`the first payment took ${firstPaid} minutes`);

// An objective should complete in a first sitting, or the guidance never pays off.
const claimed = state.completedObjectives.length;
if (claimed === 0) problems.push('not one objective was completed in the whole session');

console.log(`  first guest        minute ${firstGuest ?? '—'}`);
console.log(`  first payment      minute ${firstPaid ?? '—'}`);
console.log(`  objectives done    ${claimed}`);
console.log(`  rooms built        ${state.hotel.rooms.length}`);
console.log(`  coins at the end   ${state.player.coins.toLocaleString()}`);
console.log(line);
if (problems.length === 0) console.log('  ✓ the opening session holds up');
else for (const p of problems) console.log(`  ! ${p}`);
console.log(line);
process.exit(problems.length ? 1 : 0);
