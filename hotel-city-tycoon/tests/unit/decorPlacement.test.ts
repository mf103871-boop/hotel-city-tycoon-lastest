/**
 * Pure maths for DEC-010 decor position (docs/HC-P1-S1-PLACEMENT-DECISION.md).
 *
 * No Pixi and no state mutation here — see decorPlacement.ts's own header for
 * why that split matters. This is what both PLACE_DECOR and the 17→18 save
 * migration lean on to pick an anchor.
 */
import { describe, it, expect } from 'vitest';
import { simData } from '../support/fixture.ts';
import {
  anchorBoundsFor, slotTypeFor, firstFreeAnchor, anchorKey, anchorReachFor,
  ANCHOR_UNITS_PER_BLOCK, ANCHOR_EDGE_INSET,
} from '../../src/core/systems/decorPlacement.ts';

const data = simData();

describe('anchorBoundsFor', () => {
  it('falls back to a 1x1-block room without data', () => {
    expect(anchorBoundsFor(null, 'presidential')).toEqual({ w: 16, h: 16 });
  });

  it('falls back to 1x1 for a defId that does not exist, even with data', () => {
    expect(anchorBoundsFor(data, 'no-such-room')).toEqual({ w: 16, h: 16 });
  });

  it('falls back to 1x1 when no roomDefId is given at all', () => {
    expect(anchorBoundsFor(data, undefined)).toEqual({ w: 16, h: 16 });
  });

  it('reads the room\'s real footprint when both are available', () => {
    const economy = data.rooms.find((r) => r.id === 'economy')!;
    expect(anchorBoundsFor(data, 'economy')).toEqual({
      w: economy.blocks.w * ANCHOR_UNITS_PER_BLOCK,
      h: economy.blocks.h * ANCHOR_UNITS_PER_BLOCK,
    });
    const presidential = data.rooms.find((r) => r.id === 'presidential')!;
    expect(presidential.blocks.w).toBeGreaterThan(1);
    expect(anchorBoundsFor(data, 'presidential')).toEqual({
      w: presidential.blocks.w * ANCHOR_UNITS_PER_BLOCK,
      h: presidential.blocks.h * ANCHOR_UNITS_PER_BLOCK,
    });
  });
});

describe('slotTypeFor', () => {
  it('is null without data, whatever the defId', () => {
    expect(slotTypeFor(null, 'wallpaper_plain')).toBeNull();
  });

  it('is null for an unknown defId even with data', () => {
    expect(slotTypeFor(data, 'no-such-decor')).toBeNull();
  });

  it('reads the real slotType when both are available', () => {
    const def = data.decor.find((d) => d.id === 'wallpaper_plain')!;
    expect(slotTypeFor(data, 'wallpaper_plain')).toBe(def.slotType);
  });
});

describe('firstFreeAnchor', () => {
  const bounds = { w: 16, h: 16 }; // the smallest real room

  it('stays within bounds, inset from every edge', () => {
    for (const slotType of ['wall', 'ceiling', 'floor', 'bed', null]) {
      const { x, y } = firstFreeAnchor(bounds, slotType, new Set());
      expect(x).toBeGreaterThanOrEqual(ANCHOR_EDGE_INSET);
      expect(x).toBeLessThan(bounds.w - ANCHOR_EDGE_INSET);
      expect(y).toBeGreaterThanOrEqual(ANCHOR_EDGE_INSET);
      expect(y).toBeLessThan(bounds.h - ANCHOR_EDGE_INSET);
    }
  });

  it('prefers the ceiling band above the wall band above the floor band', () => {
    const ceiling = firstFreeAnchor(bounds, 'ceiling', new Set());
    const wall = firstFreeAnchor(bounds, 'wall', new Set());
    const floor = firstFreeAnchor(bounds, 'floor', new Set());
    const bed = firstFreeAnchor(bounds, 'bed', new Set());
    const unknown = firstFreeAnchor(bounds, null, new Set());
    expect(ceiling.y).toBeLessThan(wall.y);
    expect(wall.y).toBeLessThan(floor.y);
    // bed and an unknown slotType both default to the floor line.
    expect(bed.y).toBe(floor.y);
    expect(unknown.y).toBe(floor.y);
  });

  it('is deterministic: the same inputs always produce the same anchor', () => {
    const taken = new Set(['5,10', '6,10']);
    const a = firstFreeAnchor(bounds, 'wall', taken);
    const b = firstFreeAnchor(bounds, 'wall', taken);
    expect(a).toEqual(b);
  });

  it('never repeats an anchor already taken, up to the room\'s real decor cap', () => {
    const taken = new Set<string>();
    const seen: string[] = [];
    const cap = data.economy.limits.maxDecorPerRoom;
    for (let i = 0; i < cap; i++) {
      const { x, y } = firstFreeAnchor(bounds, 'floor', taken);
      const key = anchorKey(x, y);
      expect(taken.has(key)).toBe(false);
      taken.add(key);
      seen.push(key);
    }
    expect(new Set(seen).size).toBe(cap);
  });

  it('still returns a value, even with an exhausted room, rather than throwing', () => {
    const tiny = { w: 2, h: 2 };
    expect(() => firstFreeAnchor(tiny, 'floor', new Set(['0,0', '0,1', '1,0', '1,1']))).not.toThrow();
  });
});

/**
 * HC-P1-S4. An anchor is only legal if the picture hanging off it fits in the
 * room; before this the inset was a flat unit and a 53px-wide wallpaper on a
 * 128px-wide room ended up 18px inside the room next door.
 */
describe('anchorReachFor', () => {
  it('is null without data, and null for a defId that does not exist', () => {
    expect(anchorReachFor(null, 'wallpaper_plain')).toBeNull();
    expect(anchorReachFor(data, 'no-such-decor')).toBeNull();
  });

  it('holds a piece by its feet or by its middle, as its art does', () => {
    // A bed stands on its anchor: it reaches up, never down.
    expect(anchorReachFor(data, 'bed_single')).toMatchObject({ down: 0 });
    // A hanging lamp is the mirror image.
    expect(anchorReachFor(data, 'lighting_lamp')).toMatchObject({ up: 0 });
    // A wall piece is centred on its anchor.
    const wallpaper = anchorReachFor(data, 'wallpaper_plain')!;
    expect(wallpaper.up).toBe(wallpaper.down);
    expect(wallpaper.left).toBe(wallpaper.right);
  });

  it('gives every catalogue item a reach', () => {
    for (const item of data.decor) {
      expect(anchorReachFor(data, item.id), `${item.id} has no reach`).not.toBeNull();
    }
  });
});

describe('firstFreeAnchor with a reach', () => {
  const bounds = { w: 16, h: 16 }; // the smallest real room

  it('insets the scan by the picture, not by one flat unit', () => {
    const reach = anchorReachFor(data, 'wallpaper_plain')!;
    const { x, y } = firstFreeAnchor(bounds, 'wall', new Set(), reach);
    expect(x).toBeGreaterThanOrEqual(reach.left);
    expect(x).toBeLessThanOrEqual(bounds.w - 1 - reach.right);
    expect(y).toBeGreaterThanOrEqual(reach.up);
    expect(y).toBeLessThanOrEqual(bounds.h - 1 - reach.down);
  });

  it('keeps every catalogue piece inside the smallest room', () => {
    for (const item of data.decor) {
      const reach = anchorReachFor(data, item.id)!;
      const { x, y } = firstFreeAnchor(bounds, item.slotType, new Set(), reach);
      expect(x - reach.left, `${item.id} left`).toBeGreaterThanOrEqual(0);
      expect(x + reach.right, `${item.id} right`).toBeLessThanOrEqual(bounds.w - 1);
      expect(y - reach.up, `${item.id} up`).toBeGreaterThanOrEqual(0);
      expect(y + reach.down, `${item.id} down`).toBeLessThanOrEqual(bounds.h - 1);
    }
  });

  it('still prefers the ceiling band above the wall band above the floor', () => {
    const at = (defId: string, slotType: string) =>
      firstFreeAnchor(bounds, slotType, new Set(), anchorReachFor(data, defId)).y;
    expect(at('lighting_lamp', 'ceiling')).toBeLessThan(at('wallpaper_plain', 'wall'));
    expect(at('wallpaper_plain', 'wall')).toBeLessThan(at('bed_single', 'bed'));
  });

  it('is still deterministic, and still never repeats a taken anchor', () => {
    const reach = anchorReachFor(data, 'plant_fern')!;
    const taken = new Set<string>();
    for (let i = 0; i < data.economy.limits.maxDecorPerRoom; i++) {
      const a = firstFreeAnchor(bounds, 'floor', taken, reach);
      expect(firstFreeAnchor(bounds, 'floor', taken, reach)).toEqual(a);
      const key = anchorKey(a.x, a.y);
      expect(taken.has(key)).toBe(false);
      taken.add(key);
    }
  });

  it('centres a piece too big for its room rather than pushing it outside', () => {
    const tiny = { w: 4, h: 4 };
    const { x, y } = firstFreeAnchor(tiny, 'wall', new Set(), { left: 9, right: 9, up: 9, down: 9 });
    expect(x).toBe(1);
    expect(y).toBe(1);
  });

  it('leaves the old flat-inset behaviour untouched when no reach is given', () => {
    const { x, y } = firstFreeAnchor(bounds, 'wall', new Set());
    expect(x).toBe(ANCHOR_EDGE_INSET);
    expect(y).toBeGreaterThanOrEqual(ANCHOR_EDGE_INSET);
  });
});
