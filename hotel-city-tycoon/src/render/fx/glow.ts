/**
 * Runtime textures for light: the room pools and the sky gradients.
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

const pools = new Map<string, Texture>();
const strips = new Map<string, Texture>();

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

  const tex = Texture.from(canvas);
  tex.source.resolution = scale;
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

/** Forget every baked texture. For tests, and for a renderer that was destroyed. */
export function resetGlowCache(): void {
  for (const tex of pools.values()) tex.destroy(true);
  for (const tex of strips.values()) tex.destroy(true);
  pools.clear();
  strips.clear();
}
