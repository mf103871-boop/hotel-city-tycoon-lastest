import { describe, it, expect } from 'vitest';
import { simData } from '../support/fixture.ts';
import { createInitialState } from '../../src/core/state/init.ts';
import { advance } from '../../src/core/sim/tick.ts';
import { resolveOffline } from '../../src/core/sim/offline.ts';
import { execute } from '../../src/core/commands/index.ts';
import { catalogueFor } from '../../src/core/data-source.ts';
import { isOpen, totalShiftCost } from '../../src/core/systems/economy.ts';
import { decorFill, decorMultiplier } from '../../src/core/systems/decor.ts';
import { computeStars } from '../../src/core/systems/stars.ts';
import { plotBounds, footprintOf, overlaps, freeBlocks } from '../../src/core/state/grid.ts';

const data = simData();
const TPS = data.economy.simulation.ticksPerSecond;
const fresh = (seed = 12345) => createInitialState(data, { seed, epochMs: 1_700_000_000_000 });

describe('shifts gate income', () => {
  it('earns nothing while closed', () => {
    const s = fresh();
    expect(isOpen(s)).toBe(false);
    const coins = s.player.coins;
    advance(data, s, 2 * 3600 * TPS);
    expect(s.player.coins).toBe(coins);
    expect(s.stats.guestsServed).toBe(0);
  });

  it('earns while open, and stops when the shift expires', () => {
    const s = fresh();
    execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_2h' });
    const { events } = advance(data, s, (2 * 3600 + 10) * TPS);
    expect(s.stats.guestsServed).toBeGreaterThan(0);
    expect(isOpen(s)).toBe(false);
    expect(events.some((e) => e.type === 'shiftEnded')).toBe(true);
  });

  it('charges more for a shift at a higher level', () => {
    const s = fresh();
    const low = totalShiftCost(data, s, 'shift_6h');
    s.player.level = 30;
    expect(totalShiftCost(data, s, 'shift_6h')).toBeGreaterThan(low);
  });
});

describe('commands validate before they mutate', () => {
  it('refuses a locked room', () => {
    const res = execute(data, fresh(), { type: 'BUILD_ROOM', defId: 'family', x: 0, y: 0 });
    expect(res).toMatchObject({ ok: false, reason: 'notUnlocked' });
  });

  it('refuses an unaffordable room', () => {
    const s = fresh();
    s.player.coins = 10;
    expect(execute(data, s, { type: 'BUILD_ROOM', defId: 'economy', x: 2, y: 0 }))
      .toMatchObject({ ok: false, reason: 'cannotAfford' });
  });

  it('refuses a room placed outside the plot', () => {
    const s = fresh();
    s.player.coins = 10_000_000;
    const bounds = plotBounds(data, s);
    expect(execute(data, s, { type: 'BUILD_ROOM', defId: 'economy', x: bounds.w, y: 0 }))
      .toMatchObject({ ok: false, reason: 'outOfBounds' });
  });

  it('refuses to stack two rooms on one block', () => {
    const s = fresh();
    s.player.coins = 10_000_000;
    const existing = s.hotel.rooms[0]!;
    expect(execute(data, s, { type: 'BUILD_ROOM', defId: 'economy', x: existing.x, y: existing.y }))
      .toMatchObject({ ok: false, reason: 'overlaps' });
  });

  it('auto-places rooms without overlaps and fills the plot', () => {
    const s = fresh();
    s.player.coins = 10_000_000;
    for (let i = 0; i < 60; i++) execute(data, s, { type: 'BUILD_ROOM', defId: 'economy' });
    for (let i = 0; i < s.hotel.rooms.length; i++) {
      for (let j = i + 1; j < s.hotel.rooms.length; j++) {
        expect(overlaps(footprintOf(data, s.hotel.rooms[i]!), footprintOf(data, s.hotel.rooms[j]!))).toBe(false);
      }
    }
    expect(freeBlocks(data, s)).toBe(0);
    expect(execute(data, s, { type: 'BUILD_ROOM', defId: 'economy' }))
      .toMatchObject({ ok: false, reason: 'noSpace' });
  });

  it('installs a piece once, and only in its own place', () => {
    const s = fresh();
    s.player.coins = 1_000_000;
    const room = s.hotel.rooms.find((r) => r.defId === 'economy')!;
    const [first, second] = catalogueFor(data, 'economy');
    execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: first!, slot: 0 });
    expect(execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: first!, slot: 0 }))
      .toMatchObject({ ok: false, reason: 'alreadyPlaced' });
    expect(execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: second!, slot: 0 }))
      .toMatchObject({ ok: false, reason: 'slotIncompatible' });
    expect(execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: second!, slot: 1 }))
      .toMatchObject({ ok: true });
  });
});

describe('decor drives income', () => {
  it('raises the multiplier and the meter together', () => {
    const s = fresh();
    s.player.coins = 1_000_000;
    const room = s.hotel.rooms.find((r) => r.defId === 'economy')!;
    const def = data.rooms.find((r) => r.id === 'economy')!;
    const before = decorMultiplier(data, def, room);
    execute(data, s, { type: 'PLACE_DECOR', roomId: room.id, defId: catalogueFor(data, 'economy')[0]!, slot: 0 });
    expect(decorMultiplier(data, def, room)).toBeGreaterThan(before);
    expect(decorFill(def, room)).toBeGreaterThan(0);
  });
});

describe('hazards block income', () => {
  it('stops an infested hotel from earning', () => {
    const s = fresh();
    execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_6h' });
    for (const room of s.hotel.rooms) { room.hasPest = true; room.cleanliness = 0; }
    const coins = s.player.coins;
    advance(data, s, 3600 * TPS);
    expect(s.player.coins).toBe(coins);
  });

  it('charges the data-defined price to clear a pest', () => {
    const s = fresh();
    const room = s.hotel.rooms.find((r) => r.defId === 'economy')!;
    room.hasPest = true;
    const coins = s.player.coins;
    expect(execute(data, s, { type: 'CLEAR_HAZARD', roomId: room.id, hazard: 'pest' }).ok).toBe(true);
    expect(room.hasPest).toBe(false);
    expect(s.player.coins).toBe(coins - (data.events.find((e) => e.id === 'pest')?.clearCost?.amount ?? 0));
  });
});

describe('offline resolution', () => {
  it('is capped by the remaining shift', () => {
    const s = fresh();
    execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_2h' });
    const r = resolveOffline(data, s, 30 * 24 * 3600 * 1000);
    expect(r.earningMs).toBeLessThanOrEqual(2 * 3600 * 1000 + 1);
  });

  it('earns nothing when the hotel is closed', () => {
    const s = fresh();
    const coins = s.player.coins;
    expect(resolveOffline(data, s, 24 * 3600 * 1000).coins).toBe(0);
    expect(s.player.coins).toBe(coins);
  });

  it('solves 30 days analytically rather than by iterating', () => {
    const s = fresh();
    s.player.coins = 10_000_000;
    for (let i = 0; i < 6; i++) execute(data, s, { type: 'BUILD_ROOM', defId: 'economy', x: i, y: 1 });
    execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_48h' });
    // Median of several runs rather than one sample: a single wall-clock
    // reading swings with GC and JIT tiering, which is what made the
    // equivalent self-test fail inside a full suite run and pass alone.
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      const copy = JSON.parse(JSON.stringify(s)) as typeof s;
      const t0 = performance.now();
      resolveOffline(data, copy, 30 * 24 * 3600 * 1000);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    expect(samples[Math.floor(samples.length / 2)]!).toBeLessThan(50);
  });

  // The cap bounds what the absence pays, not how much time passed. Asserting
  // it against `elapsedMs` is what let the clock be truncated: a day away
  // moved the world fourteen hours, so seasons, gift days and every cooldown
  // fell further behind reality on each absence.
  it('caps the reward without truncating the clock', () => {
    const s = fresh();
    execute(data, s, { type: 'START_SHIFT', shiftId: 'shift_48h' });
    const year = 365 * 24 * 3600 * 1000;
    const before = s.epochMs;
    const r = resolveOffline(data, s, year);
    expect(r.earningMs).toBeLessThanOrEqual(data.economy.simulation.maxOfflineHours * 3600 * 1000);
    expect(r.elapsedMs).toBe(year);
    expect(s.epochMs).toBe(before + year);
  });
});

describe('stars', () => {
  it('stays inside the tier table', () => {
    const stars = computeStars(data, fresh());
    expect(stars).toBeGreaterThanOrEqual(1);
    expect(stars).toBeLessThanOrEqual(5);
  });
});
