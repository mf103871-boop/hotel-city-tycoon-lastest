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
import { Container, Graphics, Sprite } from 'pixi.js';
import type { RendererHandle } from './app.ts';
import { applyCamera } from './app.ts';
import { RoomView } from './roomView.ts';
import type { RoomViewData } from './roomView.ts';
import { CharacterView } from './characterView.ts';
import type { CharacterViewData } from './characterView.ts';
import { CharacterRig } from './characterRig.ts';
import { CAST, castIds } from './anim/cast.ts';
import { createRigState, figureFor, pose, NEUTRAL_INPUT } from './anim/rig.ts';
import type { RigClip, RigInput } from './anim/rig.ts';
import { motionTier } from './quality.ts';
import type { MotionTier } from './quality.ts';
import { DecorView } from './decorView.ts';
import { KeyedPool } from './pool.ts';
import { plotWorldBounds, roomWorldRect, roomWorldRectInto, worldToBlock, BLOCK_W, BLOCK_H } from './layout.ts';
import {
  fitCamera, clampCamera, pan, zoomAt, visibleRect, screenToWorld, worldToScreen,
} from './camera.ts';
import { GestureTracker } from './gestures.ts';
import { Backdrop, INK, NIGHT_TINT, SKY } from './backdrop.ts';
import { quantiseDusk, duskTint } from './lighting.ts';
import { LightLayer } from './lightLayer.ts';
import { texture, hasTexture } from './assets.ts';
import { FrameSampler, report } from './perf.ts';
import type { CameraState, Viewport, WorldBounds, Insets } from './camera.ts';

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
  /** Rating shown above the building, as gold stars. Decoration only. */
  stars: number;
  /**
   * The hotel is shut, so the whole picture is after dark.
   *
   * The rooms already switched to their `*_night` art on this flag; the sky,
   * the city, the street, the hotel's frame, the decor and the people did not,
   * and a periwinkle hotel under a noon sky was every new player's first
   * frame. One flag drives all of it so the two halves cannot disagree.
   */
  night: boolean;
  /**
   * 0..1 for everything outside the rooms; 1 while closed (DEC-018).
   *
   * The sky, the city, the street, the frame and the people on the pavement
   * follow this number through dusk and dawn; the rooms and everyone inside
   * them keep following `night`, so an open hotel at eleven at night is a
   * lit building under a dark sky and a shut one is as dark as it ever was.
   */
  nightAmount: number;
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
  /** Sky, city, street and the hotel's own shell. Decoration; never read. */
  private readonly backdrop: Backdrop;
  /** The warm pools in the lit rooms. Synced per snapshot, never per frame. */
  private readonly lights: LightLayer;
  private readonly callbacks: SceneCallbacks;

  private view: Viewport;
  private world: WorldBounds;
  private camera: CameraState;
  /** How much of the viewport the HUD covers, so the hotel can clear it. */
  private insets: Insets = { top: 0, bottom: 0 };
  private snapshot: SceneSnapshot = {
    rooms: [], characters: [], gridW: 4, gridH: 3, stars: 0, night: false, nightAmount: 0,
  };
  /** The snapshot's night amount quantised to 0..24: what every exterior view is keyed on. */
  private dusk = 0;

  /** Last frame's culling result, for the on-screen verification badge. */
  private visibleCount = 0;
  /** How many people were drawn last frame, of everyone in the hotel. */
  private visibleCharacters = 0;
  private readonly frontDecor: KeyedPool<DecorView>;
  /** Reused across frames: the keys the furniture pool should hold this tick. */
  private readonly frontKeys: string[] = [];
  private readonly roomFronts: KeyedPool<Sprite>;
  /** Reused across frames: which rooms actually have a front layer this tick. */
  private readonly frontRoomIds: string[] = [];
  /** One box, reused every frame: the render loop allocates nothing. */
  private readonly cullBox = { x: 0, y: 0, width: 0, height: 0 };
  /** The room being measured this iteration, in world pixels. Reused likewise (BL-037). */
  private readonly roomBox = { x: 0, y: 0, width: 0, height: 0 };

  private readonly gestures = new GestureTracker();
  /** Detaches every DOM listener this scene adds to the canvas. */
  private readonly domListeners = new AbortController();
  /** A rolling window of frame times, for the performance report. */
  readonly frames = new FrameSampler();
  /** What the renderer is currently clearing to, so it is set only on a change. */
  private clearColour = SKY;
  /** True once the first snapshot has been drawn, so the grid appears at boot. */
  private gridDrawn = false;
  /** Frames that began with the world's draw list marked for a rebuild (DEC-020 §6): read, never written. */
  private rebuilds = 0;
  /** The debug contact sheet of the cast, on the stage, or null. */
  private castSheet: Container | null = null;

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
    /*
     * People are drawn in the order their feet are in, not the order the pool
     * happened to hand them out in.
     *
     * The bridge has always sorted its list back to front, and the sort has
     * never reached Pixi: `KeyedPool.sync` recycles views without reordering
     * children, so two guests passing each other overlapped by luck. Each view
     * sets its own `zIndex` from its foot position every frame; this is what
     * makes Pixi honour it.
     */
    handle.layers.characters.sortableChildren = true;

    /*
     * The room's standing furniture lives in the same layer as the people.
     *
     * `decorArt.ts` has always said a `front` piece "has to sort against the
     * guests walking past it", and it never could: the pieces were children of
     * their RoomView down in `roomShell` and every character was up here. A
     * sofa cannot be both in front of one guest and behind another while it is
     * in a layer below both. So the pieces are siblings of the characters now,
     * each carrying the same `bandDepth`, and Pixi's sort interleaves them.
     */
    this.frontDecor = new KeyedPool<DecorView>({
      create: () => {
        const v = new DecorView();
        handle.layers.characters.addChild(v);
        return v;
      },
      activate: (v) => { v.reset(); },
      reset: (v) => { v.visible = false; },
      prewarm: 32,
    });

    /*
     * The counters people stand behind.
     *
     * A reception desk is not part of the sorted band: nobody in the room is
     * ever in front of it, which is what makes it the front of the room. So it
     * is one sprite per room in its own layer above the band, rather than a
     * piece competing for a place in it.
     */
    this.roomFronts = new KeyedPool<Sprite>({
      create: () => {
        const s = new Sprite();
        handle.layers.roomFront.addChild(s);
        return s;
      },
      activate: (s) => { s.visible = true; s.renderable = true; },
      reset: (s) => { s.visible = false; },
      prewarm: 4,
    });

    handle.layers.street.addChild(this.grid);
    this.backdrop = new Backdrop(handle.layers);
    this.lights = new LightLayer(handle.layers.overlays);
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

  /**
   * Hand the scene the current state, and anything the people in it should
   * react to. Called whenever the simulation changes.
   *
   * Reactions are one-shots — a cheer, a flinch — resolved by the bridge from
   * the tick's events. They are presentation and nothing else: a reaction
   * missed because the character was off screen is simply not played.
   */
  setSnapshot(snapshot: SceneSnapshot, reactions: ReadonlyArray<{ id: string; clip: string }> = []): void {
    const resized = snapshot.gridW !== this.snapshot.gridW || snapshot.gridH !== this.snapshot.gridH;
    // Quantised once here, so a continuous amount reaches no view as a
    // continuous number: twenty-five distinct pictures between noon and
    // midnight, not one per tick (and a bounded tint cache on the canvas lane).
    const dusk = quantiseDusk(snapshot.nightAmount);
    const duskChanged = snapshot.night !== this.snapshot.night || dusk !== this.dusk;
    this.snapshot = snapshot;
    this.dusk = dusk;
    // The starting plot happens to be the same size as the placeholder, so a
    // resize-only check left the grid unpainted on a fresh game.
    if (resized || duskChanged || !this.gridDrawn) {
      this.world = plotWorldBounds(snapshot.gridW, snapshot.gridH);
      this.camera = clampCamera(this.camera, this.view, this.world, this.insets);
      this.drawGrid();
      this.gridDrawn = true;
    }
    // The clear colour follows the sky.
    //
    // app.ts pins it to daylight SKY, which is what shows for the instant
    // before the first snapshot lands and at the very edge of a hard fling —
    // so after dark a hard fling exposed a strip of noon sky at the border of
    // a night picture. It is the one colour in the renderer that the night
    // flag did not reach.
    const clear = duskTint(SKY, dusk);
    if (clear !== this.clearColour) {
      this.clearColour = clear;
      this.handle.app.renderer.background.color = clear;
    }
    // The backdrop redraws only when the plot, the hotel's outline or the
    // rating actually changed; it keys on those itself.
    const rects = snapshot.rooms.map((r) => r.rect);
    this.backdrop.update(this.world, snapshot.gridH, rects, snapshot.stars, snapshot.night, dusk);
    this.reconcile();
    this.lights.sync(snapshot.rooms, snapshot.gridH, dusk, snapshot.night);
    for (const { id, clip } of reactions) this.characters.get(id)?.react(clip);
  }

  /** Per-frame work. Cheap by design: culling, a camera transform, and strides. */
  render(deltaMs = 16.7): void {
    this.frames.record(deltaMs);
    // One boolean, read before Pixi rebuilds: a context swap or a visible
    // toggle anywhere in the world since the last frame leaves this flag on,
    // and the rig is designed so a moving crowd never sets it.
    if (this.handle.world.parentRenderGroup?.structureDidChange) this.rebuilds++;
    applyCamera(this.handle.world, this.camera, this.view);

    const visible = visibleRect(this.camera, this.view);
    const margin = BLOCK_W;

    /*
     * Rooms are measured against the padded view one at a time, into a box
     * this scene owns. This used to build an array of rectangles and then
     * two arrays of indices every frame — three allocations in the hottest
     * loop the renderer has, for a result the people's cull below already
     * showed how to get for free (BL-037).
     */
    let shownRooms = 0;
    for (const room of this.snapshot.rooms) {
      roomWorldRectInto(room.rect, this.snapshot.gridH, this.roomBox);
      const inside = this.roomBox.x < visible.x + visible.width + margin
        && visible.x - margin < this.roomBox.x + this.roomBox.width
        && this.roomBox.y < visible.y + visible.height + margin
        && visible.y - margin < this.roomBox.y + this.roomBox.height;
      const view = this.rooms.get(room.id);
      if (view) view.renderable = inside;
      if (inside) shownRooms++;
    }
    this.visibleCount = shownRooms;

    /*
     * Only what is on screen animates.
     *
     * Characters were never culled — `renderable` was set true once and never
     * cleared — so every person in the hotel paid for a frame whether or not
     * anyone could see them. Now each is measured against the visible
     * rectangle (padded, so nobody pops in at the edge) with one reused box
     * and no allocation, because this runs once per character per frame.
     *
     * A culled view is settled onto its target rather than left behind: it
     * must be in the right place the moment it is drawn again, not slide in
     * from where the camera left it. Settling moves the container as well,
     * because this test reads the container's position: a view that stayed
     * at the pool's origin was outside every phone viewport that did not
     * contain the plot's corner, so it was never drawn (BL-041).
     */
    this.cullBox.x = visible.x - margin;
    this.cullBox.y = visible.y - margin;
    this.cullBox.width = visible.width + margin * 2;
    this.cullBox.height = visible.height + margin * 2;
    let onScreen = 0;
    for (const [, view] of this.characters.entries()) {
      const inside = view.x >= this.cullBox.x && view.x <= this.cullBox.x + this.cullBox.width
        && view.y >= this.cullBox.y && view.y <= this.cullBox.y + this.cullBox.height;
      view.renderable = inside;
      if (inside) { onScreen++; view.tickAnimation(deltaMs); } else { view.settle(); }
    }
    this.visibleCharacters = onScreen;

    // The furniture is culled against the same box. It does not animate, so
    // there is nothing to settle — only a `renderable` flag to clear, which is
    // what keeps a hundred sofas off screen out of the sort.
    for (const [, piece] of this.frontDecor.entries()) {
      piece.renderable = piece.x >= this.cullBox.x && piece.x <= this.cullBox.x + this.cullBox.width
        && piece.y >= this.cullBox.y && piece.y <= this.cullBox.y + this.cullBox.height;
    }
  }

  /**
   * Where each room is on screen right now, in CSS pixels.
   *
   * For diagnostics and browser tests: a scenario that wants to tap a room
   * asks instead of guessing a coordinate that only held for one viewport.
   */
  roomScreenRects(): Array<{ id: string; x: number; y: number; w: number; h: number }> {
    return this.snapshot.rooms.map((room) => {
      const world = roomWorldRect(room.rect, this.snapshot.gridH);
      const a = worldToScreen({ x: world.x, y: world.y }, this.camera, this.view);
      const b = worldToScreen({ x: world.x + world.width, y: world.y + world.height }, this.camera, this.view);
      return { id: room.id, x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
    });
  }

  /** Snapshot of what the renderer is doing right now. */
  stats(): {
    rooms: number; visibleRooms: number; characters: number; visibleCharacters: number; zoom: number;
    /** Light pools lit at the last snapshot: the rooms with somebody in, plus the lobby. */
    lights: number;
  } {
    return {
      rooms: this.snapshot.rooms.length,
      visibleRooms: this.visibleCount,
      characters: this.snapshot.characters.length,
      visibleCharacters: this.visibleCharacters,
      zoom: this.camera.zoom,
      lights: this.lights.visibleCount(),
    };
  }

  /**
   * What each person on screen is doing, for a look at a real device.
   *
   * The canvas cannot be asserted on in CI (DEC-009), so the way to check
   * that the animation is actually running is to ask it. Exposed through
   * `window.hct.characters()`.
   *
   * `source` says what draws the person: `rig` is the live parts rig
   * (HC-P2-S3), `sheet` the fallback strip, `none` the placeholder capsule —
   * the cheapest proof, on any lane, of which path is on screen.
   * `sheetReady` says the sheet arrived even where the rig stands in front
   * of it, so the bundle-arrival regression stays exercised; `sx`/`sy` are
   * the feet in CSS px, so a browser test can crop the person's pixels.
   */
  characterDiagnostics(): Array<{
    id: string; clip: string; x: number; y: number; visible: boolean; source: 'rig' | 'sheet' | 'none';
    sx: number; sy: number; sheetReady: boolean;
  }> {
    const out: Array<{
      id: string; clip: string; x: number; y: number; visible: boolean; source: 'rig' | 'sheet' | 'none';
      sx: number; sy: number; sheetReady: boolean;
    }> = [];
    for (const person of this.snapshot.characters) {
      const view = this.characters.get(person.id);
      if (!view) continue;
      const screen = worldToScreen({ x: view.x, y: view.y }, this.camera, this.view);
      out.push({
        id: person.id,
        clip: person.clip,
        x: Math.round(view.x),
        y: Math.round(view.y),
        visible: view.renderable,
        source: view.drawnSource(),
        sx: Math.round(screen.x),
        sy: Math.round(screen.y),
        sheetReady: view.sheetReady(),
      });
    }
    return out;
  }

  /** The rig's tier, how many parts it is drawing, and how many frames so far began with a draw-list rebuild. */
  rigStats(): { tier: MotionTier; parts: number; rebuilds: number } {
    let parts = 0;
    for (const [, view] of this.characters.entries()) parts += view.rigPartCount();
    return { tier: motionTier(), parts, rebuilds: this.rebuilds };
  }

  /**
   * A contact sheet of the whole cast, drawn by the rig on the stage above
   * the world, for the art review and the side-by-side with the sheets: one
   * row per member, one column per clip (walk at four phases), each posed
   * once and left still. Ink tick marks only — the canvas stays word-free.
   * `null` takes it down.
   */
  showCastSheet(spec: { clip?: string; phase?: number; scale?: number } | null): void {
    if (this.castSheet) {
      this.handle.app.stage.removeChild(this.castSheet);
      this.castSheet.destroy({ children: true });
      this.castSheet = null;
      this.handle.layers.overlays.renderable = true;
    }
    if (!spec) return;
    /*
     * The light pools go dark while the sheet is up. On Pixi's CanvasRenderer
     * (8.20/8.21) the sprite batch sets the 2D blend mode in place while the
     * Graphics adaptor sets it inside a save()/restore() pair, and the
     * context system remembers only the mode it last asked for — so the
     * first Graphics drawn after the `add` light batch leaves the real mode
     * at `lighter` for everything that follows, this frame and the next. In
     * play nothing is drawn after the overlays layer; the sheet is.
     */
    this.handle.layers.overlays.renderable = false;
    const scale = spec.scale ?? 2;
    const columns: Array<{ clip: RigClip; phase: number }> = spec.clip
      ? [{ clip: spec.clip as RigClip, phase: spec.phase ?? 0 }]
      : [
        { clip: 'idle', phase: 0 },
        { clip: 'walk', phase: 0 }, { clip: 'walk', phase: 0.25 }, { clip: 'walk', phase: 0.5 }, { clip: 'walk', phase: 0.75 },
        { clip: 'work', phase: 2 / 6 }, { clip: 'sleep', phase: 0 }, { clip: 'sit', phase: 0 },
        { clip: 'happy', phase: 0.5 }, { clip: 'angry', phase: 0.25 }, { clip: 'scared', phase: 0.5 },
      ];
    // The sheets' own cell, so a rig pose can be laid beside a sheet frame.
    const cellW = 48 * scale;
    const cellH = 72 * scale;
    const sheet = new Container();
    const ticks = new Graphics();
    sheet.addChild(ticks);
    const ids = castIds();
    const identity = (c: number): number => c;
    ids.forEach((id, row) => {
      const look = CAST[id]!;
      const p = figureFor(look.build, look.height, look.age);
      columns.forEach((col, i) => {
        const rig = new CharacterRig();
        rig.setLook(look, p, identity, scale, id);
        rig.setExpression(col.clip === 'sleep' ? 'sleep' : col.clip === 'scared' ? 'scared'
          : col.clip === 'angry' ? 'cross' : col.clip === 'happy' ? 'happy' : look.expression, col.clip === 'sleep');
        rig.setProp(col.clip === 'work' ? 'work' : 'idle');
        rig.setSeated(col.clip === 'sit');
        rig.setLying(col.clip === 'sleep');
        const rs = createRigState(row * 7 + i);
        rs.phase = col.clip === 'walk' ? col.phase : rs.phase;
        const input: RigInput = {
          ...NEUTRAL_INPUT, clip: col.clip, clipT: col.clip === 'walk' ? 0 : col.phase, frames: 8,
        };
        rig.apply(pose(rs, p, input), col.clip === 'sleep');
        // Feet on the cell's floor line (FOOT_Y 70 of 72), centred in the column.
        rig.position.set(i * cellW + cellW / 2, row * cellH + 70 * scale);
        sheet.addChild(rig);
        ticks.moveTo(i * cellW + 2, row * cellH + 70 * scale).lineTo(i * cellW + cellW - 2, row * cellH + 70 * scale);
      });
    });
    ticks.stroke({ width: 1, color: INK, alpha: 0.35 });
    ticks.rect(0, 0, columns.length * cellW, ids.length * cellH).stroke({ width: 1, color: INK, alpha: 0.5 });
    for (let i = 1; i < columns.length; i++) ticks.moveTo(i * cellW, 0).lineTo(i * cellW, ids.length * cellH);
    for (let r = 1; r < ids.length; r++) ticks.moveTo(0, r * cellH).lineTo(columns.length * cellW, r * cellH);
    ticks.stroke({ width: 1, color: INK, alpha: 0.18 });
    this.castSheet = sheet;
    this.handle.app.stage.addChild(sheet);
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
    const { night } = this.snapshot;
    this.rooms.sync(this.snapshot.rooms.map((r) => r.id));
    for (const room of this.snapshot.rooms) {
      const view = this.rooms.get(room.id);
      if (view) view.update({ ...room, night }, this.snapshot.gridH);
    }
    this.characters.sync(this.snapshot.characters.map((c) => c.id));
    for (const person of this.snapshot.characters) {
      const view = this.characters.get(person.id);
      // The sky's night as well as the hotel's: a person on the pavement is
      // lit by the street, a person indoors by the room (DEC-018).
      if (view) view.update({ ...person, night, dusk: this.dusk }, this.snapshot.gridH);
    }

    /*
     * The furniture the rooms just measured, drawn among the people.
     *
     * Read after every room has updated, because `RoomView.update` is what
     * fills `front` — and it is dirty-key guarded, so on a still hotel this
     * loop reads the same arrays it read last frame and the pool's `sync`
     * finds nothing to do.
     */
    this.frontKeys.length = 0;
    for (const room of this.snapshot.rooms) {
      const view = this.rooms.get(room.id);
      if (!view) continue;
      for (const piece of view.front) this.frontKeys.push(piece.key);
    }
    this.frontDecor.sync(this.frontKeys);
    for (const room of this.snapshot.rooms) {
      const view = this.rooms.get(room.id);
      if (!view) continue;
      for (const piece of view.front) this.frontDecor.get(piece.key)?.update(piece);
    }

    // Only the rooms that drew a front layer get a sprite. A room whose art is
    // still loading has no texture yet and is left out until it arrives, which
    // is the same thing that happens to the room's own picture.
    this.frontRoomIds.length = 0;
    for (const room of this.snapshot.rooms) {
      if (room.frontKey && hasTexture(room.frontKey)) this.frontRoomIds.push(room.id);
    }
    this.roomFronts.sync(this.frontRoomIds);
    for (const room of this.snapshot.rooms) {
      const sprite = this.roomFronts.get(room.id);
      if (!sprite || !room.frontKey) continue;
      const art = texture(room.frontKey);
      if (!art) continue;
      const world = roomWorldRect(room.rect, this.snapshot.gridH);
      sprite.texture = art;
      sprite.position.set(world.x, world.y);
      sprite.width = room.rect.w * BLOCK_W;
      sprite.height = room.rect.h * BLOCK_H;
      // The room's own picture is a night picture when the hotel is shut; this
      // one is drawn once and washed here, the way decor is.
      sprite.tint = night ? NIGHT_TINT : 0xffffff;
    }
  }

  /**
   * The plot: its outline, and the blocks a room can go on.
   *
   * Drawn in the outline colour of the art at a low alpha rather than in the
   * two warm browns it used to use. Those browns came from a UI palette the
   * art no longer shares, and against the pastel sky they were the only brown
   * in the picture — a scratchy dark grid over the one area that is meant to
   * be empty. Ink at a fraction of its weight reads as a guide instead.
   */
  private drawGrid(): void {
    const { gridW, gridH } = this.snapshot;
    const ink = duskTint(INK, this.dusk);
    this.grid.clear();
    // Plot outline: the boundary the player buys their way out of.
    this.grid.rect(0, 0, gridW * BLOCK_W, gridH * BLOCK_H)
      .stroke({ width: 2, color: ink, alpha: 0.28 });
    for (let x = 1; x < gridW; x++) {
      this.grid.moveTo(x * BLOCK_W, 0).lineTo(x * BLOCK_W, gridH * BLOCK_H);
    }
    for (let y = 1; y < gridH; y++) {
      this.grid.moveTo(0, y * BLOCK_H).lineTo(gridW * BLOCK_W, y * BLOCK_H);
    }
    this.grid.stroke({ width: 1, color: ink, alpha: 0.12 });
  }

  // ---------------------------------------------------------------- input

  resize(view: Viewport): void {
    this.view = view;
    this.handle.app.renderer.resize(view.width, view.height);
    this.camera = clampCamera(this.camera, view, this.world, this.insets);
  }

  /**
   * Tell the camera how tall the header and footer are. Measured by the
   * interface, since the scene knows nothing about the DOM around its canvas.
   */
  setInsets(insets: Insets): void {
    if (insets.top === this.insets.top && insets.bottom === this.insets.bottom) return;
    this.insets = { top: Math.max(0, insets.top), bottom: Math.max(0, insets.bottom) };
    this.camera = clampCamera(this.camera, this.view, this.world, this.insets);
  }

  focusHotel(): void {
    this.camera = fitCamera(this.view, this.world, this.insets);
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
        this.camera = pan(this.camera, action.dx, action.dy, this.view, this.world, this.insets);
      } else if (action.kind === 'zoom') {
        this.camera = zoomAt(this.camera, action.factor, action.anchor, this.view, this.world, this.insets);
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

    /*
     * A tap on the canvas must not become a click on whatever the tap put
     * there.
     *
     * Browsers follow a touch tap with a synthetic click at the same point.
     * By then the room sheet the tap opened is under the finger, so the click
     * landed on its backdrop and closed it in the same instant: on a phone
     * every room read as untappable, while a mouse never showed it, because
     * a mouse click targets the element the press began on. Cancelling the
     * touch's default suppresses the click and nothing else; the canvas takes
     * all its input through pointer events.
     */
    canvas.addEventListener('touchend', (e: TouchEvent) => e.preventDefault(), { passive: false, signal });

    canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      this.camera = zoomAt(this.camera, factor, { x: e.offsetX, y: e.offsetY }, this.view, this.world, this.insets);
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
    this.showCastSheet(null);
    this.rooms.clear();
    this.characters.clear();
    this.lights.destroy();
    this.grid.destroy();
  }
}
