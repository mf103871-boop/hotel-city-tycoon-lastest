/**
 * Visibility culling.
 *
 * Anything off screen is not drawn. On a 150-block hotel with hundreds of
 * decor sprites and dozens of characters that is the difference between 60fps
 * and a slideshow on a mid-range phone.
 *
 * A margin is included so sprites entering the view are already prepared and
 * do not pop in at the edge.
 */
import type { WorldBounds } from './camera.ts';

export interface Cullable {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function intersects(a: WorldBounds, b: Cullable): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

export function expand(rect: WorldBounds, margin: number): WorldBounds {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

/**
 * Partition items into what should be drawn and what should not.
 * Returns indices rather than objects so callers can flip `renderable` on
 * their existing display objects without allocating.
 */
export function cull<T extends Cullable>(
  items: readonly T[],
  view: WorldBounds,
  margin = 128,
): { visible: number[]; hidden: number[] } {
  const padded = expand(view, margin);
  const visible: number[] = [];
  const hidden: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item && intersects(padded, item)) visible.push(i);
    else hidden.push(i);
  }
  return { visible, hidden };
}
