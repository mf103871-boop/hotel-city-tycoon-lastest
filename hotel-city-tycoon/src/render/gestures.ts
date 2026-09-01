/**
 * Gesture state machine.
 *
 * Extracted from the scene as pure state so the awkward transitions can be
 * tested without a browser. The audit flagged two of them, and both are the
 * kind of thing that only shows up under a real thumb:
 *
 *   1. Lifting one finger after a pinch left the drag anchored to the finger
 *      that went away, so the hotel jumped.
 *   2. A pinch that ended with barely any movement was reported as a tap,
 *      opening a room the player never meant to touch.
 *
 * The machine below tracks pointers and reports intent. It knows nothing about
 * cameras or rendering.
 */

export interface Point {
  x: number;
  y: number;
}

/** Movement below this on pointer-up counts as a tap. */
export const TAP_SLOP_PX = 8;

export type GestureAction =
  | { kind: 'none' }
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'zoom'; factor: number; anchor: Point }
  | { kind: 'tap'; at: Point };

export class GestureTracker {
  private readonly pointers = new Map<number, Point>();
  private anchor: Point | null = null;
  private travelled = 0;
  private pinchDistance = 0;
  /** Set once two fingers touch, cleared only when all fingers lift. */
  private pinched = false;

  get pointerCount(): number {
    return this.pointers.size;
  }

  get isPinching(): boolean {
    return this.pointers.size >= 2;
  }

  down(id: number, p: Point): void {
    this.pointers.set(id, { ...p });
    if (this.pointers.size === 1) {
      this.anchor = { ...p };
      this.travelled = 0;
      this.pinched = false;
    } else if (this.pointers.size === 2) {
      this.pinched = true;
      this.pinchDistance = this.spread();
    }
  }

  move(id: number, p: Point): GestureAction {
    const previous = this.pointers.get(id);
    if (!previous) return { kind: 'none' };
    this.pointers.set(id, { ...p });

    if (this.pointers.size >= 2) {
      const distance = this.spread();
      if (this.pinchDistance > 0 && distance > 0) {
        const factor = distance / this.pinchDistance;
        this.pinchDistance = distance;
        return { kind: 'zoom', factor, anchor: this.centre() };
      }
      this.pinchDistance = distance;
      return { kind: 'none' };
    }

    if (!this.anchor) return { kind: 'none' };
    const dx = p.x - this.anchor.x;
    const dy = p.y - this.anchor.y;
    this.travelled += Math.abs(dx) + Math.abs(dy);
    this.anchor = { ...p };
    return { kind: 'pan', dx, dy };
  }

  up(id: number, p: Point): GestureAction {
    const wasSingle = this.pointers.size === 1;
    this.pointers.delete(id);

    if (this.pointers.size === 1) {
      // One finger left after a pinch. Re-anchor to the finger that is still
      // down, or the next drag jumps by the distance between the two.
      const [remaining] = [...this.pointers.values()];
      if (remaining) this.anchor = { ...remaining };
      this.pinchDistance = 0;
      // Keep `pinched` set: this gesture was a pinch and must not end as a tap.
      return { kind: 'none' };
    }

    if (this.pointers.size === 0) {
      const wasPinch = this.pinched;
      const travelled = this.travelled;
      this.reset();
      if (wasSingle && !wasPinch && travelled < TAP_SLOP_PX) {
        return { kind: 'tap', at: { ...p } };
      }
      return { kind: 'none' };
    }

    this.pinchDistance = this.spread();
    return { kind: 'none' };
  }

  /** Pointer cancelled by the OS — a notification, a call. Drop everything. */
  cancel(): void {
    this.reset();
  }

  private reset(): void {
    this.pointers.clear();
    this.anchor = null;
    this.travelled = 0;
    this.pinchDistance = 0;
    this.pinched = false;
  }

  private spread(): number {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private centre(): Point {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return { x: 0, y: 0 };
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
}
