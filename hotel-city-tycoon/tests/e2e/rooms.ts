/**
 * Where the rooms are on screen.
 *
 * The scenarios used to tap a coordinate that happened to hold a room on one
 * viewport (0.5 × 0.62 of the canvas, or 120 × 260) and quietly skipped on
 * every other. The renderer now reports each room's rectangle in CSS pixels
 * through `window.hct.roomRects()`, so a scenario asks where a room is and
 * taps that, whatever the device and whatever the camera did.
 */
import type { Page } from '@playwright/test';

export interface ScreenRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The band of the canvas not covered by the header or the footer. */
async function visibleBand(page: Page): Promise<{ top: number; bottom: number; width: number }> {
  return page.evaluate(() => ({
    top: document.querySelector('[data-hud="top"]')?.getBoundingClientRect().bottom ?? 0,
    bottom: document.querySelector('[data-hud="bottom"]')?.getBoundingClientRect().top ?? window.innerHeight,
    width: window.innerWidth,
  }));
}

/**
 * Every room the renderer is drawing, in canvas CSS pixels.
 *
 * Waits briefly for the scene: the handle appears once the renderer has
 * initialised, a moment after the interface is usable. Empty when there is
 * no canvas lane (the renderer failed to start, as it may without 3D APIs).
 */
export async function roomRects(page: Page, timeoutMs = 10_000): Promise<ScreenRect[]> {
  const started = Date.now();
  for (;;) {
    const rects = await page.evaluate(() => {
      const w = window as unknown as { hct?: { roomRects?: () => ScreenRect[] } };
      return w.hct?.roomRects?.() ?? [];
    });
    if (rects.length > 0 || Date.now() - started > timeoutMs) return rects;
    await page.waitForTimeout(250);
  }
}

/** Rooms whose centre is on the canvas and clear of both HUD bars. */
export async function tappableRooms(page: Page): Promise<ScreenRect[]> {
  const [rects, band] = await Promise.all([roomRects(page), visibleBand(page)]);
  return rects.filter((r) => {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    return cx > 0 && cx < band.width && cy > band.top && cy < band.bottom;
  });
}

/**
 * Tap a room — the lowest one on screen, which is the ground row on a fresh
 * hotel — and return its id, or null when no room can be reached.
 */
export async function tapRoom(page: Page, roomId?: string): Promise<string | null> {
  let rooms = await tappableRooms(page);
  // A readable portrait opening need not show every bedroom. Tests needing
  // a particular room use the real zoom gesture until that room is visible,
  // rather than silently treating the reception desk as a guest bedroom.
  if (roomId) {
    for (let attempt = 0; attempt < 18 && !rooms.some((r) => r.id === roomId); attempt++) {
      const band = await visibleBand(page);
      await page.mouse.move(band.width / 2, (band.top + band.bottom) / 2);
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(100);
      rooms = await tappableRooms(page);
    }
  }
  const room = roomId ? rooms.find((r) => r.id === roomId)
    : rooms.reduce<ScreenRect | null>((a, b) => (a && a.y + a.h > b.y + b.h ? a : b), null);
  if (!room) return null;
  const box = await page.locator('canvas').boundingBox();
  if (!box) return null;
  await page.mouse.click(box.x + room.x + room.w / 2, box.y + room.y + room.h / 2);
  return room.id;
}

/**
 * Screen points on the rows above the rooms, for placement scenarios that
 * need an empty square: one and two rows up from each room, so a fresh
 * three-row plot offers its free top row wherever the camera sits.
 */
export async function emptySquares(page: Page): Promise<Array<{ x: number; y: number }>> {
  const [rooms, band, box] = await Promise.all([tappableRooms(page), visibleBand(page), page.locator('canvas').boundingBox()]);
  if (!box) return [];
  const points: Array<{ x: number; y: number }> = [];
  for (const rowsUp of [1, 2]) {
    for (const r of rooms) {
      const x = box.x + r.x + r.w / 2;
      const y = box.y + r.y + r.h / 2 - rowsUp * r.h;
      if (y > band.top && y < band.bottom) points.push({ x, y });
    }
  }
  return points;
}
