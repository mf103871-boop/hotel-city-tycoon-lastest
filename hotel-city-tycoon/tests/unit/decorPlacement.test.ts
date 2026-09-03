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
  roomBandsFor, slotTypeFor, categoryFor, firstFreeAnchor, anchorKey,
  anchorRangeFor, resolveDecorRect, decorBandFor, decorWidthUnits,
  ANCHOR_UNITS_PER_BLOCK,
} from '../../src/core/systems/decorPlacement.ts';

const data = simData();

describe('roomBandsFor', () => {
  it('reads the interior measured off the room art', () => {
    const b = roomBandsFor(data, 'economy');
    expect(b.declared).toBe(true);
    // Measured off economy_base.png: cornice rows 2-9, wall 10-63, navy
    // skirting 64-67, floorboards 68-93. The skirting counts as the top of the
    // floor band — a rug may lie across it; a chair may not stand above it.
    expect({ ceilingBottom: b.ceilingBottom, wallBottom: b.wallBottom, floorTop: b.floorTop })
      .toEqual({ ceilingBottom: 10, wallBottom: 63, floorTop: 64 });
    expect(b.width).toBe(128);
    expect(b.height).toBe(96);
  });

  it('scales the lattice with the room, not the bands', () => {
    const b = roomBandsFor(data, 'presidential');   // 3x2 blocks
    expect(b.unitsW).toBe(3 * ANCHOR_UNITS_PER_BLOCK);
    expect(b.unitsH).toBe(2 * ANCHOR_UNITS_PER_BLOCK);
    expect(b.height).toBe(192);
  });

  it('falls back rather than throwing for a room that no longer exists', () => {
    // A legacy save can point at a removed room. DEC-010 places the piece
    // somewhere valid rather than deleting it.
    const b = roomBandsFor(data, 'no-such-room');
    expect(b.declared).toBe(false);
    expect(b.ceilingBottom).toBeLessThan(b.wallBottom);
    expect(b.wallBottom).toBeLessThan(b.floorTop);
    expect(b.floorTop).toBeLessThanOrEqual(b.floorBottom);
  });

  it('every shipped room declares its interior, in order', () => {
    for (const room of data.rooms) {
      const b = roomBandsFor(data, room.id);
      expect(b.declared, `${room.id} has no measured interior`).toBe(true);
      expect(b.ceilingBottom, room.id).toBeLessThan(b.wallBottom);
      expect(b.wallBottom, room.id).toBeLessThan(b.floorTop);
      expect(b.floorTop, room.id).toBeLessThanOrEqual(b.floorBottom);
      expect(b.floorBottom, room.id).toBeLessThan(b.height);
    }
  });
});

describe('firstFreeAnchor', () => {
  const economy = roomBandsFor(data, 'economy');

  /** The rectangle a piece actually draws, given the anchor it was handed. */
  const rectOf = (bands: ReturnType<typeof roomBandsFor>, id: string) => {
    const category = categoryFor(data, id);
    const slotType = slotTypeFor(data, id);
    const a = firstFreeAnchor(bands, category, slotType, new Set());
    return { ...resolveDecorRect(bands, category, slotType, a.x, a.y), band: decorBandFor(category) };
  };

  it('puts the whole piece inside the room, not just its anchor (DEC-010:159)', () => {
    // "كل قطعة يجب أن تقع داخل مستطيل الغرفة ... لا clipping ولا تسرب إلى
    // الغرفة المجاورة". A 24x18 placeholder box could not test this; a 57px
    // bed can, and did not pass before the bands existed.
    for (const room of data.rooms) {
      const bands = roomBandsFor(data, room.id);
      for (const item of data.decor) {
        const r = rectOf(bands, item.id);
        expect(r.x, `${item.id} in ${room.id} hangs off the left`).toBeGreaterThanOrEqual(0);
        expect(r.y, `${item.id} in ${room.id} hangs off the top`).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w, `${item.id} in ${room.id} hangs off the right`).toBeLessThanOrEqual(bands.width);
        expect(r.y + r.h, `${item.id} in ${room.id} hangs below the room`).toBeLessThanOrEqual(bands.height);
      }
    }
  });

  it('puts every piece on the surface its category belongs to (DEC-010:108, :183)', () => {
    // The regression this whole change exists for. Under the old fractional
    // bands, flooring and rugs sat 16px above the floor line in every room and
    // ceiling lamps hung over the cornice in all 23.
    for (const room of data.rooms) {
      const bands = roomBandsFor(data, room.id);
      for (const item of data.decor) {
        const r = rectOf(bands, item.id);
        const where = `${item.id} in ${room.id}`;
        if (r.band === 'ceiling') {
          // Anchors live on a 6px lattice, so a pendant hangs from the first
          // lattice row at or below the cornice — never above it, which is
          // what the old fractional bands did in all 23 rooms.
          expect(r.y, `${where} hangs above the cornice`).toBeGreaterThanOrEqual(bands.ceilingBottom);
          expect(r.y - bands.ceilingBottom, `${where} hangs too far below the cornice`).toBeLessThan(6);
        } else if (r.band === 'wall') {
          const centre = r.y + r.h / 2;
          expect(centre, `${where} is not on the wall`).toBeGreaterThanOrEqual(bands.ceilingBottom);
          expect(centre, `${where} is not on the wall`).toBeLessThanOrEqual(bands.wallBottom);
        } else if (r.band === 'floorStand') {
          const feet = r.y + r.h;
          expect(feet, `${where} does not stand on the floor`).toBeGreaterThanOrEqual(bands.floorTop);
          expect(feet, `${where} stands below the floor`).toBeLessThanOrEqual(bands.floorBottom + 1);
        } else {
          /*
           * A flat piece lies on the floor. Several rooms draw fixtures over
           * most of their floor and leave a strip thinner than the piece, and
           * there containment wins — so what is asserted is coverage: the
           * piece covers as much of the floor band as its own height allows.
           */
          const band = bands.floorBottom + 1 - bands.floorTop;
          const overlap = Math.max(0, Math.min(r.y + r.h, bands.floorBottom + 1) - Math.max(r.y, bands.floorTop));
          expect(overlap, `${where} barely touches the floor`)
            .toBeGreaterThanOrEqual(0.6 * Math.min(r.h, band));
        }
      }
    }
  });

  it('stands furniture of every size on the same floor line', () => {
    // A bed is 35px tall and an armchair 40px. Anchored on their contact edge
    // they must put their feet in the same place, or the room reads as sloped.
    const feet = ['bed_single', 'seating_armchair', 'table_deskWood', 'plant_fern']
      .map((id) => { const r = rectOf(economy, id); return r.y + r.h; });
    expect(new Set(feet).size, `feet landed at ${feet.join(', ')}`).toBe(1);
  });

  it('starts in the middle and spreads pieces apart, not into a pile', () => {
    const taken = new Set<string>();
    const xs: number[] = [];
    for (let i = 0; i < 3; i++) {
      const { x, y } = firstFreeAnchor(economy, 'seating', 'floor', taken);
      taken.add(anchorKey(x, y));
      xs.push(x);
    }
    const range = anchorRangeFor(economy, 'seating', 'floor');
    expect(Math.abs(xs[0]! - (range.minX + range.maxX) / 2)).toBeLessThanOrEqual(1);
    const sorted = [...xs].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(decorWidthUnits('floor'));
    }
  });

  it('prefers the ceiling band above the wall band above the floor band', () => {
    const y = (cat: string, slot: string) => firstFreeAnchor(economy, cat, slot, new Set()).y;
    expect(y('lighting', 'ceiling')).toBeLessThan(y('wallpaper', 'wall'));
    expect(y('wallpaper', 'wall')).toBeLessThan(y('seating', 'floor'));
    expect(y('bed', 'bed')).toBe(y('seating', 'floor'));
  });

  it('is deterministic: the same inputs always produce the same anchor', () => {
    const taken = new Set(['5,10', '6,10']);
    expect(firstFreeAnchor(economy, 'wallpaper', 'wall', taken))
      .toEqual(firstFreeAnchor(economy, 'wallpaper', 'wall', taken));
  });

  it('never repeats an anchor already taken, up to the room\'s real decor cap', () => {
    const taken = new Set<string>();
    const seen: string[] = [];
    for (let i = 0; i < data.economy.limits.maxDecorPerRoom; i++) {
      const { x, y } = firstFreeAnchor(economy, 'seating', 'floor', taken);
      const key = anchorKey(x, y);
      expect(taken.has(key)).toBe(false);
      taken.add(key);
      seen.push(key);
    }
    expect(new Set(seen).size).toBe(data.economy.limits.maxDecorPerRoom);
  });

  it('repairs an anchor from outside the room rather than drawing it there', () => {
    // Why the save format does not need a migration: resolveDecorRect is
    // total, so a piece stored against the old fractional bands is repaired
    // when it is drawn.
    const r = resolveDecorRect(economy, 'seating', 'floor', 999, -40);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(economy.width);
    expect(r.y + r.h).toBeGreaterThanOrEqual(economy.floorTop);
  });
});
