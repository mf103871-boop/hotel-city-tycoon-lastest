/**
 * The small things people do while nothing is happening to them.
 *
 * A character standing perfectly still between simulation events is the
 * clearest tell that they are a sprite rather than a person. So they blink,
 * shift their weight, glance around — on their own timetable, drawn from the
 * ranges in their animation file and from their own seed, so two guests of the
 * same type never do it in unison and the same guest does it the same way
 * after a reload.
 *
 * ART-0 §11 asks for exactly this ("blink … every 2.5–5 s, varied timing") and
 * forbids its opposite: nothing here bounces everybody in time.
 *
 * The randomness is presentational and seeded from the entity's id — it never
 * touches the simulation's RNG streams, whose cursors live in the save.
 *
 * Pure maths, no Pixi.
 */
import { mulberry32 } from '../../core/rng/index.ts';

/** What the scheduler is currently making the character do. */
export type Fidget = 'shiftWeight' | 'glance' | 'blink';

export interface SchedulerConfig {
  /** `[min, max]` milliseconds between blinks. */
  blinkEveryMs: [number, number];
  /** `[min, max]` milliseconds between idle fidgets. */
  fidgetEveryMs: [number, number];
  /** Which fidgets this character has. An empty list means they only blink. */
  fidgets: Fidget[];
}

export interface SchedulerState {
  seed: number;
  /** How many intervals have been drawn, so each draw is its own value. */
  blinkTicket: number;
  fidgetTicket: number;
  /** Milliseconds until the next blink and the next fidget. */
  untilBlink: number;
  untilFidget: number;
  /** The fidget in progress and how long it has left. */
  active: Fidget | null;
  activeLeftMs: number;
}

/** How long each fidget lasts. Short enough to read as a person, not a pose. */
export const FIDGET_MS: Readonly<Record<Fidget, number>> = {
  shiftWeight: 700,
  glance: 600,
  blink: 140,
};

/** An impatient character does all of it about twice as often. */
export const IMPATIENT_SCALE = 0.5;

export function createScheduler(seed: number): SchedulerState {
  return {
    seed,
    blinkTicket: 0,
    fidgetTicket: 0,
    untilBlink: 0,
    untilFidget: 0,
    active: null,
    activeLeftMs: 0,
  };
}

/** Re-seed for a different person. Pools hand one view to many characters. */
export function resetScheduler(s: SchedulerState, seed: number): void {
  s.seed = seed;
  s.blinkTicket = 0;
  s.fidgetTicket = 0;
  s.untilBlink = 0;
  s.untilFidget = 0;
  s.active = null;
  s.activeLeftMs = 0;
}

/** A value from `[min, max]`, decided by the seed and which draw this is. */
export function intervalFrom(seed: number, ticket: number, range: [number, number]): number {
  const [lo, hi] = range;
  return lo + (hi - lo) * mulberry32((seed + Math.imul(ticket, 0x9e3779b9)) >>> 0);
}

/** What the character should be doing on top of their clip, if anything. */
export interface Beat {
  /** A one-shot to play, this frame only. */
  play: Fidget | null;
  /** A fidget being held: the view reads it to hold a frame or flip the facing. */
  holding: Fidget | null;
}

/**
 * Advance the timers.
 *
 * `active` is true only while the character is idle enough to fidget at all —
 * standing or working, never walking, never asleep, never mid-reaction. When
 * it is false the timers simply do not run, so a guest who walks across the
 * lobby does not arrive with a backlog of blinks to get through.
 */
export function tick(
  s: SchedulerState,
  dtMs: number,
  config: SchedulerConfig,
  active: boolean,
  impatient = false,
): Beat {
  if (s.active) {
    s.activeLeftMs -= dtMs;
    if (s.activeLeftMs <= 0) s.active = null;
  }
  if (!active) return { play: null, holding: s.active };

  const scale = impatient ? IMPATIENT_SCALE : 1;
  let play: Fidget | null = null;

  s.untilBlink -= dtMs;
  if (s.untilBlink <= 0) {
    s.untilBlink = intervalFrom(s.seed, s.blinkTicket++, config.blinkEveryMs) * scale;
    play = 'blink';
  }

  s.untilFidget -= dtMs;
  if (s.untilFidget <= 0) {
    const ticket = s.fidgetTicket++;
    s.untilFidget = intervalFrom(s.seed ^ 0x5bf0, ticket, config.fidgetEveryMs) * scale;
    const choices = config.fidgets.filter((f) => f !== 'blink');
    if (choices.length > 0 && !s.active) {
      const pick = Math.floor(mulberry32((s.seed + Math.imul(ticket, 0x85ebca6b)) >>> 0) * choices.length);
      s.active = choices[Math.min(pick, choices.length - 1)] ?? null;
      s.activeLeftMs = s.active ? FIDGET_MS[s.active] : 0;
    }
  }

  return { play, holding: s.active };
}
