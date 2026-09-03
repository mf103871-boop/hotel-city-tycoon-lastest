/**
 * Boots the game and keeps React in step with it.
 *
 * The tricky part is React's development StrictMode, which mounts the effect,
 * immediately tears it down, and mounts it again. The first version guarded
 * with a `started` ref: the first boot saw itself disposed, and the second
 * exited because the ref was already set, so the loading screen never went
 * away. That is exactly the bug StrictMode exists to expose.
 *
 * The fix is to stop treating boot as a per-mount operation. There is one game
 * per page, so the engine is a module-level singleton created once and shared.
 * Mounting attaches and starts the loop; unmounting stops the loop and flushes
 * a save, but never destroys the engine. Remounting picks the same one back up.
 */
import { useEffect, useState } from 'react';
import { GameEngine, systemClock, intervalScheduler, useGameStore } from '../bridge/index.ts';
import { initSelectors, simData } from '../bridge/selectors.ts';
import { appSimData } from '../data/sim-data.ts';
import type { GameState } from '../bridge/selectors.ts';
import { SaveManager } from '../save/index.ts';
import { PersistenceCoordinator, readOnlyCapability } from '../save/coordinator.ts';
import type { SaveCapability } from '../save/coordinator.ts';
import { buildStressState, stressRequest } from '../bridge/stress.ts';
import { initAudio } from '../audio/index.ts';

/**
 * Called when saving has failed repeatedly.
 *
 * Set by the interface so the boot path does not need to know about React.
 */
let saveTroubleHandler: (() => void) | null = null;

export function onSaveTrouble(handler: (() => void) | null): void {
  saveTroubleHandler = handler;
}

function notifySaveTrouble(): void {
  saveTroubleHandler?.();
}

export interface BootResult {
  ready: boolean;
  engine: GameEngine | null;
  /**
   * The only route Settings has to storage.
   *
   * Narrow on purpose: a screen holding a `SaveManager` could write and clear
   * whenever it liked, which is how an import came to be overwritten by an
   * autosave that started before it.
   */
  saves: SaveCapability | null;
  /** True when an existing save was loaded rather than a new game started. */
  resumed: boolean;
  /** Non-null when a save was found but could not be used. */
  saveProblem: string | null;
}

interface Booted {
  engine: GameEngine;
  saves: SaveCapability;
  resumed: boolean;
  saveProblem: string | null;
}

/** One game per page. Created once, shared by every mount. */
let bootPromise: Promise<Booted> | null = null;

function boot(): Promise<Booted> {
  bootPromise ??= (async (): Promise<Booted> => {
    // Composition root: the bridge is handed its data here and nowhere else.
    initSelectors(appSimData());
    const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
    const sound = initAudio({ now: () => performance.now(), baseUrl: `${base}/assets` });
    // Browsers refuse to start audio before a gesture, so decoding waits for
    // the first touch anywhere on the page.
    const onFirstTouch = () => { void sound.load(); };
    document.addEventListener('pointerdown', onFirstTouch, { once: true });
    const data = simData();
    /*
     * One coordinator for the whole session.
     *
     * The engine's autosave, the import in Settings and the reset button all
     * go through it, so every write to the save is in a single queue and the
     * last one to run is the last one that was asked for — rather than
     * whichever happened to finish last.
     */
    const saveManager = new SaveManager(undefined, data);
    const coordinator = new PersistenceCoordinator(saveManager, systemClock.now);
    const persist = (state: GameState) => coordinator.persist(state);
    const ports = {
      clock: systemClock,
      scheduler: intervalScheduler(),
      persist,
      // Warn once, after enough failures to rule out a transient hiccup.
      onPersistFailed: (consecutive: number) => {
        if (consecutive === 3) notifySaveTrouble();
      },
    };

    // A stress session builds its own hotel and is never written anywhere: it
    // exists to be measured, and overwriting somebody's real save to take a
    // frame rate reading would be indefensible.
    const stress = stressRequest(window.location.search);
    if (stress) {
      console.info(`[hotel-city-tycoon] stress mode: ${stress.rooms} rooms, ${stress.seconds}s warm-up`);
      const state = buildStressState(data, { ...stress, epochMs: systemClock.now() });
      const engine = new GameEngine(data, state, {
        clock: systemClock,
        scheduler: intervalScheduler(),
        // No persist port at all. Nothing can reach the disk from here.
      });
      // Stress mode gets a read-only capability: it can export what it built,
      // and it cannot write over the player's real save.
      return {
        engine,
        saves: readOnlyCapability((st) => saveManager.exportToJson(st, systemClock.now())),
        resumed: false,
        saveProblem: null,
      };
    }

    /*
     * The end-to-end handle, and why it cannot ship.
     *
     * This used to be gated on `?e2e=1`, which is a query parameter — anybody
     * could type it, and the bundle carried the code either way. A handle that
     * writes coins and levels straight into GameState, bypassing every command
     * and every validation, is not something to leave in a build a player
     * downloads.
     *
     * `import.meta.env.VITE_E2E` is read at build time, so in a production
     * build this whole block is dead code and the minifier removes it.
     * `tools/check-no-cheats.mjs` fails the build if any trace survives.
     */
    if (import.meta.env.VITE_E2E === '1') {
      (window as unknown as { __hct?: unknown }).__hct = {
        state: () => useGameStore.getState().state,
      };
    }

    const loaded = await saveManager.load();
    if (loaded.ok) {
      return {
        engine: new GameEngine(data, loaded.state, ports, loaded.savedAtMs),
        saves: coordinator,
        resumed: true,
        saveProblem: null,
      };
    }
    // 'empty' is the normal first-run path, not a problem worth reporting.
    const saveProblem = loaded.reason === 'empty' ? null : loaded.reason;
    /*
     * A save that exists but could not be used is never written over.
     *
     * The fallback hotel used to boot with the full ports, so its first
     * autosave — thirty seconds later — replaced the player's real save with
     * an empty one. A newer client's save (a rollback deployment, a second
     * device on an older build) had not even been quarantined. The fallback
     * now runs without a persist port: it can be played, and Settings can
     * still import a file or start over deliberately, but nothing lands on
     * the old key by accident.
     */
    const portsForFallback = saveProblem ? { clock: ports.clock, scheduler: ports.scheduler } : ports;
    return {
      engine: GameEngine.newGame(data, portsForFallback, systemClock.now() >>> 0),
      saves: coordinator,
      resumed: false,
      saveProblem,
    };
  })();
  return bootPromise;
}

export function useGame(): BootResult {
  const [result, setResult] = useState<BootResult>({
    ready: false, engine: null, saves: null, resumed: false, saveProblem: null,
  });
  const attach = useGameStore((s) => s.attach);

  useEffect(() => {
    let cancelled = false;
    let engine: GameEngine | null = null;

    void boot().then((booted) => {
      if (cancelled) return;
      engine = booted.engine;
      attach(engine);
      // Catch up on however long the player was away before the loop starts.
      engine.resume();
      engine.start();
      setResult({ ready: true, engine, saves: booted.saves, resumed: booted.resumed, saveProblem: booted.saveProblem });
    });

    const onVisibility = () => {
      if (!engine) return;
      if (document.visibilityState === 'hidden') void engine.flush();
      else engine.resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    // Navigation and tab close fire pagehide; on iOS it is the only reliable
    // signal, since beforeunload never fires there.
    const onPageHide = () => { void engine?.flush(); };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      // Stop the loop and save, but leave the engine alive: StrictMode will
      // remount immediately, and a real unmount is a page teardown anyway.
      void engine?.flush();
      engine?.stop();
    };
  }, [attach]);

  return result;
}

/** Test hook: forget the singleton so a fresh game can be booted. */
export function resetBootForTests(): void {
  bootPromise = null;
}
