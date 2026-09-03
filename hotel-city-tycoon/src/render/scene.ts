/**
 * The hotel scene.
 *
 * Owns the room views, the camera, the input gestures and the per-frame
 * reconciliation between the simulation's state and what is on screen.
 *
 * It never reads the simulation directly — it is handed a snapshot each frame.
 * That keeps the renderer a pure function of state, which is what makes it
 * possible to replace the placeholder graphics in P3b without touching logic.
 */
import { Graphics } from 'pixi.js';
import type { RendererHandle } from './app.ts';
import { applyCamera } from './app.ts';
import { RoomView } from './roomView.ts';
import type { RoomViewData } from './roomView.ts';
import { CharacterView } from './characterView.ts';
import type { CharacterViewData } from './characterView.ts';
import { KeyedPool } from './pool.ts';
import { cull } from './culling.ts';
import { plotWorldBounds, roomWorldRect, worldToBlock, BLOCK_W, BLOCK_H } from './layout.ts';
import {
  fitCamera, clampCamera, pan, zoomAt, visibleRect, screenToWorld,
} from './camera.ts';
import { GestureTracker } from './gestures.ts';
import { FrameSampler, report } from './perf.ts';
import type { CameraState, Viewport, WorldBounds } from './camera.ts';

export interface SceneRoom extends RoomViewData {
  id: string;
}

export interface SceneCharacter extends CharacterViewData {
  id: string;
}

export interface SceneSnapshot {
  rooms: SceneRoom[];
  characters: SceneCharacter[];
  gridW: number;
  gridH: number;
}

export interface SceneCallbacks {
  onRoomTap?: (roomId: string) => void;
  onEmptyTap?: (blockX: number, blockY: number) => void;
  /** Fractional block coordinates of the tap, for guest rescue. */
  onWorldTap?: (blockX: number, blockY: number) => boolean;
}

export class HotelScene {
  private readonly handle: RendererHandle;
  private readonly rooms: KeyedPool<RoomView>;
  private readonly characters: KeyedPool<CharacterView>;
  private readonly grid = new Graphics();
  private readonly callbacks: SceneCallbacks;

  private view: Viewport;
  private world: WorldBounds;
  private camera: CameraState;
  private snapshot: SceneSnapshot = { rooms: [], characters: [], gridW: 4, gridH: 3 };

  /** Last frame's culling result, for the on-screen verification badge. */
  private visibleCount = 0;

  private readonly gestures = new GestureTracker();
  /** Detaches every DOM listener this scene adds to the canvas. */
  private readonly domListeners = new AbortController();
  /** A rolling window of frame times, for the performance report. */
  readonly frames = new FrameSampler();
  /** True once the first snapshot has been drawn, so the grid appears at boot. */
  private gridDrawn = false;

  constructor(handle: RendererHandle, view: Viewport, callbacks: SceneCallbacks = {}) {
    this.handle = handle;
    this.view = view;
    this.callbacks = callbacks;
    this.world = plotWorldBounds(4, 3);
    this.camera = fitCamera(view, this.world);

    this.rooms = new KeyedPool<RoomView>({
      create: () => {
        const v = new RoomView();
        handle.layers.roomShell.addChild(v);
        return v;
      },
      activate: (v) => { v.reset(); },
      reset: (v) => { v.visible = false; },
      prewarm: 24,
    });

    this.characters = new KeyedPool<CharacterView>({
      create: () => {
        const v = new CharacterView();
        handle.layers.characters.addChild(v);
        return v;
      },
      activate: (v) => { v.reset(); },
      reset: (v) => { v.visible = false; },
      prewarm: 16,
    });

    handle.layers.street.addChild(this.grid);
    this.attachInput();
  }

  // ---------------------------------------------------------------- frame

  /**
   * Redraw everything against the art available right now.
   *
   * Called when a bundle finishes loading: views hold a placeholder until
   * something tells them the real texture has arrived.
   */
  refreshArt(): void {
    this.reconcile();
  }

  /** Hand the scene the current state. Called whenever the simulation changes. */
  setSnapshot(snapshot: SceneSnapshot): void {
    const resized = snapshot.gridW !== this.snapshot.gridW || snapshot.gridH !== this.snapshot.gridH;
    this.snapshot = snapshot;
    // The starting plot happens to be the same size as the placeholder, so a
    // resize-only check left the grid unpainted on a fresh game.
    if (resized || !this.gridDrawn) {
      this.world = plotWorldBounds(snapshot.gridW, snapshot.gridH);
      this.camera = clampCamera(this.camera, this.view, this.world);
      this.drawGrid();
      this.gridDrawn = true;
    }
    this.reconcile();
  }

  /** Per-frame work. Cheap by design: culling, a camera transform, and strides. */
  render(deltaMs = 16.7): void {
    this.frames.record(deltaMs);
    applyCamera(this.handle.world, this.camera, this.view);

    const visible = visibleRect(this.camera, this.view);
    const boxes = this.snapshot.rooms.map((r) => roomWorldRect(r.rect, this.snapshot.gridH));
    const { visible: shown, hidden } = cull(boxes, visible);

    for (const i of shown) {
      const room = this.snapshot.rooms[i];
      const view = room ? this.rooms.get(room.id) : undefined;
      if (view) view.renderable = true;
    }
    for (const i of hidden) {
      const room = this.snapshot.rooms[i];
      const view = room ? this.rooms.get(room.id) : undefined;
      if (view) view.renderable = false;
    }
    this.visibleCount = shown.length;

    // Only what is on screen animates.
    for (const [, view] of this.characters.entries()) {
      if (view.renderable) view.tickAnimation(deltaMs);
    }
  }

  /** Snapshot of what the renderer is doing right now. */
  stats(): { rooms: number; visibleRooms: number; characters: number; zoom: number } {
    return {
      rooms: this.snapshot.rooms.length,
      visibleRooms: this.visibleCount,
      characters: this.snapshot.characters.length,
      zoom: this.camera.zoom,
    };
  }

  /** A measured report against the document's budgets. */
  perfReport(backend: string) {
    return report(this.frames, {
      rooms: this.snapshot.rooms.length,
      characters: this.snapshot.characters.length,
      drawnRooms: this.visibleCount,
      backend,
    });
  }

  private reconcile(): void {
    this.rooms.sync(this.snapshot.rooms.map((r) => r.id));
    for (const room of this.snapshot.rooms) {
      const view = this.rooms.get(room.id);
      if (view) view.update(room, this.snapshot.gridH);
    }
    this.characters.sync(this.snapshot.characters.map((c) => c.id));
    for (const person of this.snapshot.characters) {
      const view = this.characters.get(person.id);
      if (view) view.update(person, this.snapshot.gridH);
    }
  }

  private drawGrid(): void {
    const { gridW, gridH } = this.snapshot;
    this.grid.clear();
    // Plot outline: the boundary the player buys their way out of.
    this.grid.rect(0, 0, gridW * BLOCK_W, gridH * BLOCK_H).stroke({ width: 2, color: 0x4a3830 });
    for (let x = 1; x < gridW; x++) {
      this.grid.moveTo(x * BLOCK_W, 0).lineTo(x * BLOCK_W, gridH * BLOCK_H);
    }
    for (let y = 1; y < gridH; y++) {
      this.grid.moveTo(0, y * BLOCK_H).lineTo(gridW * BLOCK_W, y * BLOCK_H);
    }
    this.grid.stroke({ width: 1, color: 0x2e2420, alpha: 0.7 });
  }

  // ---------------------------------------------------------------- input

  resize(view: Viewport): void {
    this.view = view;
    this.handle.app.renderer.resize(view.width, view.height);
    this.camera = clampCamera(this.camera, view, this.world);
  }

  focusHotel(): void {
    this.camera = fitCamera(this.view, this.world);
  }

  private attachInput(): void {
    const stage = this.handle.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = { contains: () => true };

    const point = (e: { global: { x: number; y: number } }) => ({ x: e.global.x, y: e.global.y });

    stage.on('pointerdown', (e: { pointerId: number; global: { x: number; y: number } }) => {
      this.gestures.down(e.pointerId, point(e));
    });

    stage.on('pointermove', (e: { pointerId: number; global: { x: number; y: number } }) => {
      const action = this.gestures.move(e.pointerId, point(e));
      if (action.kind === 'pan') {
        this.camera = pan(this.camera, action.dx, action.dy, this.view, this.world);
      } else if (action.kind === 'zoom') {
        this.camera = zoomAt(this.camera, action.factor, action.anchor, this.view, this.world);
      }
    });

    const end = (e: { pointerId: number; global: { x: number; y: number } }) => {
      const action = this.gestures.up(e.pointerId, point(e));
      if (action.kind === 'tap') this.handleTap(action.at);
    };
    stage.on('pointerup', end);
    stage.on('pointerupoutside', end);
    stage.on('pointercancel', () => this.gestures.cancel());

    /*
     * The cancel has to come from the DOM as well.
     *
     * Pixi's EventSystem listens for pointerdown/move/up on the canvas and
     * window but never for `pointercancel`, so the stage handler above is
     * never called on a real phone. When the OS took a touch away — a
     * notification, a call, an edge swipe — the tracker kept that finger
     * registered, every later single-finger touch counted as the second
     * finger of a pinch, and the hotel could not be tapped or panned again
     * until the page was reloaded.
     */
    const canvas = this.handle.app.canvas;
    const { signal } = this.domListeners;
    const cancel = () => this.gestures.cancel();
    canvas.addEventListener('pointercancel', cancel, { signal });
    canvas.addEventListener('lostpointercapture', cancel, { signal });

    canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      this.camera = zoomAt(this.camera, factor, { x: e.offsetX, y: e.offsetY }, this.view, this.world);
    }, { passive: false, signal });
  }

  private handleTap(screen: { x: number; y: number }): void {
    const world = screenToWorld(screen, this.camera, this.view);
    const block = worldToBlock(world.x, world.y, this.snapshot.gridH);

    // People are checked first: a guest standing in a doorway should be
    // rescuable without the room behind them swallowing the tap.
    const fractional = {
      x: world.x / BLOCK_W,
      y: this.snapshot.gridH - 1 - world.y / BLOCK_H,
    };
    if (this.callbacks.onWorldTap?.(fractional.x, fractional.y)) return;

    for (const room of this.snapshot.rooms) {
      const { rect } = room;
      if (block.x >= rect.x && block.x < rect.x + rect.w && block.y >= rect.y && block.y < rect.y + rect.h) {
        this.callbacks.onRoomTap?.(room.id);
        return;
      }
    }
    this.callbacks.onEmptyTap?.(block.x, block.y);
  }

  destroy(): void {
    this.domListeners.abort();
    this.rooms.clear();
    this.characters.clear();
    this.grid.destroy();
  }
}
