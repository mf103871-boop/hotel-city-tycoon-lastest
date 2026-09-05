/**
 * How a person gets from one movement point to another, and where they are
 * along the way at a given tick (HC-P2-S1).
 *
 * A route is a list of legs — walk, lift, dwell, react — each with a length
 * in ticks. Evaluating a route at an elapsed tick count is pure arithmetic:
 * the same tick always gives the same point, which is the contract the
 * bridge has always kept (`characters.ts`: positions are derived, never
 * stored). Nothing here reads a clock or a random number; the only variety
 * is the per-person walking speed, and that comes from the entity's own id
 * and the save's seed, so it is the same after a reload as before it.
 *
 * The renderer gets the point AND the velocity along the current leg, so it
 * can carry the character forward between two ten-hertz snapshots at the
 * speed the simulation actually means. That is where the sixty frames a
 * second come from; this file is what makes them honest.
 */
import { mulberry32 } from '../core/rng/index.ts';

export interface Pt { x: number; y: number }

export type LegKind = 'walk' | 'lift' | 'dwell' | 'react';

export interface Leg {
  kind: LegKind;
  from: Pt;
  to: Pt;
  /** How long this leg lasts. At least one tick, so a route always advances. */
  ticks: number;
}

/** Where a route puts somebody at one tick. */
export interface PathSample {
  x: number;
  y: number;
  /** Blocks per second along the current leg; zero while standing. */
  vx: number;
  vy: number;
  /** Where the current leg ends — the point the renderer carries towards. */
  toX: number;
  toY: number;
  /** The leg in progress, or `legs.length` once the route is finished. */
  leg: number;
  kind: LegKind | 'done';
  /** True while in a lift: the character is between floors and not drawn. */
  hidden: boolean;
  /** 0..1 through the current leg. */
  progress: number;
  done: boolean;
}

/** Feet on the pavement: 17 px below the ground row, on the kerb the art paints. */
export const PAVEMENT_Y = -0.18;
/** How far past the right edge of the plot a guest appears. */
export const ENTRY_BEYOND = 1.5;
/** How far past the left edge a leaving guest walks before despawning. */
export const EXIT_BEYOND = 2.5;
/** A leaving guest pauses this long at the door to react before walking off. */
export const REACT_SEC = 1;

/**
 * FNV-1a over a string, the same hash `src/core/rng` uses for its streams.
 *
 * Copied rather than imported: the core keeps its hash private, and the
 * bridge must not consume a core RNG stream (the cursors live in the save).
 */
export function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** A person's own seed: their id against the save's seed. Stable for life. */
export function personSeed(id: string, saveSeed: number): number {
  return (hash32(id) ^ saveSeed) >>> 0;
}

/** A unit float from a seed and a salt, without touching any RNG stream. */
export function seeded(seed: number, salt: number): number {
  return mulberry32((seed + Math.imul(salt, 0x9e3779b9)) >>> 0);
}

/**
 * How fast this person walks, in blocks per second.
 *
 * The file gives a base and a jitter; the seed decides where in the band
 * this individual falls, so two guests of the same type never move in step.
 */
export function walkSpeed(base: number, jitter: number, seed: number): number {
  return base * (1 + jitter * (2 * seeded(seed, 0x51) - 1));
}

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** A walk from `from` to `to` at `speed` blocks/s, never shorter than a tick. */
export function walk(from: Pt, to: Pt, speed: number, tps: number): Leg {
  const ticks = Math.max(1, Math.ceil(distance(from, to) / Math.max(0.01, speed) * tps));
  return { kind: 'walk', from, to, ticks };
}

/** Standing at a point for a while. */
export function dwell(at: Pt, ticks: number): Leg {
  return { kind: 'dwell', from: at, to: at, ticks: Math.max(1, ticks) };
}

/** A trip between floors: out of sight at `from`, back into sight at `to`. */
export function lift(from: Pt, to: Pt, ticks: number): Leg {
  return { kind: 'lift', from, to, ticks: Math.max(1, ticks) };
}

/** A pause to react — a cheer, a huff — before moving on. */
export function react(at: Pt, ticks: number): Leg {
  return { kind: 'react', from: at, to: at, ticks: Math.max(1, ticks) };
}

/**
 * The legs of a journey between two rooms.
 *
 * On the same row, people walk along the floor. Across rows they walk to
 * the way out, vanish for `liftTicks`, and reappear at the way in — the
 * hotel has no drawn lift or stair yet (BL-036), and a fade at a door
 * reads as "went upstairs" where a fade in mid-room reads as a bug.
 */
export function travel(
  from: Pt, fromRow: number, out: Pt,
  to: Pt, toRow: number, entry: Pt,
  speed: number, liftTicks: number, tps: number,
): Leg[] {
  if (fromRow === toRow) return [walk(from, to, speed, tps)];
  const legs: Leg[] = [];
  if (distance(from, out) > 0.001) legs.push(walk(from, out, speed, tps));
  legs.push(lift(out, entry, liftTicks));
  if (distance(entry, to) > 0.001) legs.push(walk(entry, to, speed, tps));
  return legs;
}

export function totalTicks(legs: readonly Leg[]): number {
  let n = 0;
  for (const leg of legs) n += leg.ticks;
  return n;
}

/**
 * Where a route puts somebody `elapsed` ticks after it began.
 *
 * Past the end, they stand at the last leg's destination; the caller decides
 * what they do there. A lift hides its traveller and jumps them across at the
 * midpoint, so anything that does draw them draws them at the right end.
 */
export function evaluate(legs: readonly Leg[], elapsed: number, tps: number): PathSample {
  let t = Math.max(0, elapsed);
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]!;
    if (t >= leg.ticks) { t -= leg.ticks; continue; }
    const progress = t / leg.ticks;
    if (leg.kind === 'walk') {
      const x = leg.from.x + (leg.to.x - leg.from.x) * progress;
      const y = leg.from.y + (leg.to.y - leg.from.y) * progress;
      const vx = (leg.to.x - leg.from.x) / leg.ticks * tps;
      const vy = (leg.to.y - leg.from.y) / leg.ticks * tps;
      return { x, y, vx, vy, toX: leg.to.x, toY: leg.to.y, leg: i, kind: 'walk', hidden: false, progress, done: false };
    }
    if (leg.kind === 'lift') {
      const at = progress < 0.5 ? leg.from : leg.to;
      return { x: at.x, y: at.y, vx: 0, vy: 0, toX: at.x, toY: at.y, leg: i, kind: 'lift', hidden: true, progress, done: false };
    }
    return { x: leg.from.x, y: leg.from.y, vx: 0, vy: 0, toX: leg.from.x, toY: leg.from.y, leg: i, kind: leg.kind, hidden: false, progress, done: false };
  }
  const last = legs[legs.length - 1];
  const at = last ? last.to : { x: 0, y: 0 };
  return { x: at.x, y: at.y, vx: 0, vy: 0, toX: at.x, toY: at.y, leg: legs.length, kind: 'done', hidden: false, progress: 1, done: true };
}

/**
 * A speed that lands a walk of `dist` blocks inside `withinTicks`, never
 * slower than the person's own pace. Check-in is the case: reception starts
 * the clock the moment a guest is accepted, and the walk to the desk has to
 * finish before reception does.
 */
export function speedToArrive(base: number, dist: number, withinTicks: number, tps: number): number {
  if (withinTicks <= 0) return base;
  return Math.max(base, dist / (withinTicks / tps));
}
