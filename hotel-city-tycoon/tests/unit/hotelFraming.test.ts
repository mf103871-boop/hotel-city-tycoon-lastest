import { describe, expect, it } from 'vitest';
import { occupiedHotelBounds, openingHotelCamera } from '../../src/render/hotelFraming.ts';
import { fitCamera, worldToScreen, MIN_ZOOM, MAX_ZOOM } from '../../src/render/camera.ts';
import { plotWorldBounds, roomWorldRect } from '../../src/render/layout.ts';

const world = plotWorldBounds(4, 3);
const rooms = [
  roomWorldRect({ x: 0, y: 0, w: 2, h: 1 }, 3),
  roomWorldRect({ x: 2, y: 0, w: 1, h: 1 }, 3),
  roomWorldRect({ x: 3, y: 0, w: 1, h: 1 }, 3),
  roomWorldRect({ x: 0, y: 1, w: 1, h: 1 }, 3),
];
const entrance = rooms[0]!;

describe('opening hotel composition', () => {
  it('uses occupied rooms rather than unused expansion rows', () => {
    expect(occupiedHotelBounds(rooms)).toEqual({ x: -12, y: 68, width: 536, height: 236 });
    expect(occupiedHotelBounds([])).toBeNull();
  });

  it('shows a larger starting hotel on desktop while keeping rooms clear of the HUD', () => {
    const view = { width: 1280, height: 800 }, insets = { top: 100, bottom: 220 };
    const camera = openingHotelCamera(view, world, rooms, entrance, insets);
    expect(camera.zoom).toBeGreaterThan(fitCamera(view, world, insets).zoom * 1.8);
    for (const r of rooms) {
      const tl = worldToScreen(r, camera, view);
      const br = worldToScreen({ x: r.x + r.width, y: r.y + r.height }, camera, view);
      expect(tl.x).toBeGreaterThanOrEqual(0);
      expect(br.x).toBeLessThanOrEqual(view.width);
      expect(tl.y).toBeGreaterThanOrEqual(insets.top);
      expect(br.y).toBeLessThanOrEqual(view.height - insets.bottom);
    }
  });

  it.each([{ width: 390, height: 844 }, { width: 360, height: 800 }])(
    'keeps a bedroom 288 CSS pixels wide in portrait ($width)', (view) => {
      const insets = { top: 100, bottom: 260 };
      const camera = openingHotelCamera(view, world, rooms, entrance, insets);
      expect(camera.zoom * 128).toBeGreaterThanOrEqual(288);
      const centre = worldToScreen({ x: entrance.x + entrance.width / 2,
        y: entrance.y + entrance.height / 2 }, camera, view);
      expect(centre.x).toBeCloseTo(view.width / 2);
      expect(centre.y).toBeCloseTo((insets.top + view.height - insets.bottom) / 2);
    });

  it('reframes for landscape instead of retaining the portrait crop', () => {
    const portrait = openingHotelCamera({ width: 390, height: 844 }, world, rooms, entrance,
      { top: 100, bottom: 260 });
    const view = { width: 844, height: 390 }, insets = { top: 70, bottom: 130 };
    const landscape = openingHotelCamera(view, world, rooms, entrance, insets);
    expect(landscape.zoom).toBeLessThan(portrait.zoom);
    for (const r of rooms) {
      expect(worldToScreen(r, landscape, view).y).toBeGreaterThanOrEqual(insets.top);
      expect(worldToScreen({ x: r.x, y: r.y + r.height }, landscape, view).y)
        .toBeLessThanOrEqual(view.height - insets.bottom);
    }
  });

  it('relaxes portrait zoom when the HUD leaves little height', () => {
    const view = { width: 360, height: 640 }, insets = { top: 100, bottom: 430 };
    const camera = openingHotelCamera(view, world, rooms, entrance, insets);
    expect(camera.zoom).toBeLessThan(2.25);
    expect(worldToScreen(entrance, camera, view).y).toBeGreaterThanOrEqual(insets.top);
    expect(worldToScreen({ x: entrance.x, y: entrance.y + entrance.height }, camera, view).y)
      .toBeLessThanOrEqual(view.height - insets.bottom);
  });

  it('falls back safely for an empty plot', () => {
    const view = { width: 390, height: 844 }, insets = { top: 100, bottom: 260 };
    expect(openingHotelCamera(view, world, [], null, insets)).toEqual(fitCamera(view, world, insets));
  });

  it('keeps finite coordinates and zoom limits for a large hotel', () => {
    const camera = openingHotelCamera({ width: 360, height: 640 }, plotWorldBounds(15, 12),
      [{ x: 0, y: 0, width: 1920, height: 1152 }], null, { top: 200, bottom: 420 });
    expect(camera.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(camera.zoom).toBeLessThanOrEqual(MAX_ZOOM);
    expect(Number.isFinite(camera.x) && Number.isFinite(camera.y)).toBe(true);
  });
});
