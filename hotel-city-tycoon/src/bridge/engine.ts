/**
 * The game engine.
 *
 * This is the boundary where the pure simulation meets the real world. It owns
 * the state, converts wall-clock time into simulation ticks, routes commands
 * in and events out, and decides when a gap in time is long enough to be
 * resolved analytically instead of ticked through.
 *
 * It is deliberately framework-free. `store.ts` is a thin Zustand adapter over
 * this class, and that split is what lets the engine be tested headlessly with
 * an injected clock — no browser, no React, no timers.
 */
import type { SimData } from '../core/data-source.ts';
import type { GameState, SimEvent } from '../core/state/types.ts';
import type { Command, CommandResult } from '../core/commands/index.ts';
import { execute } from '../core/commands/index.ts';
import { advance } from '../core/sim/tick.ts';
import { resolveOffline } from '../core/sim/offline.ts';
import { createInitialState } from '../core/state/init.ts';

/** Injected so tests and the balance simulator control time completely. */
export interface EngineClock {
  now(): number;
}

/** Injected so the engine never assumes requestAnimationFrame exists. */
export interface Scheduler {
  start(fn: () => void, intervalMs: number): void;
  stop(): void;
}

export interface EnginePorts {
  clock: EngineClock;
  scheduler?: Scheduler;
  /**
   * Called after every autosave interval, and on demand.
   *
   * Resolving false means the write did not happen. The engine reports that
   * upward rather than continuing as though the game were being recorded.
   */
  persist?: (state: GameState) => void | Promise<boolean | void>;
  /** Called when a save fails, so somebody can tell the player. */
  onPersistFailed?: (consecutive: number) => void;
}

export type EngineListener = (state: GameState, events: SimEvent[]) => void;

/**
 * A gap larger than this is resolved analytically rather than ticked.
 * Below it, ticking is cheap and gives exact per-guest results.
 */
const OFFLINE_THRESHOLD_MS = 60_000;

export class GameEngine {
  private readonly data: SimData;
  private readonly ports: EnginePorts;
  private readonly listeners = new Set<EngineListener>();

  private state: GameState;
  private lastRealMs: number;
  private lastAutosaveMs: number;
  private running = false;
  private failedSaves = 0;

  /**
   * `savedAtMs` is the wall-clock moment the state was last written.
   *
   * Without it the constructor set the time baseline to *now*, and the whole
   * absence between closing the app and opening it again was erased before
   * anything could resolve it. Cold boot after a night away produced nothing:
   * the resolver was handed an elapsed time of zero and did its job perfectly.
   * A new game passes nothing and starts from now, which is correct for a
   * hotel that did not exist a moment ago.
   */
  constructor(data: SimData, state: GameState, ports: EnginePorts, savedAtMs?: number) {
    this.data = data;
    this.state = state;
    this.ports = ports;
    const now = ports.clock.now();
    // A save from the future means a clock that moved backwards. Treat it as
    // no time passed rather than as a negative absence.
    this.lastRealMs = savedAtMs !== undefined ? Math.min(savedAtMs, now) : now;
    this.lastAutosaveMs = now;
  }

  static newGame(data: SimData, ports: EnginePorts, seed: number, hotelName?: string): GameEngine {
    const now = ports.clock.now();
    const state = createInitialState(data, {
      seed,
      epochMs: now,
      ...(hotelName !== undefined ? { hotelName } : {}),
    });
    return new GameEngine(data, state, ports);
  }

  getState(): GameState {
    return this.state;
  }

  /** A structural copy, for anything that must not observe later mutation. */
  snapshot(): GameState {
    return JSON.parse(JSON.stringify(this.state)) as GameState;
  }

  subscribe(listener: EngineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(events: SimEvent[]): void {
    for (const listener of this.listeners) listener(this.state, events);
  }

  // ---------------------------------------------------------------- commands

  /**
   * The only way the outside world changes the game.
   * Rejections are returned, never thrown — a refused purchase is a normal
   * outcome the UI explains, not an exception.
   */
  dispatch(cmd: Command): CommandResult {
    const result = execute(this.data, this.state, cmd);
    if (result.ok) {
      this.emit(result.events);
      /*
       * Every accepted command is written down at once.
       *
       * Saving used to happen only on the thirty-second autosave and on a
       * best-effort flush when the tab was hidden. A room built two seconds
       * before a reload was gone afterwards: the DEC-009 lane reported
       * "6 rooms" before and "4 rooms" after. Commands are the moments the
       * player actually paid for something, so they are the moments to save.
       * The coordinator queues the writes, and a hotel without a persist
       * port (tests, the balance sims, a fallback session) is unaffected.
       */
      void this.persist();
    }
    return result;
  }

  // ---------------------------------------------------------------- time

  /**
   * Bring the simulation up to `realMs`.
   *
   * Short gaps tick. Long gaps — a backgrounded app, an overnight absence —
   * are resolved in closed form, because ticking 25 million steps to open a
   * hotel is not a thing anyone should wait for.
   */
  catchUp(realMs: number): SimEvent[] {
    const elapsed = realMs - this.lastRealMs;
    if (elapsed <= 0) return [];
    this.lastRealMs = realMs;

    const events: SimEvent[] = [];
    if (elapsed >= OFFLINE_THRESHOLD_MS) {
      const result = resolveOffline(this.data, this.state, elapsed);
      events.push(...result.events);
    } else {
      const ticks = Math.floor(elapsed / this.data.economy.simulation.tickMs);
      if (ticks > 0) {
        const stepped = advance(this.data, this.state, ticks);
        events.push(...stepped.events);
        // Carry the remainder so no fraction of a tick is ever lost.
        this.lastRealMs = realMs - (elapsed - ticks * this.data.economy.simulation.tickMs);
      } else {
        this.lastRealMs -= elapsed;
        return [];
      }
    }

    this.maybeAutosave(realMs);
    // Emit even with no events. Time itself is a change: the shift countdown,
    // guest positions and cleanliness all move on an ordinary tick, and a HUD
    // that only updates when something "happens" freezes between events.
    this.emit(events);
    return events;
  }

  /** Advance by a wall-clock duration. Used by tests and the balance sim. */
  advanceBy(ms: number): SimEvent[] {
    return this.catchUp(this.lastRealMs + ms);
  }

  private maybeAutosave(realMs: number): void {
    const intervalMs = this.data.economy.simulation.autosaveIntervalSec * 1000;
    if (realMs - this.lastAutosaveMs < intervalMs) return;
    this.lastAutosaveMs = realMs;
    void this.persist();
  }

  /** Force a save, e.g. when the app is about to be backgrounded. */
  async flush(): Promise<boolean> {
    this.lastAutosaveMs = this.ports.clock.now();
    return this.persist();
  }

  /**
   * One place that writes, so one place notices when writing stops working.
   *
   * A failed save used to be an unhandled rejection: the game carried on and
   * the player found out on their next visit that hours were gone.
   */
  private async persist(): Promise<boolean> {
    if (!this.ports.persist) return true;
    try {
      const result = await this.ports.persist(this.state);
      const ok = result !== false;
      if (ok) {
        this.failedSaves = 0;
      } else {
        this.failedSaves++;
        this.ports.onPersistFailed?.(this.failedSaves);
      }
      return ok;
    } catch {
      this.failedSaves++;
      this.ports.onPersistFailed?.(this.failedSaves);
      return false;
    }
  }

  /** How many consecutive saves have failed. Zero when all is well. */
  saveFailures(): number {
    return this.failedSaves;
  }

  // ---------------------------------------------------------------- loop

  start(): void {
    if (this.running || !this.ports.scheduler) return;
    this.running = true;
    // The baseline is deliberately not reset here. Doing so discarded any
    // absence that had not been caught up yet, which made starting the loop a
    // second way to lose the player's offline time.
    this.ports.scheduler.start(() => {
      this.catchUp(this.ports.clock.now());
    }, this.data.economy.simulation.tickMs);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.ports.scheduler?.stop();
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Call when the app returns to the foreground. Resyncs the clock baseline
   * before catching up so a backgrounded tab does not replay in tiny steps.
   */
  resume(): SimEvent[] {
    return this.catchUp(this.ports.clock.now());
  }
}

/** The real clock. The only place in the app that reads wall time for the sim. */
export const systemClock: EngineClock = {
  now: () => Date.now(),
};

/** A clock the test drives by hand. */
export function fakeClock(startMs = 0): EngineClock & { set(ms: number): void; advance(ms: number): void } {
  let current = startMs;
  return {
    now: () => current,
    set: (ms: number) => { current = ms; },
    advance: (ms: number) => { current += ms; },
  };
}

/** An interval-based scheduler. Browsers get requestAnimationFrame in P3. */
export function intervalScheduler(): Scheduler {
  let handle: ReturnType<typeof setInterval> | null = null;
  return {
    start(fn, intervalMs) {
      if (handle !== null) clearInterval(handle);
      handle = setInterval(fn, intervalMs);
    },
    stop() {
      if (handle !== null) clearInterval(handle);
      handle = null;
    },
  };
}
