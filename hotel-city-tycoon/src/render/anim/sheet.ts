/**
 * Slicing a character's sheet into the frames of one clip.
 *
 * The sheet is a grid: a row per clip, a column per frame, laid out by that
 * character's animation file and declared in the manifest as an `anim` block
 * (HC-P2-S1, DEC-012). Reading the layout from the manifest rather than from
 * constants here is what ART-0 §17 asks for, and it is what lets the frame
 * count of a clip change in `data/animations/` without touching the renderer.
 *
 * Slicing allocates a texture per frame, so it happens once per character and
 * clip and never inside the render loop.
 */
import { Rectangle, Texture } from 'pixi.js';
import { texture, entryFor, assetGeneration } from '../assets.ts';
import type { AnimSpec, AnimClip } from '../assets.ts';

/** Sliced rows, keyed by `<assetKey>|<clip>`. */
const rows = new Map<string, Texture[] | null>();
/**
 * The asset generation the null entries above were recorded under.
 *
 * A null means "no sheet yet", and the sheet can still arrive: drop the nulls
 * whenever a bundle lands and keep the frames already sliced. Without this a
 * view created before its bundle loaded kept its placeholder for the whole
 * session — a street of blank capsules beside one properly drawn character.
 */
let sheetGeneration = -1;

/** The layout the manifest declares for this character, if it declares one. */
export function animOf(assetKey: string): AnimSpec | null {
  return entryFor(assetKey)?.anim ?? null;
}

/** One clip's declared timing, or null when this character has no such row. */
export function clipOf(assetKey: string, clip: string): AnimClip | null {
  return animOf(assetKey)?.clips[clip] ?? null;
}

/** Every clip this character's sheet carries. */
export function clipNames(assetKey: string): string[] {
  const spec = animOf(assetKey);
  return spec ? Object.keys(spec.clips) : [];
}

/**
 * The frames of one clip, or null when the sheet or the row is missing.
 *
 * Callers fall back to their placeholder on null. That is the contract the
 * whole render layer keeps: there is always something to draw.
 */
export function framesFor(assetKey: string, clip: string): Texture[] | null {
  const generation = assetGeneration();
  if (generation !== sheetGeneration) {
    sheetGeneration = generation;
    for (const [key, value] of rows) if (value === null) rows.delete(key);
  }
  const cacheKey = `${assetKey}|${clip}`;
  const cached = rows.get(cacheKey);
  if (cached !== undefined) return cached;

  const spec = animOf(assetKey);
  const row = spec?.clips[clip];
  const sheet = texture(assetKey);
  if (!spec || !row || !sheet) { rows.set(cacheKey, null); return null; }

  const { w, h } = spec.frame;
  const out: Texture[] = [];
  for (let i = 0; i < row.frames; i++) {
    out.push(new Texture({
      source: sheet.source,
      frame: new Rectangle(i * w, row.row * h, w, h),
    }));
  }
  rows.set(cacheKey, out);
  return out;
}

/**
 * One frame of one clip, falling back to the first frame of `idle` — a
 * character whose sheet lacks the row the bridge asked for still stands there
 * rather than vanishing.
 */
export function frameOf(assetKey: string, clip: string, index: number): Texture | null {
  const frames = framesFor(assetKey, clip) ?? framesFor(assetKey, 'idle');
  if (!frames || frames.length === 0) return null;
  return frames[index % frames.length] ?? frames[0] ?? null;
}

/** Reset between tests. */
export function resetSheetCache(): void {
  rows.clear();
  sheetGeneration = -1;
}
