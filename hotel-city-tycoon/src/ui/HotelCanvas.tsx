/**
 * The canvas.
 *
 * React mounts and sizes it, then stays out of the way: the scene subscribes
 * to the engine directly, so HUD re-renders never cost frames.
 *
 * Note what this file does NOT import: nothing from src/core. Everything it
 * needs about the simulation comes through the bridge selectors.
 */
import { useEffect, useRef } from 'react';
import {
  createRenderer, HotelScene, loadBundle, resolutionTier, missingAssetKeys, declaredAssetCount,
  formatReport,
} from '../render/index.ts';
import type { SceneSnapshot } from '../render/index.ts';
import { useGameStore } from '../bridge/index.ts';
import { summariseRooms, gridSize } from '../bridge/selectors.ts';
import { characterViews, guestNear } from '../bridge/characters.ts';
import type { GameState } from '../bridge/selectors.ts';

function toSnapshot(state: GameState): SceneSnapshot {
  const grid = gridSize(state);
  return {
    gridW: grid.w,
    gridH: grid.h,
    characters: characterViews(state).map((c) => ({
      id: c.id,
      assetKey: c.assetKey,
      x: c.x,
      y: c.y,
      facing: c.facing,
      desire: c.desire,
      draggable: c.draggable,
      opacity: c.opacity,
      kind: c.kind,
      activity: c.activity,
    })),
    rooms: summariseRooms(state).map((r) => ({
      id: r.id,
      rect: { x: r.x, y: r.y, w: r.w, h: r.h },
      category: r.category,
      label: r.defId,
      assetKey: r.assetKey,
      fill: r.fill,
      showMeter: r.showMeter,
      hasPest: r.hasPest,
      hasFire: r.hasFire,
      hasGhost: r.hasGhost,
      occupants: r.occupants,
    })),
  };
}

export interface CanvasStats {
  backend: 'webgpu' | 'webgl';
  fps: number;
  rooms: number;
  visibleRooms: number;
  characters: number;
  zoom: number;
  fpsP95Low: number;
  memoryMB: number | null;
}

export interface HotelCanvasProps {
  onRoomTap?: (roomId: string) => void;
  /** Block coordinates of a tap that hit no room. Drives placement mode. */
  onEmptyTap?: (blockX: number, blockY: number) => void;
  onStats?: (stats: CanvasStats) => void;
}

export function HotelCanvas({ onRoomTap, onEmptyTap, onStats }: HotelCanvasProps) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useGameStore((s) => s.engine);

  useEffect(() => {
    if (!canvas.current || !holder.current || !engine) return;
    let scene: HotelScene | null = null;
    let stop: (() => void) | null = null;
    let disposed = false;

    void (async () => {
      const box = holder.current!.getBoundingClientRect();
      const handle = await createRenderer({
        canvas: canvas.current!,
        width: box.width,
        height: box.height,
      });
      if (disposed) { handle.destroy(); return; }

      // exactOptionalPropertyTypes: only pass the callback if there is one.
      // Load the art before the first snapshot, or the opening frame draws
      // placeholder shells and only corrects itself on the next state change.
      // An earlier build defined this loader and never called it: every file
      // was present, validated, and unused.
      const tier = resolutionTier(globalThis.devicePixelRatio || 1);
      const rooms = await loadBundle('rooms', tier);
      if (disposed) { handle.destroy(); return; }
      if (rooms.missing.length > 0) {
        console.warn(`[assets] ${rooms.missing.length} room textures unavailable; using placeholders`);
      } else {
        console.info(`[assets] ${rooms.loaded} room textures loaded at @${tier}x`);
      }
      // Everything else can arrive after the hotel is on screen.
      // The rest arrives after the hotel is on screen. Each bundle refreshes
      // the scene as it lands, so a sprite drawn as a placeholder is replaced
      // the moment its real texture exists.
      void Promise.all([
        loadBundle('effects', tier),
        loadBundle('ui', tier),
        loadBundle('characters', tier),
        loadBundle('decor', tier),
      ].map((p) => p.then((r) => { scene?.refreshArt(); return r; }))).then(() => {
        scene?.refreshArt();
        const gaps = missingAssetKeys();
        const declared = declaredAssetCount();
        if (gaps.length > 0) {
          // Naming the shortfall against what this build expects makes a stale
          // deployment obvious instead of looking like a rendering bug.
          console.warn(
            `[assets] ${gaps.length} of ${declared} declared textures missing — ` +
            `if this is a deployment, it may be older than the asset set. First few: ` +
            gaps.slice(0, 5).join(', '),
          );
        } else {
          console.info(`[assets] complete: all ${declared} declared textures available`);
        }
      });

      scene = new HotelScene(handle, { width: box.width, height: box.height }, {
        ...(onRoomTap ? { onRoomTap } : {}),
        ...(onEmptyTap ? { onEmptyTap } : {}),
        // A tap on a guest walking out pulls them back to reception. Checked
        // before rooms so someone standing in a doorway is still reachable.
        onWorldTap: (bx, by) => {
          const target = guestNear(engine.getState(), bx, by);
          if (!target) return false;
          // Someone on their way out gets called back; someone resting gets
          // checked on, in case they are the inspector.
          return target.draggable
            ? engine.dispatch({ type: 'DRAG_GUEST', guestId: target.id }).ok
            : engine.dispatch({ type: 'TAP_GUEST', guestId: target.id }).ok;
        },
      });
      scene.setSnapshot(toSnapshot(engine.getState()));
      scene.focusHotel();

      const unsubscribe = engine.subscribe((state) => {
        scene?.setSnapshot(toSnapshot(state));
      });
      handle.app.ticker.add((ticker) => scene?.render(ticker.deltaMS));

      // Twice a second is enough for a readout and costs nothing.
      const statsTimer = setInterval(() => {
        if (!scene || !onStats) return;
        const perf = scene.perfReport(handle.backend);
        onStats({
          backend: handle.backend,
          fps: handle.app.ticker.FPS,
          fpsP95Low: perf.fpsP95Low,
          memoryMB: perf.memoryMB,
          ...scene.stats(),
        });
      }, 500);

      // Exposed so a performance reading is one line in the console rather
      // than an afternoon of instrumentation.
      const w = window as unknown as { hct?: Record<string, unknown> };
      w.hct = {
        ...(w.hct ?? {}),
        perf: () => {
          const r = scene!.perfReport(handle.backend);
          const text = formatReport(r);
          console.log(`\n===== PERFORMANCE =====\n${text}\n=======================\n`);
          void navigator.clipboard?.writeText(text).catch(() => { /* select it */ });
          return r;
        },
        resetPerf: () => { scene?.frames.reset(); console.log('[perf] sampling restarted'); },
      };

      const onResize = () => {
        const next = holder.current?.getBoundingClientRect();
        if (next) scene?.resize({ width: next.width, height: next.height });
      };
      window.addEventListener('resize', onResize);

      stop = () => {
        clearInterval(statsTimer);
        window.removeEventListener('resize', onResize);
        unsubscribe();
        scene?.destroy();
        handle.destroy();
      };
    })();

    return () => { disposed = true; stop?.(); };
  }, [engine, onRoomTap, onEmptyTap, onStats]);

  return (
    <div ref={holder} className="absolute inset-0">
      {/*
        The canvas is most of the screen and announces nothing on its own.
        The label describes what it is; the live region below carries what
        changes, because a canvas cannot tell anyone what just happened.
      */}
      <canvas
        ref={canvas}
        role="img"
        aria-label="Your hotel"
        className="block h-full w-full touch-none"
      />
    </div>
  );
}
