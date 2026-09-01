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
