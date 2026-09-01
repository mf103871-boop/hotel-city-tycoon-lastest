/**
 * Camera maths.
 *
 * Pure arithmetic, no Pixi. Separating the camera's rules from its rendering
 * is what lets pan clamping, zoom limits and coordinate conversion be tested
 * without a browser — which matters, because "the hotel scrolled off screen
 * and I can't get back" is the kind of bug that only shows up on a real device
 * at the worst moment.
 */

export interface Viewport {
  width: number;
  height: number;
}

export interface WorldBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CameraState {
  /** World coordinate at the centre of the viewport. */
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 2.5;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Keep the camera over the hotel.
 *
 * When the world is smaller than the viewport on an axis, the camera centres
 * on it rather than clamping to an edge — otherwise a small hotel would sit
 * jammed into a corner.
 */
export function clampCamera(cam: CameraState, view: Viewport, world: WorldBounds): CameraState {
  const zoom = clampZoom(cam.zoom);
  const halfW = view.width / (2 * zoom);
  const halfH = view.height / (2 * zoom);

  const minX = world.x + halfW;
  const maxX = world.x + world.width - halfW;
  const minY = world.y + halfH;
  const maxY = world.y + world.height - halfH;

  const x = minX > maxX ? world.x + world.width / 2 : Math.min(maxX, Math.max(minX, cam.x));
  const y = minY > maxY ? world.y + world.height / 2 : Math.min(maxY, Math.max(minY, cam.y));

  return { x, y, zoom };
}

export function worldToScreen(p: { x: number; y: number }, cam: CameraState, view: Viewport): { x: number; y: number } {
  return {
    x: (p.x - cam.x) * cam.zoom + view.width / 2,
    y: (p.y - cam.y) * cam.zoom + view.height / 2,
  };
}

export function screenToWorld(p: { x: number; y: number }, cam: CameraState, view: Viewport): { x: number; y: number } {
  return {
    x: (p.x - view.width / 2) / cam.zoom + cam.x,
    y: (p.y - view.height / 2) / cam.zoom + cam.y,
  };
}

/** Drag by a screen-space delta. */
export function pan(cam: CameraState, dxScreen: number, dyScreen: number, view: Viewport, world: WorldBounds): CameraState {
  return clampCamera({ x: cam.x - dxScreen / cam.zoom, y: cam.y - dyScreen / cam.zoom, zoom: cam.zoom }, view, world);
}

/**
 * Pinch or wheel zoom that keeps `anchor` (a screen point) over the same world
 * point. Without this the hotel slides away from the fingers, which feels
 * broken even when the numbers are right.
 */
export function zoomAt(
  cam: CameraState,
  factor: number,
  anchor: { x: number; y: number },
  view: Viewport,
  world: WorldBounds,
): CameraState {
  const before = screenToWorld(anchor, cam, view);
  const zoom = clampZoom(cam.zoom * factor);
  const after = screenToWorld(anchor, { ...cam, zoom }, view);
  return clampCamera({ x: cam.x + (before.x - after.x), y: cam.y + (before.y - after.y), zoom }, view, world);
}

/** Zoom that fits the whole world on screen, with a margin. */
export function fitZoom(view: Viewport, world: WorldBounds, margin = 0.9): number {
  if (world.width <= 0 || world.height <= 0) return 1;
  return clampZoom(Math.min(view.width / world.width, view.height / world.height) * margin);
}

export function fitCamera(view: Viewport, world: WorldBounds): CameraState {
  return clampCamera(
    { x: world.x + world.width / 2, y: world.y + world.height / 2, zoom: fitZoom(view, world) },
    view,
    world,
  );
}

/** The world rectangle currently on screen, used for culling. */
export function visibleRect(cam: CameraState, view: Viewport): WorldBounds {
  const width = view.width / cam.zoom;
  const height = view.height / cam.zoom;
  return { x: cam.x - width / 2, y: cam.y - height / 2, width, height };
}
