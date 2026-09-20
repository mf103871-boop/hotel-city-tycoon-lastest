import { describe, it, expect } from 'vitest';
import {
  localHour, clockNight, nightAmountAt, DUSK_START, DUSK_END, DAWN_START, DAWN_END,
} from '../../src/bridge/daylight.ts';
import {
  quantiseDusk, lerpTint, duskTint, poolAlpha, starAlpha, DUSK_STEPS,
  POOL_ALPHA_OPEN, POOL_ALPHA_CLOSED_LOBBY,
} from '../../src/render/lighting.ts';
import { NIGHT_TINT, SKY, NIGHT } from '../../src/render/backdrop.ts';

/**
 * The day/night maths, tested where it can be (DEC-018): the clock is pure
 * arithmetic on the simulation's epoch, and the tints are pure arithmetic on
 * the day palette. What goes wrong here is a sign on the time-zone offset, a
 * ramp that runs the wrong way, or a night colour that is not the one the art
 * is baked with — all of it checkable without a browser.
 */

const NOON_Z = Date.UTC(2026, 8, 20, 12, 0, 0);
const atUtc = (hour: number, minute = 0): number => Date.UTC(2026, 8, 20, hour, minute, 0);

describe('localHour', () => {
  it('applies the JavaScript time-zone offset sign', () => {
    // getTimezoneOffset is minutes to ADD to local to reach UTC: UTC+1 is −60.
    expect(localHour(NOON_Z, -60)).toBe(13);
    expect(localHour(NOON_Z, 300)).toBe(7);
    expect(localHour(NOON_Z, 0)).toBe(12);
  });

  it('wraps around midnight in both directions', () => {
    expect(localHour(atUtc(23), -120)).toBe(1);
    expect(localHour(atUtc(1), 180)).toBe(22);
    expect(localHour(0, 0)).toBe(0);
    expect(localHour(-3_600_000, 0)).toBe(23);
  });
});

describe('clockNight', () => {
  it('holds the anchor hours', () => {
    expect(clockNight(12)).toBe(0);
    expect(clockNight(19)).toBe(0.5);
    expect(clockNight(22)).toBe(1);
    expect(clockNight(6)).toBe(0.5);
    expect(clockNight(0)).toBe(1);
  });

  it('ramps up across dusk and down across dawn, monotonically', () => {
    let last = -1;
    for (let h = DUSK_START; h <= DUSK_END; h += 0.05) {
      const n = clockNight(h);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
    last = 2;
    for (let h = DAWN_START; h <= DAWN_END; h += 0.05) {
      const n = clockNight(h);
      expect(n).toBeLessThanOrEqual(last);
      last = n;
    }
  });

  it('never leaves [0, 1] and never returns NaN', () => {
    for (const h of [-5, 0, 4.99, 5, 7, 17.999, 18, 20, 23.999, 24, 48.5, 1e9]) {
      const n = clockNight(h);
      expect(Number.isNaN(n)).toBe(false);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
    expect(clockNight(Number.NaN)).toBe(0);
  });
});

describe('nightAmountAt', () => {
  it('is 1 whenever the hotel is shut, even at noon', () => {
    expect(nightAmountAt(NOON_Z, 0, true)).toBe(1);
    expect(nightAmountAt(NOON_Z, 0, false)).toBe(0);
  });
});

describe('quantiseDusk', () => {
  it('maps 0..1 onto 0..24 and clamps', () => {
    expect(quantiseDusk(0.5)).toBe(12);
    expect(quantiseDusk(0)).toBe(0);
    expect(quantiseDusk(1)).toBe(DUSK_STEPS);
    expect(quantiseDusk(-3)).toBe(0);
    expect(quantiseDusk(7)).toBe(DUSK_STEPS);
  });
});

describe('lerpTint', () => {
  it('returns each end exactly', () => {
    expect(lerpTint(0x6fbcf9, 0x102040, 0)).toBe(0x6fbcf9);
    expect(lerpTint(0x6fbcf9, 0x102040, 1)).toBe(0x102040);
    expect(lerpTint(0x6fbcf9, 0x102040, -1)).toBe(0x6fbcf9);
    expect(lerpTint(0x6fbcf9, 0x102040, 2)).toBe(0x102040);
  });

  it('moves every channel monotonically towards the night value', () => {
    const day = 0xf0a010;
    const night = 0x203080;
    let last = [0xf0, 0xa0, 0x10];
    for (let t = 0; t <= 1.0001; t += 1 / DUSK_STEPS) {
      const c = lerpTint(day, night, t);
      const ch = [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
      expect(ch[0]).toBeLessThanOrEqual(last[0]!);
      expect(ch[1]).toBeLessThanOrEqual(last[1]!);
      expect(ch[2]).toBeGreaterThanOrEqual(last[2]!);
      last = ch;
    }
  });
});

describe('duskTint', () => {
  it('reaches the same night the art is baked with', () => {
    expect(duskTint(0xffffff, DUSK_STEPS)).toBe(NIGHT_TINT);
    expect(duskTint(SKY, DUSK_STEPS)).toBe(NIGHT.sky);
    expect(duskTint(SKY, 0)).toBe(SKY);
  });
});

describe('poolAlpha', () => {
  it('lights only occupied rooms and the lobby', () => {
    expect(poolAlpha(DUSK_STEPS, false, false, false)).toBe(0);
    expect(poolAlpha(DUSK_STEPS, false, true, true)).toBe(POOL_ALPHA_CLOSED_LOBBY);
    expect(poolAlpha(DUSK_STEPS, true, false, false)).toBe(POOL_ALPHA_OPEN);
    expect(poolAlpha(0, true, false, false)).toBe(0);
    expect(poolAlpha(12, true, false, false)).toBeCloseTo(POOL_ALPHA_OPEN / 2, 6);
  });
});

describe('starAlpha', () => {
  it('stays dark until a third of the way to night and never reaches full', () => {
    expect(starAlpha(0)).toBe(0);
    expect(starAlpha(Math.floor(0.35 * DUSK_STEPS))).toBe(0);
    expect(starAlpha(DUSK_STEPS)).toBeLessThanOrEqual(0.9);
    expect(starAlpha(DUSK_STEPS)).toBeGreaterThan(0.85);
    expect(starAlpha(20)).toBeGreaterThan(starAlpha(12));
  });
});
