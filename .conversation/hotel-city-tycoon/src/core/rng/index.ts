/**
 * Deterministic RNG.
 *
 * `Math.random()` is banned in src/core by lint rule, and this is why: the
 * simulation must produce byte-identical results from the same seed, in the
 * game, in a test, in the balance simulator, and one day on a server.
 *
 * Streams are independent on purpose. If guest spawning and fire events shared
 * one sequence, adding a single fire check would shift every future guest —
 * and a balance change in one system would silently rebalance another.
 */

export type StreamName = 'guestSpawn' | 'guestType' | 'guestDesire' | 'roomPick' | 'events' | 'staffGrade' | 'poke';

export const STREAMS: readonly StreamName[] = [
  'guestSpawn', 'guestType', 'guestDesire', 'roomPick', 'events', 'staffGrade', 'poke',
];

/** Cursor position of every stream. Lives in the save file. */
export type RngCursors = Record<StreamName, number>;

export function createCursors(): RngCursors {
  return { guestSpawn: 0, guestType: 0, guestDesire: 0, roomPick: 0, events: 0, staffGrade: 0, poke: 0 };
}

/** Cheap 32-bit string hash, used to derive a per-stream seed from the master seed. */
function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * mulberry32 — small, fast, and good enough for gameplay. Not cryptographic,
 * and it must never be used as if it were.
 */
export function mulberry32(seed: number): number {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
  t ^= (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * A pure function of (masterSeed, stream, cursor). Nothing is stored inside the
 * generator, so replaying a save from any point produces the same values.
 */
export class Rng {
  private readonly seed: number;
  private readonly cursors: RngCursors;

  constructor(seed: number, cursors: RngCursors) {
    this.seed = seed;
    this.cursors = cursors;
  }

  /** Next float in [0, 1). Advances the stream cursor. */
  next(stream: StreamName): number {
    const n = this.cursors[stream]++;
    /*
     * `Math.imul` and `>>> 0`, not `*` and `+`.
     *
     * `n * 0x9e3779b9` is exact only while the product fits a double's 53-bit
     * mantissa. The golden-ratio constant is about 2.65e9, so that holds until
     * n ≈ 3,405,171 — and the busiest stream draws once per tick, 864,000 times
     * a simulated day. Four days in, the low bits start falling off the end,
     * and past that point the naive product disagrees with the correct 32-bit
     * one about 77% of the time.
     *
     * It never crashed and it never looked wrong: the stream stays
     * deterministic, so replays still matched and the determinism test still
     * passed. It just quietly stopped being the sequence it was supposed to be,
     * in exactly the long runs the balance simulations depend on.
     */
    const mixed = (Math.imul(n, 0x9e3779b9) + (hashString(stream) ^ this.seed)) >>> 0;
    return mulberry32(mixed);
  }

  /** Integer in [min, max] inclusive. */
  int(stream: StreamName, min: number, max: number): number {
    return min + Math.floor(this.next(stream) * (max - min + 1));
  }

  /** True with probability p. */
  chance(stream: StreamName, p: number): boolean {
    return this.next(stream) < p;
  }

  /** Weighted pick. Returns null only for an empty list. */
  weighted<T>(stream: StreamName, items: readonly T[], weightOf: (item: T) => number): T | null {
    let total = 0;
    for (const item of items) total += weightOf(item);
    if (total <= 0) return null;
    let roll = this.next(stream) * total;
    for (const item of items) {
      roll -= weightOf(item);
      if (roll <= 0) return item;
    }
    return items[items.length - 1] ?? null;
  }

  /** Uniform pick. */
  pick<T>(stream: StreamName, items: readonly T[]): T | null {
    if (items.length === 0) return null;
    return items[this.int(stream, 0, items.length - 1)] ?? null;
  }

  /** Snapshot for persistence. */
  snapshot(): RngCursors {
    return { ...this.cursors };
  }
}
