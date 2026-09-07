/** Opening composition: frame the built hotel, not its empty expansion plot. */
import { clampCamera, clampZoom, fitCamera, fitZoom } from './camera.ts';
import type { CameraState, Insets, Viewport, WorldBounds } from './camera.ts';

export function occupiedHotelBounds(rooms: readonly WorldBounds[]): WorldBounds | null {
  if (rooms.length === 0) return null;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const room of rooms) {
    left = Math.min(left, room.x);
    top = Math.min(top, room.y);
    right = Math.max(right, room.x + room.width);
    bottom = Math.max(bottom, room.y + room.height);
  }
  // A little space for the shell, roof stars and pavement, in world pixels.
  return { x: left - 12, y: top - 28, width: right - left + 24, height: bottom - top + 44 };
}

export function openingHotelCamera(
  view: Viewport,
  world: WorldBounds,
  rooms: readonly WorldBounds[],
  entrance: WorldBounds | null,
  insets: Insets,
): CameraState {
  const hotel = occupiedHotelBounds(rooms);
  if (!hotel) return fitCamera(view, world, insets);

  const fitted = fitZoom(view, hotel, 0.94, insets);
  const portraitPhone = view.width < 640 && view.height > view.width;
  const bandHeight = Math.max(1, view.height - insets.top - insets.bottom);
  // A 128px bedroom is ~288 CSS px at this zoom. If the HUD leaves too
  // little height, keep one floor usable instead of forcing that target.
  const readable = Math.min(2.25, bandHeight * 0.9 / 116);
  const zoom = clampZoom(portraitPhone ? Math.max(fitted, readable) : fitted);
  const focus = portraitPhone && zoom > fitted && entrance ? entrance : hotel;
  const bandShift = (insets.top - insets.bottom) / (2 * zoom);
  return clampCamera({
    x: focus.x + focus.width / 2,
    y: focus.y + focus.height / 2 - bandShift,
    zoom,
  }, view, world, insets);
}
