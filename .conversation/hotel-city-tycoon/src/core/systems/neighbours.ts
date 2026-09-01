/**
 * Rival hotels in the city.
 *
 * The architecture document names these in section 13 as the short-term
 * substitute for a social layer: visiting real players needs a server, and the
 * project deliberately has not built one.
 *
 * Two things this deliberately is not.
 *
 * It is **not a fake leaderboard**. These are hotels in a city, and the game
 * says so plainly. Dressing generated numbers up as other people would be a
 * lie told to make the game feel busier than it is, and a player who worked
 * that out would be right to distrust everything else it told them.
 *
 * It is **not a source of income**. Visiting pays a small amount, capped
 * daily, so it is a habit rather than a strategy. The original's tip jars
 * became the whole game for some players, and that is a worse game.
 *
 * Everything here is derived from a seed and the day. Nothing is stored except
 * which hotels the player has already visited today.
 */
import type { SimData } from '../data-source.ts';
import type { GameState } from '../state/types.ts';
import { mulberry32 } from '../rng/index.ts';

/**
 * A small sequence from one seed.
 *
 * `mulberry32` is a single step that returns a number, not a generator. This
 * walks it, which is all the city needs: a handful of stable draws per hotel.
 */
function draws(seed: number, count: number): number[] {
  const out: number[] = [];
  let n = seed;
  for (let i = 0; i < count; i++) {
    n = (n + 0x9e3779b9) | 0;
    out.push(mulberry32(n));
  }
  return out;
}

/**
 * A rival hotel.
 *
 * `npc` is always true and is on the type deliberately: these are generated
 * from the player's own seed, and a screen that shows them without saying so
 * is telling the player there are other people here when there are not. If
 * real players ever arrive, this is the flag that distinguishes them.
 */
export interface Neighbour {
  npc: true;
  /** Stable across every session. */
  id: string;
  name: string;
  profileId: string;
  level: number;
  stars: number;
  rooms: number;
  /** True once the player has visited today. */
  visited: boolean;
}

/** Which day a moment falls in. Neighbours grow between days, not within one. */
function dayIndex(epochMs: number): number {
  return Math.floor(epochMs / 86_400_000);
}

/**
 * The city as it stands today.
 *
 * A neighbour's level is its starting point plus growth for every day the
 * player has been playing, so the city moves whether or not the player does —
 * which is the whole point of having neighbours at all.
 */
export function neighbours(data: SimData, state: GameState, epochMs: number): Neighbour[] {
  const startedDay = dayIndex(state.startedAtMs ?? epochMs);
  const today = dayIndex(epochMs);
  const daysElapsed = Math.max(0, today - startedDay);
  const maxLevel = data.levels[data.levels.length - 1]?.level ?? 60;

  const out: Neighbour[] = [];
  for (let i = 0; i < data.neighbours.count; i++) {
    // Seeded per neighbour rather than per city, so adding one does not
    // reshuffle the others.
    const [rName, rProfile, rHead, rRooms] = draws(state.seed * 31 + i * 7717, 4) as
      [number, number, number, number];
    const name = data.neighbours.names[Math.floor(rName * data.neighbours.names.length)]
      ?? `Hotel ${i + 1}`;
    const profile = data.neighbours.profiles[Math.floor(rProfile * data.neighbours.profiles.length)]
      ?? data.neighbours.profiles[0]!;

    // A spread of starting points, so day one is not twelve identical rivals.
    const head = Math.floor(rHead * 6);
    const level = Math.min(maxLevel, 1 + head + Math.floor(daysElapsed * profile.growthPerDay));
    const stars = Math.min(profile.starCeiling, 1 + Math.floor(level / 12));

    out.push({
      id: `n${i}`,
      npc: true,
      name,
      profileId: profile.id,
      level,
      stars,
      rooms: Math.max(4, Math.round(level * 1.6 + rRooms * 6)),
      visited: state.visitedToday.day === today && state.visitedToday.ids.includes(`n${i}`),
    });
  }

  return out.sort(ahead);
}

/**
 * One ordering, used by the list and by the rank.
 *
 * The list sorted by level then stars; the rank counted only who had a higher
 * level. So a rival on the player's level with more stars sat above them in
 * the list and was not counted as ahead of them — the screen and the number
 * disagreed, and the player was the one who had to reconcile them.
 */
export function ahead(
  a: { level: number; stars: number },
  b: { level: number; stars: number },
): number {
  return b.level - a.level || b.stars - a.stars;
}

/**
 * Where the player stands in the city, 1-based.
 *
 * The comparison is the point. A player with no sense of whether they are
 * doing well has nothing to measure a good week against.
 */
export function cityRank(data: SimData, state: GameState, epochMs: number): { rank: number; of: number } {
  const others = neighbours(data, state, epochMs);
  const me = { level: state.player.level, stars: state.hotel.stars };
  const above = others.filter((n) => ahead(n, me) < 0).length;
  return { rank: above + 1, of: others.length + 1 };
}

/** How many visits are left today. */
export function visitsLeft(data: SimData, state: GameState, epochMs: number): number {
  const today = dayIndex(epochMs);
  const used = state.visitedToday.day === today ? state.visitedToday.ids.length : 0;
  return Math.max(0, data.neighbours.visitsPerDay - used);
}

export function canVisit(
  data: SimData,
  state: GameState,
  epochMs: number,
  neighbourId: string,
): boolean {
  if (visitsLeft(data, state, epochMs) <= 0) return false;
  const today = dayIndex(epochMs);
  if (state.visitedToday.day === today && state.visitedToday.ids.includes(neighbourId)) return false;
  return neighbours(data, state, epochMs).some((n) => n.id === neighbourId);
}

/** Record a visit. The reward is paid by the command. */
export function recordVisit(state: GameState, epochMs: number, neighbourId: string): void {
  const today = dayIndex(epochMs);
  if (state.visitedToday.day !== today) {
    state.visitedToday = { day: today, ids: [] };
  }
  state.visitedToday.ids.push(neighbourId);
}
