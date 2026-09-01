/**
 * Grid geometry.
 *
 * The hotel is a grid of blocks. Every room occupies a rectangle of them, and
 * rooms may sit anywhere inside the purchased plot — they do not have to touch,
 * which is what allows the tower, pyramid and scattered layouts the original
 * game became known for.
 *
 * This module is pure arithmetic with no dependency on the renderer, so the
 * placement rules are the same whether they are checked by the simulation, by
 * a test, or eventually by a server.
 */
import type { SimData, Blocks } from '../data-source.ts';
import { roomById } from '../data-source.ts';
import { roomDef } from '../data-source.ts';
import type { GameState, RoomInstance } from './types.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function footprintOf(data: SimData, room: RoomInstance): Rect {
  const def = roomDef(data, room.defId);
  return { x: room.x, y: room.y, w: def.blocks.w, h: def.blocks.h };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

/** The buildable area, from the plot the player currently owns. */
export function plotBounds(data: SimData, state: GameState): Rect {
  const plot = data.plots.find((p) => p.id === state.hotel.plotId) ?? data.plots[0];
  const grid: Blocks = plot?.grid ?? { w: 4, h: 3 };
  return { x: 0, y: 0, w: grid.w, h: grid.h };
}

/** Why a placement is refused, or null when it is fine. */
export type PlacementProblem = 'outOfBounds' | 'overlaps' | null;

export function checkPlacement(
  data: SimData,
  state: GameState,
  blocks: Blocks,
  x: number,
  y: number,
  ignoreRoomId?: string,
): PlacementProblem {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return 'outOfBounds';
  const rect: Rect = { x, y, w: blocks.w, h: blocks.h };
  if (!contains(plotBounds(data, state), rect)) return 'outOfBounds';

  for (const room of state.hotel.rooms) {
    if (room.id === ignoreRoomId) continue;
    if (overlaps(rect, footprintOf(data, room))) return 'overlaps';
  }
  return null;
}

/**
 * Everything wrong with putting this room here, or null.
 *
 * ONE source of truth for placement, used by `MOVE_ROOM`, by
 * `PLACE_STORED_ROOM`, by the preview and by whether Confirm is enabled. They
 * used to answer separately: `checkPlacement` knows nothing about `sameSpot`,
 * so the preview went green over the square a room was already standing in and
 * the command then refused it. A preview that disagrees with the command is
 * worse than no preview.
 *
 * `movingRoomId` is the room being picked up — it ignores itself when checking
 * overlap, and it is what makes `sameSpot` detectable at all.
 */
export function placementProblemAt(
  data: SimData,
  state: GameState,
  defId: string,
  x: number,
  y: number,
  movingRoomId?: string,
): PlacementProblem | 'sameSpot' | 'unknownRoom' {
  const def = roomById(data, defId);
  if (!def) return 'unknownRoom';

  if (movingRoomId !== undefined) {
    const moving = state.hotel.rooms.find((r) => r.id === movingRoomId);
    // Putting a room back exactly where it already is is not a move. The core
    // has always said so; now the preview says it first.
    if (moving && moving.x === x && moving.y === y) return 'sameSpot';
  }

  return checkPlacement(data, state, def.blocks, x, y, movingRoomId);
}

/**
 * First free position for a room of this size, scanning bottom-up then
 * left-to-right. Bottom-up because a hotel grows upward, and a player watching
 * auto-placement expects new floors to stack rather than scatter.
 */
export function findFreeSpot(
  data: SimData,
  state: GameState,
  blocks: Blocks,
): { x: number; y: number } | null {
  const bounds = plotBounds(data, state);
  for (let y = 0; y + blocks.h <= bounds.h; y++) {
    for (let x = 0; x + blocks.w <= bounds.w; x++) {
      if (checkPlacement(data, state, blocks, x, y) === null) return { x, y };
    }
  }
  return null;
}

/** Blocks currently covered by rooms. Used by the HUD and by placement previews. */
export function occupancyMap(data: SimData, state: GameState): boolean[][] {
  const bounds = plotBounds(data, state);
  const map: boolean[][] = Array.from({ length: bounds.h }, () => new Array<boolean>(bounds.w).fill(false));
  for (const room of state.hotel.rooms) {
    const rect = footprintOf(data, room);
    for (let dy = 0; dy < rect.h; dy++) {
      for (let dx = 0; dx < rect.w; dx++) {
        const row = map[rect.y + dy];
        if (row && rect.x + dx < bounds.w) row[rect.x + dx] = true;
      }
    }
  }
  return map;
}

/** Free blocks remaining inside the plot. */
export function freeBlocks(data: SimData, state: GameState): number {
  let free = 0;
  for (const row of occupancyMap(data, state)) {
    for (const taken of row) if (!taken) free++;
  }
  return free;
}

/** The room at a grid cell, if any. Used for tap handling. */
export function roomAt(data: SimData, state: GameState, x: number, y: number): RoomInstance | null {
  const point: Rect = { x, y, w: 1, h: 1 };
  for (const room of state.hotel.rooms) {
    if (overlaps(point, footprintOf(data, room))) return room;
  }
  return null;
}
