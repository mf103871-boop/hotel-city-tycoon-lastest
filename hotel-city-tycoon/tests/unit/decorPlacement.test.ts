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
  anchorBoundsFor, slotTypeFor, categoryFor, firstFreeAnchor, anchorKey,
  anchorRangeFor, decorAnchorFor, decorWidthUnits, DECOR_ART_SCALE,
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
  /** Scene canvas per slotType — the manifest's table (gen-asset-manifest.mjs). */
  const SIZE: Record<string, [number, number]> = {
    wall: [96, 72], floor: [72, 72], ceiling: [72, 48], bed: [104, 64],
  };
  /** One category per slotType, chosen to be the hardest case for that slot. */
  const CASES: Array<[string | null, string | null]> = [
    ['wallpaper', 'wall'], ['lighting', 'ceiling'], ['seating', 'floor'],
    ['rug', 'floor'], ['bed', 'bed'], [null, null],
  ];

  /** The piece's drawn rectangle in room pixels, given an anchor. */
  function pieceRect(category: string | null, slotType: string | null, x: number, y: number) {
    const [pw, ph] = SIZE[slotType ?? ''] ?? [72, 72];
    const [ax, ay] = decorAnchorFor(category);
    const w = pw * DECOR_ART_SCALE, h = ph * DECOR_ART_SCALE;
    const cx = x * (128 / ANCHOR_UNITS_PER_BLOCK), cy = y * (96 / ANCHOR_UNITS_PER_BLOCK);
    return { left: cx - w * ax, right: cx + w * (1 - ax), top: cy - h * ay, bottom: cy + h * (1 - ay) };
  }

  it('stays within bounds, inset from every edge', () => {
    for (const [category, slotType] of CASES) {
      const { x, y } = firstFreeAnchor(bounds, category, slotType, new Set());
      expect(x).toBeGreaterThanOrEqual(ANCHOR_EDGE_INSET);
      expect(x).toBeLessThan(bounds.w - ANCHOR_EDGE_INSET);
      expect(y).toBeGreaterThanOrEqual(ANCHOR_EDGE_INSET);
      expect(y).toBeLessThan(bounds.h - ANCHOR_EDGE_INSET);
    }
  });

  it('puts the whole piece inside the room, not just its anchor (DEC-010)', () => {
    // The rule DEC-010 actually states — "كل قطعة يجب أن تقع داخل مستطيل
    // الغرفة ... لا clipping" — which a 24x18 placeholder box could not test.
    for (const [category, slotType] of CASES) {
      const { x, y } = firstFreeAnchor(bounds, category, slotType, new Set());
      const r = pieceRect(category, slotType, x, y);
      expect(r.left, `${category}/${slotType} hangs off the left`).toBeGreaterThanOrEqual(0);
      expect(r.top, `${category}/${slotType} hangs off the top`).toBeGreaterThanOrEqual(0);
      expect(r.right, `${category}/${slotType} hangs off the right`).toBeLessThanOrEqual(128);
      expect(r.bottom, `${category}/${slotType} hangs below the floor`).toBeLessThanOrEqual(96);
    }
  });

  it('keeps every anchor in the legal range inside the room too', () => {
    for (const [category, slotType] of CASES) {
      const range = anchorRangeFor(bounds, category, slotType);
      expect(range.maxX).toBeGreaterThanOrEqual(range.minX);
      expect(range.maxY).toBeGreaterThanOrEqual(range.minY);
      for (const x of [range.minX, range.maxX]) {
        for (const y of [range.minY, range.maxY]) {
          const r = pieceRect(category, slotType, x, y);
          expect(r.left).toBeGreaterThanOrEqual(0);
          expect(r.right).toBeLessThanOrEqual(128);
          expect(r.top).toBeGreaterThanOrEqual(0);
          expect(r.bottom).toBeLessThanOrEqual(96);
        }
      }
    }
  });

  it('starts in the middle and spreads pieces apart, not into a pile', () => {
    // Left-to-right scanning stacked a room's furniture into its left quarter;
    // stepping outward one anchor unit at a time then stacked it in the middle,
    // because one unit is 8px and an armchair is 40px wide.
    const taken = new Set<string>();
    const xs: number[] = [];
    for (let i = 0; i < 3; i++) {
      const { x, y } = firstFreeAnchor(bounds, 'seating', 'floor', taken);
      taken.add(anchorKey(x, y));
      xs.push(x);
    }
    const centre = (bounds.w - 1) / 2;
    expect(Math.abs(xs[0]! - centre), 'the first piece is not in the middle').toBeLessThanOrEqual(1);
    const width = decorWidthUnits('floor');
    const sorted = [...xs].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]! - sorted[i - 1]!,
        `pieces ${sorted[i - 1]} and ${sorted[i]} overlap`).toBeGreaterThanOrEqual(width);
    }
  });

  it('prefers the ceiling band above the wall band above the floor band', () => {
    const ceiling = firstFreeAnchor(bounds, 'lighting', 'ceiling', new Set());
    const wall = firstFreeAnchor(bounds, 'wallpaper', 'wall', new Set());
    const floor = firstFreeAnchor(bounds, 'seating', 'floor', new Set());
    const bed = firstFreeAnchor(bounds, 'bed', 'bed', new Set());
    const unknown = firstFreeAnchor(bounds, null, null, new Set());
    expect(ceiling.y).toBeLessThan(wall.y);
    expect(wall.y).toBeLessThan(floor.y);
    // bed and an unknown slotType both default to the floor line of their own
    // size, which is not the same line: a bed is shorter than an armchair.
    expect(bed.y).toBeGreaterThan(wall.y);
    expect(unknown.y).toBe(floor.y);
  });

  it('is deterministic: the same inputs always produce the same anchor', () => {
    const taken = new Set(['5,10', '6,10']);
    const a = firstFreeAnchor(bounds, 'wallpaper', 'wall', taken);
    const b = firstFreeAnchor(bounds, 'wallpaper', 'wall', taken);
    expect(a).toEqual(b);
  });

  it('never repeats an anchor already taken, up to the room\'s real decor cap', () => {
    const taken = new Set<string>();
    const seen: string[] = [];
    const cap = data.economy.limits.maxDecorPerRoom;
    for (let i = 0; i < cap; i++) {
      const { x, y } = firstFreeAnchor(bounds, 'seating', 'floor', taken);
      const key = anchorKey(x, y);
      expect(taken.has(key)).toBe(false);
      taken.add(key);
      seen.push(key);
    }
    expect(new Set(seen).size).toBe(cap);
  });

  it('still returns a value, even with an exhausted room, rather than throwing', () => {
    const tiny = { w: 2, h: 2 };
    expect(() => firstFreeAnchor(tiny, 'seating', 'floor', new Set(['0,0', '0,1', '1,0', '1,1']))).not.toThrow();
  });

  it('agrees with the catalogue: every real piece fits its smallest room', () => {
    for (const item of data.decor) {
      const category = categoryFor(data, item.id);
      const slotType = slotTypeFor(data, item.id);
      const { x, y } = firstFreeAnchor(bounds, category, slotType, new Set());
      const r = pieceRect(category, slotType, x, y);
      expect(r.left, `${item.id} hangs off the left`).toBeGreaterThanOrEqual(0);
      expect(r.right, `${item.id} hangs off the right`).toBeLessThanOrEqual(128);
      expect(r.top, `${item.id} hangs off the top`).toBeGreaterThanOrEqual(0);
      expect(r.bottom, `${item.id} hangs below the floor`).toBeLessThanOrEqual(96);
    }
  });
});
