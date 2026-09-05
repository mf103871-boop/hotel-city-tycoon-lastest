/**
 * What is new when the player opens the game.
 *
 * Everything measured so far has been either the first twenty minutes or a
 * curve over months. Nobody asked the question in between: somebody opens this
 * on day twelve — what changed since day eleven?
 *
 * That is the retention question, and a day with nothing new is a day the
 * player has no reason to have opened it. The original game answered this with
 * a weekly shop, seasonal events and a level curve that kept handing things
 * over. Whether this one does is measurable rather than a matter of taste.
 *
 * Run: node --experimental-strip-types tools/balance-sim/sessions.ts
 */
import { loadSimData } from './load-data.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { execute } from '../../src/core/commands/index.ts';
import { advance } from '../../src/core/sim/tick.ts';
import { objectiveProgress } from '../../src/core/systems/objectives.ts';
import { shopOffers, shopPeriod, activeSeason, giftState } from '../../src/core/systems/liveops.ts';
import { nextTier } from '../../src/core/systems/upgrades.ts';
import { isOpen, totalShiftCost } from '../../src/core/systems/economy.ts';
import type { GameState } from '../../src/core/state/types.ts';
import type { SimData } from '../../src/core/data-source.ts';
import { catalogueFor, catalogueIndex } from '../../src/core/data-source.ts';

const data = loadSimData();
const TPS = data.economy.simulation.ticksPerSecond;
const DAY = 86_400_000;
/**
 * Twenty-one days by default.
 *
 * Long enough to cover the first three weeks — the window a player either
 * settles into or stops opening — and short enough to run inside a check. A
 * longer horizon is available with DAYS=, but simulating months of a growing
 * hotel minute by minute is expensive and the aggregate curve already covers
 * that ground.
 */
const DAYS = Number(process.env['DAYS'] ?? 21);
/** A session is what somebody does in ten minutes, once a day. */
const SESSION_MIN = 10;

interface Session {
  day: number;
  level: number;
  news: string[];
  /** Objectives claimed by the end of this session. */
  claimed: number;
}

/** Everything that changed since the player last looked. */
function whatIsNew(
  d: SimData,
  s: GameState,
  epochMs: number,
  seen: { level: number; period: number; season: string | null; upgrades: Set<string> },
): string[] {
  const news: string[] = [];

  if (s.player.level > seen.level) {
    const unlocked = d.levels
      .filter((l) => l.level > seen.level && l.level <= s.player.level)
      .flatMap((l) => l.unlocks ?? []);
    news.push(unlocked.length > 0
      ? `level ${s.player.level}: ${unlocked.map((u) => u.id).join(', ')}`
      : `level ${s.player.level}`);
  }

  const period = shopPeriod(d, epochMs);
  if (period !== seen.period) {
    const affordable = shopOffers(d, s, epochMs)
      .filter((o) => o.currency === 'coins' && o.price <= s.player.coins).length;
    if (affordable > 0) news.push(`shop refreshed (${affordable} affordable)`);
  }

  const season = activeSeason(d, epochMs);
  if ((season?.id ?? null) !== seen.season && season) news.push(`${season.id} began`);

  const objective = d.objectives.find((o) => !s.completedObjectives.includes(o.id));
  if (objective && objectiveProgress(d, s, objective.check) >= 1) {
    news.push(`objective ready: ${objective.id}`);
  }

  for (const upgrade of d.upgrades) {
    if (upgrade.unlockLevel > s.player.level || seen.upgrades.has(upgrade.id)) continue;
    const tier = nextTier(d, s, upgrade.id);
    if (tier && tier.cost <= s.player.coins) {
      news.push(`can afford ${upgrade.id}`);
      seen.upgrades.add(upgrade.id);
    }
  }

  if (giftState(d, s, epochMs).available) news.push('daily gift');

  return news;
}

/** Ten minutes of an ordinary player: claim, open, decorate, build. */
function playSession(s: GameState, epochMs: number): void {
  s.epochMs = epochMs;
  execute(data, s, { type: 'CLAIM_GIFT', epochMs });

  const objective = data.objectives.find((o) => !s.completedObjectives.includes(o.id));
  if (objective && objectiveProgress(data, s, objective.check) >= 1) {
    execute(data, s, { type: 'CLAIM_OBJECTIVE', objectiveId: objective.id });
  }

  // Spend on the hotel first, then open the longest shift the remaining money
  // buys. A player who opens once a day wants the doors open while they are
  // gone; opening the cheapest shift means the hotel sits shut for twenty-two
  // hours, which is not how anyone plays.
  for (let act = 0; act < 6; act++) {
    // Land first. Somebody who cannot fit another room goes looking for
    // space — it is the first thing they do, not the third. An earlier order
    // put expansion behind decorating, so the plot filled at eleven rooms and
    // the player spent seven weeks redecorating the same ones.
    const plot = [...data.plots]
      .filter((p) => p.unlockLevel <= s.player.level && p.cost <= s.player.coins * 0.6)
      .sort((a, b) => b.blocks - a.blocks)[0];
    if (plot && execute(data, s, { type: 'EXPAND_PLOT', plotId: plot.id }).ok) continue;

    const buildable = data.rooms
      .filter((r) => r.unlockLevel <= s.player.level && r.cost.currency === 'coins'
        && r.cost.amount <= s.player.coins * 0.4)
      .sort((a, b) => b.cost.amount - a.cost.amount)[0];
    if (buildable && execute(data, s, { type: 'BUILD_ROOM', defId: buildable.id }).ok) continue;

    const room = s.hotel.rooms.find((r) => {
      const def = data.rooms.find((x) => x.id === r.defId);
      return def ? r.decor.length < def.decorSlots && def.decorSlots > 0 : false;
    });
    const item = room ? catalogueFor(data, room.defId)
      .map((id) => data.decor.find((x) => x.id === id)!)
      .filter((x) => x.unlockLevel <= s.player.level && x.cost.currency === 'coins'
        && x.cost.amount <= s.player.coins * 0.25
        && !room.decor.some((p) => p.defId === x.id))
      .sort((a, b) => b.decorPoints - a.decorPoints)[0] : undefined;
    if (room && item) {
      execute(data, s, {
        type: 'PLACE_DECOR', roomId: room.id, defId: item.id, slot: catalogueIndex(data, room.defId, item.id),
      });
      continue;
    }
    break;
  }

  if (!isOpen(s)) {
    const shift = [...data.shifts]
      .filter((sh) => sh.unlockLevel <= s.player.level && totalShiftCost(data, s, sh.id) <= s.player.coins)
      .sort((a, b) => b.durationSec - a.durationSec)[0];
    if (shift) execute(data, s, { type: 'START_SHIFT', shiftId: shift.id });
  }

  advance(data, s, SESSION_MIN * 60 * TPS);
}

// ---------------------------------------------------------------- run
const START = Date.UTC(2026, 4, 4);
const state = createInitialState(data, { seed: 31415, epochMs: START });
const seen = { level: 0, period: -1, season: null as string | null, upgrades: new Set<string>() };
const sessions: Session[] = [];

for (let day = 0; day < DAYS; day++) {
  const now = START + day * DAY;
  state.epochMs = now;
  const news = whatIsNew(data, state, now, seen);
  sessions.push({ day: day + 1, level: state.player.level, news, claimed: 0 });

  seen.level = state.player.level;
  seen.period = shopPeriod(data, now);
  seen.season = activeSeason(data, now)?.id ?? null;

  playSession(state, now);
  // Record what the session actually achieved, not the state it began in.
  sessions[sessions.length - 1]!.claimed = state.completedObjectives.length;
  // The rest of the day passes without them.
  advance(data, state, (24 * 3600 - SESSION_MIN * 60) * TPS);
}

const line = '─'.repeat(78);
console.log(line);
console.log(`  Hotel City Tycoon — what is new each day, over ${DAYS} days`);
console.log(line);
for (const s of sessions) {
  const news = s.news.length === 0 ? '— nothing new —' : s.news.join(' · ');
  if (s.day <= 21 || s.news.length === 0 || s.day % 7 === 0) {
    console.log(`  day ${String(s.day).padStart(3)}  lv ${String(s.level).padStart(2)}  ${news}`);
  }
}

console.log(line);
/**
 * The daily gift fires every day by definition, so counting it made this
 * measure always pass while the player sat at the same level for seven weeks.
 * A timer paying out is not the game moving.
 */
const substantial = (s: Session) => s.news.filter((n) => n !== 'daily gift');

const empty = sessions.filter((s) => substantial(s).length === 0);
const longestGap = (() => {
  let worst = 0;
  let run = 0;
  for (const s of sessions) {
    run = substantial(s).length === 0 ? run + 1 : 0;
    if (run > worst) worst = run;
  }
  return worst;
})();

console.log(`  days with only the gift  ${empty.length} of ${DAYS}`);
console.log(`  longest empty run        ${longestGap} day(s)`);
console.log(`  level reached            ${state.player.level}`);
console.log(`  objectives claimed       ${state.completedObjectives.length}/${data.objectives.length}`);
console.log(line);

const problems: string[] = [];
if (longestGap > 5) {
  problems.push(`${longestGap} days running with nothing but the gift — that is where a player stops opening it`);
}
if (empty.length > DAYS * 0.5) {
  problems.push(`${empty.length} of ${DAYS} days offered nothing but the daily gift`);
}
if (sessions.slice(0, 7).some((s) => substantial(s).length === 0)) {
  problems.push('a day inside the first week with nothing but the gift');
}
// A player who stops levelling has stopped progressing, whatever else appears.
const half = sessions[Math.floor(sessions.length / 2)]!;
if (state.player.level - half.level < 2) {
  problems.push(`level ${half.level} at the halfway mark and ${state.player.level} at the end — progression stalled`);
}

if (problems.length === 0) console.log('  ✓ every stretch gives the player a reason to come back');
else for (const p of problems) console.log(`  ! ${p}`);
console.log(line);
process.exit(problems.length ? 1 : 0);
