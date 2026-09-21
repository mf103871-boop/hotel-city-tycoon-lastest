/**
 * The runtime effects atlas: every pixel the channel draws, baked once
 * (HC-P2-S4, DEC-019/DEC-021).
 *
 * One offscreen 2D canvas, 256x80 logical at resolution 2, wrapped with
 * `Texture.from` — the same shape `fx/glow.ts` already uses for the light
 * pools, and for the same reasons. A baked bitmap is the same picture on
 * every backend, so what the DEC-009 canvas lane screenshots is what the
 * phone draws; nothing here is a filter, a mask or a RenderTexture; and
 * because every frame is a rectangle of the one source, the Canvas2D lane
 * draws a whole burst as one batch of `drawImage` calls with no tint copy
 * behind it (no effect sprite is ever tinted — the colour is in the atlas).
 *
 * Because it is arithmetic rather than a file, `public/`, `data/`, the
 * service worker's cache rules, `stamp-sw`'s ART_DIRS digest and the asset
 * manifest's 361 entries are all untouched by this step.
 *
 * `document` is touched only inside the functions and the atlas is built on
 * the first `fxFrame()` — the first emit, never at import. So boot draws
 * nothing new, the e2e boot windows do not move, and `node
 * --experimental-strip-types` can still load anything that imports this.
 *
 * DEC-021, the hard rule: no `fillText`, no `measureText`, no font, no `Text`
 * and no `BitmapText`. The digits and the marks are polylines from
 * `glyphs.ts`, painted here and nowhere else; `tools/selftest/effects.ts`
 * asserts each of those words is absent from this directory.
 */
import { Rectangle, Texture } from 'pixi.js';
import type { TextureSource } from 'pixi.js';
import { PALETTE, shade } from '../anim/cast.ts';
import {
  ATLAS_COLS, ATLAS_H, ATLAS_RES, ATLAS_W, BUBBLE_H, BUBBLE_W, BUBBLE_Y, CELL,
  GLYPHS, GLYPH_COUNT, GLYPH_H, GLYPH_W,
  FRAME_BUBBLE, FRAME_BLANK, FRAME_COIN_0, FRAME_COUNT, FRAME_DUST_0, FRAME_SPARK_0,
  FX_FRAMES, frameForGlyph,
} from './glyphs.ts';

/*
 * The frame indices and the grid live in `glyphs.ts`, because the pure half
 * needs them too — `particles.ts`'s `frameOf()` answers in atlas frames and
 * must stay loadable without Pixi. They are re-exported here so that a reader
 * of the atlas still finds the whole vocabulary in one place.
 */
export {
  FRAME_DIGIT_0, FRAME_PLUS, FRAME_COIN_0, FRAME_SPARK_0, FRAME_DUST_0,
  FRAME_MARK_0, FRAME_BLANK, FRAME_BUBBLE, FX_FRAMES, FRAME_COUNT,
} from './glyphs.ts';

/** The coin's own box inside its cell: 9 logical px across, the glyph width. */
const COIN_R = GLYPH_W / 2;
/** The flip, as the ellipse's half-width in fractions of the coin's radius. */
const COIN_FLIP: readonly number[] = [1, 0.82, 0.58, 0.3, 0.58, 0.82];
/** A four-point twinkle, shrinking as it burns out. */
const SPARK_R: readonly number[] = [6, 5, 4, 3, 2, 1];
/** How deep the star's waist is, as a fraction of its point. */
const SPARK_WAIST = 0.34;
/**
 * The puff: a soft disc that grows, baked opaque.
 *
 * Flat on purpose. The strip used to carry a falling opacity of its own
 * ([0.55 … 0.08]) *and* be multiplied by `alphaOf`'s ramp, and the product
 * peaked at 0.275 on the 2 px frame and reached 0.0067 on the 6 px one — a
 * puff that measured as present and could not be seen. There is one fade for
 * the dust now, `DUST_ALPHA_PEAK` in `particles.ts`, and it is the sprite's.
 *
 * The tone is the prototype's rgb(190,190,175) rather than a cool
 * `lighten(metal)`: a floor here is warm tan, and a pale blue-grey haze at
 * half opacity did not separate from the character's own contact shadow.
 */
const DUST_R: readonly number[] = [2, 3, 4, 5, 5.5, 6];
const DUST_TONE_T = 0.15;
/** The card's own height inside the 28x24 rect; the rest is the tail. */
const BUBBLE_CARD_H = 19;
const BUBBLE_CORNER = 5;
const BUBBLE_TAIL_W = 7;
/** The house hairline: every rim in this world is one logical px. */
const RIM_W = 1;

let source: TextureSource | null = null;
const frames: Texture[] = [];

/** `rgba()` for a palette colour. Bake time only — nothing here runs per frame. */
function css(colour: number, alpha: number): string {
  const r = (colour >> 16) & 0xff;
  const g = (colour >> 8) & 0xff;
  const b = colour & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Where a frame sits on the sheet, in logical px. */
function rectOf(index: number): Rectangle {
  if (index === FRAME_BUBBLE) return new Rectangle(0, BUBBLE_Y, BUBBLE_W, BUBBLE_H);
  const col = index % ATLAS_COLS;
  const row = Math.floor(index / ATLAS_COLS);
  return new Rectangle(col * CELL, row * CELL, CELL, CELL);
}

/**
 * One glyph, centred in its cell.
 *
 * The offset is `(CELL - GLYPH_W)/2, (CELL - GLYPH_H)/2` = (3.5, 2), pinned by
 * the signed decision §3.3: with `anchor.set(0.5, 0.5)` on every pooled
 * sprite the glyph's own centre then lands exactly on the sprite's position,
 * which is what makes a label's advance a property of `GLYPH_ADVANCE_PX`
 * alone. The strokes are walked in order because order is the contract, and
 * `glyphs.ts`'s `expand()` lays them out as every ink rim first and then
 * every cream body — so a two-shape glyph's second rim cannot paint over its
 * first body, which is what used to cost the plus sign its arms.
 */
function paintGlyph(ctx: CanvasRenderingContext2D, index: number, glyph: number): void {
  const box = rectOf(index);
  ctx.save();
  ctx.translate(box.x + (CELL - GLYPH_W) / 2, box.y + (CELL - GLYPH_H) / 2);
  for (const stroke of GLYPHS[glyph]!) {
    const pts = stroke.points;
    ctx.beginPath();
    ctx.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
    if (stroke.closed) ctx.closePath();
    if (stroke.fill !== null) {
      ctx.fillStyle = css(stroke.fill, 1);
      ctx.fill();
    }
    if (stroke.stroke !== null) {
      ctx.strokeStyle = css(stroke.stroke, 1);
      ctx.lineWidth = stroke.width;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** The coin, mid-flip: a gold ellipse with a rim and one highlight. */
function paintCoin(ctx: CanvasRenderingContext2D, step: number): void {
  const box = rectOf(FRAME_COIN_0 + step);
  const cx = box.x + CELL / 2;
  const cy = box.y + CELL / 2;
  const rx = Math.max(0.6, COIN_R * COIN_FLIP[step]!);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, COIN_R, 0, 0, Math.PI * 2);
  ctx.fillStyle = css(PALETTE.gold, 1);
  ctx.fill();
  ctx.strokeStyle = css(shade(PALETTE.gold, 0.35), 1);
  ctx.lineWidth = RIM_W;
  ctx.stroke();
  // One highlight, up and to the left, so the face reads as metal rather than
  // a disc — the prototype's coin does the same with a lighter arc.
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.25, cy - COIN_R * 0.3, Math.max(0.3, rx * 0.34), COIN_R * 0.36, 0, 0, Math.PI * 2);
  ctx.fillStyle = css(PALETTE.creamHi, 0.85);
  ctx.fill();
}

/** The twinkle: four points about the cell's centre, turning as it shrinks. */
function paintSpark(ctx: CanvasRenderingContext2D, step: number): void {
  const box = rectOf(FRAME_SPARK_0 + step);
  const cx = box.x + CELL / 2;
  const cy = box.y + CELL / 2;
  const r = SPARK_R[step]!;
  const turn = (step / (FX_FRAMES - 1)) * (Math.PI / 2);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = turn + (i * Math.PI) / 4;
    const radius = i % 2 === 0 ? r : r * SPARK_WAIST;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = css(PALETTE.creamHi, 1);
  ctx.fill();
  ctx.strokeStyle = css(PALETTE.gold, 0.9);
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

/** The puff: warm grey, growing, no rim — it is air, not a thing. */
function paintDust(ctx: CanvasRenderingContext2D, step: number): void {
  const box = rectOf(FRAME_DUST_0 + step);
  ctx.beginPath();
  ctx.arc(box.x + CELL / 2, box.y + CELL / 2, DUST_R[step]!, 0, Math.PI * 2);
  ctx.fillStyle = css(shade(PALETTE.warmWhite, DUST_TONE_T), 1);
  ctx.fill();
}

/**
 * The reaction card: the same warm white and ink rim as `characterView.ts`'s
 * desire bubble, so a greeting and a want read as one language.
 */
function paintBubble(ctx: CanvasRenderingContext2D): void {
  const box = rectOf(FRAME_BUBBLE);
  const x = box.x + RIM_W;
  const y = box.y + RIM_W;
  const w = BUBBLE_W - RIM_W * 2;
  const h = BUBBLE_CARD_H - RIM_W;
  ctx.fillStyle = css(PALETTE.warmWhite, 1);
  ctx.strokeStyle = css(PALETTE.ink, 1);
  ctx.lineWidth = RIM_W;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, BUBBLE_CORNER);
  ctx.fill();
  ctx.stroke();
  // The tail, drawn over the card's bottom edge so the rim does not cross it.
  const mid = box.x + BUBBLE_W / 2;
  const foot = box.y + BUBBLE_H - RIM_W;
  ctx.beginPath();
  ctx.moveTo(mid - BUBBLE_TAIL_W / 2, y + h - RIM_W);
  ctx.lineTo(mid + BUBBLE_TAIL_W / 2, y + h - RIM_W);
  ctx.lineTo(mid - BUBBLE_TAIL_W / 4, foot);
  ctx.closePath();
  ctx.fillStyle = css(PALETTE.warmWhite, 1);
  ctx.fill();
  ctx.strokeStyle = css(PALETTE.ink, 1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(mid - BUBBLE_TAIL_W / 2 + RIM_W, y + h - RIM_W);
  ctx.lineTo(mid + BUBBLE_TAIL_W / 2 - RIM_W, y + h - RIM_W);
  ctx.strokeStyle = css(PALETTE.warmWhite, 1);
  ctx.lineWidth = RIM_W * 1.6;
  ctx.stroke();
}

/** Bake the sheet. Called once, on the first frame anybody asks for. */
function build(): void {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W * ATLAS_RES;
  canvas.height = ATLAS_H * ATLAS_RES;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for the effects atlas');
  ctx.scale(ATLAS_RES, ATLAS_RES);
  // Round joins and caps once: the glyph data is polylines in a 9x12 box and
  // nothing in it depends on a miter.
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (let g = 0; g < GLYPH_COUNT; g++) paintGlyph(ctx, frameForGlyph(g), g);
  for (let step = 0; step < FX_FRAMES; step++) {
    paintCoin(ctx, step);
    paintSpark(ctx, step);
    paintDust(ctx, step);
  }
  paintBubble(ctx);
  // FRAME_BLANK is left untouched: one transparent cell, which is the blend
  // fence's texture (BL-048).

  // The resolution goes in with the source, the S2 fix recorded in
  // HC-P2-S2-LIGHT-DECISION §9 row 3: setting `source.resolution` afterwards
  // rewrites the source's size without telling the Texture.
  source = Texture.from({ resource: canvas, resolution: ATLAS_RES }).source;
  frames.length = 0;
  for (let i = 0; i < FRAME_COUNT; i++) frames.push(new Texture({ source, frame: rectOf(i) }));
}

/**
 * One frame of the sheet, by index. Builds the atlas on the first call.
 *
 * An index nobody baked returns the transparent cell rather than throwing:
 * a missing effect must never be able to take the frame down.
 */
export function fxFrame(index: number): Texture {
  if (!source) build();
  const at = index >= 0 && index < FRAME_COUNT ? index : FRAME_BLANK;
  return frames[at]!;
}

/** Whether the sheet has been baked yet. For diagnostics and the tests. */
export function fxAtlasReady(): boolean {
  return source !== null;
}

/** Forget the sheet. Mirrors `resetGlowCache()`, for tests and a dead renderer. */
export function resetFxAtlas(): void {
  for (const frame of frames) frame.destroy(false);
  frames.length = 0;
  if (source) source.destroy();
  source = null;
}
