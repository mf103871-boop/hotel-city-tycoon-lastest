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
  formatReport, quantiseDusk, renderFlags, setMotionTier, tierFor,
} from '../render/index.ts';
import type { SceneSnapshot } from '../render/index.ts';
import { useGameStore } from '../bridge/index.ts';
import { summariseRooms, gridSize, hotelIsOpen, nightAmount } from '../bridge/selectors.ts';
import { characterViews, guestNear } from '../bridge/characters.ts';
import { reactionsFor } from '../bridge/reactions.ts';
import type { GameState } from '../bridge/selectors.ts';

function toSnapshot(state: GameState, tzOffsetMin: number): SceneSnapshot {
  const grid = gridSize(state);
  // How far into the night the sky and the street are (DEC-018). Quantised
  // once here rather than per person, so every tinted copy on the Canvas2D
  // lane shares the same 25 keys instead of one per character.
  const night = nightAmount(state, tzOffsetMin);
  const dusk = quantiseDusk(night);
  return {
    gridW: grid.w,
    gridH: grid.h,
    // Decoration: the gold stars the backdrop paints over the building. The
    // HUD is where the player reads the rating; this is the hotel wearing it.
    stars: state.hotel.stars,
    // A shut hotel is already showing its `*_night` room art (selectors.ts's
    // roomArtVariant). This is that same fact handed to everything else the
    // renderer draws, so the sky, the street, the furniture and the people go
    // dark with the rooms instead of leaving a night hotel under a noon sky.
    night: !hotelIsOpen(state),
    // The same fact as a number: 1 while shut, and the local dusk and dawn
    // ramps while open, for the sky, the street and the light pools only.
    // The rooms and everyone inside keep the boolean above (DEC-018).
    nightAmount: night,
    characters: characterViews(state).map((c) => ({
      id: c.id,
      assetKey: c.assetKey,
      x: c.x,
      y: c.y,
      vx: c.vx,
      vy: c.vy,
      toX: c.toX,
      toY: c.toY,
      segment: c.segment,
      facing: c.facing,
      desire: c.desire,
      draggable: c.draggable,
      tappable: c.tappable,
      opacity: c.opacity,
      kind: c.kind,
      activity: c.activity,
      clip: c.clip,
      mood: c.mood,
      seed: c.seed,
      dusk,
    })),
    rooms: summariseRooms(state).map((r) => ({
      id: r.id,
      rect: { x: r.x, y: r.y, w: r.w, h: r.h },
      category: r.category,
      label: r.defId,
      assetKey: r.assetKey,
      artIsNight: r.artIsNight,
      frontKey: r.frontKey,
      pestKey: r.pestKey,
      fill: r.fill,
      showMeter: r.showMeter,
      hasPest: r.hasPest,
      hasFire: r.hasFire,
      hasGhost: r.hasGhost,
      occupants: r.occupants,
      decor: r.decor.map((p) => ({
        id: p.id,
        defId: p.defId,
        category: p.category,
        slotType: p.slotType,
        assetKey: p.assetKey,
        localX: p.localX,
        localY: p.localY,
        flipX: p.flipX,
        zBias: p.zBias,
        boxW: p.boxW,
        boxH: p.boxH,
        builtIn: p.builtIn,
      })),
    })),
  };
}

export interface CanvasStats {
  backend: 'webgpu' | 'webgl' | 'canvas';
  fps: number;
  rooms: number;
  visibleRooms: number;
  characters: number;
  visibleCharacters: number;
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
    // The device's clock offset, read once and here only: the bridge derives
    // the hour from the simulation's own epoch and must never touch a clock,
    // or its selectors stop being pure and the selftests stop meaning anything.
    const tz = new Date().getTimezoneOffset();

    void (async () => {
      const box = holder.current!.getBoundingClientRect();
      // `?lite=0|1` and `?aa=1` (HC-P2-S3, DEC-020): the rig's motion tier
      // and the renderer's antialiasing, for evidence captures and the
      // device reading. Parsed by the pure render module; only read here.
      const flags = renderFlags(window.location.search);
      const handle = await createRenderer({
        canvas: canvas.current!,
        width: box.width,
        height: box.height,
        ...(flags.aa ? { antialias: true } : {}),
      });
      if (disposed) { handle.destroy(); return; }
      // The canvas lane redraws every rig part as a path each frame, so it
      // samples poses on the clip's frame grid unless the URL says otherwise.
      setMotionTier(tierFor(handle.backend, flags.tier));

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
          if (target.draggable) return engine.dispatch({ type: 'DRAG_GUEST', guestId: target.id }).ok;
          const checked = engine.dispatch({ type: 'TAP_GUEST', guestId: target.id });
          // A check that found nothing (the daily pokes are spent, or the
          // guest is awake) must not swallow the room underneath: the tap
          // falls through and opens the room as it would have anyway.
          return checked.ok && !checked.events.every((e) => e.type === 'nothingFound');
        },
      });
      // How much of the screen the HUD covers, so the camera can keep the
      // ground row out from under the bottom bar. Re-measured on resize and
      // with the stats tick, since the footer grows when the objective card
      // appears.
      const hudInsets = () => ({
        top: document.querySelector('[data-hud="top"]')?.getBoundingClientRect().height ?? 0,
        bottom: document.querySelector('[data-hud="bottom"]')?.getBoundingClientRect().height ?? 0,
      });
      scene.setInsets(hudInsets());
      scene.setSnapshot(toSnapshot(engine.getState(), tz));
      scene.focusHotel();

      // Events come through with the state so the people they are about can
      // answer them: a cheer at a check-in, a flinch at a fire. The bridge
      // decides who reacts and with which clip; the scene only plays it.
      const unsubscribe = engine.subscribe((state, events) => {
        scene?.setSnapshot(toSnapshot(state, tz), reactionsFor(state, events));
      });
      handle.app.ticker.add((ticker) => scene?.render(ticker.deltaMS));
      // A hidden tab kept drawing every frame and draining the battery
      // (BL-024). Pixi clamps the first deltaMS after a restart (maxElapsedMS)
      // and motion.ts clamps again at MAX_DT_S, so nobody teleports on return.
      const onVisibility = () => {
        if (document.hidden) handle.app.ticker.stop();
        else handle.app.ticker.start();
      };
      document.addEventListener('visibilitychange', onVisibility);

      // Twice a second is enough for a readout and costs nothing.
      const statsTimer = setInterval(() => {
        scene?.setInsets(hudInsets());
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
        // Where the rooms are on screen, so a browser test taps a room rather
        // than a coordinate that happened to hold on one viewport.
        roomRects: () => scene?.roomScreenRects() ?? [],
        // What each person is doing, on a device with a real canvas. The
        // animation cannot be asserted on in CI (DEC-009), so this is how a
        // visual review answers "is it actually moving?" with a number.
        characters: () => scene?.characterDiagnostics() ?? [],
        // The whole cast, every clip, posed by the rig on the stage at a
        // fixed scale — the contact sheet the art review reads (DEC-020).
        castSheet: (spec?: { clip?: string; phase?: number; scale?: number }) => scene?.showCastSheet(spec ?? {}),
        castSheetOff: () => scene?.showCastSheet(null),
        // The tier, the part count, and how many frames began with a draw-list
        // rebuild flagged or a view update queued (see HotelScene.rigStats).
        rigStats: () => scene?.rigStats(),
      };

      const onResize = () => {
        const next = holder.current?.getBoundingClientRect();
        if (next) scene?.resize({ width: next.width, height: next.height });
        scene?.setInsets(hudInsets());
      };
      window.addEventListener('resize', onResize);
      // Insets may change after rotation without another window resize.
      // Observe the actual playable rectangle, not only the screen.
      const resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(holder.current!);
      window.visualViewport?.addEventListener('resize', onResize);

      stop = () => {
        clearInterval(statsTimer);
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('resize', onResize);
        resizeObserver.disconnect();
        window.visualViewport?.removeEventListener('resize', onResize);
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
