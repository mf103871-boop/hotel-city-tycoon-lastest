/**
 * Every write to the save, in one line.
 *
 * The game had three separate routes to storage: the engine's autosave, the
 * import in Settings, and the reset button. Each held its own `SaveManager`
 * and wrote whenever it liked, so the last write won by accident of timing:
 *
 *   - an autosave that started before an import could land *after* it, putting
 *     the old hotel back over the file the player had just chosen
 *   - a `flush()` during React cleanup or on `visibilitychange` could recreate
 *     SAVE_KEY seconds after a reset had removed it
 *   - Settings built `new SaveManager()` with no `SimData`, so an imported
 *     file skipped the semantic validation that loading a save performs
 *
 * A boolean "saving is off now" flag does not fix this. By the time the flag
 * is set, an autosave may already be in flight, and it will still finish last.
 * The only thing that works is a queue: every operation joins the back of one
 * chain, and the chain runs them one at a time in the order they arrived.
 *
 * Pure: no React, no DOM, no timers.
 */
import type { GameState } from '../core/state/types.ts';
import type { SaveManager } from './index.ts';

/**
 * Turn anything that was thrown into a readable string.
 *
 * `(e as Error).message` reads a property off whatever was thrown, and
 * `throw null` makes the catch block itself throw — an error handler that
 * fails is worse than no error handler.
 */
function errorDetail(value: unknown): string {
  try {
    if (value instanceof Error) return value.message;
    return String(value);
  } catch {
    return 'unknown persistence error';
  }
}

export type ImportResult =
  | { ok: true }
  | { ok: false; kind: 'invalid' | 'storage' | 'busy'; detail: string };

export type ResetResult =
  | { ok: true }
  | { ok: false; kind: 'storage' | 'busy'; detail: string };

/**
 * What Settings is allowed to do.
 *
 * Deliberately narrow. Handing React a `SaveManager` — or worse, the storage —
 * is what let a screen call `save()` and `clear()` directly and step on the
 * engine. Settings gets three verbs and no way to reach past them.
 */
export interface SaveCapability {
  exportToJson(state: GameState): string;
  importAndCommit(json: string): Promise<ImportResult>;
  reset(): Promise<ResetResult>;
}

export class PersistenceCoordinator implements SaveCapability {
  private readonly saves: SaveManager;
  private readonly now: () => number;

  /**
   * The tail of the write chain.
   *
   * Every operation appends to this and nothing runs in parallel. It is never
   * allowed to end up rejected: a failed write must not poison the queue for
   * everything after it.
   */
  private tail: Promise<unknown> = Promise.resolve();

  /**
   * Set the moment an import or reset is committed, and never cleared while
   * the page lives.
   *
   * After that point the engine's state is stale by definition — the world is
   * about to be replaced by a reload — so a late `flush()` must not write it.
   * It reports success, because a save that was correctly prevented is not an
   * engine failure and must not count towards the "saving is broken" warning.
   */
  private sealed = false;

  /** Only one of import/reset at a time. The other is told it is busy. */
  private adminBusy = false;

  /**
   * The manager is handed in, not built here.
   *
   * There used to be two: one inside this class and one in `useGame` for
   * loading and exporting. Two managers over one storage is two views of the
   * same file, and the moment they disagree about anything — configuration,
   * caching, validation — the disagreement is invisible. The composition root
   * builds one and everything shares it.
   */
  constructor(saves: SaveManager, now: () => number) {
    this.saves = saves;
    this.now = now;
  }

  /** True once an import or reset has been committed. */
  isSealed(): boolean {
    return this.sealed;
  }

  /**
   * Append to the chain and hand back this operation's own result.
   *
   * `tail.then(op, op)` runs the next operation whether the previous one
   * resolved or rejected, and the tail is then flattened to a resolved promise
   * so one failure cannot stop everything behind it.
   */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }

  /**
   * The engine's save port.
   *
   * The snapshot is taken *now*, synchronously, before joining the queue. The
   * engine keeps mutating its state while this waits its turn, and writing the
   * live object would persist whatever the hotel looked like when the queue
   * got round to it rather than when the save was asked for.
   */
  async persist(state: GameState): Promise<boolean> {
    /*
     * The seal is checked once, here, and never again.
     *
     * It used to be checked a second time inside the queue callback, which
     * silently dropped a save that had been accepted before the seal and was
     * merely waiting its turn behind another write. An autosave admitted at
     * 702 vanished because an import sealed the coordinator while 701 was
     * still in the storage layer, and the hotel fell back to 701.
     *
     * Admission is the decision. Once an operation is in the queue it runs.
     * Only calls that arrive after the seal return early without writing.
     */
    if (this.sealed) return true;
    try {
      // Snapshot and timestamp inside the try: `structuredClone` throws on a
      // value it cannot copy, and a clock can throw too. Either is a failed
      // save, not an exception for the engine to handle.
      const snapshot = structuredClone(state);
      const capturedNow = this.now();
      return await this.enqueue(async () => {
        const outcome = await this.saves.save(snapshot, capturedNow);
        return outcome.ok;
      });
    } catch {
      return false;
    }
  }

  /**
   * Validate a file, then make it the last thing written.
   *
   * Nothing is sealed until the file has passed. A rejected import leaves the
   * player exactly where they were, with autosave still running.
   */
  async importAndCommit(json: string): Promise<ImportResult> {
    /*
     * Sealed means finished, until the page reloads.
     *
     * Only `adminBusy` was checked, and it is released on success — so a
     * second import was accepted after the first had committed, parsed a file
     * and written over it. The reload has not happened yet; the world on
     * screen is already stale; nothing more may be committed.
     */
    if (this.sealed || this.adminBusy) {
      return { ok: false, kind: 'busy', detail: 'another operation is in progress or awaiting reload' };
    }
    this.adminBusy = true;
    try {
      const parsed = await this.saves.importFromJson(json);
      if (!parsed.ok) {
        // Refused: SAVE_KEY untouched, quarantine untouched, autosave alive.
        return { ok: false, kind: 'invalid', detail: parsed.detail ?? parsed.reason };
      }

      // Sealed synchronously, before awaiting anything. An autosave that has
      // already started still finishes — it is ahead in the queue — but no new
      // one can be admitted between here and the write below.
      this.sealed = true;
      const state = parsed.state;
      const capturedNow = this.now();

      const wrote = await this.enqueue(async () => {
        // The imported state is written by the queue, so it lands after any
        // autosave that was already in flight and is therefore the last write.
        const outcome = await this.saves.save(state, capturedNow);
        return outcome;
      });

      if (!wrote.ok) {
        // The file was good but the disk was not. Put everything back the way
        // it was so the player can retry and autosave keeps working.
        this.sealed = false;
        return { ok: false, kind: 'storage', detail: wrote.detail ?? wrote.reason };
      }
      return { ok: true };
    } catch (e) {
      this.sealed = false;
      return { ok: false, kind: 'storage', detail: errorDetail(e) };
    } finally {
      // The lock is released either way; the seal is what keeps the engine out
      // after a success.
      this.adminBusy = false;
    }
  }

  /**
   * Erase the save, and keep it erased.
   *
   * The seal is what stops a `flush()` from React cleanup writing the old
   * hotel straight back into the key that was just removed.
   */
  async reset(): Promise<ResetResult> {
    if (this.sealed || this.adminBusy) {
      return { ok: false, kind: 'busy', detail: 'another operation is in progress or awaiting reload' };
    }
    this.adminBusy = true;
    this.sealed = true;
    try {
      const cleared = await this.enqueue(async () => {
        await this.saves.clear();
        return true;
      });
      if (!cleared) {
        this.sealed = false;
        return { ok: false, kind: 'storage', detail: 'the save could not be cleared' };
      }
      return { ok: true };
    } catch (e) {
      // A failed clear leaves the old save in place, so the player is not
      // stranded with a half-erased game and no autosave.
      this.sealed = false;
      return { ok: false, kind: 'storage', detail: errorDetail(e) };
    } finally {
      this.adminBusy = false;
    }
  }

  exportToJson(state: GameState): string {
    return this.saves.exportToJson(state, this.now());
  }
}

/**
 * A capability for a session that must never touch the player's save.
 *
 * Stress mode builds a hotel to be measured and overwriting somebody's real
 * game to take a frame-rate reading would be indefensible. Export still works
 * — it only reads — and the two writing verbs refuse.
 */
export function readOnlyCapability(exportToJson: (state: GameState) => string): SaveCapability {
  return {
    exportToJson,
    importAndCommit: () =>
      Promise.resolve({ ok: false, kind: 'busy', detail: 'not available in this session' } as const),
    reset: () =>
      Promise.resolve({ ok: false, kind: 'busy', detail: 'not available in this session' } as const),
  };
}
