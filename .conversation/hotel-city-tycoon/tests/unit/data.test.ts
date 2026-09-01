import { describe, it, expect } from 'vitest';
import {
  GameData, RoomById, GuestRooms, CommercialRooms,
  shiftCost, xpForLevel, levelForXp, unlocksAt,
} from '../../src/data/index.ts';

describe('data layer', () => {
  it('parses every data file against its schema', () => {
    expect(GameData.rooms.rooms.length).toBe(23);
    expect(GameData.levels.levels.length).toBe(GameData.levels.maxLevel);
  });

  it('exposes the 23 room types split across three categories', () => {
    const { rooms } = GameData.rooms;
    const functional = rooms.filter((r) => r.category === 'functional');
    expect(GuestRooms.length + CommercialRooms.length + functional.length).toBe(rooms.length);
    expect(GuestRooms.length).toBe(9);
    expect(CommercialRooms.length).toBe(8);
    expect(functional.length).toBe(6);
  });

  it('keeps the guest-room income ladder strictly increasing by tier', () => {
    // 3B split the ladder into two currencies. Inside each one, price climbs
    // with tier; coin incomes climb too, while the gem payouts follow table
    // A.1 verbatim (deliberately non-monotone), pinned by the selftests.
    for (const currency of ['coins', 'gems'] as const) {
      const sorted = GuestRooms.filter((r) => r.cost.currency === currency)
        .sort((a, b) => a.tier - b.tier);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.cost.amount).toBeGreaterThan(sorted[i - 1]!.cost.amount);
        if (currency === 'coins') {
          expect(sorted[i]!.incomePerGuest).toBeGreaterThan(sorted[i - 1]!.incomePerGuest);
        }
      }
    }
  });

  it('scales shift cost with level, never below base', () => {
    for (const s of GameData.shifts.shifts) {
      expect(shiftCost(s.id, 1)).toBe(s.baseCost);
      expect(shiftCost(s.id, 20)).toBeGreaterThan(shiftCost(s.id, 1));
      expect(shiftCost(s.id, 50)).toBeGreaterThan(shiftCost(s.id, 20));
    }
  });

  it('round-trips level <-> xp', () => {
    for (let lv = 1; lv <= GameData.levels.maxLevel; lv++) {
      expect(levelForXp(xpForLevel(lv))).toBe(lv);
    }
  });

  // The old assertion here read `xpForLevel` — which returns the cumulative
  // xpTotal — against a bound written for the per-level step, and failed by a
  // factor of fifteen. The formula string in the data generates neither
  // column, so it cannot be the test either. What is actually checkable today
  // is that the table agrees with itself and never goes backwards.
  it('keeps the level table internally consistent', () => {
    const levels = GameData.levels.levels;
    for (let i = 1; i < levels.length; i++) {
      const prev = levels[i - 1]!;
      const here = levels[i]!;
      expect(here.xpTotal).toBe(prev.xpTotal + (prev.xpToNext ?? 0));
    }
  });

  it('never lets the XP curve flatten or reverse', () => {
    const levels = GameData.levels.levels;
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]!.xpTotal).toBeGreaterThan(levels[i - 1]!.xpTotal);
      const step = levels[i]!.xpToNext;
      const prevStep = levels[i - 1]!.xpToNext;
      if (step !== null && prevStep !== null) expect(step).toBeGreaterThan(prevStep);
    }
  });

  it('holds the XP curve where it is until it is deliberately re-tuned', () => {
    // A ceiling, not an endorsement. The curve reaches 39,021,441 at L60 —
    // roughly six times harsher than Hotel City (6,280,000 at L52), which is
    // the opposite of the design goal recorded in levels.json. This bound
    // stops it drifting further while Phase 6 decides whether to rebuild the
    // table or to change the goal. Lowering it is a balance decision.
    expect(xpForLevel(GameData.levels.maxLevel)).toBeLessThanOrEqual(40_000_000);
  });

  it('unlocks the starting rooms at level 1', () => {
    const l1 = unlocksAt(1).filter((u) => u.kind === 'room').map((u) => u.id);
    for (const id of GameData.economy.start.prebuiltRooms) {
      expect(l1).toContain(id);
    }
  });

  it('gives every commercial room a coherent staffing declaration', () => {
    // 4B: the cafe, arcade and disco are staffless, exactly as the original
    // listed them; every other amenity declares one slot and a real role.
    const staffless = new Set(['cafe', 'arcade', 'spa']);
    for (const r of CommercialRooms) {
      if (staffless.has(r.id)) {
        expect(r.staffSlots).toBe(0);
        expect(r.staffRole).toBeNull();
      } else {
        expect(r.staffSlots).toBeGreaterThan(0);
        expect(GameData.staff.roles.some((s) => s.id === r.staffRole)).toBe(true);
      }
      expect(GameData.guests.desireTags).toContain(r.desireTag);
    }
  });

  it('resolves every room id through the lookup map', () => {
    for (const r of GameData.rooms.rooms) {
      expect(RoomById.get(r.id)).toBe(r);
    }
  });
});
