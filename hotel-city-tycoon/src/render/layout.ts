/**
 * Where things sit on screen.
 *
 * Translates the simulation's block grid into world pixels. Kept separate from
 * both the grid rules and the Pixi objects so the mapping can be tested and,
 * more importantly, changed in one place when the art arrives at P3b.
 */
import type { Rect } from '../core/state/grid.ts';
import type { WorldBounds } from './camera.ts';

/** One grid block, in world pixels. Rooms are wider than they are tall. */
export const BLOCK_W = 128;
export const BLOCK_H = 96;

/** Y grows upward in the hotel but downward on screen, so rows are flipped. */
export function blockToWorld(x: number, y: number, plotHeight: number): { x: number; y: number } {
  return { x: x * BLOCK_W, y: (plotHeight - 1 - y) * BLOCK_H };
}

export function worldToBlock(wx: number, wy: number, plotHeight: number): { x: number; y: number } {
  return {
    x: Math.floor(wx / BLOCK_W),
    y: plotHeight - 1 - Math.floor(wy / BLOCK_H),
  };
}

/** World-space rectangle for a room footprint. */
export function roomWorldRect(rect: Rect, plotHeight: number): WorldBounds {
  const topLeft = blockToWorld(rect.x, rect.y + rect.h - 1, plotHeight);
  return { x: topLeft.x, y: topLeft.y, width: rect.w * BLOCK_W, height: rect.h * BLOCK_H };
}

/**
 * Decor anchor units (DEC-010, docs/HC-P1-S1-PLACEMENT-DECISION.md): 16 per
 * block, so one unit is 8px horizontally and 6px vertically at 1x. A piece's
 * `localX`/`localY` are in these units, measured from the room's own
 * top-left — the same origin RoomView draws its own art from (roomView.ts),
 * so the conversion below is the only step needed to place a piece inside a
 * room's local Pixi space.
 */
export const ANCHOR_UNITS_PER_BLOCK = 16;
export const ANCHOR_PX_X = BLOCK_W / ANCHOR_UNITS_PER_BLOCK;
export const ANCHOR_PX_Y = BLOCK_H / ANCHOR_UNITS_PER_BLOCK;

/** A decor anchor, in room-local pixels from the room's top-left. */
export function anchorToLocalPx(localX: number, localY: number): { x: number; y: number } {
  return { x: localX * ANCHOR_PX_X, y: localY * ANCHOR_PX_Y };
}

/** World bounds of the whole buildable plot, plus ground and sky margin. */
export function plotWorldBounds(gridW: number, gridH: number): WorldBounds {
  const marginX = BLOCK_W;
  const marginTop = BLOCK_H * 2;
  const ground = BLOCK_H;
  return {
    x: -marginX,
    y: -marginTop,
    width: gridW * BLOCK_W + marginX * 2,
    height: gridH * BLOCK_H + marginTop + ground,
  };
}

/** Draw order. Lower numbers are further back. */
export const LAYER = {
  sky: 0,
  cityscape: 10,
  street: 20,
  roomShell: 30,
  roomFloor: 40,
  decor: 50,
  characters: 60,
  hazards: 70,
  overlays: 80,
  indicators: 90,
} as const;

export type LayerName = keyof typeof LAYER;

/**
 * The sorted band: one draw order shared by everything standing on the floor.
 *
 * `decorArt.ts` has always said that a piece in the `front` band "has to sort
 * against the guests walking past it — footY sorted". It did not: the pieces
 * were drawn inside their RoomView, in the `roomShell` layer, and the people
 * were in `characters` above it. Two fixed layers, so nobody could ever walk
 * behind a sofa. These give both the same number, in one formula, so they
 * interleave by the foot they stand on.
 *
 * `DEPTH_ROW` has to be larger than the widest the world can ever be in
 * pixels, or a piece far to the right sorts into the row below it. The largest
 * plot `data/plots.json` sells is 15 blocks wide — 1920px — and
 * `tools/selftest/render.ts` holds that under this number.
 */
export const DEPTH_ROW = 4096;

/**
 * A tie on the foot line goes to the person.
 *
 * A guest standing exactly on a rug's own foot line is standing *on* the rug,
 * and the same guest at a bed's foot line is in front of it. Decor keeps the
 * fractional part below this so it never wins that tie, while `depth` still
 * separates the rug from the bed standing on it.
 */
export const DEPTH_CHARACTER_BIAS = 0.5;

/** Where one thing sorts in the band: its foot, then its column, then its bias. */
export function bandDepth(worldX: number, footY: number, bias = 0): number {
  return footY * DEPTH_ROW + worldX + bias;
}
