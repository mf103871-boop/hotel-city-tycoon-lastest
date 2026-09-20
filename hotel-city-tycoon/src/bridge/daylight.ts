/**
 * The clock the sky follows (DEC-018).
 *
 * Night used to mean one thing: the hotel is shut. That flag still drives
 * every interior, but the world outside the rooms now follows the hour as
 * well, so an open hotel at eleven at night is a lit building under a dark
 * sky — the approved reference — rather than a noon street.
 *
 * Pure arithmetic on `state.epochMs`, which advances by `tickMs` per tick
 * (src/core/sim/tick.ts:72): the value is a function of the state, so it is
 * deterministic and selftestable with a zero offset. The bridge never reads
 * the device clock or its time zone; the UI hands the offset in once.
 */

/** Dusk runs from 18:00 to 20:00 local, dawn from 05:00 to 07:00. */
export const DUSK_START = 18;
export const DUSK_END = 20;
export const DAWN_START = 5;
export const DAWN_END = 7;

/**
 * The local hour, fractional, in [0, 24).
 *
 * `tzOffsetMin` has JavaScript's `getTimezoneOffset` sign: the minutes to add
 * to local time to reach UTC, so local = epoch − offset. Wrapped twice so a
 * negative epoch still lands in the range.
 */
export function localHour(epochMs: number, tzOffsetMin: number): number {
  return ((((epochMs - tzOffsetMin * 60_000) / 3_600_000) % 24) + 24) % 24;
}

/**
 * How much night an hour holds: 0 by day, 1 by night, ramping across dusk
 * and dawn. Clamped, so it is never outside [0, 1] and never NaN for a finite
 * hour.
 */
export function clockNight(hour: number): number {
  if (!Number.isFinite(hour)) return 0;
  const h = ((hour % 24) + 24) % 24;
  let n: number;
  if (h >= DAWN_END && h < DUSK_START) n = 0;
  else if (h >= DUSK_START && h < DUSK_END) n = (h - DUSK_START) / (DUSK_END - DUSK_START);
  else if (h >= DAWN_START && h < DAWN_END) n = 1 - (h - DAWN_START) / (DAWN_END - DAWN_START);
  else n = 1;
  return Math.min(1, Math.max(0, n));
}

/**
 * The night amount the renderer paints the outside with.
 *
 * Forced to 1 while the hotel is shut, so today's night — the closed hotel —
 * is a subset of the new one and nothing that used to be dark is ever lit.
 */
export function nightAmountAt(epochMs: number, tzOffsetMin: number, closed: boolean): number {
  return closed ? 1 : clockNight(localHour(epochMs, tzOffsetMin));
}
