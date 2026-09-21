/**
 * Runtime textures for light: the room pools and the sky gradients, and
 * since HC-P2-S4 the room's earned rim flash and the one transparent pixel
 * the effects layer leads with (BL-048).
 *
 * Painted once on an offscreen 2D canvas and wrapped with `Texture.from`, not
 * drawn with Pixi's own gradient fills. A `FillGradient` depends on the
 * renderer that draws it, and the DEC-009 lane runs the CanvasRenderer; a
 * baked texture is the same bitmap on every backend, so what the lane
 * screenshots is what the phone draws (DEC-018/019). Nothing here uses a
 * filter, a mask or a RenderTexture for the same reason.
 *
 * Every texture is created at first use, never at import: `document` is
 * touched only inside the functions, so node strip-types can still load the
 * modules that import this one.
 */
import { Texture } from 'pixi.js';

/** Baked at twice the drawn size so a pool stays smooth at zoom 2. */
const RESOLUTION = 2;
/** But never past this on the long side: a 3×2 room at 2x would be 768 px of gradient for nothing. */
const MAX_SIDE = 512;
/** The prototype's pool (main.ts:588-591): a warm lamp at the ceiling, gone by the floor. */
const POOL_RGB = '255,226,150';
const POOL_CORNER = 12;
const POOL_LAMP_Y = 12;
const POOL_R0 = 4;
const POOL_R1_OF_H = 1.25;

/** The rim a room flashes when it earns (HC-P2-S4). */
const RIM_RGB = '245,194,77';
/** How many strokes deep the rim is, one logical px apart. */
const RIM_STEPS = 6;
const RIM_W = 2;

const pools = new Map<string, Texture>();
const strips = new Map<string, Texture>();
const rims = new Map<string, Texture>();
let blank: Texture | null = null;

function canvasOf(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for the light textures');
  return [canvas, ctx];
}

/**
 * The warm pool a lit room casts, sized to that room.
 *
 * One texture per distinct room size, cached: the rounded-rect falloff is
 * baked into the bitmap, so the sprite needs no mask. Drawn as a Sprite of
 * `wPx`×`hPx` with `blendMode = 'add'`, which the Canvas2D lane maps to
 * `'lighter'`.
 */
export function radialPoolTexture(wPx: number, hPx: number): Texture {
  const key = `${wPx}x${hPx}`;
  const hit = pools.get(key);
  if (hit) return hit;

  const scale = Math.min(RESOLUTION, MAX_SIDE / Math.max(wPx, hPx, 1));
  const [canvas, ctx] = canvasOf(Math.ceil(wPx * scale), Math.ceil(hPx * scale));
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.roundRect(0, 0, wPx, hPx, POOL_CORNER);
  ctx.clip();
  const g = ctx.createRadialGradient(wPx / 2, POOL_LAMP_Y, POOL_R0, wPx / 2, POOL_LAMP_Y, hPx * POOL_R1_OF_H);
  g.addColorStop(0, `rgba(${POOL_RGB},1)`);
  g.addColorStop(1, `rgba(${POOL_RGB},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, wPx, hPx);

  // The resolution goes in with the source: a Texture computes its frame and
  // uvs from the source it is given, and setting `source.resolution` later
  // rewrites the source's size without telling the Texture, leaving a frame
  // twice the size of the source it sits in.
  const tex = Texture.from({ resource: canvas, resolution: scale });
  pools.set(key, tex);
  return tex;
}

/**
 * A vertical gradient strip, 4×256, to stretch over the sky.
 *
 * `stops` are `[offset 0..1, 0xRRGGBB]`; cached by their string, so the day
 * sky and the night sky are two textures made once.
 */
export function verticalGradientTexture(stops: ReadonlyArray<[number, number]>): Texture {
  const key = stops.map(([at, colour]) => `${at}:${colour}`).join(',');
  const hit = strips.get(key);
  if (hit) return hit;

  const [canvas, ctx] = canvasOf(4, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [at, colour] of stops) {
    g.addColorStop(Math.min(1, Math.max(0, at)), `#${colour.toString(16).padStart(6, '0')}`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);

  const tex = Texture.from(canvas);
  strips.set(key, tex);
  return tex;
}

/**
 * One transparent pixel: the blend fence (BL-048).
 *
 * Drawn as the first thing after the additive light batch, purely so that the
 * sprite batch's in-place `setBlendMode` (CanvasBatchAdaptor.mjs:42) leaves
 * CanvasContextSystem's cached mode and the 2D context's real
 * `globalCompositeOperation` agreeing at 'normal'. After that a Graphics
 * drawn later takes the early return at CanvasContextSystem.mjs:117, draws
 * against 'source-over' and restores 'source-over' — so it cannot start the
 * leak. It paints nothing at all; the picture is unchanged by it.
 */
export function blankTexture(): Texture {
  if (blank) return blank;
  const [canvas] = canvasOf(1, 1);
  blank = Texture.from(canvas);
  return blank;
}

/**
 * The rim a room flashes when it earns (HC-P2-S4).
 *
 * Deliberately NOT `radialPoolTexture`: that gradient is brightest near the
 * room's ceiling lamp and still about 0.72 of full strength half a room above
 * the floor, so an additive sprite using it brightens the middle of a
 * standing character — which is exactly where tests/e2e/game.spec.ts crops
 * for the ink outline, and how much of the room that crop covers depends on
 * the camera's zoom. A rim whose alpha is zero over the whole interior takes
 * the question away instead of answering it arithmetically.
 *
 * Gold rather than the pool's cream for the same reason, on the only channel
 * that binds: the rig's ink has its largest channel in blue, and gold's blue
 * is 77 against the pool's 150, so the same alpha costs half the headroom.
 */
export function roomRimTexture(wPx: number, hPx: number): Texture {
  const key = `${wPx}x${hPx}`;
  const hit = rims.get(key);
  if (hit) return hit;

  const scale = Math.min(RESOLUTION, MAX_SIDE / Math.max(wPx, hPx, 1));
  const [canvas, ctx] = canvasOf(Math.ceil(wPx * scale), Math.ceil(hPx * scale));
  ctx.scale(scale, scale);
  ctx.lineWidth = RIM_W;
  for (let i = 0; i < RIM_STEPS; i++) {
    const w = wPx - i * 2;
    const h = hPx - i * 2;
    if (w <= 0 || h <= 0) break;
    ctx.beginPath();
    ctx.roundRect(i, i, w, h, Math.max(1, POOL_CORNER - i));
    ctx.strokeStyle = `rgba(${RIM_RGB},${1 - i / RIM_STEPS})`;
    ctx.stroke();
  }

  const tex = Texture.from({ resource: canvas, resolution: scale });
  rims.set(key, tex);
  return tex;
}

/** Forget every baked texture. For tests, and for a renderer that was destroyed. */
export function resetGlowCache(): void {
  for (const tex of pools.values()) tex.destroy(true);
  for (const tex of strips.values()) tex.destroy(true);
  for (const tex of rims.values()) tex.destroy(true);
  if (blank) blank.destroy(true);
  blank = null;
  pools.clear();
  strips.clear();
  rims.clear();
}
